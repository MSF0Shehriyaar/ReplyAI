import {NextRequest,NextResponse} from 'next/server';
import {GET as session,POST as authenticate} from '../auth/route';
export const dynamic='force-dynamic';
export const GET=session;
export async function POST(request:NextRequest){
  if(request.headers.has('origin')||request.headers.has('cookie')||request.headers.has('sec-fetch-site'))return NextResponse.json({error:'Use browser sign-in.'},{status:403});
  try{
    const raw=await request.text();if(raw.length>8192)return NextResponse.json({error:'Request too large.'},{status:413});
    const body=JSON.parse(raw);
    if(!['login','register'].includes(body.action))return NextResponse.json({error:'Choose sign-in or registration.'},{status:400});
    const url=new URL('/business/api/auth',request.url);
    const headers=new Headers({'Content-Type':'application/json',origin:url.origin});
    for(const key of ['x-forwarded-for','user-agent'])if(request.headers.get(key))headers.set(key,request.headers.get(key)!);
    const response=await authenticate(new NextRequest(url,{method:'POST',headers,body:JSON.stringify(body)}));
    const data=await response.json() as Record<string,unknown>;
    const serialized=response.headers.get('set-cookie')?.match(/(?:^|,\s*)wa_session=([^;]+)/)?.[1];
    const token=serialized?decodeURIComponent(serialized):undefined;
    return NextResponse.json(response.ok&&token?{...data,token}:data,{status:response.status,headers:{'Cache-Control':'no-store','Pragma':'no-cache'}});
  }catch{return NextResponse.json({error:'Authentication failed.'},{status:400});}
}
export async function DELETE(request:NextRequest){
  return authenticate(new NextRequest(new URL('/business/api/auth',request.url),{method:'POST',headers:{'Content-Type':'application/json',Authorization:request.headers.get('authorization')||''},body:JSON.stringify({action:'logout'})}));
}
