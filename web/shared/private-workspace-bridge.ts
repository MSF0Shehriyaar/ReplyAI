const encoder=new TextEncoder();
const headerName='x-private-workspace-proof';
function ownerToken(headers:Headers) {
  const authorization=headers.get('authorization');
  if(authorization?.startsWith('Bearer '))return authorization.slice(7).trim();
  const cookie=headers.get('cookie')?.split(';').map(part=>part.trim()).find(part=>part.startsWith('nina_owner_session='));
  try{return cookie?decodeURIComponent(cookie.slice('nina_owner_session='.length)):'';}catch{return '';}
}
async function signingKey() {
  const secret=process.env.SESSION_SIGNING_KEY||'';
  if(secret.length<32)throw new Error('Private service signing is not configured.');
  return crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);
}
function message(request:Request,time:number) {
  const url=new URL(request.url);
  // Next's route Request omits its configured basePath. Canonicalize the
  // transport URL and the route URL identically before signing or verifying.
  const pathname=url.pathname.startsWith('/business/')?url.pathname.slice('/business'.length):url.pathname;
  return encoder.encode(['private-workspace:v1',request.method,pathname+url.search,String(time),ownerToken(request.headers)].join('\n'));
}
export async function signPrivateWorkspaceRequest(request:Request) {
  if(!ownerToken(request.headers))throw new Error('Owner credentials are required.');
  const time=Date.now();
  const signature=await crypto.subtle.sign('HMAC',await signingKey(),message(request,time));
  return time+'.'+Array.from(new Uint8Array(signature),b=>b.toString(16).padStart(2,'0')).join('');
}
export async function isPrivateWorkspaceRequest(request:Request) {
  try {
    const proof=request.headers.get(headerName)||'';
    const [timeText,signature]=proof.split('.');
    const time=Number(timeText);
    if(!Number.isFinite(time)||Math.abs(Date.now()-time)>30000||!/^[a-f0-9]{64}$/.test(signature)||!ownerToken(request.headers))return false;
    return crypto.subtle.verify('HMAC',await signingKey(),Uint8Array.from(signature.match(/../g)!,part=>parseInt(part,16)),message(request,time));
  }catch{return false;}
}
export const PRIVATE_WORKSPACE_PROOF_HEADER=headerName;
