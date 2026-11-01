import {test} from 'node:test';
import assert from 'node:assert/strict';
process.env.TURSO_DATABASE_URL='file::memory:';
process.env.TURSO_AUTH_TOKEN='local-test';
process.env.SESSION_SIGNING_KEY='shared-provider-test-signing-'.repeat(3);
process.env.CREDENTIALS_KEY='12'.repeat(32);
process.env.NEXT_PUBLIC_APP_URL='https://test.example';
const server=await import('./whatsapp/lib/server.ts');
const auth=await import('./whatsapp/app/api/auth/route.ts');
const workspace=await import('./whatsapp/app/api/workspace/route.ts');
const catalogRoute=await import('./whatsapp/app/api/catalog/route.ts');
const {saveCatalogPublication}=await import('./whatsapp/lib/catalog-publication.ts');
const adminRoute=await import('./whatsapp/app/api/admin/route.ts');
const {completeBusinessAI}=await import('./whatsapp/lib/shared-ai.ts');
const {enqueueEvent}=await import('./whatsapp/lib/queue-ownership.ts');
const {processThreadJobs}=await import('./whatsapp/lib/queue.ts');
const {NextRequest}=await import('./whatsapp/node_modules/next/server.js');
const {signPrivateWorkspaceRequest,PRIVATE_WORKSPACE_PROOF_HEADER}=await import('./shared/private-workspace-bridge.ts');
async function privateReq(request){request.headers.set(PRIVATE_WORKSPACE_PROOF_HEADER,await signPrivateWorkspaceRequest(request));return request;}
const req=(path,body,cookie)=>new NextRequest('https://test.example'+path,{method:body?'POST':'GET',headers:{'content-type':'application/json',origin:'https://test.example',...(cookie?{cookie}:{})},...(body?{body:JSON.stringify(body)}:{})});
const product=(name,price)=>({id:'product-1',name,category:'Home',price,currency:'INR',description:'Made locally',features:[],inStock:true});
const state=async(key,value)=>server.db().prepare('INSERT INTO workspace_state(key,payload) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET payload=excluded.payload').bind(key,JSON.stringify(value)).run();
const providers=[{id:'admin-primary',label:'Private admin label',provider:'groq',model:'test-model',verified:true},{id:'admin-backup',label:'Private backup label',provider:'openrouter',model:'test-backup',verified:true}];
const thread=(id)=>({id,version:0,phone:'919999999999',name:'Customer',channel:'personal',status:'open',takeover:false,ai:true,tags:[],messages:[{id:id+'-in',role:'incoming',text:'Do you have products?',at:Date.now()}],lastInbound:Date.now(),updated:Date.now(),draft:''});
const aiResponse=(text,tokens=20)=>Response.json({choices:[{message:{content:text}}],usage:{total_tokens:tokens}});

