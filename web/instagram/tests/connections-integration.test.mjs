// Exercise the actual server routes with an isolated SQLite database and mocked
// providers/Instagram. No production credentials, generation, or messages used.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import {z} from 'zod';
const root=path.resolve('.');
async function fixture(fixtureOptions={}){
 const sql=new DatabaseSync(':memory:');
 sql.exec(`CREATE TABLE workspace_state(key TEXT PRIMARY KEY,payload TEXT);CREATE TABLE encrypted_secrets(key TEXT PRIMARY KEY,cipher TEXT);CREATE TABLE threads(id TEXT PRIMARY KEY,demo INTEGER,payload TEXT,version INTEGER,updated INTEGER);CREATE TABLE jobs(id TEXT PRIMARY KEY,thread_id TEXT,payload TEXT,status TEXT,attempts INTEGER,created INTEGER);CREATE TABLE activity(id TEXT PRIMARY KEY,kind TEXT,message TEXT,created INTEGER,demo INTEGER);CREATE TABLE usage(day TEXT PRIMARY KEY,calls INTEGER,tokens INTEGER,sent INTEGER);`);
 const DB={prepare(query){let args=[];const statement=sql.prepare(query);const p={bind(...values){args=values;return p;},async first(){return statement.get(...args)||null;},async all(){return {results:statement.all(...args)};},async run(){return {meta:{changes:Number(statement.run(...args).changes)}};}};return p;},async batch(statements){return Promise.all(statements.map(s=>s.run()));}};
 const sends=[];const generations=[];
 const fakeFetch=async(url,requestOptions={})=>{
  const override=await fixtureOptions.remoteHook?.(url,requestOptions);if(override!==undefined)return override;
  const options=requestOptions;
  if(url.includes('/me?'))return Response.json({username:'second',user_id:options.headers.Authorization==='Bearer fixture-wrong-account-token'?'300':'200'});
  if(url.endsWith('/models'))return Response.json({data:[{id:'gemini-test'},{id:'openai/gpt-oss-120b'}]});
  if(url.endsWith('/chat/completions')){generations.push({url,authorization:options.headers.Authorization,body:JSON.parse(options.body)});return Response.json({choices:[{message:{content:generations.length===1?'Hello there 😊':'Good to hear 🙂'}}],usage:{total_tokens:9}});}
  if(url.endsWith('/messages')){sends.push({url,authorization:options.headers.Authorization,body:JSON.parse(options.body)});return Response.json({message_id:'sent-'+sends.length});}
  throw new Error('Unexpected external request');
 };
 const ClockDate=fixtureOptions.clock?class extends Date{static now(){return fixtureOptions.clock.now;}}:Date;
 const context=vm.createContext({Date:ClockDate,console,crypto,TextEncoder,TextDecoder,Request,Response,Headers,AbortSignal,Uint8Array,ArrayBuffer,Set,Map,URL,fetch:fakeFetch});
 const cache=new Map();
 async function load(file){if(cache.has(file))return cache.get(file);if(file==='cloudflare:workers'){const m=new vm.SyntheticModule(['env'],function(){this.setExport('env',{DB,CREDENTIALS_KEY:'1'.repeat(64)});},{context});cache.set(file,m);return m;}if(file==='zod'){const m=new vm.SyntheticModule(['z'],function(){this.setExport('z',z);},{context});cache.set(file,m);return m;}
  const code=ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
  const m=new vm.SourceTextModule(code,{context,identifier:file});cache.set(file,m);return m;
 }
 async function link(spec,from){return load(spec.startsWith('@/')?path.join(root,spec.slice(2))+'.ts':spec.startsWith('.')?path.resolve(path.dirname(from.identifier),spec)+'.ts':spec);}
 const server=await load(path.join(root,'lib/server.ts'));await server.link(link);await server.evaluate();
 async function route(name){const m=await load(path.join(root,'app/api/'+name+'/route.ts'));if(m.status==='unlinked')await m.link(link);if(m.status==='linked')await m.evaluate();return m.namespace;}
 const manage=await route('managed-connections'),webhook=await route('webhook'),process=await route('process');
 const post=async(payload)=>manage.POST(new Request('https://nina.test/api/managed-connections',{method:'POST',headers:{'x-nina-client':'1',Origin:'https://nina.test','Content-Type':'application/json'},body:JSON.stringify(payload)}));
 async function event(entries){const body=JSON.stringify({object:'instagram',entry:entries});const key=await crypto.subtle.importKey('raw',new TextEncoder().encode('fixture-app-secret'),{name:'HMAC',hash:'SHA-256'},false,['sign']);const hash=new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(body)));return webhook.POST(new Request('https://nina.test/api/webhook',{method:'POST',headers:{'x-hub-signature-256':'sha256='+Buffer.from(hash).toString('hex')},body}));}
 const run=()=>process.POST(new Request('https://nina.test/api/process',{method:'POST',headers:{'x-nina-client':'1'},body:'{}'}));
 const s=server.namespace;await s.saveSecret('instagram_token','fixture-owner-token');await s.saveSecret('instagram_app_secret','fixture-app-secret');await s.saveSecret('groq_key','fixture-groq-key');await s.writeState('connection',{instagramVerified:true,username:'current',igId:'100',aiVerified:true,lastEvent:Date.now()});
 const {defaults}= (await load(path.join(root,'lib/model.ts'))).namespace;await s.writeState('settings',{...defaults,enabled:true,approval:false,length:1,dailyLimit:0});
 return {s,post,event,run,sql,sends,generations,route};
}
test('accounts keep tokens, inboxes, pause state and provider routing separate',async()=>{
 const f=await fixture();
 assert.equal((await f.post({kind:'instagram',action:'add',key:'fixture-second-token'})).status,200);
 let accounts=await f.s.instagramAccounts();const second=accounts.find(a=>a.id!=='legacy-instagram');assert.equal(second.enabled,false);
 assert.equal((await f.post({kind:'instagram',action:'test',id:second.id})).status,200);
 assert.equal((await f.post({kind:'instagram',action:'update',id:second.id,enabled:true})).status,412);
 const entry=(owner,mid)=>({id:owner,messaging:[{sender:{id:'123456'},recipient:{id:owner},timestamp:Date.now(),message:{mid,text:'Hello'}}]});
 const accepted=await (await f.event([entry('100','one'),entry('200','two'),entry('999','ignored')])).json();assert.equal(accepted.accepted,2);
 await f.run();await f.run();assert.equal(f.sends.length,1);assert.ok(f.sends[0].url.endsWith('/100/messages'));assert.equal(f.sends[0].authorization,'Bearer fixture-owner-token');
 const threads=await f.s.allThreads();assert.equal(threads.length,2);assert.notEqual(threads[0].id,threads[1].id);
 assert.equal((await f.post({kind:'provider',action:'add',provider:'gemini',label:'Second model',model:'gemini-test',key:'fixture-gemini-key'})).status,200);
 const p=(await f.s.providerConnections()).find(p=>p.provider==='gemini');assert.equal((await f.post({kind:'provider',action:'test',id:p.id})).status,200);
 assert.equal((await f.post({kind:'provider',action:'activate',id:p.id})).status,400);
 assert.equal((await f.post({kind:'instagram',action:'update',id:second.id,providerId:p.id})).status,400);
 assert.equal((await f.post({kind:'instagram',action:'update',id:second.id,enabled:true,providerId:p.id,billingAcknowledged:true})).status,200);
 assert.equal((await (await f.event([entry('200','three')])).json()).accepted,1);await f.run();
 assert.equal(f.sends.length,2);assert.ok(f.sends[1].url.endsWith('/200/messages'));assert.equal(f.sends[1].authorization,'Bearer fixture-second-token');assert.ok(f.generations[1].url.startsWith('https://generativelanguage.googleapis.com/'));assert.equal(f.generations[1].authorization,'Bearer fixture-gemini-key');
 const status=await f.s.connectionStatus();assert.equal(status.primaryProviderId,'legacy-groq');assert.ok(!JSON.stringify(status).includes('fixture-'));
 assert.equal((await f.post({kind:'provider',action:'remove',id:p.id})).status,409);
 assert.equal((await f.post({kind:'provider',action:'remove',id:'legacy-groq'})).status,409);
 const repeats=await (await f.event([entry('100','one')])).json();assert.equal(repeats.accepted,0);
 assert.equal((await f.post({kind:'instagram',action:'add',key:'fixture-duplicate-token'})).status,200);const duplicate=(await f.s.instagramAccounts()).find(a=>!a.verified);assert.equal((await f.post({kind:'instagram',action:'test',id:duplicate.id})).status,409);
 assert.equal((await f.post({kind:'instagram',action:'update',id:second.id,key:'fixture-wrong-account-token'})).status,200);assert.equal((await f.post({kind:'instagram',action:'test',id:second.id})).status,409);
 f.sql.close();
});

