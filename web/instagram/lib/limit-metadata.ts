export type LimitMetric={label:string;used?:number;limit?:number;remaining?:number;resetAt?:number;unit:'requests'|'tokens'|'percent'|'USD'};
export type LimitSnapshot={at:number;status:number;limited:boolean;code?:number;retryAt?:number;metrics:LimitMetric[]};

function number(value:unknown){if(value===null||value===undefined||value==='')return undefined;const n=Number(value);return Number.isFinite(n)&&n>=0?n:undefined;}

export function duration(value:string|null,now:number){
 if(!value)return undefined;
 const trimmed=value.trim();
 const n=Number(trimmed);
 if(Number.isFinite(n)&&n>=0){
  if(n>1e9&&n<2e10) return n>1e11?n:n*1000;
  return now+n*1000;
 }
 const matches=[...trimmed.matchAll(/(\d+(?:\.\d+)?)(ms|s|m|h|d)/g)];
 if(!matches.length)return undefined;
 const scales:Record<string,number>={ms:1,s:1000,m:60000,h:3600000,d:86400000};
 const ms=matches.reduce((sum,m)=>sum+Number(m[1])*scales[m[2]],0);
 return ms>0&&ms<=7*86400000?now+ms:undefined;
}

function getHeaderNum(headers:Headers,...names:string[]){
 for(const name of names){
  const v=headers.get(name);
  const n=number(v);
  if(n!==undefined)return n;
 }
 return undefined;
}

function getHeaderDuration(headers:Headers,now:number,...names:string[]){
 for(const name of names){
  const v=headers.get(name);
  const d=duration(v,now);
  if(d!==undefined)return d;
 }
 return undefined;
}

// Persist only a numeric allowlist. Bodies, headers, keys and message text never enter traces.
export function limitMetadata(kind:'provider'|'meta',provider:string,status:number,headers:Headers,data:any,now=Date.now()):LimitSnapshot{
 const code=number(data?.error?.code),metrics:LimitMetric[]=[];
 const limited=status===429||(kind==='meta'&&[4,17,32,613,80002].includes(code??-1))||(kind==='provider'&&((status===400||status===403)&&data?.error?.status==='RESOURCE_EXHAUSTED'||status===402&&(code===402||data?.error?.type==='insufficient_quota')));
 const retry=headers.get('retry-after');let retryAt:number|undefined;
 if(retry){
  const n=number(retry);
  const at=n===undefined?Date.parse(retry):now+n*1000;
  if(Number.isFinite(at)&&at>now&&at<=now+7*86400000)retryAt=at;
 }

 if(kind==='provider'){
  // Requests limit & remaining
  const reqLimit=getHeaderNum(headers,'x-ratelimit-limit-requests','x-ratelimit-limit','ratelimit-limit');
  const reqRemaining=getHeaderNum(headers,'x-ratelimit-remaining-requests','x-ratelimit-remaining','ratelimit-remaining');
  const reqReset=getHeaderDuration(headers,now,'x-ratelimit-reset-requests','x-ratelimit-reset','ratelimit-reset');
  if(reqLimit!==undefined||reqRemaining!==undefined){
   metrics.push({
    label:provider==='groq'?'Requests per day':provider==='openrouter'?'Requests quota':'Reported requests',
    unit:'requests',
    limit:reqLimit,
    remaining:reqRemaining,
    resetAt:reqReset
   });
  }

  // Tokens limit & remaining
  const tokLimit=getHeaderNum(headers,'x-ratelimit-limit-tokens','ratelimit-limit-tokens');
  const tokRemaining=getHeaderNum(headers,'x-ratelimit-remaining-tokens','ratelimit-remaining-tokens');
  const tokReset=getHeaderDuration(headers,now,'x-ratelimit-reset-tokens','ratelimit-reset-tokens');
  if(tokLimit!==undefined||tokRemaining!==undefined){
   metrics.push({
    label:provider==='groq'?'Tokens per minute':'Reported tokens',
    unit:'tokens',
    limit:tokLimit,
    remaining:tokRemaining,
    resetAt:tokReset
   });
  }

  // OpenRouter credit details
  if(provider==='openrouter'){
   const d=data?.data;
   for(const [field,label] of [['limit','Credit allowance'],['limit_remaining','Credit remaining'],['usage','Credits used']] as const){
    const n=number(d?.[field]);
    if(n!==undefined)metrics.push({label,unit:'USD',...(field==='usage'?{used:n}:field==='limit'?{limit:n}:{remaining:n})});
   }
   if(d?.rate_limit?.requests){
    metrics.push({label:`Rate limit (${d.rate_limit.interval||'window'})`,unit:'requests',limit:d.rate_limit.requests});
   }
  }

  // AI Horde kudos & worker metrics
  if(provider==='aihorde'){
   const kudos=number(data?.kudos??data?.user?.kudos);
   if(kudos!==undefined){
    metrics.push({label:'Horde Kudos available',unit:'requests',remaining:kudos});
   }
  }
 }else{
  for(const [header,label] of [['x-app-usage','App'],['x-business-use-case-usage','Instagram business use case']] as const){
   let parsed:any;try{const raw=headers.get(header);if(raw&&raw.length<32768)parsed=JSON.parse(raw);}catch{}
   const entries=header==='x-app-usage'?[parsed]:Object.values(parsed||{}).flat().filter((x:any)=>x?.type==='instagram');
   for(const entry of entries.slice(0,32)){
    for(const [field,name] of [['call_count','Calls'],['total_cputime','CPU time'],['total_time','Processing time']] as const){
     const used=number(entry?.[field]);
     if(used!==undefined)metrics.push({label:label+' · '+name,unit:'percent',used,limit:100});
    }
    const minutes=number(entry?.estimated_time_to_regain_access);
    if(minutes&&minutes<=10080)retryAt=Math.max(retryAt||0,now+minutes*60000);
   }
  }
 }
 return {at:now,status,limited,...(code!==undefined?{code}:{}),...(retryAt?{retryAt}:{}),metrics};
}
