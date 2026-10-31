import {requireWorkspaceRequest,errorResponse,AppError} from '@/lib/server';
import {processQueueBatch} from '@/lib/queue';
import {validSignature} from '../webhook/route';

export async function POST(request:Request){
  try{
    if(request.headers.get('x-nina-client')==='1'){
      await requireWorkspaceRequest(request);
    }else{
      const raw=await request.text();
      if(!await validSignature(raw,request.headers.get('x-hub-signature-256')))throw new AppError('Invalid processing request.',403);
      const body=JSON.parse(raw);
      if(!body.process||!body.timestamp||Math.abs(Date.now()-body.timestamp)>300000)throw new AppError('Processing request expired.',403);
    }
    return Response.json(await processQueueBatch(6, true));
  }catch(e){
    return errorResponse(e);
  }
}
