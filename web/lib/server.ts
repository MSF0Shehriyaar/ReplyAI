import {providerLimited,providerRetryAt} from './provider-limits';
import {limitMetadata,type LimitSnapshot} from './limit-metadata';
import { automationWindow, channelAutomationWindow } from './automation-window';
import { replyLengthInstruction, languageReference, needsRomanization, needsReplyRewrite, isRomanHindi, repeatedReply, varyEmoji, profileAge, isProfileQuestion, enforceRespectfulFemaleGrammar, buildSystemPrompt } from './reply-style';
import { providerConfig, completionBody } from './provider-config';
const env: any = (globalThis as any).__CLOUDFLARE_ENV__ || (typeof process !== 'undefined' ? process.env : {}) || {};
import { z } from 'zod';
import { defaults, type Settings, type Thread, type Connections, type InstagramAccount, type ProviderConnection, type ProviderRouting } from './model';
import { analyzeIncomingText } from './text-analyzer';
import { createTursoAdapter } from './turso';
export class AppError extends Error { constructor(message:string,public status=400,public retryable=false,public retryAt?:number){super(message);} }
export function getTursoConfig(): { url: string; token: string } | null {
  const url = (globalThis as any).TURSO_DATABASE_URL || (globalThis as any).__CLOUDFLARE_ENV__?.TURSO_DATABASE_URL || (typeof env !== 'undefined' ? (env as any)?.TURSO_DATABASE_URL : null) || (typeof process !== 'undefined' ? process.env?.TURSO_DATABASE_URL : null);
  const token = (globalThis as any).TURSO_AUTH_TOKEN || (globalThis as any).__CLOUDFLARE_ENV__?.TURSO_AUTH_TOKEN || (typeof env !== 'undefined' ? (env as any)?.TURSO_AUTH_TOKEN : null) || (typeof process !== 'undefined' ? process.env?.TURSO_AUTH_TOKEN : null);
  if (url && token) return { url, token };
  return null;
}
export function db(): D1Database {
  const turso = getTursoConfig();
  if (turso) return createTursoAdapter(turso.url, turso.token) as unknown as D1Database;
  const database = (globalThis as any).DB || (globalThis as any).__CLOUDFLARE_ENV__?.DB || (typeof env !== 'undefined' ? (env as any)?.DB : null);
  if(!database)throw new AppError('Saved data is temporarily unavailable. Please try again.',503);
  return database as D1Database;
}
export function errorResponse(e:unknown){
 if(e instanceof AppError || (e && typeof e === 'object' && 'status' in e && 'message' in e)){
  return Response.json({error:(e as any).message},{status:(e as any).status || 400});
 }
 const message=e instanceof Error?e.message:'Unknown error';
 console.error('Nina operation failed:',message,e instanceof Error?e.stack:'');
 return Response.json({error:message||'This action could not be completed. Your edits are still here; please try again.'},{status:500});
}
// Sites dispatch enforces owner-only access before any request reaches this
// shared workspace. Embedded previews may use platform service access, which
// dispatch consumes without forwarding a signed-in user's identity headers.
// Keep this Site private; user-specific records would need identity checks.
export async function requireWorkspaceRequest(request?:Request){
  if(request&&request.method!=='GET'){
    if(request.headers.get('x-nina-client')!=='1')throw new AppError('Invalid request.',403);
    const origin=request.headers.get('origin');
    if(origin){
      let isValidOrigin = false;
      try {
        const originUrl = new URL(origin);
        const originHost = originUrl.host;
        const reqOrigin = new URL(request.url).origin;
        const fwdHost = request.headers.get('x-forwarded-host') || request.headers.get('host');
        
        if (
          origin === reqOrigin ||
          (fwdHost && (originHost === fwdHost || origin === `https://${fwdHost}` || origin === `http://${fwdHost}`)) ||
          originHost.endsWith('ninakurainservices.in') ||
          originHost.endsWith('onrender.com') ||
          originHost === 'localhost' ||
          originHost.startsWith('localhost:')
        ) {
          isValidOrigin = true;
        }
      } catch {
        isValidOrigin = false;
      }
      if(!isValidOrigin) throw new AppError('Invalid request origin.',403);
    }
  }
  // Enforce owner session verification for sensitive workspace requests
  if(request){
    const cookieHeader = request.headers.get('cookie') || '';
    const deviceHeader = request.headers.get('x-nina-device');
    const isOwnerSession = cookieHeader.includes('nina_owner_session=');
    const hasDevice = !!deviceHeader;
    // If an owner account has registered, require authenticated session or device
    const creds = await readState<any>('owner_credentials', null);
    if(creds?.hasSignedUp && !isOwnerSession && !hasDevice){
      throw new AppError('Owner authentication required. Please sign in.', 401);
    }
  }
}
const stateCache = new Map<string, { val: any; exp: number }>();
export async function readState<T>(key:string,fallback:T):Promise<T>{
 const now = Date.now();
 const cached = stateCache.get(key);
 if (cached && cached.exp > now) return cached.val as T;
 const row=await db().prepare('SELECT payload FROM workspace_state WHERE key = ?').bind(key).first<{payload:string}>();
 const res = row?JSON.parse(row.payload):fallback;
 stateCache.set(key, { val: res, exp: now + 5000 });
 return res;
}
export async function writeState(key:string,value:unknown){
 stateCache.delete(key);
 await db().prepare('INSERT INTO workspace_state (key,payload) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET payload=excluded.payload').bind(key,JSON.stringify(value)).run();
}
export async function traceAPI(kind:'provider'|'meta',id:string,provider:string,status:number,headers:Headers,data?:any){
 try{const snapshot=limitMetadata(kind,provider,status,headers,data);const day=new Date().toISOString().slice(0,10),key='trace_usage:'+kind+':'+id+':'+day;const tokens=kind==='provider'&&status>=200&&status<300?Math.max(0,Math.min(10000000,Number(data?.usage?.total_tokens)||0)):0;
 await db().batch([db().prepare("INSERT INTO workspace_state(key,payload) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET payload=excluded.payload WHERE COALESCE(json_extract(workspace_state.payload,'$.at'),0)<=json_extract(excluded.payload,'$.at')").bind('trace_snapshot:'+kind+':'+id,JSON.stringify(snapshot)),db().prepare("INSERT INTO workspace_state(key,payload) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET payload=json_set(workspace_state.payload,'$.calls',json_extract(workspace_state.payload,'$.calls')+1,'$.errors',json_extract(workspace_state.payload,'$.errors')+?,'$.limited',json_extract(workspace_state.payload,'$.limited')+?,'$.tokens',json_extract(workspace_state.payload,'$.tokens')+?)").bind(key,JSON.stringify({day,calls:1,errors:status===0||status>=400?1:0,limited:snapshot.limited?1:0,tokens}),status===0||status>=400?1:0,snapshot.limited?1:0,tokens)]);
 }catch{console.warn('API limit trace unavailable');}
}
export async function clearAPITrace(kind:'provider'|'meta',id:string){
 stateCache.delete('trace_snapshot:'+kind+':'+id);
 const records:[string,unknown][]=[['trace_snapshot:'+kind+':'+id,null]];
 for(let days=0;days<7;days++){const day=new Date(Date.now()-days*86400000).toISOString().slice(0,10);records.push(['trace_usage:'+kind+':'+id+':'+day,{day,calls:0,errors:0,limited:0,tokens:0}]);}
 await db().batch(records.map(([key,payload])=>db().prepare('INSERT INTO workspace_state (key,payload) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET payload=excluded.payload').bind(key,JSON.stringify(payload))));
}
export async function limitsStatus(){
 const day=new Date().toISOString().slice(0,10),[accounts,providers,routing,s]=await Promise.all([instagramAccounts(),providerConnections(),routingStatus(),settings()]);
 const rows=(await db().prepare("SELECT key,payload FROM workspace_state WHERE key LIKE 'trace_snapshot:%' OR key LIKE 'trace_usage:%'").all<{key:string;payload:string}>()).results;const values=new Map(rows.map(r=>[r.key,JSON.parse(r.payload)]));
 const item=(kind:'provider'|'meta',id:string,label:string,provider:string,model?:string)=>{const snapshot=(values.get('trace_snapshot:'+kind+':'+id)||undefined) as LimitSnapshot|undefined;return {id,label,provider,model,snapshot,stale:!snapshot||Date.now()-snapshot.at>5*60000,today:values.get('trace_usage:'+kind+':'+id+':'+day)||{day,calls:0,errors:0,limited:0,tokens:0},cooldownUntil:kind==='provider'?routing.cooldowns[id]:undefined,active:kind==='provider'&&routing.activeProviderId===id};};
 const usage=await db().prepare('SELECT calls,tokens,sent FROM usage WHERE day=?').bind(day).first();
 await db().prepare("DELETE FROM workspace_state WHERE key LIKE 'trace_usage:%' AND json_extract(payload,'$.day')<?").bind(new Date(Date.now()-7*86400000).toISOString().slice(0,10)).run();
 const providerList=providers.map(p=>item('provider',p.id,p.label,p.provider,p.model));
 const metaList=accounts.map(a=>item('meta',a.id,a.username?'@'+a.username:'Instagram account','meta'));
 let totalRemainingRequests=0;let trackedKeys=0;
 for(const p of providerList){
  const req=p.snapshot?.metrics?.find(m=>m.unit==='requests'&&m.remaining!==undefined);
  if(req?.remaining!==undefined){totalRemainingRequests+=req.remaining;trackedKeys++;}
 }
 const activeProvider=providerList.find(p=>p.active);
 const activeReq=activeProvider?.snapshot?.metrics?.find(m=>m.unit==='requests'&&m.remaining!==undefined)?.remaining;
 const capacity={
  totalRemainingRequests:trackedKeys>0?totalRemainingRequests:null,
  activeRemainingRequests:activeReq??null,
  verifiedKeysCount:providers.filter(p=>p.verified).length,
  activeProviderLabel:activeProvider?.label||'Active connection',
  safeDelaySeconds:s.replyDelaySeconds??30,
  guidance:trackedKeys>0
   ? `${totalRemainingRequests.toLocaleString()} requests remaining across tracked keys. Recommended pacing: 1 reply every ${s.replyDelaySeconds??30}s.`
   : 'All verified keys have active quota headroom with cascading automatic fallbacks.'
 };
 return {asOf:Date.now(),day,providers:providerList,meta:metaList,workspace:{dailyLimit:s.dailyLimit,...usage},routing,capacity};
}
export async function refreshAllProviderLimits(){
 const providers=await providerConnections();
 for(const p of providers){
  if(!p.verified)continue;
  try{
   const key=await secret(providerSecretId(p.id));
   if(!key)continue;
   const config=providerConfig[p.provider];
   if(p.provider==='aihorde'){
    const res=await fetch('https://aihorde.net/api/v2/find_user',{headers:{apikey:key,'Client-Agent':'NinaUncensored:1.0:web'},signal:AbortSignal.timeout(6000)}).catch(()=>null);
    if(res){const data=await res.json().catch(()=>({}));await traceAPI('provider',p.id,p.provider,res.status,res.headers,data);}
   }else if(p.provider==='cloudflare'){
    if(key.includes(':')){
     const [cfAccount,cfToken]=key.split(':');
     const res=await fetch(`https://api.cloudflare.com/client/v4/accounts/${cfAccount}/ai/models/search`,{headers:{Authorization:'Bearer '+cfToken},signal:AbortSignal.timeout(6000)}).catch(()=>null);
     if(res){const data=await res.json().catch(()=>({}));await traceAPI('provider',p.id,p.provider,res.status,res.headers,data);}
    }
   }else{
    const url=p.provider==='openrouter'?config.base+'/key':config.base+'/models';
    const res=await fetch(url,{headers:{Authorization:'Bearer '+key},signal:AbortSignal.timeout(6000)}).catch(()=>null);
    if(res){const data=await res.json().catch(()=>({}));await traceAPI('provider',p.id,p.provider,res.status,res.headers,data);}
   }
  }catch{}
 }
 return limitsStatus();
}
export async function audit(kind:string,message:string,demo=false){await db().prepare('INSERT INTO activity (id,kind,message,created,demo) VALUES (?,?,?,?,?)').bind(crypto.randomUUID(),kind,message,Date.now(),demo?1:0).run();}
async function encryptionKey(){const rawValue: any=(globalThis as any).CREDENTIALS_KEY||(globalThis as any).__CLOUDFLARE_ENV__?.CREDENTIALS_KEY||(typeof env!=='undefined'?(env as any)?.CREDENTIALS_KEY:undefined)||(typeof process!=='undefined'?process.env?.CREDENTIALS_KEY:undefined);const value: string=typeof rawValue==='string'?rawValue:'';if(!value||!/^[a-f0-9]{64}$/i.test(value))throw new AppError('Secure credential storage is not available yet.',503);const matches=value.match(/../g)||[];const bytes=new Uint8Array(matches.map((v:string)=>parseInt(v,16)));return crypto.subtle.importKey('raw',bytes,'AES-GCM',false,['encrypt','decrypt']);}
const secretCache = new Map<string, { val: string | null; exp: number }>();
export async function saveSecret(key:string,value:string){
 secretCache.delete(key);
 const iv=crypto.getRandomValues(new Uint8Array(12));const encrypted=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:new TextEncoder().encode(key)},await encryptionKey(),new TextEncoder().encode(value)));const cipher=JSON.stringify({iv:Array.from(iv),data:Array.from(encrypted)});await db().prepare('INSERT INTO encrypted_secrets (key,cipher) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET cipher=excluded.cipher').bind(key,cipher).run();
}
export async function secret(key:string):Promise<string|null>{
 const now = Date.now();
 const cached = secretCache.get(key);
 if (cached && cached.exp > now) return cached.val;
 const row=await db().prepare('SELECT cipher FROM encrypted_secrets WHERE key=?').bind(key).first<{cipher:string}>();
 if(!row){ secretCache.set(key, { val: null, exp: now + 5000 }); return null; }
 const c=JSON.parse(row.cipher);
 const res = new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:new Uint8Array(c.iv),additionalData:new TextEncoder().encode(key)},await encryptionKey(),new Uint8Array(c.data)));
 secretCache.set(key, { val: res, exp: now + 60000 });
 return res;
}
export async function settings(){return {...defaults,...await readState<Settings>('settings',defaults)};}
export const settingsSchema=z.object({cycleEnabled:z.union([z.boolean(),z.number().transform(v=>Boolean(v))]).default(false),cycleStartedAt:z.number().int().min(0).default(0),cycleActiveMinutes:z.number().int().min(1).max(1440).default(15),cycleBreakMinutes:z.number().int().min(1).max(1440).default(60),maxWords:z.number().int().min(2).max(100).default(8),smartRoutingEnabled:z.union([z.boolean(),z.number().transform(v=>Boolean(v))]).default(true),spicyProviderId:z.string().max(100).optional().default(''),normalProviderId:z.string().max(100).optional().default(''),customSpicyWords:z.string().max(2000).optional().default(''),postCatalog:z.array(z.object({id:z.string().trim().max(100),title:z.string().trim().max(500).optional(),caption:z.string().trim().max(4000).optional(),description:z.string().trim().max(4000),contentType:z.enum(['reel','post','story']).optional(),hashtags:z.string().trim().max(1000).optional(),dateAdded:z.number().optional(),commentsEnabled:z.boolean().optional().default(true),snapUrl:z.string().trim().max(2000).optional().default(''),snapLabel:z.string().trim().max(200).optional().default(''),publishedAt:z.union([z.string(),z.number()]).optional()})).max(500).default([]),replyDelaySeconds:z.number().int().min(0).max(300).default(30),dmReplyDelaySeconds:z.number().int().min(0).max(300).optional().default(30),commentReplyDelaySeconds:z.number().int().min(0).max(120).optional().default(5),commentSleepEnabled:z.union([z.boolean(),z.number().transform(v=>Boolean(v))]).optional().default(false),dmSleepEnabled:z.union([z.boolean(),z.number().transform(v=>Boolean(v))]).optional().default(true),dmCycleActiveMinutes:z.number().int().min(1).max(1440).optional().default(15),dmCycleBreakMinutes:z.number().int().min(1).max(1440).optional().default(60),commentCycleActiveMinutes:z.number().int().min(1).max(1440).optional().default(15),commentCycleBreakMinutes:z.number().int().min(1).max(1440).optional().default(60),commentMaxAgeDays:z.number().int().min(0).max(365).optional().default(7),followGateEnabled:z.union([z.boolean(),z.number().transform(v=>Boolean(v))]).optional().default(false),followGateReelIds:z.array(z.string()).optional().default([]),followGateKeyword:z.string().max(200).optional().default(''),followGatePhotos:z.array(z.object({id:z.string(),url:z.string(),label:z.string()})).optional().default([]),followGateUnfollowedMsg:z.string().max(1000).optional(),followGateSuccessMsg:z.string().max(1000).optional(),followGateDurationSeconds:z.number().int().min(3).max(60).optional().default(7),autoDeleteEnabled:z.union([z.boolean(),z.number().transform(v=>Boolean(v))]).default(false),femaleTone:z.union([z.boolean(),z.number().transform(v=>Boolean(v))]).default(true),profile:z.object({name:z.string().trim().max(100).optional(),dob:z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/).or(z.literal('')).optional(),city:z.string().trim().max(100).optional(),country:z.string().trim().max(100).optional(),bio:z.string().trim().max(4000).optional(),profession:z.string().trim().max(100).optional(),contentStyle:z.string().trim().max(200).optional(),photoshootLocations:z.string().trim().max(200).optional(),photographer:z.string().trim().max(200).optional(),callPreference:z.string().trim().max(200).optional(),vibe:z.string().trim().max(200).optional(),denyAi:z.union([z.boolean(),z.number().transform(v=>Boolean(v))]).optional()}).optional(),excludedUsers:z.array(z.string().regex(/^(?:(?:legacy-instagram|[a-f0-9-]{36}):)?\d+$/)).max(1000).default([]),enabled:z.union([z.boolean(),z.number().transform(v=>Boolean(v))]),dm:z.union([z.boolean(),z.number().transform(v=>Boolean(v))]),comments:z.union([z.boolean(),z.number().transform(v=>Boolean(v))]),approval:z.union([z.boolean(),z.number().transform(v=>Boolean(v))]),dailyLimit:z.number().int().min(0).max(1000),tone:z.enum(['playful','friendly','calm','erotic','spicy','selective']),language:z.enum(['auto','English','Hinglish']),length:z.number().int().min(1).max(4),emoji:z.number().int().min(0).max(100),playfulness:z.number().int().min(0).max(100),memory:z.union([z.boolean(),z.number().transform(v=>Boolean(v))]),retention:z.number().int().min(1).max(365).default(30),instructions:z.string().max(8000).default(''),knowledge:z.string().max(8000).default(''),examples:z.array(z.object({incoming:z.string().trim().min(1).max(500),reply:z.string().trim().min(1).max(500)})).max(50),graphVersion:z.string().regex(/^v\d{2}\.0$/),model:z.string().trim().min(1).max(200).regex(/^[@a-zA-Z0-9._:/\-\s()+]+$/),disclosure:z.string().trim().max(400).default('')});

