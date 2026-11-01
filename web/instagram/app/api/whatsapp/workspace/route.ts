// WhatsApp owns these routes. Never expose an unauthenticated fallback from Instagram.
export const dynamic = 'force-dynamic';
export async function GET() { return Response.json({error:'WhatsApp service unavailable.'},{status:503,headers:{'Cache-Control':'no-store'}}); }
export const POST = GET;

