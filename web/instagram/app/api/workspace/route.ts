import { requireWorkspaceRequest,errorResponse,settings,allThreads,connectionStatus,db,settingsSchema,cleanupHistory,writeState,audit,AppError,syncInstagramReels } from '@/lib/server';
import {automationWindow} from '@/lib/automation-window';
import {queueStatus, processNextJob} from '@/lib/queue';
import {defaults} from '@/lib/model';

export const dynamic='force-dynamic';
let lastCleanupAt=0;
let lastWorkspaceCache:any=null;

export async function GET(){
 try{
  await requireWorkspaceRequest();
  const [s,threads,connections,logs,usage,queue]=await Promise.all([
   settings(),
   allThreads(),
   connectionStatus(),
   db().prepare('SELECT * FROM activity WHERE demo=0 ORDER BY created DESC LIMIT 100').all(),
   db().prepare('SELECT COALESCE(SUM(calls),0) calls,COALESCE(SUM(tokens),0) tokens,COALESCE(SUM(sent),0) sent FROM usage').first(),
   queueStatus()
  ]);
  const responseData={settings:s,automationWindow:automationWindow(s),threads,connections,logs:logs.results,usage,queue,storageReady:true};
  lastWorkspaceCache=responseData;
  return Response.json(responseData,{headers:{'Cache-Control':'no-store'}});
 }catch(e:any){
  console.error('Workspace load error:', e);
  return errorResponse(e);
 }
}

export async function PUT(request:Request){
 try{
  await requireWorkspaceRequest(request);
  const parsed=settingsSchema.safeParse(await request.json());
  if(!parsed.success){
   const issue=parsed.error.issues[0];
   throw new AppError((issue?issue.path.join('.')+': '+issue.message:'Check the settings fields and try again.'),400);
  }
  const c=await connectionStatus();
  if(parsed.data.enabled&&(!c.instagramVerified||!c.aiVerified||!c.receiverSeen))throw new AppError('Connect and test Instagram, your reply provider, and the public webhook receiver before enabling automation.',412);
  if(parsed.data.cycleEnabled&&!parsed.data.cycleStartedAt)parsed.data.cycleStartedAt=Date.now();
  await writeState('settings',parsed.data);
  await audit('Settings saved','Updated personality and reply controls');
  return Response.json({ok:true});
 }catch(e){
  return errorResponse(e);
 }
}

export async function POST(request:Request){
 try{
  await requireWorkspaceRequest(request);
  const body: any = await request.json().catch(()=>({}));
  if(body?.action==='cleanup'){
   await cleanupHistory(true);
   await audit('Manual history cleanup','Purged old conversation history according to retention settings.');
   return Response.json({ok:true,message:'History cleaned up successfully.'});
  }
  if(body?.action==='sync-reels'){
   const res = await syncInstagramReels(body?.accountId);
   return Response.json({ok:true,message:`Synced ${res.synced} reels/posts from Instagram.`,synced:res.synced});
  }
  throw new AppError('Unknown workspace action.',400);
 }catch(e){
  return errorResponse(e);
 }
}