function messageEvent(mid,at=Date.now()){return {id:'100',messaging:[{sender:{id:'123456'},recipient:{id:'100'},timestamp:at,message:{mid,text:'Hello'}}]};}
test('adaptive length saves and permits a useful explanation without changing strict short mode',async()=>{
 const answer='I meant we can keep chatting here. I am not arranging a meeting.';
 const f=await fixture({remoteHook:async(url,options)=>{
  if(url.endsWith('/chat/completions')){
   const system=JSON.parse(options.body).messages[0].content;
   return Response.json({choices:[{message:{content:system.includes('Adaptive, mostly short')?answer:'We can keep chatting here.'}}],usage:{total_tokens:10}});
  }
 }});
 const workspace=await f.route('workspace'),preview=await f.route('preview');
 const settings=await f.s.settings();
 const save=length=>workspace.PUT(new Request('https://nina.test/api/workspace',{method:'PUT',headers:{'x-nina-client':'1',Origin:'https://nina.test','Content-Type':'application/json'},body:JSON.stringify({...settings,length})}));
 const generate=()=>preview.POST(new Request('https://nina.test/api/preview',{method:'POST',headers:{'x-nina-client':'1',Origin:'https://nina.test','Content-Type':'application/json'},body:JSON.stringify({message:'What do you mean about meeting? Please explain.',channel:'dm'})}));
 assert.equal((await save(4)).status,200);
 assert.equal((await (await generate()).json()).reply,answer);
 assert.equal((await save(1)).status,200);
 assert.equal((await (await generate()).json()).reply,'We can keep chatting here.');
 assert.equal(f.sends.length,0);
 f.sql.close();
});
test('a transient provider failure retries without duplicating the incoming message',async()=>{
 let calls=0;const f=await fixture({remoteHook:async url=>{if(url.endsWith('/chat/completions')&&calls++===0)return new Response('{}',{status:503});}});
 await f.event([messageEvent('retry')]);const first=await (await f.run()).json();assert.equal(first.retryQueued,true);assert.equal(f.sends.length,0);assert.equal(f.sql.prepare("SELECT status FROM jobs WHERE id='retry'").get().status,'pending');
 f.sql.prepare("UPDATE jobs SET created=? WHERE id='retry'").run(Date.now()-1);await f.run();assert.equal(f.sends.length,1);assert.equal(f.sql.prepare("SELECT attempts FROM jobs WHERE id='retry'").get().attempts,2);assert.equal((await f.s.allThreads())[0].messages.filter(m=>m.role==='incoming').length,1);f.sql.close();
});
test('missing Instagram receipt leaves an uncertain delivery and cannot be retried automatically',async()=>{
 let attempts=0;const f=await fixture({remoteHook:async url=>{if(url.endsWith('/messages')){attempts++;return Response.json({});}}});
 await f.event([messageEvent('uncertain')]);await f.run();assert.equal((await f.s.allThreads())[0].status,'uncertain');
 f.sql.prepare("UPDATE jobs SET status='processing',created=? WHERE id='uncertain'").run(Date.now()-180000);await f.run();assert.equal(attempts,1);assert.equal(f.sql.prepare("SELECT status FROM jobs WHERE id='uncertain'").get().status,'failed');f.sql.close();
});
test('a confirmed reply survives interruption before the job acknowledgement without another send',async()=>{
 const f=await fixture();await f.event([messageEvent('ack')]);await f.run();assert.equal(f.sends.length,1);
 f.sql.prepare("UPDATE jobs SET status='processing',created=? WHERE id='ack'").run(Date.now()-180000);await f.run();assert.equal(f.sends.length,1);assert.equal(f.sql.prepare("SELECT status FROM jobs WHERE id='ack'").get().status,'done');f.sql.close();
});
test('interrupted work before sending can be safely recovered',async()=>{
 const f=await fixture();await f.event([messageEvent('recover')]);f.sql.prepare("UPDATE jobs SET status='processing',created=? WHERE id='recover'").run(Date.now()-180000);await f.run();assert.equal(f.sends.length,1);assert.equal(f.sql.prepare("SELECT status FROM jobs WHERE id='recover'").get().status,'done');f.sql.close();
});
test('parallel processing preserves order for messages in the same conversation',async()=>{
 let release,entered;const blocked=new Promise(r=>release=r),generationEntered=new Promise(r=>entered=r);let first=true;
 const f=await fixture({remoteHook:async url=>{if(first&&url.endsWith('/chat/completions')){first=false;entered();await blocked;}}});
 const at=Date.now();await f.event([messageEvent('ordered-one',at),messageEvent('ordered-two',at)]);const running=f.run();await generationEntered;
 const second=await (await f.run()).json();assert.equal(second.processed,0);release();await running;await f.run();assert.equal(f.sends.length,2);const t=(await f.s.allThreads())[0];assert.equal(t.messages.filter(m=>m.role==='incoming').length,2);assert.equal(t.lastReplyEventId,'ordered-two');f.sql.close();
});
test('expired DMs do not spend a provider call or attempt a send',async()=>{
 const f=await fixture();await f.event([messageEvent('expired',Date.now()-25*3600000)]);await f.run();assert.equal(f.generations.length,0);assert.equal(f.sends.length,0);assert.equal(f.sql.prepare("SELECT status FROM jobs WHERE id='expired'").get().status,'failed');f.sql.close();
});

