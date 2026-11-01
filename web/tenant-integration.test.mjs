import { test } from 'node:test';
import assert from 'node:assert/strict';
process.env.TURSO_DATABASE_URL='file::memory:';
process.env.TURSO_AUTH_TOKEN='local-test';
process.env.SESSION_SIGNING_KEY='test-signing-key-'.repeat(4);
process.env.CREDENTIALS_KEY='12'.repeat(32);
process.env.NEXT_PUBLIC_APP_URL='https://test.example';
const server=await import('./whatsapp/lib/server.ts');
const auth=await import('./whatsapp/lib/auth.ts');
const authRoute=await import('./whatsapp/app/api/auth/route.ts');
const workspace=await import('./whatsapp/app/api/workspace/route.ts');
const webhook=await import('./whatsapp/app/api/webhook/route.ts');
const queue=await import('./whatsapp/lib/queue-ownership.ts');
const {NextRequest}=await import('./whatsapp/node_modules/next/server.js');
const req=(path,body,cookie,origin='https://test.example')=>new NextRequest('https://test.example'+path,{method:body?'POST':'GET',headers:{'content-type':'application/json',origin,...(cookie?{cookie}:{})},...(body?{body:JSON.stringify(body)}:{})});

test('tenant boundaries and API workflows against an isolated database',async t=>{
  await server.initDatabase();
  let a,b;
  await t.test('register two businesses and read their separate workspaces',async()=>{
    for(const name of ['alpha','beta']) {
      const response=await authRoute.POST(req('/api/auth',{action:'register',businessName:name,ownerName:'Owner',email:name+'@example.test',password:'long-test-password'}));
      assert.equal(response.status,200,await response.clone().text());
      const data=await response.json(),cookie=response.headers.get('set-cookie').split(';')[0];
      if(name==='alpha') a={...data,cookie}; else b={...data,cookie};
    }
    const response=await workspace.GET(req('/api/workspace?tenantId='+b.tenantId,undefined,a.cookie));
    assert.equal(response.status,403);
    assert.equal((await workspace.GET(req('/api/workspace'))).status,401);
    const own=await workspace.GET(req('/api/workspace',undefined,a.cookie));
    assert.equal(own.status,200); const data=await own.json();
    assert.equal(data.activeAccountId,a.tenantId); assert.deepEqual(data.connections.providers,[]);
    assert.equal(data.settings.catalog.length,0);
  });
  await t.test('same customer and order identifiers stay independent',async()=>{
    for(const business of [a,b]) {
      await server.saveCustomerProfile({phone:'same-phone',name:business.tenantId},business.tenantId);
      await server.saveOrder({id:'same-order',threadId:'same-thread',customerPhone:'same-phone',orderStatus:'confirmed',createdAt:1},business.tenantId);
      await server.saveThread({id:'same-thread',version:0,messages:[],tags:[],name:business.tenantId},business.tenantId);
    }
    assert.equal((await server.getCustomerProfile('same-phone',a.tenantId)).name,a.tenantId);
    assert.equal((await server.getCustomerProfile('same-phone',b.tenantId)).name,b.tenantId);
    assert.equal((await server.allOrders(a.tenantId)).length,1);
    assert.equal((await server.getThread('same-thread',b.tenantId)).name,b.tenantId);
  });
  await t.test('credential encryption and provider routing stay inside the business',async()=>{
    await server.saveTenantSecret(a.tenantId,'groq_key','fake-alpha-key');
    assert.equal(await server.tenantSecret(a.tenantId,'groq_key'),'fake-alpha-key');
    assert.equal(await server.tenantSecret(b.tenantId,'groq_key'),null);
    const raw=await server.db().prepare('SELECT cipher FROM tenant_credentials WHERE tenant_id=?').bind(a.tenantId).first();
    assert.ok(!raw.cipher.includes('fake-alpha-key'));
  });
  await t.test('replays enqueue once and concurrent queue claims have one owner',async()=>{
    const event={id:'test-event',threadId:'test-thread',text:'Hello'};
    assert.equal(await queue.enqueueEvent(a.tenantId,event),true);
    assert.equal(await queue.enqueueEvent(a.tenantId,event),false);
    assert.equal(await queue.enqueueEvent(b.tenantId,event),true);
    const first=await queue.claimThreadJobs(a.tenantId,'test-thread',3);
    const second=await queue.claimThreadJobs(a.tenantId,'test-thread',3);
    assert.equal(first.jobs.length,1); assert.equal(second.jobs.length,0);
    await queue.releaseThread(a.tenantId,'test-thread',first.token);
  });
  await t.test('CSRF, validation and operator restrictions reject mutations',async()=>{
    assert.equal((await workspace.POST(req('/api/workspace',{action:'process'},a.cookie,'https://attacker.test'))).status,403);
    assert.equal((await workspace.POST(req('/api/workspace',{action:'process'},a.cookie,''))).status,403);
    assert.equal((await workspace.POST(req('/api/workspace',{action:'save-order',order:{id:'bad'}},a.cookie))).status,400);
    await server.db().prepare("UPDATE business_users SET role='business_operator' WHERE id=?").bind(a.user.id).run();
    const {token}=await auth.createAuthSession({id:a.user.id,email:a.user.email,name:'Owner',role:'business_operator',tenantId:a.tenantId});
    assert.equal((await workspace.POST(req('/api/workspace',{action:'save-credentials',groqKey:'test'},'wa_session='+token))).status,403);
    await server.db().prepare("UPDATE business_users SET role='business_admin' WHERE id=?").bind(a.user.id).run();
  });
  await t.test('suspended tenants and revoked or deleted sessions lose access',async()=>{
    const token=b.cookie.slice('wa_session='.length);
    assert.ok(await auth.verifySessionToken(token));
    await server.updateBusinessTenantStatus(b.tenantId,'suspended');
    assert.equal(await auth.verifySessionToken(token),null);
    await assert.rejects(queue.enqueueEvent(b.tenantId,{id:'blocked',threadId:'blocked'}));
    await server.updateBusinessTenantStatus(b.tenantId,'active');
    const session=await auth.createAuthSession({id:b.user.id,email:b.user.email,name:'Owner',role:'business_admin',tenantId:b.tenantId});
    await server.db().prepare('DELETE FROM auth_sessions WHERE id=?').bind(session.session.jti).run();
    assert.equal(await auth.verifySessionToken(session.token),null);
  });
  await t.test('webhook signatures are mandatory',async()=>{
    assert.equal((await webhook.POST(req('/api/webhook',{object:'whatsapp_business_account'}))).status,403);
  });
  await t.test('master admin can inspect another business and create one without changing identity',async()=>{
    await server.db().exec('CREATE TABLE IF NOT EXISTS workspace_state(key TEXT PRIMARY KEY,payload TEXT NOT NULL)');
    const jti=crypto.randomUUID(),payload=JSON.stringify({jti,user:'owner',exp:Date.now()+60000});
    const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(process.env.SESSION_SIGNING_KEY),{name:'HMAC',hash:'SHA-256'},false,['sign']);
    const signature=Buffer.from(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(payload))).toString('hex');
    await server.db().prepare('INSERT INTO workspace_state VALUES (?,?)').bind('owner_session:'+jti,JSON.stringify({user:'owner',expiresAt:Date.now()+60000})).run();
    const cookie='nina_owner_session='+btoa(payload)+'.'+signature;
    assert.equal((await workspace.GET(req('/api/workspace?tenantId='+a.tenantId,undefined,cookie))).status,200);
    const response=await authRoute.POST(req('/api/auth',{action:'create-business',businessName:'Admin client',ownerName:'Client',email:'client@example.test',password:'temporary-client-password'},cookie));
    assert.equal(response.status,200); assert.equal(response.headers.get('set-cookie'),null);
    assert.equal((await authRoute.POST(req('/api/auth',{action:'create-business',businessName:'Blocked',ownerName:'Client',email:'blocked@example.test',password:'temporary-client-password'},a.cookie))).status,403);
    await server.db().prepare('DELETE FROM workspace_state WHERE key=?').bind('owner_session:'+jti).run();
    assert.equal((await workspace.GET(req('/api/workspace',undefined,cookie))).status,401);
  });
  await t.test('outgoing retries do not send the same reply twice',async()=>{
    await server.db().prepare("INSERT INTO tenant_connections(tenant_id,provider,phone_number_id,updated_at) VALUES (?,'cloud','123',?)").bind(a.tenantId,Date.now()).run();
    await server.saveTenantSecret(a.tenantId,'wa_access_token','fake-access-token');
    const thread={id:'send-test',version:0,phone:'1000',name:'Test',tags:[],messages:[{id:'in-1',role:'incoming',text:'Hello',at:1}],lastInbound:1};
    await server.saveThread(thread,a.tenantId);
    const original=globalThis.fetch; let calls=0;
    globalThis.fetch=async()=>{calls++;return Response.json({messages:[{id:'out-1'}]});};
    try {await server.sendReply(thread,'Hello back',a.tenantId);await server.sendReply(thread,'Hello back',a.tenantId);}
    finally {globalThis.fetch=original;}
    assert.equal(calls,1);assert.equal(thread.messages.filter(m=>m.role==='outgoing').length,1);
  });
  await t.test('settings validation accepts actual defaults and persisted rate limiting locks attempts',async()=>{
    const {settingsSchema}=await import('./whatsapp/lib/validation.ts');
    const parsed=settingsSchema.safeParse(await server.settings(a.tenantId));
    assert.ok(parsed.success,JSON.stringify(parsed.error?.issues));
    const {consumeRateLimit}=await import('./whatsapp/lib/rate-limit.ts');
    await consumeRateLimit('test-bucket',2,60000);
    await consumeRateLimit('test-bucket',2,60000);
    await assert.rejects(consumeRateLimit('test-bucket',2,60000),error=>error.status===429);
  });
  await t.test('logout revokes the cookie server-side',async()=>{
    const token=a.cookie.slice('wa_session='.length);
    assert.equal((await authRoute.POST(req('/api/auth',{action:'logout'},a.cookie))).status,200);
    assert.equal(await auth.verifySessionToken(token),null);
  });
});

test('legacy migrations require ownership and preserve records transactionally',async()=>{
  const {createTursoAdapter}=await import('./whatsapp/lib/turso.ts');
  const {migrateTenantTables}=await import('./whatsapp/lib/tenant-migration.ts');
  const database=createTursoAdapter('file::memory:','test');
  await database.exec('CREATE TABLE tenant_connections(tenant_id TEXT PRIMARY KEY,phone_number_id TEXT)');
  await database.exec('CREATE TABLE wa_customers(phone TEXT PRIMARY KEY,payload TEXT NOT NULL,updated INTEGER NOT NULL)');
  await database.prepare('INSERT INTO wa_customers VALUES (?,?,?)').bind('preserved','{"name":"Original"}',123).run();
  await assert.rejects(migrateTenantTables(database),/explicit LEGACY/);
  await migrateTenantTables(database,'explicit-owner');
  const row=await database.prepare('SELECT * FROM wa_customers').first();
  assert.equal(row.tenant_id,'explicit-owner'); assert.equal(JSON.parse(row.payload).name,'Original');
  await migrateTenantTables(database,'explicit-owner');
  assert.equal((await database.prepare('SELECT count(*) AS n FROM wa_customers').first()).n,1);
});
