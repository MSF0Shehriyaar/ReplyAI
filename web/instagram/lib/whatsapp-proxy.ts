import {requireWorkspaceRequest,errorResponse,AppError} from './server';
import {signPrivateWorkspaceRequest,PRIVATE_WORKSPACE_PROOF_HEADER} from '../../shared/private-workspace-bridge';

const allowed=new Set(['admin','workspace','auth','connect','location','catalog']);
export async function proxyPrivateWhatsApp(request:Request,path:string[]) {
  try {
    await requireWorkspaceRequest(request);
    if(path.length!==1||!allowed.has(path[0]))return new Response(null,{status:404});
    const incoming=new URL(request.url);
    const backend=new URL('api/'+path[0],(process.env.WHATSAPP_INTERNAL_URL||'http://127.0.0.1:3001/business').replace(/\/$/,'')+'/');
    if(!['http:','https:'].includes(backend.protocol))throw new AppError('Service configuration unavailable.',503);
    backend.search=incoming.search;
    const headers=new Headers({'Content-Type':'application/json'});
    const authorization=request.headers.get('authorization');
    const cookie=request.headers.get('cookie')?.split(';').map(part=>part.trim()).find(part=>part.startsWith('nina_owner_session='));
    if(authorization?.startsWith('Bearer '))headers.set('Authorization',authorization);
    else if(cookie)headers.set('Cookie',cookie);
    else throw new AppError('Owner sign-in required.',401);
    headers.set('Origin',request.headers.get('origin')||backend.origin);
    if(request.headers.get('x-forwarded-for'))headers.set('x-forwarded-for',request.headers.get('x-forwarded-for')!);
    const proofRequest=new Request(backend,{method:request.method,headers});
    headers.set(PRIVATE_WORKSPACE_PROOF_HEADER,await signPrivateWorkspaceRequest(proofRequest));
    let body:string|undefined;
    if(!['GET','HEAD'].includes(request.method)) {
      body=await request.text();
      if(body.length>128000)throw new AppError('Request too large.',413);
    }
    const response=await fetch(backend,{method:request.method,headers,body,cache:'no-store',redirect:'manual',signal:AbortSignal.timeout(65000)});
    if(response.status>=300&&response.status<400)throw new AppError('Business service unavailable.',502);
    if(!response.headers.get('content-type')?.includes('application/json'))throw new AppError('Business service unavailable.',502);
    return new Response(response.body,{status:response.status,headers:{'Content-Type':'application/json','Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});
  }catch(error){return errorResponse(error);}
}