test('legacy replies without an event receipt are not sent again after recovery',async()=>{
 const f=await fixture();await f.event([messageEvent('legacy-ack')]);await f.run();const t=(await f.s.allThreads())[0];delete t.lastReplyEventId;delete t.lastReplyEventIds;await f.s.saveThread(t);
 f.sql.prepare("UPDATE jobs SET status='processing',created=? WHERE id='legacy-ack'").run(Date.now()-180000);await f.run();assert.equal(f.sends.length,1);assert.equal(f.sql.prepare("SELECT status FROM jobs WHERE id='legacy-ack'").get().status,'failed');f.sql.close();
});

test('ten-second quiet period groups messages into one reply with receipts for every event',async()=>{
 const clock={now:Date.now()};const f=await fixture({clock});const s=await f.s.settings();await f.s.writeState('settings',{...s,replyDelaySeconds:10});
 await f.event([messageEvent('burst-one',clock.now)]);assert.equal((await (await f.run()).json()).processed,0);assert.equal(f.generations.length,0);
 clock.now+=5000;const second=messageEvent('burst-two',clock.now);second.messaging[0].message.text='And how are you?';await f.event([second]);
 clock.now+=5001;assert.equal((await (await f.run()).json()).processed,0);clock.now+=5000;
 await f.run();assert.equal(f.sends.length,1);assert.equal(f.generations.length,1);assert.match(f.generations[0].body.messages.at(-1).content,/Hello\nAnd how are you/);
 assert.equal(f.sql.prepare("SELECT COUNT(*) c FROM jobs WHERE status='done'").get().c,2);
 f.sql.prepare("UPDATE jobs SET status='processing',created=?").run(clock.now-180000);await f.run();assert.equal(f.sends.length,1);assert.equal(f.sql.prepare("SELECT COUNT(*) c FROM jobs WHERE status='done'").get().c,2);f.sql.close();
});
test('message arriving during generation prevents an outdated reply and joins the next burst',async()=>{
 const clock={now:Date.now()};let release,entered;const blocked=new Promise(r=>release=r),started=new Promise(r=>entered=r);let first=true;
 const f=await fixture({clock,remoteHook:async url=>{if(first&&url.endsWith('/chat/completions')){first=false;entered();await blocked;}}});await f.s.writeState('settings',{...await f.s.settings(),replyDelaySeconds:10});
 await f.event([messageEvent('mid-generation-one',clock.now)]);clock.now+=10001;const pending=f.run();await started;const later=messageEvent('mid-generation-two',clock.now);later.messaging[0].message.text='Wait, another thing';await f.event([later]);release();assert.equal((await (await pending).json()).deferred,true);assert.equal(f.sends.length,0);assert.equal(f.sql.prepare("SELECT attempts FROM jobs WHERE id='mid-generation-one'").get().attempts,0);
 clock.now+=10001;await f.run();assert.equal(f.sends.length,1);assert.match(f.generations.at(-1).body.messages.at(-1).content,/Hello\nWait, another thing/);f.sql.close();
});
test('scheduled breaks preserve pending messages without provider calls and resume safely',async()=>{
 const clock={now:Date.now()};const f=await fixture({clock});await f.s.writeState('settings',{...await f.s.settings(),cycleEnabled:true,cycleStartedAt:clock.now-16*60000});
 await f.event([messageEvent('break-message',clock.now)]);assert.equal((await (await f.run()).json()).paused,true);assert.equal(f.generations.length,0);assert.equal(f.sql.prepare("SELECT status FROM jobs WHERE id='break-message'").get().status,'pending');
 clock.now+=60*60000;await f.run();assert.equal(f.sends.length,1);f.sql.close();
});
test('messages expire individually even in an active thread and delivery IDs survive cleanup',async()=>{
 const f=await fixture();await f.event([messageEvent('retained-id')]);await f.run();const t=(await f.s.allThreads())[0];const expired=Date.now()-25*3600000;t.messages.unshift({role:'incoming',text:'expired chat text',at:expired});t.messages.push({role:'incoming',text:'current chat text',at:Date.now()});await f.s.saveThread(t);
 const old={id:'old-event',threadId:t.id,at:expired,text:'expired queued text'};f.sql.prepare("INSERT INTO jobs VALUES (?,?,?,'done',1,?)").run(old.id,t.id,JSON.stringify(old),expired);
 await f.s.writeState('settings',{...await f.s.settings(),retention:1});assert.ok(!(await f.s.getThread(t.id)).messages.some(m=>m.text==='expired chat text'));await f.s.cleanupHistory();
 const stored=JSON.parse(f.sql.prepare('SELECT payload FROM threads WHERE id=?').get(t.id).payload);assert.ok(!stored.messages.some(m=>m.text==='expired chat text'));assert.ok(stored.messages.some(m=>m.text==='current chat text'));assert.equal(stored.lastReplyEventId,'retained-id');
 assert.ok(!f.sql.prepare("SELECT payload FROM jobs WHERE id='old-event'").get().payload.includes('expired queued text'));assert.equal((await (await f.event([messageEvent('retained-id')])).json()).accepted,0);f.sql.close();
});
test('deleting a conversation keeps webhook deduplication without retaining its chat text',async()=>{
 const f=await fixture();await f.event([messageEvent('deleted-chat')]);await f.run();const t=(await f.s.allThreads())[0];const route=await f.route('threads');
 const response=await route.POST(new Request('https://nina.test/api/threads',{method:'POST',headers:{'x-nina-client':'1'},body:JSON.stringify({id:t.id,action:'delete'})}));assert.equal(response.status,200);assert.equal((await f.s.allThreads()).length,0);assert.equal((await (await f.event([messageEvent('deleted-chat')])).json()).accepted,0);assert.ok(!f.sql.prepare("SELECT payload FROM jobs WHERE id='deleted-chat'").get().payload.includes('Hello'));f.sql.close();
});
test('a rewrite that still repeats a recent response is withheld instead of sent',async()=>{
 const f=await fixture({remoteHook:async url=>url.endsWith('/chat/completions')?Response.json({choices:[{message:{content:'Same thing 😄'}}]}):undefined});
 await f.event([messageEvent('repeat-first')]);await f.run();await f.event([messageEvent('repeat-second')]);const result=await (await f.run()).json();assert.equal(result.retryQueued,true);assert.equal(f.sends.length,1);f.sql.close();
});