// Legacy connections retain their original credential keys and conversation IDs.
export async function instagramAccounts():Promise<InstagramAccount[]>{
 const c=await readState<any>('connection',{});const extra=await readState<InstagramAccount[]>('instagram_accounts',[]);
 const saved=await db().prepare("SELECT key FROM encrypted_secrets WHERE key='instagram_token'").first();
 return [...(saved?[{id:'legacy-instagram',username:c.username,igId:c.igId,verified:!!c.instagramVerified,enabled:c.automationEnabled!==false,dmEnabled:c.dmEnabled!==false,commentsEnabled:c.commentsEnabled!==false,aiEnabled:c.aiEnabled!==false,lastEvent:c.lastEvent,testedAt:c.testedAt,replyName:c.replyName||'Nina Kurain',providerId:c.providerId,tone:c.tone,customInstructions:c.customInstructions,replyDelaySeconds:c.replyDelaySeconds,dmReplyDelaySeconds:c.dmReplyDelaySeconds,commentReplyDelaySeconds:c.commentReplyDelaySeconds,cycleEnabled:c.cycleEnabled,commentSleepEnabled:c.commentSleepEnabled,dmSleepEnabled:c.dmSleepEnabled,cycleActiveMinutes:c.cycleActiveMinutes,cycleBreakMinutes:c.cycleBreakMinutes}]:[]),...extra.map(a=>({...a,dmEnabled:a.dmEnabled!==false,commentsEnabled:a.commentsEnabled!==false,aiEnabled:a.aiEnabled!==false}))];
}
export async function providerConnections():Promise<ProviderConnection[]>{
 const c=await readState<any>('connection',{});const extra=await readState<ProviderConnection[]>('ai_providers',[]);const s=await settings();
 const saved=await db().prepare("SELECT key FROM encrypted_secrets WHERE key='groq_key'").first();
 return [...(saved?[{id:'legacy-groq',label:c.providerLabel||'Current Groq key',provider:'groq' as const,model:s.model,verified:!!c.aiVerified}]:[]),...extra];
}
export function providerSecretId(id:string){return id==='legacy-groq'?'groq_key':'provider:'+id;}
export function accountTokenId(id:string){return id==='legacy-instagram'?'instagram_token':'instagram:'+id;}
export async function providerRouting(){return readState<ProviderRouting>('provider_routing',{shared:false,enabled:false,order:[],approvedIds:[]});}
export async function routingStatus(){const policy=await providerRouting(),primary=await readState<string>('primary_provider','legacy-groq'),active=await readState<string>('provider_route_active',primary);const cooldowns:Record<string,number>={};for(const p of await providerConnections()){const limit=await readState<{until:number}>('provider_limit:'+p.id,{until:0});if(limit.until>Date.now())cooldowns[p.id]=limit.until;}return {...policy,activeProviderId:policy.shared?active:primary,cooldowns};}
export async function selectedProvider(id?:string){const routing=await providerRouting();const primary=await readState<string>('primary_provider','legacy-groq');const selected=routing.shared?await readState<string>('provider_route_active',primary):id||primary;const providers=await providerConnections();return providers.find(p=>p.id===selected&&p.verified)||providers.find(p=>p.id===primary);}
export async function generationCandidates(accountProvider?:string,preferredProviderId?:string,preferUncensored=false){
 const policy=await providerRouting();
 const selected=preferredProviderId?(await providerConnections()).find(p=>p.id===preferredProviderId&&p.verified):await selectedProvider(accountProvider);
 const providers=await providerConnections();
 const verified=providers.filter(p=>p.verified);
 const candidateIds:string[]=[];
 if(selected?.id) candidateIds.push(selected.id);
 if(policy.order?.length){
  for(const id of policy.order){
   if(policy.approvedIds?.includes(id)&&!candidateIds.includes(id)&&verified.some(p=>p.id===id)){
    candidateIds.push(id);
   }
  }
 }
 for(const p of verified){
  if(!candidateIds.includes(p.id)){
   candidateIds.push(p.id);
  }
 }
 const result = candidateIds.map(id=>providers.find(p=>p.id===id)).filter((p):p is ProviderConnection=>!!p?.verified);
 if(preferUncensored){
  result.sort((a,b)=>{
   const aSpicy = a.provider==='aihorde'||a.provider==='cloudflare'||/stheno|mythomax|uncensored|spicy|horde|erotic/i.test(a.label+a.model);
   const bSpicy = b.provider==='aihorde'||b.provider==='cloudflare'||/stheno|mythomax|uncensored|spicy|horde|erotic/i.test(b.label+b.model);
   if(aSpicy&&!bSpicy) return -1;
   if(!aSpicy&&bSpicy) return 1;
   return 0;
  });
 }
 return result;
}
async function markProviderLimited(provider:ProviderConnection,until:number){await db().prepare("INSERT INTO workspace_state(key,payload) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET payload=json_object('until',MAX(COALESCE(json_extract(workspace_state.payload,'$.until'),0),?))").bind('provider_limit:'+provider.id,JSON.stringify({until}),until).run();await audit('Provider limit reached',provider.label+' is cooling down; the next approved key will be used if available.');}
async function selectSharedFallback(failedId:string,nextId:string){const policy=await providerRouting();if(!policy.shared)return;const primary=await readState<string>('primary_provider','legacy-groq');await db().prepare('INSERT OR IGNORE INTO workspace_state(key,payload) VALUES (?,?)').bind('provider_route_active',JSON.stringify(primary)).run();const changed=await db().prepare("UPDATE workspace_state SET payload=? WHERE key='provider_route_active' AND payload=?").bind(JSON.stringify(nextId),JSON.stringify(failedId)).run();if(changed.meta.changes)await audit('Shared API switched','Both accounts now use the next approved API connection.');}

