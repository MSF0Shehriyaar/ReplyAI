import {db,secret,tenantSecret,providerConnections,assertActiveTenant,AppError} from './server';
import {providerConfig,completionBody} from './provider-config';

async function sharedState<T>(key:string,fallback:T):Promise<T> {
  try {const row=await db().prepare('SELECT payload FROM workspace_state WHERE key=?').bind(key).first<{payload:string}>();return row?JSON.parse(row.payload):fallback;}catch{return fallback;}
}
export async function businessAICandidates(tenantId:string) {
  const list=(await providerConnections(tenantId)).filter(p=>p.verified&&!!providerConfig[p.provider]);
  const primary=await sharedState('primary_provider','legacy-groq');
  const policy=await sharedState<{shared?:boolean;order?:string[]}>('provider_routing',{});
  const active=policy.shared?await sharedState('provider_route_active',primary):primary;
  const order=[active,primary,...(policy.order || []),...list.map(p=>p.id)];
  const result=[];
  for(const id of new Set(order)) {
    const provider=list.find(p=>p.id===id);if(!provider)continue;
    const limit=await sharedState<{until:number}>('provider_limit:'+id,{until:0});
    if(limit.until>Date.now())continue;
    result.push(provider);
  }
  return result;
}
export async function completeBusinessAI(tenantId:string,messages:{role:string;content:string}[],temperature=0.6):Promise<string> {
  await assertActiveTenant(tenantId);
  const candidates=await businessAICandidates(tenantId);
  if(!candidates.length)throw new AppError('The administrator’s AI service is not ready or is cooling down. Please try again shortly.',503);
  const deadline=Date.now()+55000;
  for(const candidate of candidates) {
    if(Date.now()>deadline)break;
    const key=candidate.id==='tenant-groq'?await tenantSecret(tenantId,'groq_key'):await secret(candidate.id==='legacy-groq'||candidate.id==='shared-groq'?'groq_key':'provider:'+candidate.id);
    if(!key)continue;
    try {
      let content='',tokens=0;
      const config=providerConfig[candidate.provider];
      if(candidate.provider==='aihorde') {
        const response=await fetch(config.base+'/generate/text/async',{method:'POST',headers:{apikey:key,'Client-Agent':'NinaBusiness:1.0:admin-managed','Content-Type':'application/json'},body:JSON.stringify({prompt:messages.map(m=>'['+m.role+']: '+m.content).join('\n')+'\n[assistant]:',models:candidate.model==='auto'?[]:[candidate.model],params:{n:1,max_context_length:4096,max_length:300,temperature}}),signal:AbortSignal.timeout(10000)});
        if(!response.ok)throw new Error('Provider unavailable');
        const task=await response.json();
        if(!task.id)throw new Error('Provider unavailable');
        for(let attempt=0;attempt<10&&Date.now()<deadline;attempt++) {
          const poll=await fetch(config.base+'/generate/text/status/'+encodeURIComponent(task.id),{headers:{apikey:key,'Client-Agent':'NinaBusiness:1.0:admin-managed'},signal:AbortSignal.timeout(6000)});
          if(poll.ok) {const data=await poll.json();if(data.done) {content=data.generations?.[0]?.text || '';break;}}
          await new Promise(resolve=>setTimeout(resolve,1000));
        }
        if(!content) {await fetch(config.base+'/generate/text/status/'+encodeURIComponent(task.id),{method:'DELETE',headers:{apikey:key},signal:AbortSignal.timeout(3000)}).catch(()=>{});throw new Error('Provider unavailable');}
      } else {
        let endpoint=config.base+'/chat/completions',token=key;
        if(candidate.provider==='cloudflare') {
          const account=key.includes(':')?key.split(':')[0]:process.env.CLOUDFLARE_ACCOUNT_ID;
          token=key.includes(':')?key.slice(key.indexOf(':')+1):key;
          if(!account)continue;
          endpoint=config.base+'/'+encodeURIComponent(account)+'/ai/v1/chat/completions';
        }
        const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify(completionBody(candidate.provider,candidate.model,messages,temperature)),signal:AbortSignal.timeout(Math.max(1,Math.min(15000,deadline-Date.now())))});
        if(!response.ok)throw new Error('Provider unavailable');
        const data=await response.json();content=data.choices?.[0]?.message?.content || '';tokens=Number(data.usage?.total_tokens)||0;
      }
      if(!content.trim())throw new Error('Empty response');
      await db().prepare('INSERT INTO tenant_usage(tenant_id,calls,tokens,updated_at) VALUES (?,1,?,?) ON CONFLICT(tenant_id) DO UPDATE SET calls=calls+1,tokens=tokens+excluded.tokens,updated_at=excluded.updated_at').bind(tenantId,tokens,Date.now()).run();
      return content.trim();
    }catch {
      // Shared cooldown prevents every business from hammering the same failing key.
      await db().prepare('INSERT INTO wa_state(key,payload) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET payload=excluded.payload').bind('ai_failure:'+candidate.id,JSON.stringify({at:Date.now()})).run();
      try {await db().prepare('INSERT INTO workspace_state(key,payload) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET payload=excluded.payload').bind('provider_limit:'+candidate.id,JSON.stringify({until:Date.now()+30000})).run();}catch{}
    }
  }
  throw new AppError('The administrator’s AI providers could not respond. Your message is saved for retry.',503);
}