test('Android pairing is one-time, expiring and revocable, with no credential exports',async()=>{
 const clock={now:Date.now()},f=await fixture({clock});const access=await f.route('mobile-access'),pair=await f.route('mobile/pair'),mobile=await f.route('mobile');
 const owner=(payload)=>new Request('https://nina.test/api/mobile-access',{method:'POST',headers:{'x-nina-client':'1',Origin:'https://nina.test'},body:JSON.stringify(payload)});
 const redeem=code=>pair.POST(new Request('https://nina.test/api/mobile/pair',{method:'POST',body:JSON.stringify({code,label:'Test phone'})}));
 const dispatch=(token,path,method='GET',payload={})=>mobile.POST(new Request('https://nina.test/api/mobile',{method:'POST',headers:{'x-nina-device':token},body:JSON.stringify({path,method,payload})}));
 assert.equal((await access.POST(new Request('https://nina.test/api/mobile-access',{method:'POST',body:'{"action":"create"}'}))).status,403);
 assert.equal((await dispatch('0'.repeat(64),'/api/workspace')).status,401);
 const first=await (await access.POST(owner({action:'create'}))).json();assert.match(first.code,/^NK-[a-f0-9]{64}$/);
 assert.ok(!JSON.stringify(f.sql.prepare('SELECT payload FROM workspace_state WHERE key=?').get('mobile_pairing')).includes(first.code));
 const results=await Promise.all([redeem(first.code),redeem(first.code)]);assert.deepEqual(results.map(r=>r.status).sort(),[200,401]);const session=await results.find(r=>r.status===200).json();
 const workspace=await dispatch(session.deviceToken,'/api/workspace');assert.equal(workspace.status,200);const content=await workspace.text();assert.ok(!content.includes('fixture-owner-token'));assert.ok(!content.includes('fixture-groq-key'));
 assert.equal((await dispatch(session.deviceToken,'/api/mobile-access','POST',{action:'create'})).status,403);
 assert.equal((await dispatch(session.deviceToken,'https://evil.test')).status,403);
 const list=await (await access.GET()).json();assert.equal(list.devices.length,1);assert.ok(!JSON.stringify(list).includes(session.deviceToken));
 assert.equal((await access.POST(owner({action:'revoke',id:list.devices[0].id}))).status,200);assert.equal((await dispatch(session.deviceToken,'/api/workspace')).status,401);
 const second=await (await access.POST(owner({action:'create'}))).json();clock.now+=11*60000;assert.equal((await redeem(second.code)).status,401);
 const third=await (await access.POST(owner({action:'create'}))).json();const thirdSession=await (await redeem(third.code)).json();clock.now+=31*86400000;assert.equal((await dispatch(thirdSession.deviceToken,'/api/workspace')).status,401);
 assert.equal(f.sends.length,0);f.sql.close();
});

