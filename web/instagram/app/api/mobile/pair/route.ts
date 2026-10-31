import {z} from 'zod';
import {errorResponse,AppError} from '@/lib/server';
import {requestJSON} from '@/lib/request-json';
import {redeemPair} from '@/lib/mobile-access';
export async function POST(request:Request){try{const parsed=z.object({code:z.string().max(100),label:z.string().max(80).optional()}).strict().safeParse(await requestJSON(request,1024));if(!parsed.success)throw new AppError('Invalid pairing request.');return Response.json(await redeemPair(parsed.data.code,parsed.data.label),{headers:{'Cache-Control':'no-store'}});}catch(e){return errorResponse(e);}}
