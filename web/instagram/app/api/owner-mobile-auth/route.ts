import {NextRequest,NextResponse} from 'next/server';
import {GET as session,POST as login,DELETE as logout} from '../auth/route';
export const dynamic='force-dynamic';
export const GET=session;
export const DELETE=logout;
// Native applications exchange explicit credentials for a revocable bearer
// session. Browser authentication continues to use HTTP-only cookies.
export async function POST(request:NextRequest){
  if(request.headers.has('origin')||request.headers.has('cookie')||request.headers.has('sec-fetch-site'))return NextResponse.json({error:'Use browser sign-in.'},{status:403});
  try{
    const raw=await request.text();if(raw.length>8192)return NextResponse.json({error:'Request too large.'},{status:413});
    const body=JSON.parse(raw);
    if(body.action&&body.action!=='login')return NextResponse.json({error:'Sign-in required.'},{status:400});
    const url=new URL('/api/auth',request.url);
    const headers=new Headers({'Content-Type':'application/json',origin:url.origin});
    for(const key of ['x-forwarded-for','user-agent'])if(request.headers.get(key))headers.set(key,request.headers.get(key)!);
    const response=await login(new NextRequest(url,{method:'POST',headers,body:JSON.stringify({action:'login',username:body.username,password:body.password})}));
    const data=await response.json() as Record<string,unknown>;
    const token=response.cookies.get('nina_owner_session')?.value;
    return NextResponse.json(response.ok&&token?{...data,token}:data,{status:response.status,headers:{'Cache-Control':'no-store','Pragma':'no-cache'}});
  }catch{return NextResponse.json({error:'Authentication failed.'},{status:400});}
}