test('both accounts share one API until quota causes a sticky fallback',async()=>{
 const attempts=[];let limited=false;
 const f=await fixture({remoteHook:async(url,options)=>{if(url.endsWith('/chat/completions')){attempts.push(options.headers.Authorization);if(options.headers.Authorization==='Bearer fixture-groq-key'&&limited)return Response.json({error:{message:'Rate limit reached'}},{status:429,headers:{'Retry-After':'120'}});}}});
 await f.post({kind:'provider',action:'add',provider:'gemini',label:'Shared backup',model:'gemini-test',key:'fixture-gemini-key'});const backup=(await f.s.providerConnections()).find(p=>p.provider==='gemini');await f.post({kind:'provider',action:'test',id:backup.id});
 assert.equal((await f.post({kind:'provider',action:'routing',shared:true,fallbackEnabled:true,order:['legacy-groq',backup.id],approvedIds:['legacy-groq',backup.id]})).status,400);
 assert.equal((await f.post({kind:'provider',action:'routing',shared:true,fallbackEnabled:true,order:['legacy-groq',backup.id],approvedIds:['legacy-groq',backup.id],billingAcknowledged:true})).status,200);
 await f.post({kind:'instagram',action:'add',key:'fixture-second-token'});const second=(await f.s.instagramAccounts()).find(a=>a.id!=='legacy-instagram');await f.post({kind:'instagram',action:'test',id:second.id});await f.post({kind:'instagram',action:'update',id:second.id,providerId:backup.id,billingAcknowledged:true});
 await f.s.generateReply('hello','dm',[],'legacy-instagram');await f.s.generateReply('hello','dm',[],second.id);assert.deepEqual(attempts,['Bearer fixture-groq-key','Bearer fixture-groq-key']);
 limited=true;await f.s.generateReply('hello','dm',[],'legacy-instagram');assert.deepEqual(attempts.slice(-2),['Bearer fixture-groq-key','Bearer fixture-gemini-key']);
 await f.s.generateReply('hello','dm',[],second.id);assert.equal(attempts.at(-1),'Bearer fixture-gemini-key');assert.equal(attempts.filter(x=>x==='Bearer fixture-groq-key').length,3);
 const status=await f.s.connectionStatus();assert.equal(status.providerRouting.activeProviderId,backup.id);assert.ok(status.providerRouting.cooldowns['legacy-groq']>Date.now());assert.ok(!JSON.stringify(status).includes('fixture-groq-key'));assert.equal(f.sends.length,0);f.sql.close();
});
test('all API quotas keep replies queued without exhausting safe job attempts',async()=>{
 const clock={now:Date.now()};const f=await fixture({clock,remoteHook:async url=>url.endsWith('/chat/completions')?Response.json({error:{message:'Daily quota reached'}},{status:429,headers:{'Retry-After':'3600'}}):undefined});
 await f.post({kind:'provider',action:'routing',shared:true,fallbackEnabled:true,order:['legacy-groq'],approvedIds:['legacy-groq']});await f.event([messageEvent('all-limited',clock.now)]);const result=await (await f.run()).json();assert.equal(result.retryQueued,true);const job=f.sql.prepare("SELECT status,attempts,created FROM jobs WHERE id='all-limited'").get();assert.equal(job.status,'pending');assert.equal(job.attempts,0);assert.ok(job.created>=clock.now+3600000);assert.equal(f.sends.length,0);f.sql.close();
});
test('bad credentials and app caps do not silently switch API providers',async()=>{
 const f=await fixture({remoteHook:async url=>url.endsWith('/chat/completions')?Response.json({error:{message:'Invalid key'}},{status:401}):undefined});
 await f.post({kind:'provider',action:'routing',shared:true,fallbackEnabled:true,order:['legacy-groq'],approvedIds:['legacy-groq']});await assert.rejects(()=>f.s.generateReply('hello','dm'),/rejected the API key/);assert.equal(Object.keys((await f.s.connectionStatus()).providerRouting.cooldowns).length,0);
 const s=await f.s.settings();s.dailyLimit=1;await f.s.writeState('settings',s);await assert.rejects(()=>f.s.generateReply('hello','dm'),/daily generation limit/);assert.equal(f.sends.length,0);f.sql.close();
});
test('parallel quota responses rotate the shared pointer only once',async()=>{
 const f=await fixture({remoteHook:async(url,options)=>url.endsWith('/chat/completions')&&options.headers.Authorization==='Bearer fixture-groq-key'?Response.json({error:{message:'rate limit'}},{status:429}):undefined});
 await f.post({kind:'provider',action:'add',provider:'groq',label:'Backup',model:'openai/gpt-oss-120b',key:'fixture-backup-key'});const p=(await f.s.providerConnections()).find(p=>p.id!=='legacy-groq');await f.post({kind:'provider',action:'test',id:p.id});await f.post({kind:'provider',action:'routing',shared:true,fallbackEnabled:true,order:['legacy-groq',p.id],approvedIds:['legacy-groq',p.id]});
 await Promise.all([f.s.generateReply('hello','dm'),f.s.generateReply('hello','dm')]);assert.equal((await f.s.connectionStatus()).providerRouting.activeProviderId,p.id);assert.equal(f.sql.prepare("SELECT COUNT(*) count FROM activity WHERE kind='Shared API switched'").get().count,1);assert.equal(f.sends.length,0);f.sql.close();
});