test('shared administrator AI and live tenant catalogs',async t=>{
  const originalFetch=globalThis.fetch;
  globalThis.fetch=async()=>{throw new Error('Unmocked network request');};
  try {
    await server.initDatabase();
    await server.db().exec('CREATE TABLE IF NOT EXISTS workspace_state(key TEXT PRIMARY KEY,payload TEXT NOT NULL)');
    const businesses=[];
    for(const name of ['Alpha','Beta']) {
      const response=await auth.POST(req('/api/auth',{action:'register',businessName:name,ownerName:'Owner',email:name.toLowerCase()+'@test.example',password:'long-test-password'}));
      assert.equal(response.status,200,await response.clone().text());
      businesses.push({...await response.json(),cookie:response.headers.get('set-cookie').split(';')[0]});
    }
    const [a,b]=businesses;
    await state('ai_providers',providers);await state('primary_provider','admin-primary');
    await server.saveSecret('provider:admin-primary','fake-admin-primary');
    await server.saveSecret('provider:admin-backup','fake-admin-backup');
    await t.test('catalog saves are authorized, live and isolated, including an empty catalog',async()=>{
      for(const [business,name,price] of [[a,'Alpha mug',250],[b,'Beta bowl',450]]) {
        const settings=await server.settings(business.tenantId);
        await server.saveSettings({...settings,industry:'Homewares',businessDescription:'Locally made homewares',storeAddress:'Online service across India',supportEmail:'support@example.test',shippingPolicy:'Delivery in five days',returnPolicy:'Return within seven days',warrantyPolicy:'No warranty',paymentMethods:'COD',knowledge:'Products are handmade.',supportPhone:business===a?'919876543210':'919123456789',instructions:'Private business instructions',enabled:true,approval:false,personalReplyDelaySeconds:0,groupReplyDelaySeconds:0},business.tenantId);
        const response=await workspace.POST(req('/api/workspace',{action:'save-catalog',catalog:[product(name,price)]},business.cookie));
        assert.equal(response.status,200,await response.clone().text());
        await saveCatalogPublication(business.tenantId,business===a?'alpha-store':'beta-store',true);
      }
      assert.equal((await workspace.POST(req('/api/workspace',{action:'save-catalog',tenantId:b.tenantId,catalog:[]},a.cookie))).status,403);
      assert.equal((await workspace.POST(req('/api/workspace',{action:'save-catalog',catalog:[product('Duplicate',1),product('Duplicate',2)]},a.cookie))).status,400);
      const data=await (await catalogRoute.GET(req('/api/catalog?business='+a.tenantId))).json();
      assert.equal(data.products[0].name,'Alpha mug');assert.equal(data.phone,'919876543210');
      assert.ok(!JSON.stringify(data).includes('Private business instructions'));
      assert.ok(!JSON.stringify(data).includes('Beta bowl'));
      await workspace.POST(req('/api/workspace',{action:'save-catalog',catalog:[]},b.cookie));
      assert.deepEqual((await (await catalogRoute.GET(req('/api/catalog?business='+b.tenantId))).json()).products,[]);
      await workspace.POST(req('/api/workspace',{action:'save-catalog',catalog:[product('Beta bowl',499)]},b.cookie));
      assert.equal((await (await catalogRoute.GET(req('/api/catalog?business='+b.tenantId))).json()).products[0].price,499);
      assert.equal((await catalogRoute.GET(req('/api/catalog?business=missing'))).status,404);
      assert.equal((await catalogRoute.GET(req('/api/catalog'))).status,400);
    });
    await t.test('both businesses use administrator keys with only their own prompt data',async()=>{
      const requests=[];
      globalThis.fetch=async(url,options)=>{requests.push({url,headers:options.headers,body:JSON.parse(options.body)});return aiResponse('Please check our products.');};
      for(const business of businesses) {
        assert.equal(await server.tenantSecret(business.tenantId,'groq_key'),null);
        assert.equal(await server.generateReply(thread(business.tenantId),business.tenantId),'Please check our products.');
        const response=await workspace.GET(req('/api/workspace',undefined,business.cookie));
        const data=await response.json();
        assert.equal(data.connections.aiVerified,true);assert.deepEqual(data.connections.providers,[]);
        assert.equal(data.connections.primaryProviderId,undefined);
        assert.ok(!JSON.stringify(data).includes('fake-admin'));
        assert.ok(!JSON.stringify(data).includes('Private admin label'));
      }
      assert.equal(requests.length,2);
      for(let i=0;i<2;i++) {
        assert.equal(requests[i].headers.Authorization,'Bearer fake-admin-primary');
        const prompt=requests[i].body.messages[0].content;
        assert.ok(prompt.includes(i===0?'Alpha mug':'Beta bowl'));
        assert.ok(!prompt.includes(i===0?'Beta bowl':'Alpha mug'));
        assert.ok(!prompt.includes('Titan'));
        assert.ok(prompt.includes('/catalog/'+(i===0?'alpha-store':'beta-store')));
        assert.ok(!prompt.includes('fake-admin'));
      }
      assert.equal((await server.db().prepare('SELECT calls FROM tenant_usage WHERE tenant_id=?').bind(a.tenantId).first()).calls,1);
    });
    await t.test('Cloudflare uses the same administrator account and compatible model as Instagram',async()=>{
      await state('ai_providers',[{id:'admin-cloudflare',label:'Admin Cloudflare',provider:'cloudflare',model:'@cf/mistral/mistral-7b-instruct-v0.2',verified:true}]);
      await state('primary_provider','admin-cloudflare');
      await server.saveSecret('provider:admin-cloudflare','fake-cloudflare-token');
      const requests=[];globalThis.fetch=async(url,options)=>{requests.push({url,options,body:JSON.parse(options.body)});return aiResponse('Cloudflare reply');};
      assert.equal(await completeBusinessAI(a.tenantId,[{role:'user',content:'Hello'}]),'Cloudflare reply');
      assert.match(requests[0].url,/accounts\/[a-f0-9]{32}\/ai\/v1\/chat\/completions/);
      assert.equal(requests[0].options.headers.Authorization,'Bearer fake-cloudflare-token');
      assert.equal(requests[0].body.model,'@cf/mistralai/mistral-small-3.1-24b-instruct');
      await server.saveSecret('provider:admin-cloudflare','a'.repeat(32)+':fake-cloudflare-explicit');
      await completeBusinessAI(b.tenantId,[{role:'user',content:'Hello'}]);
      assert.ok(requests[1].url.includes('/accounts/'+'a'.repeat(32)+'/'));
      assert.equal(requests[1].options.headers.Authorization,'Bearer fake-cloudflare-explicit');
      await state('ai_providers',providers);await state('primary_provider','admin-primary');
    });
    await t.test('provider failures fall back and preserve the longer shared cooldown',async()=>{
      const calls=[];
      globalThis.fetch=async(url,options)=>{
        calls.push(options.headers.Authorization);
        if(calls.length===1) {
          await state('provider_limit:admin-primary',{until:Date.now()+120000});
          return new Response('{}',{status:429,headers:{'retry-after':'60'}});
        }
        return aiResponse('Backup reply');
      };
      assert.equal(await completeBusinessAI(a.tenantId,[{role:'user',content:'Hello'}]),'Backup reply');
      assert.deepEqual(calls,['Bearer fake-admin-primary','Bearer fake-admin-backup']);
      const limit=JSON.parse((await server.db().prepare('SELECT payload FROM workspace_state WHERE key=?').bind('provider_limit:admin-primary').first()).payload);
      assert.ok(limit.until>Date.now()+110000);
      calls.length=1;
      assert.equal(await completeBusinessAI(b.tenantId,[{role:'user',content:'Hello'}]),'Backup reply');
      assert.equal(calls.at(-1),'Bearer fake-admin-backup');
      await state('provider_limit:admin-primary',{until:0});
    });
    await t.test('queue failure preserves the message and retries to one actual mocked delivery',async()=>{
      await state('ai_providers',[]);
      await enqueueEvent(a.tenantId,{id:'queue-in',threadId:'queue-thread',senderPhone:'919999999999',senderName:'Customer',text:'Do you have mugs?',at:Date.now()});
      assert.equal((await processThreadJobs('queue-thread',a.tenantId)).processed,0);
      const saved=await server.getThread('queue-thread',a.tenantId);
      assert.equal(saved.messages.filter(m=>m.role==='incoming').length,1);
      assert.match(saved.flagged,/Automation unavailable/);
      assert.equal((await server.db().prepare('SELECT status FROM wa_jobs WHERE tenant_id=? AND id=?').bind(a.tenantId,'queue-in').first()).status,'pending');
      await state('ai_providers',providers);
      await server.db().prepare("INSERT INTO tenant_connections(tenant_id,provider,phone_number_id,updated_at) VALUES (?,'cloud','123',?)").bind(a.tenantId,Date.now()).run();
      await server.saveTenantSecret(a.tenantId,'wa_access_token','fake-wa-token');
      let deliveries=0;
      globalThis.fetch=async(url,options)=>{
        const body=JSON.parse(options.body);
        if(String(url).includes('graph.facebook.com')){deliveries++;assert.equal(options.headers.Authorization,'Bearer fake-wa-token');return Response.json({messages:[{id:'outbound-queue'}]});}
        assert.equal(options.headers.Authorization,'Bearer fake-admin-primary');
        return aiResponse(body.messages[0].content.startsWith('You evaluate')?'{"isConfirmed":false}':'The Alpha mug is available for INR 250.');
      };
      await server.db().prepare('UPDATE wa_jobs SET created=0 WHERE tenant_id=? AND id=?').bind(a.tenantId,'queue-in').run();
      assert.equal((await processThreadJobs('queue-thread',a.tenantId)).processed,1);
      assert.equal((await processThreadJobs('queue-thread',a.tenantId)).processed,0);
      const done=await server.getThread('queue-thread',a.tenantId);
      assert.equal(deliveries,1);assert.equal(done.messages.filter(m=>m.role==='incoming').length,1);
      assert.equal(done.messages.filter(m=>m.role==='outgoing').length,1);assert.equal(done.flagged,'');
    });
    await t.test('paused automation makes no AI calls and approval mode saves a draft',async()=>{
      const current=await server.settings(b.tenantId);
      await server.saveSettings({...current,enabled:false},b.tenantId);
      let calls=0;globalThis.fetch=async()=>{calls++;return aiResponse('{"isConfirmed":false}');};
      await enqueueEvent(b.tenantId,{id:'paused-in',threadId:'paused-thread',senderPhone:'919888888888',text:'Hello',at:Date.now()});
      assert.equal((await processThreadJobs('paused-thread',b.tenantId)).processed,1);assert.equal(calls,0);
      await server.saveSettings({...current,enabled:true,approval:true},b.tenantId);
      globalThis.fetch=async(url,options)=>{assert.ok(!String(url).includes('graph.facebook.com'));const body=JSON.parse(options.body);return aiResponse(body.messages[0].content.startsWith('You evaluate')?'{"isConfirmed":false}':'The Beta bowl is INR 499.');};
      await enqueueEvent(b.tenantId,{id:'review-in',threadId:'review-thread',senderPhone:'919888888888',text:'Any bowls available?',at:Date.now()});
      assert.equal((await processThreadJobs('review-thread',b.tenantId)).processed,1);
      const draft=await server.getThread('review-thread',b.tenantId);
      assert.equal(draft.status,'review');assert.equal(draft.draft,'The Beta bowl is INR 499.');
    });
    await t.test('profile readiness is required and scoped settings cannot overwrite the catalog',async()=>{
      const response=await auth.POST(req('/api/auth',{action:'register',businessName:'Unconfigured',ownerName:'Owner',email:'unconfigured@test.example',password:'long-test-password'}));
      const data=await response.json(),cookie=response.headers.get('set-cookie').split(';')[0];
      const settings=await server.settings(data.tenantId);
      assert.equal((await workspace.POST(req('/api/workspace',{action:'save-automation',settings:{...settings,enabled:true}},cookie))).status,412);
      assert.equal((await workspace.POST(req('/api/workspace',{action:'save-profile',settings},cookie))).status,400);
      const complete={...await server.settings(a.tenantId),businessName:'Unconfigured',enabled:false,catalog:[]};
      assert.equal((await workspace.POST(req('/api/workspace',{action:'save-profile',settings:complete},cookie))).status,200);
      const aSettings=await server.settings(a.tenantId);
      assert.equal((await workspace.POST(req('/api/workspace',{action:'save-automation',settings:{...aSettings,catalog:[],approval:true}},a.cookie))).status,200);
      assert.equal((await server.settings(a.tenantId)).catalog[0].name,'Alpha mug');
      globalThis.fetch=async()=>aiResponse('A private preview for Alpha.');
      const preview=await workspace.POST(req('/api/workspace',{action:'test-ai',text:'What do you sell?'},a.cookie));
      assert.equal(preview.status,200);assert.equal((await preview.json()).reply,'A private preview for Alpha.');
      assert.equal((await server.settings(data.tenantId)).enabled,false);
    });
    await t.test('one verified WhatsApp number cannot belong to two businesses',async()=>{
      const {claimWhatsAppNumber}=await import('./whatsapp/lib/number-ownership.ts');
      assert.equal(await claimWhatsAppNumber(a.tenantId,'+91 98765 43210'),'919876543210');
      assert.equal(await claimWhatsAppNumber(a.tenantId,'919876543210'),'919876543210');
      await assert.rejects(claimWhatsAppNumber(b.tenantId,'+91-98765-43210'),error=>error.status===409);
      await assert.rejects(claimWhatsAppNumber(b.tenantId,'invalid'),error=>error.status===400);
      assert.equal(await claimWhatsAppNumber(b.tenantId,'919123456789'),'919123456789');
      assert.equal((await server.db().prepare('SELECT tenant_id FROM whatsapp_number_owners WHERE phone=?').bind('919876543210').first()).tenant_id,a.tenantId);
    });
    await t.test('reply limits are enforced before delivery and completed jobs cannot send twice',async()=>{
      const config=await server.settings(a.tenantId);
      await server.saveSettings({...config,dailyLimit:1,approval:false},a.tenantId);
      let network=0;globalThis.fetch=async()=>{network++;throw Error('Must not send');};
      await assert.rejects(server.sendReply(thread('daily-cap'),'Another automatic reply',a.tenantId,true),e=>e.status===429);
      assert.equal(network,0);
      await server.db().prepare("UPDATE wa_jobs SET status='pending',attempts=0,created=0 WHERE tenant_id=? AND id='queue-in'").bind(a.tenantId).run();
      assert.equal((await processThreadJobs('queue-thread',a.tenantId)).processed,1);
      assert.equal(network,0);
      await server.saveSettings(config,a.tenantId);
    });
    await t.test('changing automation permissions while AI generates prevents a send',async()=>{
      const config=await server.settings(a.tenantId);
      await server.saveSettings({...config,enabled:true,approval:false},a.tenantId);
      let sends=0;
      globalThis.fetch=async(url)=>{
        if(String(url).includes('graph.facebook.com')){sends++;throw Error('Must not send');}
        await server.saveSettings({...config,enabled:false},a.tenantId);
        return aiResponse('Here are our products.');
      };
      await enqueueEvent(a.tenantId,{id:'permission-in',threadId:'permission-thread',senderPhone:'919111111111',text:'Please share product details',at:Date.now()});
      assert.equal((await processThreadJobs('permission-thread',a.tenantId)).processed,0);
      const saved=await server.getThread('permission-thread',a.tenantId);
      assert.equal(sends,0);assert.equal(saved.messages.filter(m=>m.role==='incoming').length,1);
      assert.match(saved.flagged,/permissions changed/);
      await server.saveSettings(config,a.tenantId);
    });
    await t.test('business hours use the chosen timezone, including overnight hours',async()=>{
      const {isBusinessHours}=await import('./whatsapp/lib/reply-style.ts');
      const config=await server.settings(a.tenantId);
      const time=new Date('2026-11-01T05:00:00Z');
      assert.equal(isBusinessHours({...config,businessHours:'09:00-18:00',businessTimezone:'Asia/Kolkata'},time),true);
      assert.equal(isBusinessHours({...config,businessHours:'09:00-18:00',businessTimezone:'UTC'},time),false);
      assert.equal(isBusinessHours({...config,businessHours:'22:00-06:00',businessTimezone:'UTC'},time),true);
      assert.equal(isBusinessHours({...config,businessHours:'24/7'},time),true);
    });
    await t.test('background worker recovers saved work and expired final attempts become visible failures',async()=>{
      const config=await server.settings(a.tenantId);
      await server.saveSettings({...config,enabled:true,approval:true},a.tenantId);
      globalThis.fetch=async(url,options)=>{
        assert.ok(!String(url).includes('graph.facebook.com'));
        const body=JSON.parse(options.body);
        return aiResponse(body.messages[0].content.startsWith('You evaluate')?'{"isConfirmed":false}':'Recovered by the background worker.');
      };
      await enqueueEvent(a.tenantId,{id:'recovery-in',threadId:'recovery-thread',senderPhone:'919222222222',text:'Any mugs available?',at:Date.now()});
      const {startQueueWorker}=await import('./whatsapp/lib/queue-worker.ts');
      const worker=startQueueWorker();
      try {
        const deadline=Date.now()+12000;
        while(Date.now()<deadline) {
          const row=await server.db().prepare('SELECT status FROM wa_jobs WHERE tenant_id=? AND id=?').bind(a.tenantId,'recovery-in').first();
          if(row.status==='done')break;
          await new Promise(resolve=>setTimeout(resolve,100));
        }
        assert.equal((await server.getThread('recovery-thread',a.tenantId)).draft,'Recovered by the background worker.');
      }finally{clearInterval(worker.timer);delete globalThis.__waQueueWorker;}
      await enqueueEvent(a.tenantId,{id:'expired-final',threadId:'expired-thread',senderPhone:'919222222222',text:'Saved message',at:Date.now()});
      await server.db().prepare("UPDATE wa_jobs SET status='processing',attempts=3,created=0 WHERE tenant_id=? AND id='expired-final'").bind(a.tenantId).run();
      const ownership=await import('./whatsapp/lib/queue-ownership.ts');
      const claim=await ownership.claimThreadJobs(a.tenantId,'expired-thread',3);
      assert.equal(claim.jobs.length,0);
      await ownership.releaseThread(a.tenantId,'expired-thread',claim.token);
      assert.equal((await server.db().prepare("SELECT status FROM wa_jobs WHERE tenant_id=? AND id='expired-final'").bind(a.tenantId).first()).status,'failed');
      await server.saveSettings(config,a.tenantId);
    });
    await t.test('owner oversight shows real registrations, sessions, activity and usage without exposing secrets',async()=>{
      const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(process.env.SESSION_SIGNING_KEY),{name:'HMAC',hash:'SHA-256'},false,['sign']);
      const id=crypto.randomUUID(),owner='Nina registered owner';
      const payload=JSON.stringify({user:owner,jti:id,iat:Date.now(),exp:Date.now()+60000});
      const signature=Buffer.from(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(payload))).toString('hex');
      await state('owner_session:'+id,{user:owner,createdAt:Date.now(),expiresAt:Date.now()+60000});
      const cookie='nina_owner_session='+encodeURIComponent(btoa(payload)+'.'+signature);
      assert.equal((await adminRoute.GET(req('/api/admin',undefined,cookie))).status,404);
      const spoofed=req('/api/admin',undefined,cookie);spoofed.headers.set(PRIVATE_WORKSPACE_PROOF_HEADER,Date.now()+'.'+'0'.repeat(64));
      assert.equal((await adminRoute.GET(spoofed)).status,404);
      assert.equal((await adminRoute.GET(req('/api/admin'))).status,404);
      assert.equal((await adminRoute.GET(req('/api/admin',undefined,a.cookie))).status,404);
      const login=await auth.POST(req('/api/auth',{action:'login',email:'beta@test.example',password:'long-test-password'}));
      assert.equal(login.status,200);
      const sessionCookie=login.headers.get('set-cookie').split(';')[0];
      const helpers=await import('./whatsapp/lib/auth.ts');
      const businessSession=await helpers.verifySessionToken(decodeURIComponent(sessionCookie.slice('wa_session='.length)));
      const response=await adminRoute.GET(await privateReq(req('/api/admin',undefined,cookie)));
      assert.equal(response.status,200,await response.clone().text());
      const result=await response.json();
      assert.equal(result.ownerName,owner);
      assert.ok(result.tenants.some(t=>t.id===a.tenantId&&t.name==='Alpha'));
      assert.ok(result.users.some(u=>u.email==='beta@test.example'&&u.lastLoginAt&&u.lastSeenAt));
      assert.ok(result.sessions.some(s=>s.id===businessSession.jti&&s.status==='active'));
      assert.ok(result.activity.some(event=>event.kind==='User login'));
      assert.ok(result.daily.some(day=>day.calls>0&&day.received>0&&day.sent>0));
      assert.ok(result.ownerSessions.some(s=>s.current&&s.name===owner));
      for(const secret of ['fake-admin-primary','fake-admin-backup','password_hash','fake-wa-token'])assert.ok(!JSON.stringify(result).includes(secret));
      const action={action:'revoke-session',kind:'business',id:businessSession.jti};
      assert.equal((await adminRoute.POST(req('/api/admin',action,a.cookie))).status,404);
      assert.equal((await adminRoute.POST(await privateReq(req('/api/admin',action,cookie)))).status,200);
      assert.equal(await helpers.verifySessionToken(decodeURIComponent(sessionCookie.slice('wa_session='.length))),null);
      assert.equal((await adminRoute.POST(await privateReq(req('/api/admin',{action:'revoke-session',kind:'owner',id},cookie)))).status,400);
    });
    await t.test('suspension blocks AI and the public catalog',async()=>{
      await server.updateBusinessTenantStatus(b.tenantId,'suspended');
      await assert.rejects(completeBusinessAI(b.tenantId,[{role:'user',content:'Hello'}]),e=>e.status===403);
      assert.equal((await catalogRoute.GET(req('/api/catalog?business='+b.tenantId))).status,404);
    });
  }finally{globalThis.fetch=originalFetch;}
});
