import {AppError} from './server';
export async function requestJSON(request:Request,maxBytes=65536):Promise<unknown>{
 if(Number(request.headers.get('content-length'))>maxBytes)throw new AppError('Request too large.',413);
 const reader=request.body?.getReader();if(!reader)throw new AppError('A JSON body is required.');
 const chunks:Uint8Array[]=[];let size=0;
 for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>maxBytes){await reader.cancel();throw new AppError('Request too large.',413);}chunks.push(value);}
 const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.byteLength;}
 try{return JSON.parse(new TextDecoder().decode(bytes));}catch{throw new AppError('Invalid JSON request.');}
}
