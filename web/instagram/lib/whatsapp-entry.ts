// Direct development ports must open the actual business app, never a stale
// embedded dashboard. Production paths are routed by web/server.mjs.
export function whatsappServiceOrigin(host:string|null):string|null {
  if(host==='localhost:3000')return 'http://localhost:3001';
  if(host==='127.0.0.1:3000')return 'http://127.0.0.1:3001';
  const configured=process.env.WHATSAPP_PUBLIC_URL;
  if(configured) {
    try {const url=new URL(configured);if(url.protocol==='https:')return url.origin;}catch{}
  }
  return null;
}