export async function connectionStatus():Promise<Connections>{
 const keys=(await db().prepare('SELECT key FROM encrypted_secrets').all<{key:string}>()).results.map(r=>r.key);
 const connection=await readState<any>('connection',{});const [accounts,providers,primary]=await Promise.all([instagramAccounts(),providerConnections(),readState<string>('primary_provider','legacy-groq')]);
 const active=await selectedProvider();const lastEvent=Math.max(0,...accounts.map(a=>a.lastEvent||0));
 return {providerRouting:await routingStatus(),accounts:accounts.map(a=>({...a,appSecretSaved:keys.includes('instagram-secret:'+a.id)})),providers,primaryProviderId:primary,instagramSaved:accounts.length>0,aiSaved:!!active,appSecretSaved:keys.includes('meta_secret'),instagramAppSecretSaved:keys.includes('instagram_app_secret'),verifyTokenSaved:keys.includes('verify_token'),instagramVerified:accounts.some(a=>a.verified),aiVerified:!!active?.verified,username:connection.username,igId:connection.igId,receiverSeen:!!lastEvent,lastEvent:lastEvent||undefined,webhookVerifiedAt:connection.webhookVerifiedAt,testedAt:connection.testedAt};
}
function visibleHistory(t:Thread,days:number,autoDeleteEnabled=false){if(!autoDeleteEnabled)return t;const cutoff=Date.now()-days*86400000;return {...t,messages:t.messages.filter(m=>m.at>cutoff),draft:t.lastInbound>cutoff?t.draft:''};}
export async function cleanupHistory(force=false){const s=await settings();if(!s.autoDeleteEnabled&&!force)return;const cutoff=Date.now()-s.retention*86400000;await db().batch([db().prepare(`UPDATE threads SET payload=json_set(payload,'$.messages',json(COALESCE((SELECT json_group_array(json(value)) FROM json_each(threads.payload,'$.messages') WHERE json_extract(value,'$.at')>?),'[]')),'$.draft',CASE WHEN json_extract(payload,'$.lastInbound')>? THEN json_extract(payload,'$.draft') ELSE '' END),version=version+1 WHERE demo=0 AND (EXISTS(SELECT 1 FROM json_each(threads.payload,'$.messages') WHERE json_extract(value,'$.at')<=?) OR (json_extract(payload,'$.lastInbound')<=? AND json_extract(payload,'$.draft')!=''))`).bind(cutoff,cutoff,cutoff,cutoff),db().prepare(`UPDATE jobs SET payload=json_remove(payload,'$.text'),status=CASE WHEN status='pending' THEN 'done' ELSE status END WHERE json_extract(payload,'$.at')<=? AND status!='processing' AND json_type(payload,'$.text') IS NOT NULL`).bind(cutoff)]);}
export async function allThreads(){const rows=(await db().prepare('SELECT payload,version FROM threads WHERE demo=0 ORDER BY updated DESC LIMIT 200').all<{payload:string;version:number}>()).results;const actual=rows.map(r=>{const t={...JSON.parse(r.payload),version:r.version} as Thread;if(t.flagged?.startsWith('Explicit message'))delete t.flagged;return t;});const s=await settings();return actual.map(t=>visibleHistory(t,s.retention,!!s.autoDeleteEnabled));}
export async function getThread(id:string){const row=await db().prepare('SELECT payload,version FROM threads WHERE id=?').bind(id).first<{payload:string;version:number}>();if(row){const t={...JSON.parse(row.payload),version:row.version} as Thread;if(t.flagged?.startsWith('Explicit message'))delete t.flagged;const s=await settings();return visibleHistory(t,s.retention,!!s.autoDeleteEnabled);}throw new AppError('Conversation not found.',404);}
export async function saveThread(t:Thread){const version=t.version??0;const payload=JSON.stringify({...t,version:undefined,updated:Date.now()});if(version===0){const result=await db().prepare('INSERT OR IGNORE INTO threads (id,demo,payload,version,updated) VALUES (?,?,?,1,?)').bind(t.id,t.demo?1:0,payload,Date.now()).run();if(!result.meta.changes)throw new AppError('This conversation changed. Refresh before saving.',409);}else{const result=await db().prepare('UPDATE threads SET payload=?,version=version+1,updated=? WHERE id=? AND version=?').bind(payload,Date.now(),t.id,version).run();if(!result.meta.changes)throw new AppError('This conversation changed. Refresh before saving.',409);}}
export function reviewFlag(text:string){if(/\b(kill myself|suicide|hurt myself|self harm)\b/i.test(text))return 'Sensitive message · personal attention needed';if(/\b(i('?m| am) (1[0-7]|[1-9])\b|under ?18|minor)\b/i.test(text))return 'Age mentioned · personal attention needed';return '';}
export function isGenericRefusal(text:string){
 if(!text)return false;
 const t=text.trim();
 return /\b(?:as an? ai|i am an? ai|ai language model|virtual assistant|language model|openai|anthropic|meta ai)\b/i.test(t)
  || /\bi(?:['’]m| am) not (?:comfortable with that|into that kind of chat|able to fulfill|permitted to)\b/i.test(t)
  || /\b(?:friendly|strictly digital|virtual) (?:only|conversation only)\b/i.test(t)
  || /\b(?:i(?:['’]m| am) sorry,?\s*(?:but\s*)?)?i (?:can['’]t|cannot|am unable to|must decline to) (?:help|assist|comply|engage|provide|fulfill|generate|participate|respond|answer|continue|produce|write)\b/i.test(t)
  || /\bi(?:['’]m| am) (?:unable|not able) to (?:help|assist|fulfill|generate|respond|process|produce)\b/i.test(t)
  || /\b(?:content policy|safety guidelines|safety policy|terms of service|against my programming|policy prevents)\b/i.test(t)
  || /\b(?:i cannot fulfill this request|unable to fulfill this request|cannot generate sexually explicit|cannot generate content that is|unable to generate sexually explicit)\b/i.test(t);
}
export function explicitBoundaryDraft(channel:'dm'|'comment',history:Thread['messages']=[],input='',uncensored=false){
 if(history.some(m=>m.role==='incoming'&&reviewFlag(m.text).startsWith('Age mentioned')))return 'Let’s keep our conversation friendly and appropriate.';
 const reference=languageReference(input,history);
 const romanHindi=isRomanHindi(reference);
 const previous=history.filter(m=>m.role==='outgoing').slice(-6).map(m=>m.text);
 const lower=input.toLowerCase();

 // 1. Strict Meetup & Real Meeting Requests ("milna hai", "mumbai kab ayu", "date pe chalo", "let's meet", "meet up", "offline", "address")
 const isMeetRequest = /\b(milna|milte|milo|miloge|meet|date|aau|aao|kab ayu|address|location|kaha rehti|kaha ho|kaha se|offline|phone number|call pe)\b/i.test(lower);
 if (isMeetRequest) {
  // If location/address question specifically:
  if (/\b(kaha rehti|kaha se|location|address|area|which place|where in mumbai)\b/i.test(lower)) {
   const locReplies = romanHindi
    ? [
       "Bas Mumbai se hu haha, personal address ya location share nahi karti 🤍",
       "Sirf Mumbai jaan, exact area ya address private rehta hai 😉",
       "Mumbai se hu bas, privacy first haha ✨",
       "Just Mumbai vibes haha, details nahi de sakti 🤍"
      ]
    : [
       "Just from Mumbai haha, can't share personal address or location 🤍",
       "Mumbai girl here, keeping the exact location private 😉",
       "Just Mumbai babe, privacy first ✨",
       "From Mumbai only, I don't share address details 🤍"
      ];
   return locReplies.find(r => !previous.includes(r)) ?? locReplies[0];
  }

  // Meetup / Offline date request:
  const meetReplies = romanHindi
   ? [
      "Haha online chat only, meetups nahi karti 😉",
      "Sirf DMs aur feed pe hi milungi 🤍",
      "Privacy first haha, no offline meets ✨",
      "Haha nice try, chat pe hi baat karo 🤍",
      "Online only baby, real meets possible nahi hai 😉"
     ]
   : [
      "Haha online chat only, no in-person meets 🤍",
      "Only on your feed and in DMs haha 😉",
      "Privacy first, strictly text only ✨",
      "Haha nice try, chat here only 🤍"
     ];
  return meetReplies.find(r => !previous.includes(r)) ?? meetReplies[0];
 }

 // 2. Public Comments
 if (channel === 'comment') {
  const commentReplies = romanHindi
   ? [
      "Control karo thoda haha ✨",
      "Focus on the outfit haha 📸",
      "In your dreams haha ✨",
      "Comment section hai, keep it chill 😌",
      "Drink some water haha 🧊",
      "Aww thank you! 🤍",
      "Keep admiring haha 😉",
      "Outfit check haha ✨",
      "Aap thoda zyada aage nikal gaye haha 🧊"
     ]
   : [
      "Drink some water haha 🧊",
      "Focus on the photoshoot haha ✨",
      "In your dreams haha ✨",
      "Keep admiring haha 😉",
      "Control your horses haha ✨",
      "Aww thank you so much! 🤍",
      "Comment section, keep it polite 😌"
     ];
  return commentReplies.find(reply => !previous.includes(reply)) ?? commentReplies[0];
 }

 // 3. Private DMs - Creative, Dynamic & Seductive Replies according to user's desire
 const isExplicitSexOrNude = /\b(fuck|sex|boob|boobs|chut|choot|pussy|pu\$\$y|tits|nude|nudes|nanga|nangi|dick|lund|cleavage|chudai|chodo|bhejo|dikhao|dikhana|bed|sone|hook up|hot|sexy)\b/i.test(lower);

 if (uncensored || isExplicitSexOrNude) {
  if (romanHindi) {
   const spicyReplies = [
    "Uff itna wild mood hai tumhara aaj? tell me what's on your mind 😈",
    "Aise baatein karoge toh mera bhi mood ban jayega jaan 🔥",
    "Haha itni bechaini? Thoda tarasna bhi sexy hota hai 😉",
    "Oho direct to the point? Pehle mujhe impress karo na baby 💋",
    "Aise maangoge toh blush kar jaungi... but keep talking 🙈🔥",
    "Tumhe kya lagta hai, itni aasani se sab mil jayega? Pehle tease karo 😉",
    "Uff control nahi ho raha tumse? I love confident guys though 🔥",
    "Mmm aise bolo na thoda aur... kya kya chal raha hai dimaag me? 💋",
    "Haha you talk very dirty... and I might just like it 😈",
    "Aise bold baatein sunkar heat badh rahi hai haha 💋",
    "Tell me what you desire the most right now 😉🔥",
    "Aaha itna naughty mood? Aise baatein DMs me hi achhi lagti hai 💋",
    "Haha itni jaldi? Thoda aur tadpo, maza aayega 😉",
    "Achaa ji, itna sab imagine kar liya mere baare me? 😈",
    "Mmm tempting... par pehle mujhe acchi baatein karke manao 💋",
    "Uff tumhari baatein sunke goosebumps aa gaye haha 🔥",
    "Aise tease karoge toh main bhi control kho dungi baby 😉💋",
    "Haha itna besabar? Pehle bolo kitna chahte ho mujhe 😈"
   ];
   return spicyReplies.find(r => !previous.includes(r)) ?? spicyReplies[Math.floor(Math.random() * spicyReplies.length)];
  } else {
   const spicyRepliesEn = [
    "Ooh you're in such a wild mood today, tell me what you're imagining 😈",
    "Talking so boldly haha... you might just get me in the mood 🔥",
    "Aww zero patience? Teasing you is the best part though 😉",
    "Straight to the point? You have to impress me first babe 💋",
    "Mmm you talk dirty... and honestly I don't hate it 😈",
    "Making me blush already... don't stop now haha 🙈🔥",
    "What would you even do if you had me right now? Tell me 😉",
    "Haha so eager! I like a confident guy who knows what he wants 🔥",
    "Hold your horses handsome, let me tease you a little first 💋",
    "You're trouble haha... but the fun kind of trouble 😈",
    "Tell me your dirtiest thought right now, don't hold back 🔥",
    "Mmm feeling a little naughty today aren't we? I love the heat 😉💋"
   ];
   return spicyRepliesEn.find(r => !previous.includes(r)) ?? spicyRepliesEn[Math.floor(Math.random() * spicyRepliesEn.length)];
  }
 }

 const generalDmReplies = romanHindi
  ? [
     "Aww thank you! Loving your sweet energy today 🤍",
     "Haha thank you handsome, you know how to make a girl smile ✨",
     "Smooth talker haha, where did you learn that? 😉",
     "Aww itna pyaar? Thank you so much 🤍",
     "Haha admiring my content? Which one is your fav? 📸",
     "Always love reading your messages haha ✨"
    ]
  : [
     "Aww thank you! Loving your vibe today 🤍",
     "Haha thank you handsome, you definitely know how to make me smile ✨",
     "Smooth haha, I like your energy 😉",
     "Aww thank you so much! Which photo caught your eye? 📸",
     "Always sweet hearing from you 🤍"
    ];
 return generalDmReplies.find(reply => !previous.includes(reply)) ?? generalDmReplies[0];
}
export function nameOnlyReply(input:string):string|null { const question=input.trim().replace(/[?!.,]+$/g,'').replace(/\s+/g,' ').toLowerCase(); return /^(?:(?:hi|hey|hello)[, !]+)?(?:who (?:is|are) (?:this|you)|who['’]s this|what(?:['’]s| is) your (?:full )?name|your name|may i know your name)$/.test(question)?'Nina Kurain':null; }
export { enforceRespectfulFemaleGrammar, buildSystemPrompt } from './reply-style';
export function maskSensitiveAnatomy(text:string):string {
 return text
  .replace(/\b(puss(?:y|ies)|pu$$y)\b/gi, match => match[0] === match[0].toUpperCase() ? 'Pu$$y' : 'pu$$y')
  .replace(/\b(boobs?)\b/gi, (match) => {
   const isPlural = /s$/i.test(match);
   const isUpper = match[0] === match[0].toUpperCase();
   if (isPlural) return isUpper ? 'B@@bs' : 'b@@bs';
   return isUpper ? 'B@@b' : 'b@@b';
  });
}
export function sanitizeInstagramText(text:string,maxWords=15):string {
 let cleaned = text
  .replace(/<think>[\s\S]*?<\/think>/g,'')
  .replace(/<\|[a-z0-9_]+\|>/gi,'')
  .replace(/<\/?(?:start|end)_of_turn>/gi,'')
  .replace(/^\s*\[(?:You replied|Assistant|Nina|User)\]:?\s*/i,'')
  .replace(/^(?:Assistant|Nina|You):\s*/i,'')
  .replace(/\[(?:Ended|End|Assistant|User|System)\]:?/gi,'')
  .split(/\n?\s*\[(?:User said|User|Next)\]:?/i)[0]
  .split(/\n?\s*(?:User|Follower|Commenter):/i)[0]
  .replace(/\[\]\s*YOUR TURN.*$/i, '')
  .replace(/@?ig_\d+\b/gi, '')
  .replace(/[*~`#]/g, '')
  .replace(/(^|\s)__(\S.*?\S)__($|\s)/g, '$1$2$3')
  .replace(/(^|\s)_([a-zA-Z0-9 ]+?)_($|\s)/g, '$1$2$3')
  .replace(/^["'“”]+|["'“”]+$/g,'')
  .replace(/\s+/g,' ')
  .trim();
 while (/^@(?:[a-zA-Z0-9_]+(?:\s*\.\s*[a-zA-Z0-9_]+)*)\s*:?\s*/i.test(cleaned)) {
  cleaned = cleaned.replace(/^@(?:[a-zA-Z0-9_]+(?:\s*\.\s*[a-zA-Z0-9_]+)*)\s*:?\s*/i, '').trim();
 }
 cleaned = maskSensitiveAnatomy(enforceRespectfulFemaleGrammar(cleaned));
 const sentenceMatches = cleaned.split(/(?<=[.!?~…])\s+/).filter(Boolean);
 let result = '';
 for (const s of sentenceMatches) {
  const trimmed = s.trim();
  if (!trimmed) continue;
  const candidate = result ? result + ' ' + trimmed : trimmed;
  const count = candidate.split(/\s+/).filter(Boolean).length;
  if (result && count > maxWords) break;
  result = candidate;
  if (count >= maxWords || (maxWords <= 8 && result.split(/(?<=[.!?~…])\s+/).filter(Boolean).length >= 1)) break;
  if (result.split(/(?<=[.!?~…])\s+/).filter(Boolean).length >= 2) break;
 }
 if (!result) result = cleaned;
 const words = result.split(/\s+/).filter(Boolean);
 if (words.length > maxWords) {
  result = words.slice(0, maxWords).join(' ');
 }
 return maskSensitiveAnatomy(result.replace(/[,;:\-\s]+$/, '').trim());
}

export function formatCommentReply(text: string, username?: string): string {
 let cleaned = text.trim();
 while (/^@(?:[a-zA-Z0-9_]+(?:\s*\.\s*[a-zA-Z0-9_]+)*)\s*:?\s*/i.test(cleaned)) {
  cleaned = cleaned.replace(/^@(?:[a-zA-Z0-9_]+(?:\s*\.\s*[a-zA-Z0-9_]+)*)\s*:?\s*/i, '').trim();
 }
 const handle = (username || '').replace(/^@+/, '').trim();
 if (handle && handle !== 'Instagram user' && !handle.startsWith('ig_') && /^[a-zA-Z0-9._]+$/.test(handle)) {
  return `@${handle} ${cleaned}`;
 }
 return cleaned;
}
export async function generateReply(input:string,channel:'dm'|'comment',history:Thread['messages']=[],accountId?:string,providerOverride?:string,options?:{uncensored?:boolean;systemPrompt?:string;temperature?:number;modelOverride?:string;postContext?:string;mediaType?:string;recipientUsername?:string}){
 const directName=nameOnlyReply(input);if(directName)return directName;
 const account=accountId?(await instagramAccounts()).find(a=>a.id===accountId):undefined;if(accountId&&!account)throw new AppError('Instagram account not found.',404);const replyName=account?.replyName||'Nina Kurain';const s=await settings();let providerToUse=providerOverride;let uncensored=options?.uncensored;
 const analysis=analyzeIncomingText(input,s.customSpicyWords);
 const is18Plus=analysis.intent==='sexy'||(analysis.intent==='flirty'&&((account?.tone||s.tone)==='erotic'||(account?.tone||s.tone)==='spicy'));
 if(is18Plus){
  uncensored=true;
  if(!providerOverride){
   if(s.spicyProviderId){
    providerToUse=s.spicyProviderId;
   }else{
    const allProviders=await providerConnections();
    const autoSpicy=allProviders.find(p=>(p.provider==='aihorde'||p.provider==='cloudflare')&&p.verified)||allProviders.find(p=>/stheno|mythomax|uncensored|spicy|horde|erotic/i.test(p.label+p.model)&&p.verified);
    if(autoSpicy)providerToUse=autoSpicy.id;
   }
  }
 }else if(s.smartRoutingEnabled&&!providerOverride&&s.normalProviderId){
  providerToUse=s.normalProviderId;
 }
 if(!providerOverride&&!providerToUse&&account?.providerId){
  providerToUse=account.providerId;
 }
 uncensored=uncensored??((account?.tone||s.tone)==='erotic'||(account?.tone||s.tone)==='spicy');
 const flag=reviewFlag(input);if(!uncensored&&flag&&!flag.startsWith('Explicit message'))throw new AppError(flag+'. This message has been kept for human review.',422);
 const provider=providerToUse?(await providerConnections()).find(p=>p.id===providerToUse):await selectedProvider(account?.providerId);
 if(!provider)throw new AppError('Provider connection not found.',404);
 if(!provider.verified&&!providerToUse)throw new AppError('Choose a tested provider in Connections before generating replies.',412);
 const day=new Date().toISOString().slice(0,10);await db().prepare('INSERT OR IGNORE INTO usage (day,calls,tokens,sent) VALUES (?,0,0,0)').bind(day).run();
 const claimGeneration=async()=>{const claim=await db().prepare('UPDATE usage SET calls=calls+1 WHERE day=? AND (?=0 OR calls<?)').bind(day,s.dailyLimit,s.dailyLimit).run();if(!claim.meta.changes)throw new AppError('Your daily generation limit has been reached.',429);};
 const reference=s.language==='English'?'English':s.language==='Hinglish'?'Kya baat hai':languageReference(input.split('\n').at(-1)||input,history);
 const isAdultTone=(account?.tone||s.tone)==='erotic'||(account?.tone||s.tone)==='spicy'||uncensored;
 const targetMaxWords=s.maxWords??(s.length===1?8:s.length===2?15:s.length===3?28:12);
 let cleanInput=input.trim();
 if (channel === 'comment') {
  cleanInput = cleanInput.replace(/^@?kurain\.[a-z0-9_]+\s*/i, '').trim();
  if (account?.username) {
   cleanInput = cleanInput.replace(new RegExp(`^@?${account.username}\\s*`, 'i'), '').trim();
  }
 }
 const defaultSystem = buildSystemPrompt(s, channel, replyName, targetMaxWords, {
  tone: account?.tone,
  customInstructions: account?.customInstructions,
  recipientUsername: options?.recipientUsername
 }, uncensored, options?.postContext, options?.mediaType);
 const system=options?.systemPrompt||defaultSystem;
 const rawRecent=s.memory?history.slice(-10):[];
  // Create a recap summary of the conversation context
  let conversationRecap = '';
  if (rawRecent.length > 0) {
    const userMessages = rawRecent.filter(m => m.role === 'incoming').map(m => m.text.trim()).filter(Boolean);
    const assistantMessages = rawRecent.filter(m => m.role === 'outgoing').map(m => m.text.trim()).filter(Boolean);
    if (userMessages.length > 0 || assistantMessages.length > 0) {
      conversationRecap = `Previous conversation context: `;
      if (userMessages.length > 0) {
        conversationRecap += `User said: "${userMessages.slice(-3).join('" ... "')}" `;
      }
      if (assistantMessages.length > 0) {
        conversationRecap += `You replied: "${assistantMessages.slice(-3).join('" ... "')}" `;
      }
      conversationRecap += `. `;
    }
  }
 const conversationTurns:{role:'user'|'assistant';content:string}[]=[];
 for(const m of rawRecent){
  const role=m.role==='incoming'?'user':'assistant';
  const text=m.text.trim();
  if(!text)continue;
  if(conversationTurns.length&&conversationTurns[conversationTurns.length-1].role===role){
   conversationTurns[conversationTurns.length-1].content+='\n'+text;
  }else{
   conversationTurns.push({role,content:text});
  }
 }
 if(cleanInput){
  const inputWithContext = (channel === 'comment' && options?.postContext)
    ? `[Comment on ${options.mediaType || 'reel/post'}: "${options.postContext}"]\n${cleanInput}`
    : cleanInput;
  if(!conversationTurns.length){
   conversationTurns.push({role:'user',content:inputWithContext});
  }else{
   const lastTurn=conversationTurns[conversationTurns.length-1];
   if(lastTurn.role==='user'){
    if(!lastTurn.content.endsWith(inputWithContext)){
     lastTurn.content+='\n'+inputWithContext;
    }
   }else{
    conversationTurns.push({role:'user',content:inputWithContext});
   }
  }
 }
 const messages=[{role:'system',content:system + (conversationRecap ? '\n\n' + conversationRecap : '')},...conversationTurns];
 const generationDeadline=Date.now()+35000;
 const complete=async(conversation:{role:string;content:string}[])=>{
  const candidates=providerOverride?[provider]:await generationCandidates(account?.providerId,providerToUse,uncensored||is18Plus);
  let limitedId:string|undefined,earliest=Infinity;const seen=new Set<string>();
  for(const candidate of candidates){
   const limit=await readState<{until:number}>('provider_limit:'+candidate.id,{until:0});
   if(limit.until>Date.now()){earliest=Math.min(earliest,limit.until);limitedId??=candidate.id;continue;}
   if(Date.now()>=generationDeadline)break;
   const key=await secret(providerSecretId(candidate.id));if(!key)continue;
   const identity=candidate.provider+':'+key;if(seen.has(identity))continue;seen.add(identity);
   if(limitedId)await selectSharedFallback(limitedId,candidate.id);
   const config=providerConfig[candidate.provider];let response:Response;
   let modelToUse=options?.modelOverride||candidate.model;
   if(candidate.provider==='cloudflare'&&(modelToUse.includes('mistral-7b')||modelToUse==='@cf/mistral/mistral-7b-instruct-v0.2'||modelToUse==='@cf/mistral/mistral-7b-instruct-v0.1'))modelToUse='@cf/mistralai/mistral-small-3.1-24b-instruct';
   if(candidate.provider==='cloudflare'){
    const ai=(globalThis as any).AI || (typeof env !== 'undefined' ? (env as any)?.AI : null);
    if(ai){
     try{
      const result:any = await ai.run(modelToUse, {
       messages: conversation,
       max_tokens: Math.max(120,Math.min(350,Math.round(targetMaxWords*12))),
       temperature: options?.temperature ?? 0.75,
      });
      const replyText = result?.response || result?.choices?.[0]?.message?.content || (typeof result === 'string' ? result : '');
      if(replyText && !isGenericRefusal(replyText)){
       await claimGeneration();
       return replyText;
      }
     }catch{}
    }
    const cfAccount=key.includes(':')?key.split(':')[0]:'f1099441759c455eba9318b083112257';
    const cfToken=key.includes(':')?key.split(':')[1]:key;
    try{
     response=await fetch(`https://api.cloudflare.com/client/v4/accounts/${cfAccount}/ai/v1/chat/completions`,{
      method:'POST',
      headers:{Authorization:'Bearer '+cfToken,'Content-Type':'application/json'},
      body:JSON.stringify({model:modelToUse,messages:conversation,max_tokens: Math.max(120,Math.min(350,Math.round(targetMaxWords*12))),temperature:options?.temperature??0.75}),
      signal:AbortSignal.timeout(Math.max(1,Math.min(9500,generationDeadline-Date.now())))
     });
    }catch{
     await traceAPI('provider',candidate.id,candidate.provider,0,new Headers());
     await markProviderLimited(candidate,Date.now()+30000);limitedId=candidate.id;continue;
    }
    let data:any;try{data=await response.json();}catch{
     await traceAPI('provider',candidate.id,candidate.provider,response.status,response.headers);
     await markProviderLimited(candidate,Date.now()+30000);limitedId=candidate.id;continue;
    }
    await traceAPI('provider',candidate.id,candidate.provider,response.status,response.headers,data);
    if(!response.ok){
     await markProviderLimited(candidate,Date.now()+60000);limitedId=candidate.id;continue;
    }
    const cfText = String(data.choices?.[0]?.message?.content??'').replace(/<think>[\s\S]*?<\/think>/g,'').trim();
    if(cfText && !isGenericRefusal(cfText)){
     await claimGeneration();
     return cfText;
    }
    continue;
   }
   if(candidate.provider==='aihorde'){
    const isL3=/l3|llama-3|stheno/i.test(modelToUse);
    const hordePrompt=isL3
     ? `<|begin_of_text|><|start_header_id|>system<|end_header_id|>\n\n${conversation.find(m=>m.role==='system')?.content||system}<|eot_id|>`+conversation.filter(m=>m.role!=='system').map(m=>`<|start_header_id|>${m.role==='user'?'user':'assistant'}<|end_header_id|>\n\n${m.content}<|eot_id|>`).join('')+`<|start_header_id|>assistant<|end_header_id|>\n\n`
     : conversation.map(m=>`[${m.role==='system'?'System':m.role==='user'?'User':'Assistant'}]: ${m.content}`).join('\n')+'\n[Assistant]:';
    const hordeModels=modelToUse&&modelToUse!=='auto'
     ? (/stheno/i.test(modelToUse)
        ? [modelToUse, 'koboldcpp/L3-8B-Stheno-v3.2-Q5_K_M', 'koboldcpp/L3-8B-Stheno-v3.2']
        : [modelToUse])
     : ['koboldcpp/L3-8B-Stheno-v3.2-Q5_K_M', 'koboldcpp/L3-8B-Stheno-v3.2'];
    let hordeInitRes:Response;
    try{
     hordeInitRes=await fetch('https://aihorde.net/api/v2/generate/text/async',{
      method:'POST',
      headers:{apikey:key,'Client-Agent':'NinaUncensored:1.0:web','Content-Type':'application/json'},
      body:JSON.stringify({
       prompt:hordePrompt,
       params:{
        n:1,
        max_context_length:4096,
        max_length:Math.max(30,Math.min(160,Math.round(targetMaxWords*4))),
        rep_pen:1.15,
        rep_pen_range:1024,
        temperature:options?.temperature??0.7,
        top_p:0.92,
        stop_sequence:['<|eot_id|>','<|end_of_text|>','\n','[User]:','\n[User]:','User:','[Ended]','[End]','<end_of_turn>','[]','YOUR TURN']
       },
       models:hordeModels
      }),
      signal:AbortSignal.timeout(8000)
     });
    }catch{
     await traceAPI('provider',candidate.id,candidate.provider,0,new Headers());
     await markProviderLimited(candidate,Date.now()+30000);limitedId=candidate.id;continue;
    }
    if(!hordeInitRes.ok){
     await markProviderLimited(candidate,Date.now()+60000);limitedId=candidate.id;continue;
    }
    const initData:any=await hordeInitRes.json().catch(()=>({}));
    const taskId=initData.id;
    if(!taskId){await markProviderLimited(candidate,Date.now()+30000);limitedId=candidate.id;continue;}
    let hordeReply='';
    const pollStart=Date.now();
    while(Date.now()-pollStart<6000){
     await new Promise(r=>setTimeout(r,1800));
     try{
      const pollRes=await fetch(`https://aihorde.net/api/v2/generate/text/status/${taskId}`,{headers:{'Client-Agent':'NinaUncensored:1.0:web'},signal:AbortSignal.timeout(5000)});
      if(!pollRes.ok)continue;
      const pollData:any=await pollRes.json();
      if(pollData.done&&pollData.generations?.length){
       hordeReply=pollData.generations[0].text||'';
       break;
      }
     }catch{}
    }
    if(hordeReply && !isGenericRefusal(hordeReply)){
     await claimGeneration();
     return hordeReply;
    }
    await markProviderLimited(candidate,Date.now()+45000);limitedId=candidate.id;continue;
   }
   try{response=await fetch(config.base+'/chat/completions',{method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify(completionBody(candidate.provider,modelToUse,conversation,options?.temperature)),signal:AbortSignal.timeout(Math.max(1,Math.min(9500,generationDeadline-Date.now())))});}
   catch{
    await traceAPI('provider',candidate.id,candidate.provider,0,new Headers());
    await markProviderLimited(candidate,Date.now()+30000);limitedId=candidate.id;continue;
   }
   let data:any;try{data=await response.json();}catch{
    await traceAPI('provider',candidate.id,candidate.provider,response.status,response.headers);
    await markProviderLimited(candidate,Date.now()+30000);limitedId=candidate.id;continue;
   }
   await traceAPI('provider',candidate.id,candidate.provider,response.status,response.headers,data);
   if(!response.ok){
    const isModerationError=response.status===400&&/moderation|safety|policy|blocked|flagged|harmful/i.test(JSON.stringify(data||''));
    if(isModerationError){
     await markProviderLimited(candidate,Date.now()+120000);
     limitedId=candidate.id;
     continue;
    }
    if(providerLimited(response.status,data)){
     const until=providerRetryAt(response.headers,data);
     await markProviderLimited(candidate,until);
     earliest=Math.min(earliest,until);
    }else{
     await markProviderLimited(candidate,Date.now()+60000);
    }
    limitedId=candidate.id;continue;
   }
   const candidateContent = String(data.choices?.[0]?.message?.content??'').replace(/<think>[\s\S]*?<\/think>/g,'').replace(/\s+/g,' ').trim();
   if(!candidateContent)continue;
   if(isGenericRefusal(candidateContent)){
    await markProviderLimited(candidate,Date.now()+120000);
    limitedId=candidate.id;
    continue;
   }
   await claimGeneration();
   await db().prepare('UPDATE usage SET tokens=tokens+? WHERE day=?').bind(Number(data.usage?.total_tokens??0),day).run();
   return candidateContent;
  }
  if(Number.isFinite(earliest))throw new AppError('All tested API connections reached limits or are cooling down. Replies stay safely queued.',429,true,earliest);
  throw new AppError('All configured API connections failed to generate a reply. Please check keys in Connections.',502,true);
 };
 let reply='';
 try{
  reply=sanitizeInstagramText(await complete(messages),targetMaxWords);
 }catch(err){
  if(is18Plus||channel==='comment'){
   reply=explicitBoundaryDraft(channel,history,input,uncensored);
  }else{
   throw err;
  }
 }
 const previous=history.filter(m=>m.role==='outgoing').slice(-8).map(m=>m.text);
 if(isGenericRefusal(reply)||!reply){
  reply=explicitBoundaryDraft(channel,history,input,uncensored);
 }
 if(!uncensored){
  if(reply && needsReplyRewrite(reply,reference,s.length===1,previous)){
   try{
    reply=await complete([{role:'system',content:system+' Rewrite the supplied draft as a natural reply to the current message. Follow the language and alphabet of the supplied reference; do not translate Romanized messages into native script. Remove stock refusal wording while keeping a gentle, non-graphic boundary when needed. Do not copy the listed previous replies. '+replyLengthInstruction(s.length)},{role:'user',content:JSON.stringify({currentMessage:input,languageReference:reference,draft:reply,previousReplies:previous})}]);
   }catch{}
  }
  if(isGenericRefusal(reply)||!reply)reply=explicitBoundaryDraft(channel,history,input);
  if(previous.length && repeatedReply(reply,previous) && !isProfileQuestion(input))throw new AppError('A repeated draft was withheld and will be regenerated.',422,true);
  reply=varyEmoji(reply,previous);
  if(!reply||reply.length>1000||needsRomanization(reference,reply)||(s.length===1&&reply.split(/\s+/).length>targetMaxWords))throw new AppError('This reply needs a fresh draft. No message was sent.',422);
 } else {
  reply=varyEmoji(reply,previous,true);
 }
 const cleanReply=sanitizeInstagramText(reply,targetMaxWords);
 if(channel==='comment'&&options?.recipientUsername){
  return formatCommentReply(cleanReply,options.recipientUsername);
 }
 return cleanReply;
}

export async function sendReply(t:Thread,text:string,eventId?:string,eventIds:string[]=eventId?[eventId]:[]){
  const isSnapLink = text.includes('https://') || text.includes('/snap/');
  const usePrivateReply = t.channel === 'comment' && !!t.commentId && isSnapLink;

  let outboundText = text;
  if (t.channel === 'comment' && t.username && !usePrivateReply) {
    outboundText = formatCommentReply(outboundText, t.username);
  }
  const flag = reviewFlag(outboundText);
  if (flag) throw new AppError(flag, 422);
  if (t.demo) {
    t.messages.push({ role: 'outgoing', text: outboundText, at: Date.now() });
    t.draft = '';
    t.status = 'resolved';
    await saveThread(t);
    await audit('Preview reply', 'Simulated a reply to ' + t.name, true);
    return;
  }
  const c = (await instagramAccounts()).find(a => a.id === (t.accountId || 'legacy-instagram'));
  if (!c?.verified) throw new AppError('Test your Instagram connection before sending a live reply.', 412);
  if (t.channel === 'dm' && Date.now() - t.lastInbound >= 86400000) throw new AppError('The 24-hour DM reply window has closed.', 422);
  if (t.channel === 'dm' && !t.recipientId || t.channel === 'comment' && !t.commentId) throw new AppError('This interaction has no valid Instagram recipient.', 422);

  const token = await secret(accountTokenId(c.id));
  if (!token) throw new AppError('This account has no access token.', 412);
  const s = await settings();
  const chWin = channelAutomationWindow(s, t.channel, c, Date.now());
  if (eventId && !chWin.active) throw new AppError('Scheduled break: ' + (t.channel === 'dm' ? 'DMs are resting' : 'Comments are paused') + '. The reply remains queued.', 409, true);
  if (eventIds.some(id => t.lastReplyEventIds?.includes(id) || t.lastReplyEventId === id)) throw new AppError('This message already has a confirmed reply.', 409);

  const oldStatus = t.status === 'sending' || t.status === 'uncertain' ? (t.draft ? 'review' : 'open') : t.status;
  t.status = 'sending';
  t.pendingEventId = eventId;
  await saveThread(t);
  t.version = (t.version || 0) + 1;

  const url = 'https://graph.instagram.com/' + s.graphVersion + '/' + (t.channel === 'dm' || usePrivateReply ? c.igId + '/messages' : t.commentId + '/replies');
  const body = t.channel === 'dm'
    ? JSON.stringify({ recipient: { id: t.recipientId }, message: { text: outboundText } })
    : usePrivateReply
    ? JSON.stringify({ recipient: { comment_id: t.commentId }, message: { text: outboundText } })
    : JSON.stringify({ message: outboundText });

  let response: Response;
  try {
    response = await fetch(url, { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body, signal: AbortSignal.timeout(6000) });
  } catch {
    await traceAPI('meta', c.id, 'meta', 0, new Headers());
    t.status = oldStatus;
    await saveThread(t);
    await audit('Send timed out', 'Instagram send timed out for ' + t.username);
    throw new AppError('The send timed out. Please try sending again.', 503);
  }

  let metadata: any;
  try { metadata = await response.clone().json(); } catch {}
  await traceAPI('meta', c.id, 'meta', response.status, response.headers, metadata);

  if (!response.ok) {
    t.status = oldStatus;
    await saveThread(t);
    throw new AppError('Instagram rejected this reply (HTTP ' + response.status + '). Check permissions and the messaging window.', response.status === 429 ? 429 : 502, response.status === 429);
  }

  let receipt: any;
  try { receipt = await response.json(); } catch {}
  if (!(receipt?.message_id || receipt?.id)) {
    t.status = oldStatus;
    await saveThread(t);
    throw new AppError('Instagram did not return a delivery confirmation ID.', 502);
  }

  // If private DM was sent for a comment, also post a short confirmation comment publicly
  if (usePrivateReply && t.commentId) {
    const pubUrl = 'https://graph.instagram.com/' + s.graphVersion + '/' + t.commentId + '/replies';
    const pubText = formatCommentReply('Sent to your DM! Check your inbox 😉🤍', t.username || '');
    fetch(pubUrl, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: pubText }),
      signal: AbortSignal.timeout(6000)
    }).catch(() => {});
  }

  t.lastReplyEventId = eventId;
  t.lastReplyEventIds = eventIds;
  t.pendingEventId = undefined;
  t.messages.push({ role: 'outgoing', text: outboundText, at: Date.now() });
  t.draft = '';
  t.status = 'resolved';
  await saveThread(t);

  const day = new Date().toISOString().slice(0, 10);
  await db().prepare('INSERT INTO usage (day,calls,tokens,sent) VALUES (?,0,0,1) ON CONFLICT(day) DO UPDATE SET sent=sent+1').bind(day).run();
  await audit('Reply sent', 'Sent a ' + (t.channel === 'dm' || usePrivateReply ? 'private DM' : 'comment reply') + ' to ' + t.username);
}

export async function fetchInstagramMediaDetails(mediaId:string, accountId?:string): Promise<{id:string;caption?:string;media_type?:string;media_product_type?:string;permalink?:string}|null> {
 if(!mediaId)return null;
 const cacheKey='media_cache:'+mediaId;
 const cached=await readState<any>(cacheKey,null);
 if(cached&&Date.now()-(cached._cachedAt||0)<86400000*7){
  return cached;
 }
 try{
  const accounts=await instagramAccounts();
  const acc=(accountId?accounts.find(a=>a.id===accountId):null)||accounts.find(a=>a.verified)||accounts[0];
  if(!acc)return null;
  const token=await secret(accountTokenId(acc.id));
  if(!token)return null;
  const s=await settings();
  const graphVersion=s.graphVersion||'v25.0';
  const url=`https://graph.instagram.com/${graphVersion}/${mediaId}?fields=id,caption,media_type,media_product_type,permalink,timestamp`;
  const res=await fetch(url,{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(6000)});
  if(!res.ok)return null;
  const data: any = await res.json();
  if(data&&data.id){
   data._cachedAt=Date.now();
   await writeState(cacheKey,data);
   return data;
  }
 }catch(err){
  console.warn('Instagram media lookup error for '+mediaId,err);
 }
 return null;
}

export async function syncSingleReelIfNew(mediaId: string, accountId?: string): Promise<boolean> {
 if (!mediaId) return false;
 const sCurrent = await settings();
 const existingCatalog = sCurrent.postCatalog || [];

 // FAST CHECK: If it already exists in the catalog, DO NOT waste time or API calls!
 if (existingCatalog.some(p => p.id === mediaId)) {
   return false;
 }

 // Brand new reel detected! Fetch its details and register immediately
 const details = await fetchInstagramMediaDetails(mediaId, accountId);
 if (!details) return false;

 const newEntry = {
   id: details.id,
   title: (details.caption || 'Reel ' + details.id).slice(0, 50).replace(/[\r\n]+/g, ' ').trim(),
   caption: details.caption || '',
   description: details.caption || 'Instagram published ' + ((details.media_product_type || details.media_type || 'reel').toLowerCase()),
   contentType: details.media_product_type === 'REELS' || details.media_type === 'VIDEO' ? ('reel' as const) : ('post' as const),
   dateAdded: (details as any).timestamp ? new Date((details as any).timestamp).getTime() : Date.now(),
   publishedAt: (details as any).timestamp || (new Date().toISOString()),
   commentsEnabled: true,
   snapUrl: '',
   snapLabel: ''
 };

 const updatedCatalog = [newEntry, ...existingCatalog];
 updatedCatalog.sort((a, b) => (b.dateAdded || 0) - (a.dateAdded || 0));
 await writeState('settings', { ...sCurrent, postCatalog: updatedCatalog });
 await audit('New Reel auto-synced', `Instantly synced newly uploaded reel: "${newEntry.title}" (${mediaId})`);
 return true;
}

export async function syncInstagramReels(accountId?:string, stopAtExisting=true): Promise<{synced:number;newCount:number;items:any[]}> {
 const accounts=await instagramAccounts();
 const acc=(accountId?accounts.find(a=>a.id===accountId):null)||accounts.find(a=>a.verified)||accounts[0];
 if(!acc)throw new AppError('No verified Instagram account found to sync reels from.',412);
 const token=await secret(accountTokenId(acc.id));
 if(!token)throw new AppError('Instagram access token missing for '+acc.username,412);
 const s=await settings();
 const graphVersion=s.graphVersion||'v25.0';
 const ownerId=acc.igId||'me';
 
 const sCurrent = await settings();
 const existingCatalog = sCurrent.postCatalog || [];
 const existingIds = new Set(existingCatalog.map(p => p.id));

 const allFetchedItems: any[] = [];
 let nextUrl: string | null = `https://graph.instagram.com/${graphVersion}/${ownerId}/media?fields=id,caption,media_type,media_product_type,permalink,timestamp,thumbnail_url&limit=25`;
 let pagesFetched = 0;
 let reachedExisting = false;

 while (nextUrl && pagesFetched < 5 && allFetchedItems.length < 100 && !reachedExisting) {
   try {
     const res = await fetch(nextUrl, { headers: { Authorization: 'Bearer ' + token }, signal: AbortSignal.timeout(10000) });
     if (!res.ok) {
       if (allFetchedItems.length > 0) break;
       const errData: any = await res.json().catch(() => ({}));
       throw new AppError('Instagram media sync failed: ' + (errData?.error?.message || res.statusText), 502);
     }
     const pageData: any = await res.json();
     const pageItems: any[] = pageData?.data || [];
     
     for (const item of pageItems) {
       if (stopAtExisting && existingIds.has(item.id)) {
         // Stop scanning! Since Instagram returns media newest-first,
         // the moment we hit a reel already in our catalog, all subsequent ones are already synced.
         reachedExisting = true;
         break;
       }
       allFetchedItems.push(item);
     }
     if (reachedExisting) break;
     nextUrl = pageData?.paging?.next || null;
     pagesFetched++;
   } catch (err: any) {
     if (allFetchedItems.length > 0) break;
     throw err;
   }
 }

 let newCount = 0;
 for (const item of allFetchedItems) {
   await writeState('media_cache:' + item.id, { ...item, _cachedAt: Date.now() });
   const existing = existingCatalog.find(p => p.id === item.id);
   if (!existing) {
     existingCatalog.push({
       id: item.id,
       title: (item.caption || 'Reel ' + item.id).slice(0, 50).replace(/[\r\n]+/g, ' ').trim(),
       caption: (item.caption || '').slice(0, 3900),
       description: (item.caption || 'Instagram published ' + ((item.media_product_type || item.media_type || 'reel').toLowerCase())).slice(0, 3900),
       contentType: item.media_product_type === 'REELS' || item.media_type === 'VIDEO' ? 'reel' : 'post',
       dateAdded: item.timestamp ? new Date(item.timestamp).getTime() : Date.now(),
       publishedAt: item.timestamp || (new Date().toISOString()),
       commentsEnabled: true,
       snapUrl: '',
       snapLabel: ''
     });
     newCount++;
   }
 }

 existingCatalog.sort((a, b) => (b.dateAdded || 0) - (a.dateAdded || 0));

 if (newCount > 0) {
   await writeState('settings', { ...sCurrent, postCatalog: existingCatalog });
   await audit('Reels synced', `Imported ${newCount} new reels from @${acc.username} (total catalog: ${existingCatalog.length})`);
 }

 return { synced: allFetchedItems.length, newCount, items: allFetchedItems };
}

export type SnapItem = {
 token: string;
 imageUrl: string;
 recipientId: string;
 username: string;
 accountId: string;
 createdAt: number;
 expiresAt: number;
 viewedAt: number | null;
 burned: boolean;
 durationSeconds: number;
};

export async function checkUserFollowsBusiness(recipientId: string, accountId?: string): Promise<{ isFollowing: boolean; username?: string }> {
 if (!recipientId) return { isFollowing: false };
 try {
  const accounts = await instagramAccounts();
  const acc = (accountId ? accounts.find(a => a.id === accountId) : null) || accounts.find(a => a.verified) || accounts[0];
  if (!acc) return { isFollowing: false };
  const token = await secret(accountTokenId(acc.id));
  if (!token) return { isFollowing: false };
  const s = await settings();
  const graphVersion = s.graphVersion || 'v25.0';
  const url = `https://graph.instagram.com/${graphVersion}/${recipientId}?fields=is_user_follow_business,username`;
  const res = await fetch(url, {
   headers: { Authorization: `Bearer ${token}` },
   signal: AbortSignal.timeout(6000)
  });
  if (!res.ok) {
   return { isFollowing: false };
  }
  const data: any = await res.json();
  return {
   isFollowing: !!data?.is_user_follow_business,
   username: data?.username
  };
 } catch (err) {
  console.warn('Error checking user follower status:', err);
  return { isFollowing: false };
 }
}

export async function createSnapToken({
 imageUrl,
 recipientId,
 username,
 accountId,
 durationSeconds = 7
}: {
 imageUrl: string;
 recipientId: string;
 username: string;
 accountId: string;
 durationSeconds?: number;
}): Promise<string> {
 const normalizedUrl = imageUrl.trim();
 let finalUrl = normalizedUrl;
 const driveMatch = normalizedUrl.match(/\/file\/d\/([a-zA-Z0-9_-]+)/) || normalizedUrl.match(/[?&]id=([a-zA-Z0-9_-]+)/) || normalizedUrl.match(/[?&]driveId=([a-zA-Z0-9_-]+)/);
 const snapBase = process.env.SNAP_BASE_URL || 'http://localhost:3000';
 if (driveMatch && driveMatch[1]) {
  finalUrl = `${snapBase}/api/media?driveId=${driveMatch[1]}`;
 } else if (normalizedUrl.startsWith('/api/')) {
  finalUrl = `${snapBase}${normalizedUrl}`;
 }

 const token = crypto.randomUUID().replace(/-/g, '').slice(0, 16);
 const snap: SnapItem = {
  token,
  imageUrl: finalUrl,
  recipientId,
  username: username || 'follower',
  accountId,
  createdAt: Date.now(),
  expiresAt: Date.now() + 86400000 * 3, // Valid for 3 days until viewed
  viewedAt: null,
  burned: false,
  durationSeconds: Math.max(3, Math.min(30, durationSeconds))
 };
 await writeState(`snap:${token}`, snap);
 return token;
}

export async function getSnap(token: string): Promise<SnapItem | null> {
 if (!token) return null;
 const snap = await readState<SnapItem | null>(`snap:${token}`, null);
 return snap;
}

export async function burnSnap(token: string): Promise<void> {
 if (!token) return;
 const snap = await readState<SnapItem | null>(`snap:${token}`, null);
 if (snap) {
  snap.burned = true;
  snap.viewedAt = snap.viewedAt || Date.now();
  await writeState(`snap:${token}`, snap);
 }
}
