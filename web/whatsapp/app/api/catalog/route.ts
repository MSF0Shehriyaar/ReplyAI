import {initDatabase,errorResponse,AppError,db} from '@/lib/server';
import {getAuthSession} from '@/lib/auth';
import {publicCatalog} from '@/lib/public-catalog';
export const dynamic='force-dynamic';
export async function GET(request:Request) {
  try {
    const params=new URL(request.url).searchParams;
    const slug=params.get('slug');
    const requested=params.get('business');
    if(!requested&&!slug&&!request.headers.get('cookie'))throw new AppError('Open a business catalog link or sign in to your workspace.',400);
    await initDatabase();
    const publication=slug?await db().prepare('SELECT tenant_id FROM catalog_publications WHERE slug=? AND published=1').bind(slug).first<{tenant_id:string}>():null;
    if(slug&&!publication)throw new AppError('This catalog is unavailable.',404);
    const businessId=publication?.tenant_id||requested||(await getAuthSession(request))?.tenantId;
    if(!businessId)throw new AppError('Open a business catalog link or sign in to your workspace.',401);
    return Response.json(await publicCatalog(businessId),{headers:{'Cache-Control':'no-store'}});
  }catch(error){return errorResponse(error);}
}