test('limit monitor captures safe per-key counters atomically and never calls providers on refresh',async()=>{
 const f=await fixture();const headers=new Headers({'x-ratelimit-limit-requests':'100','x-ratelimit-remaining-requests':'20'});
 await Promise.all(Array.from({length:5},()=>f.s.traceAPI('provider','legacy-groq','groq',200,headers,{usage:{total_tokens:9},message:'private-chat',key:'private-key'})));
 await f.s.traceAPI('meta','legacy-instagram','meta',400,new Headers(),{error:{code:80002,message:'private-chat'}});
 const api=await f.route('limits');const report=await (await api.GET()).json();assert.equal(report.providers[0].today.calls,5);assert.equal(report.providers[0].today.tokens,45);assert.equal(report.meta[0].today.limited,1);assert.equal(report.providers[0].snapshot.metrics[0].remaining,20);assert.equal(f.generations.length,0);assert.equal(f.sends.length,0);assert.ok(!JSON.stringify(report).includes('private-'));assert.ok(!JSON.stringify(report).includes('fixture-'));
 await f.s.clearAPITrace('provider','legacy-groq');const after=await f.s.limitsStatus();assert.equal(after.providers[0].today.calls,0);assert.equal(after.providers[0].snapshot,undefined);
});
test('changing a model clears only its traces and preserves the shared primary',async()=>{
 const f=await fixture();
 assert.equal((await f.post({kind:'provider',action:'add',provider:'gemini',label:'Backup',model:'gemini-test',key:'fixture-gemini-key'})).status,200);
 const p=(await f.s.providerConnections()).find(p=>p.provider==='gemini');
 await f.s.traceAPI('provider',p.id,'gemini',404,new Headers());
 await f.s.traceAPI('provider','legacy-groq','groq',200,new Headers(),{usage:{total_tokens:9}});
 assert.equal((await f.post({kind:'provider',action:'update',id:p.id,model:'gemini-new'})).status,200);
 assert.equal((await f.s.providerConnections()).find(q=>q.id===p.id).model,'gemini-new');
 const report=await f.s.limitsStatus(),reset=report.providers.find(q=>q.id===p.id);
 assert.equal(reset.snapshot,undefined);assert.equal(reset.today.calls,0);
 await f.s.traceAPI('provider',p.id,'gemini',200,new Headers(),{usage:{total_tokens:12}});
 const renewed=(await f.s.limitsStatus()).providers.find(q=>q.id===p.id);
 assert.equal(renewed.today.calls,1);assert.equal(renewed.today.tokens,12);assert.equal(renewed.snapshot.status,200);
 assert.ok(f.sql.prepare('SELECT payload FROM workspace_state WHERE key=?').get('trace_snapshot:provider:legacy-groq'));
 assert.equal((await f.s.connectionStatus()).primaryProviderId,'legacy-groq');
 assert.equal(f.sends.length,0);f.sql.close();
});
test('generation and Instagram responses are traced without altering delivery controls',async()=>{
 const f=await fixture({remoteHook:async url=>url.endsWith('/chat/completions')?Response.json({choices:[{message:{content:'Hey there'}}],usage:{total_tokens:11}},{headers:{'x-ratelimit-limit-tokens':'6000','x-ratelimit-remaining-tokens':'5990'}}):url.endsWith('/messages')?Response.json({message_id:'receipt'},{headers:{'x-app-usage':JSON.stringify({call_count:30,total_time:10})}}):undefined});
 const text=await f.s.generateReply('Hello','dm',[],'legacy-instagram');await f.s.saveThread({id:'trace-test',name:'Test',username:'test',channel:'dm',demo:false,status:'open',takeover:false,ai:true,messages:[],draft:'',lastInbound:Date.now(),recipientId:'123',updated:Date.now()});await f.s.sendReply(await f.s.getThread('trace-test'),text,'new-event');const report=await f.s.limitsStatus();assert.equal(report.providers[0].today.calls,1);assert.equal(report.providers[0].today.tokens,11);assert.equal(report.meta[0].today.calls,1);assert.equal(report.meta[0].snapshot.metrics[0].used,30);assert.equal((await f.s.getThread('trace-test')).status,'resolved');
});

