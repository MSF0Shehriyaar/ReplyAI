import {z} from 'zod';
import {initDatabase,errorResponse,AppError,audit} from '@/lib/server';
import {requireTenantAccess} from '@/lib/auth';
import {readJSON,tenantIdSchema} from '@/lib/request-security';
import {consumeRateLimit} from '@/lib/rate-limit';
import {parseAndMapAddress} from '@/lib/location-service';
export const dynamic='force-dynamic';
export async function POST(request:Request) {
  try {
    await initDatabase();
    const parsed=z.object({address:z.string().min(8).max(2000),tenantId:tenantIdSchema.optional()}).strict().safeParse(await readJSON(request,4096));
    if(!parsed.success) throw new AppError('Enter a delivery address or shared map coordinates.',400);
    const {session,tenantId}=await requireTenantAccess(request,parsed.data.tenantId);
    await consumeRateLimit('location:'+session.userId,20,60000);
    const location=await parseAndMapAddress(parsed.data.address);
    if(!location) throw new AppError('Include the street, locality and city, or share a map position.',422);
    await audit('Location checked','Delivery address parsed; confirmation required',tenantId);
    return Response.json({location},{headers:{'Cache-Control':'no-store'}});
  } catch(error) {return errorResponse(error);}
}
