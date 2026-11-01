export class ApiError extends Error{constructor(message:string,public status:number){super(message);}}
export function configuredOrigin(raw:string|undefined,development:boolean){
  if(!raw)throw new Error('Set EXPO_PUBLIC_API_URL to your service origin before starting the app.');
  const url=new URL(raw);
  if(url.username||url.password||url.search||url.hash||url.pathname!=='/')throw new Error('The service URL must be an origin with no path or credentials.');
  if(url.protocol!=='https:'&&!(development&&url.protocol==='http:'))throw new Error('A secure HTTPS service is required.');
  return url.origin;
}
export function apiClient(origin:string,token:string|null,onExpired?:()=>void){
  return async function request<T=any>(path:string,body?:unknown,method=body===undefined?'GET':'POST'):Promise<T>{
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),65000);
    try{
      const response=await fetch(origin+path,{method,credentials:'omit',redirect:'error',headers:{Accept:'application/json',...(body!==undefined?{'Content-Type':'application/json'}:{}),...(token?{Authorization:'Bearer '+token}:{})},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:controller.signal});
      const data:any=await response.json().catch(()=>({error:'The service returned an unreadable response.'}));
      if(response.status===401&&token)onExpired?.();
      if(!response.ok)throw new ApiError(data.error||'The request could not be completed.',response.status);
      return data as T;
    }catch(error){if(error instanceof ApiError)throw error;throw new Error('The service could not be reached. Check your connection and retry.');}
    finally{clearTimeout(timer);}
  };
}
export type Api=ReturnType<typeof apiClient>;