test('private sandbox targets the exact saved key without changing shared routing or sending',async()=>{
 const f=await fixture();const preview=await f.route('preview');
 await f.post({kind:'provider',action:'add',provider:'gemini',label:'Private test key',model:'gemini-test',key:'fixture-isolated-key'});
 const p=(await f.s.providerConnections()).find(p=>p.provider==='gemini');
 const before=JSON.stringify(await f.s.routingStatus());
 const req=(body)=>new Request('https://nina.test/api/preview',{method:'POST',headers:{'x-nina-client':'1',Origin:'https://nina.test'},body:JSON.stringify(body)});
 const response=await preview.POST(req({message:'Hello there',channel:'dm',providerId:p.id}));assert.equal(response.status,200);const result=await response.json();assert.equal(result.sent,false);assert.ok(result.words>0);assert.ok(result.durationMs>=0);assert.equal(f.generations[0].authorization,'Bearer fixture-isolated-key');assert.equal(JSON.stringify(await f.s.routingStatus()),before);assert.equal(f.sends.length,0);
 assert.equal((await preview.POST(req({message:'Hello',channel:'dm',providerId:'missing'}))).status,404);
 assert.equal((await preview.POST(req({message:'Hello',channel:'dm',accountId:'missing'}))).status,404);f.sql.close();
});
test('mobile rejects malformed and oversized payloads and revoke-all invalidates sessions and codes',async()=>{
 const f=await fixture();const access=await f.route('mobile-access'),pair=await f.route('mobile/pair'),mobile=await f.route('mobile');
 const req=(body)=>new Request('https://nina.test/api/mobile-access',{method:'POST',headers:{'x-nina-client':'1',Origin:'https://nina.test'},body:JSON.stringify(body)});
 assert.equal((await access.POST(req(null))).status,400);
 assert.equal((await pair.POST(new Request('https://nina.test/api/mobile/pair',{method:'POST',body:'broken'}))).status,400);
 assert.equal((await pair.POST(new Request('https://nina.test/api/mobile/pair',{method:'POST',body:'x'.repeat(1025)}))).status,413);
 const code=await (await access.POST(req({action:'create'}))).json();const session=await (await pair.POST(new Request('https://nina.test/api/mobile/pair',{method:'POST',body:JSON.stringify({code:code.code})}))).json();
 assert.equal((session.expiresAt-Date.now())/86400000>29.99,true);
 const dispatch=(body)=>mobile.POST(new Request('https://nina.test/api/mobile',{method:'POST',headers:{'x-nina-device':session.deviceToken},body:JSON.stringify(body)}));
 assert.equal((await dispatch(null)).status,400);assert.equal((await dispatch({path:'/api/workspace',method:'GET',extra:true})).status,400);
 const unused=await (await access.POST(req({action:'create'}))).json();assert.equal((await access.POST(req({action:'revoke-all'}))).status,200);assert.equal((await dispatch({path:'/api/workspace',method:'GET'})).status,401);
 assert.equal((await pair.POST(new Request('https://nina.test/api/mobile/pair',{method:'POST',body:JSON.stringify({code:unused.code})}))).status,401);assert.equal(f.sends.length,0);f.sql.close();
});
