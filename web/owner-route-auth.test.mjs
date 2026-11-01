import {test} from 'node:test';
import assert from 'node:assert/strict';
process.env.TURSO_DATABASE_URL='';
process.env.TURSO_AUTH_TOKEN='';
process.env.SESSION_SIGNING_KEY='owner-cookie-regression-'.repeat(3);
process.env.CREDENTIALS_KEY='12'.repeat(32);
process.env.NEXT_PUBLIC_APP_URL='https://owner.test';
const {createTursoAdapter}=await import('./whatsapp/lib/turso.ts');
const database=createTursoAdapter('file::memory:','fixture');
globalThis.DB=database;
for(const statement of [
  'CREATE TABLE workspace_state(key TEXT PRIMARY KEY,payload TEXT)',
  'CREATE TABLE encrypted_secrets(key TEXT PRIMARY KEY,cipher TEXT)',
  'CREATE TABLE threads(id TEXT PRIMARY KEY,demo INTEGER,payload TEXT,version INTEGER,updated INTEGER)',
  'CREATE TABLE jobs(id TEXT PRIMARY KEY,thread_id TEXT,payload TEXT,status TEXT,attempts INTEGER,created INTEGER)',
  'CREATE TABLE activity(id TEXT PRIMARY KEY,kind TEXT,message TEXT,created INTEGER,demo INTEGER)',
  'CREATE TABLE usage(day TEXT PRIMARY KEY,calls INTEGER,tokens INTEGER,sent INTEGER)',
])await database.exec(statement);
const server=await import('./instagram/lib/server.ts');
const auth=await import('./instagram/app/api/auth/route.ts');
const workspace=await import('./instagram/app/api/workspace/route.ts');
const limits=await import('./instagram/app/api/limits/route.ts');
const automation=await import('./instagram/app/api/automation-status/route.ts');
const health=await import('./instagram/app/api/health/route.ts');
const mobile=await import('./instagram/app/api/owner-mobile-auth/route.ts');
const {proxyPrivateWhatsApp}=await import('./instagram/lib/whatsapp-proxy.ts');
const {isPrivateWorkspaceRequest,PRIVATE_WORKSPACE_PROOF_HEADER}=await import('./shared/private-workspace-bridge.ts');
const {NextRequest}=await import('./instagram/node_modules/next/server.js');
const req=(path,body,cookie)=>new NextRequest('https://owner.test'+path,{method:body?'POST':'GET',headers:{origin:'https://owner.test','content-type':'application/json',...(cookie?{cookie}:{})},...(body?{body:JSON.stringify(body)}:{})});
test('public deployment health check exposes no owner or workspace data',async()=>{const response=await health.GET();assert.equal(response.status,200);assert.deepEqual(await response.json(),{status:'ok'});});
test('actual owner login cookie authenticates workspace and private status routes, then revokes',async()=>{
  const salt='fixture-only-salt',password='fixture-long-password';
  let username='Fixture Owner';
  while(JSON.stringify({user:username,iat:Date.now(),exp:Date.now()+30*86400000,jti:crypto.randomUUID()}).length%3===0)username+='x';
  const material=await crypto.subtle.importKey('raw',new TextEncoder().encode(password+salt),'PBKDF2',false,['deriveBits']);
  const bits=await crypto.subtle.deriveBits({name:'PBKDF2',salt:new TextEncoder().encode(salt),iterations:100000,hash:'SHA-256'},material,256);
  await server.writeState('owner_credentials',{hasSignedUp:true,username,salt,passwordHash:Buffer.from(bits).toString('hex')});
  for(const route of [workspace,limits,automation])assert.equal((await route.GET(req('/api/private'))).status,401);
  assert.equal((await auth.POST(req('/api/auth',{action:'login',password}))).status,401);
  const response=await auth.POST(req('/api/auth',{action:'login',username,password}));
  assert.equal(response.status,200,await response.clone().text());
  const cookie=response.headers.get('set-cookie').split(';')[0];
  assert.ok(cookie.includes('%3D'));
  assert.equal((await (await auth.GET(req('/api/auth',undefined,cookie))).json()).authenticated,true);
  for(const route of [workspace,limits,automation]) {
    const response=await route.GET(req('/api/private',undefined,cookie));
    assert.equal(response.status,200,await response.clone().text());
  }
  assert.equal((await auth.DELETE(req('/api/auth',undefined,cookie))).status,200);
  assert.equal((await workspace.GET(req('/api/workspace',undefined,cookie))).status,401);
});

test('native owner sessions require explicit credentials, protect the private bridge and revoke',async()=>{
  const credentials=await server.readState('owner_credentials',null);
  const native=(path,body,token,method=body?'POST':'GET')=>new NextRequest('https://owner.test'+path,{method,headers:{'content-type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{})});
  assert.equal((await mobile.POST(req('/api/owner-mobile-auth',{username:credentials.username,password:'fixture-long-password'}))).status,403);
  assert.equal((await mobile.POST(native('/api/owner-mobile-auth',{action:'signup'}))).status,400);
  const response=await mobile.POST(native('/api/owner-mobile-auth',{username:credentials.username,password:'fixture-long-password'}));
  assert.equal(response.status,200,await response.clone().text());
  assert.equal(response.headers.get('set-cookie'),null);
  const {token}=await response.json();assert.ok(token);assert.equal(response.headers.get('cache-control'),'no-store');
  assert.equal((await (await mobile.GET(native('/api/owner-mobile-auth',undefined,token))).json()).authenticated,true);
  assert.equal((await workspace.GET(native('/api/workspace',undefined,token))).status,200);
  let forwarded=0;const original=globalThis.fetch;
  globalThis.fetch=async(url,options)=>{forwarded++;const upstream=new Request(url,{method:options.method,headers:options.headers});assert.equal(await isPrivateWorkspaceRequest(upstream),true);assert.equal(new URL(url).pathname,'/business/api/admin');return Response.json({ok:true},{headers:{'set-cookie':'private=secret',[PRIVATE_WORKSPACE_PROOF_HEADER]:'never-return'}});};
  try{
    assert.equal((await proxyPrivateWhatsApp(native('/api/whatsapp-service/admin'),['admin'])).status,401);
    assert.equal(forwarded,0);
    assert.equal((await proxyPrivateWhatsApp(native('/api/whatsapp-service/unknown',undefined,token),['unknown'])).status,404);
    const bridged=await proxyPrivateWhatsApp(native('/api/whatsapp-service/admin',undefined,token),['admin']);assert.equal(bridged.status,200);
    assert.equal(bridged.headers.get('set-cookie'),null);assert.equal(bridged.headers.get(PRIVATE_WORKSPACE_PROOF_HEADER),null);
    const missing=await proxyPrivateWhatsApp(native('/api/whatsapp-service/admin',undefined,'invalid'),['admin']);assert.equal(missing.status,401);assert.equal(forwarded,1);
  }finally{globalThis.fetch=original;}
  assert.equal((await mobile.DELETE(native('/api/owner-mobile-auth',undefined,token,'DELETE'))).status,200);
  assert.equal((await workspace.GET(native('/api/workspace',undefined,token))).status,401);
});
