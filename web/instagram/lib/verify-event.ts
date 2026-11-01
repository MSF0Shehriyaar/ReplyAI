import { secret, instagramAccounts } from './server';
import { verifyWebhookSignature } from './webhook-signature';
export async function validSignature(body:string|ArrayBuffer,signature:string|null) {
  return verifyWebhookSignature(body,signature,await Promise.all([secret('instagram_app_secret'),secret('meta_secret'),...(await instagramAccounts()).map(a=>secret('instagram-secret:'+a.id))]));
}
