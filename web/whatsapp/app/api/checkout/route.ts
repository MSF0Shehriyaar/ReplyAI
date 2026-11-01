import {initDatabase,errorResponse,AppError} from '@/lib/server';
import {requireOrigin,readJSON} from '@/lib/request-security';
import {catalogCheckoutSchema,normalizeCustomerPhone} from '@/lib/checkout-contract';
import {createCatalogCheckout} from '@/lib/catalog-checkout';
import {consumeRateLimit} from '@/lib/rate-limit';
export const dynamic='force-dynamic';
export async function POST(request:Request){
  try{
    requireOrigin(request);await initDatabase();
    const ip=request.headers.get('x-forwarded-for')?.split(',')[0].trim()||'unknown';
    await consumeRateLimit('catalog-checkout:'+ip,12,60000);
    const parsed=catalogCheckoutSchema.safeParse(await readJSON(request,16000));
    if(!parsed.success)throw new AppError('Check your delivery address, phone, PIN code and bag. All required address fields and consent are needed.',400);
    await consumeRateLimit('catalog-checkout-customer:'+normalizeCustomerPhone(parsed.data.address.phone),10,3600000);
    const result=await createCatalogCheckout(parsed.data);
    return Response.json(result,{headers:{'Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});
  }catch(error){return errorResponse(error);}
}
