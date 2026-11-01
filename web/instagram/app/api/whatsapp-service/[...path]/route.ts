import {proxyPrivateWhatsApp} from '@/lib/whatsapp-proxy';
export const dynamic='force-dynamic';
export const runtime='nodejs';
type Context={params:Promise<{path:string[]}>};
export async function GET(request:Request,context:Context) {
  return proxyPrivateWhatsApp(request,(await context.params).path);
}
export const POST=GET;
