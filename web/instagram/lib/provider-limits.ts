// Inspect limit metadata only; never log provider bodies (which may echo input).
export function providerLimited(status:number,data:any){return status===429||((status===400||status===403)&&data?.error?.status==='RESOURCE_EXHAUSTED')||(status===402&&(data?.error?.code===402||data?.error?.type==='insufficient_quota'));}
export function providerRetryAt(headers:Headers,data:any,now=Date.now()){
 const retry=headers.get('retry-after');let milliseconds=0;
 if(retry){const seconds=Number(retry);milliseconds=Number.isFinite(seconds)?seconds*1000:Date.parse(retry)-now;}
 if(!(milliseconds>0)){const detail=data?.error?.details?.find((d:any)=>typeof d.retryDelay==='string');if(detail)milliseconds=parseFloat(detail.retryDelay)*1000;}
 if(!(milliseconds>0)){const message=String(data?.error?.message||'');milliseconds=/per.?day|daily|tokens.?per.?day|requests.?per.?day/i.test(message)?86400000:60000;}
 return now+Math.max(1000,Math.min(7*86400000,milliseconds));
}
