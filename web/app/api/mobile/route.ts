import {z} from 'zod';
import {requestJSON} from '@/lib/request-json';
import {errorResponse,AppError,writeState,readState} from '@/lib/server';
import {validateDevice,DEVICE_PREFIX,type Device} from '@/lib/mobile-access';
import {GET as workspaceGET,PUT as workspacePUT} from '../workspace/route';
import {POST as threadsPOST} from '../threads/route';
import {POST as connectionsPOST} from '../connections/route';
import {POST as managedPOST} from '../managed-connections/route';
import {POST as previewPOST} from '../preview/route';
import {POST as processPOST} from '../process/route';
import {GET as statusGET} from '../automation-status/route';
import {GET as limitsGET} from '../limits/route';
import {GET as exportGET} from '../export/route';
const routes:Record<string,(r:Request)=>Promise<Response>>={
 'GET /api/workspace':()=>workspaceGET(),'PUT /api/workspace':workspacePUT,
 'POST /api/threads':threadsPOST,'POST /api/connections':connectionsPOST,
 'POST /api/managed-connections':managedPOST,'POST /api/preview':previewPOST,
 'POST /api/process':processPOST,'GET /api/automation-status':()=>statusGET(),
 'GET /api/limits':()=>limitsGET(),'GET /api/export':()=>exportGET()
};
export async function POST(request:Request){try{const id=await validateDevice(request.headers.get('x-nina-device'));const parsed=z.object({path:z.string().max(100),method:z.enum(['GET','POST','PUT']),payload:z.unknown().optional()}).strict().safeParse(await requestJSON(request));if(!parsed.success)throw new AppError('Invalid phone request.');const p=parsed.data;if(p.path==='/api/mobile/disconnect'&&p.method==='POST'){const key=DEVICE_PREFIX+id;const device=await readState<Device>(key,{} as Device);await writeState(key,{...device,revokedAt:Date.now()});return Response.json({ok:true});}const handler=routes[p.method+' '+p.path];if(!handler)throw new AppError('This phone operation is not supported.',403);const origin=new URL(request.url).origin;const internal=new Request(origin+p.path,{method:p.method,headers:{'Content-Type':'application/json','x-nina-client':'1',Origin:origin},body:p.method==='GET'?undefined:JSON.stringify(p.payload??{})});const result=await handler(internal);return new Response(result.body,{status:result.status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});}catch(e){return errorResponse(e);}}
