import {db,settings,getThread,saveThread,generateReply,sendReply,reviewFlag,audit,AppError,instagramAccounts,cleanupHistory,fetchInstagramMediaDetails} from './server';
import {automationWindow} from './automation-window';
import type {Thread} from './model';

type Job={id:string;thread_id:string;payload:string;attempts:number;created:number};

let lastCleanup = 0;
async function throttledCleanup(){
 const now = Date.now();
 if(now - lastCleanup > 3600000){
  lastCleanup = now;
  try{ await cleanupHistory(); }catch{}
 }
}

async function recoverStaleJobs(){
 const cutoff=Date.now()-120000;
 try {
  await db().prepare("UPDATE jobs SET status='pending',attempts=0,created=? WHERE status='processing' AND created<?").bind(Date.now(),cutoff).run();
  const stale=(await db().prepare("SELECT id,payload FROM threads WHERE demo=0 AND (json_extract(payload,'$.status')='sending' OR json_extract(payload,'$.status')='uncertain') AND updated<?").bind(cutoff).all<{id:string;payload:string}>()).results;
  for(const st of stale){
   try{
    const p=JSON.parse(st.payload);
    p.status=p.draft?'review':'open';
    await db().prepare("UPDATE threads SET payload=? WHERE id=?").bind(JSON.stringify(p),st.id).run();
   }catch{}
  }
 } catch {}
}

export async function drainPendingReviews(): Promise<number> {
 const s=await settings();
 if(s.approval)return 0;
 const now=Date.now(),window=automationWindow(s,now);
 if(!window.active)return 0;
 try{
  const pendingReviews=(await db().prepare("SELECT payload FROM threads WHERE demo=0 AND json_extract(payload,'$.status')='review' AND json_extract(payload,'$.draft')!='' LIMIT 1").all<{payload:string}>()).results;
  let sent=0;
  for(const r of pendingReviews){
   const revT=JSON.parse(r.payload) as Thread;
   if(!revT.flagged&&revT.draft){
    try{
     const latestIncoming=revT.messages.filter(m=>m.role==='incoming').at(-1);
     const eventId=latestIncoming?.eventId;
     await sendReply(revT,revT.draft,eventId);
     await db().prepare("UPDATE jobs SET status='done' WHERE thread_id=? AND status='pending'").bind(revT.id).run();
     sent++;
    }catch(err){
     console.warn('Auto review send error for '+revT.id+':',err);
    }
   }
  }
  return sent;
 }catch(err){
  console.warn('drainPendingReviews error:',err);
  return 0;
 }
}

export async function queueStatus(){
 const rows=(await db().prepare('SELECT status,COUNT(*) count FROM jobs GROUP BY status').all<{status:string;count:number}>()).results;
 const counts=Object.fromEntries(rows.map(r=>[r.status,Number(r.count)]));
 const ready=await db().prepare("SELECT COUNT(*) count FROM jobs WHERE status='pending' AND created<=?").bind(Date.now()).first<{count:number}>();
 const uncertain=await db().prepare("SELECT COUNT(*) count FROM threads WHERE demo=0 AND (json_extract(payload,'$.status')='sending' OR json_extract(payload,'$.status')='uncertain')").first<{count:number}>();
 return {pending:counts.pending||0,ready:Number(ready?.count||0),processing:counts.processing||0,failed:counts.failed||0,done:counts.done||0,uncertain:Number(uncertain?.count||0)};
}

export async function processNextJob(){
 await throttledCleanup();await recoverStaleJobs();const s=await settings();const now=Date.now(),window=automationWindow(s,now);
 const job=await db().prepare(`SELECT j.* FROM jobs j WHERE j.status='pending' AND j.attempts<5 AND j.created<=?
 AND NOT EXISTS (SELECT 1 FROM jobs p WHERE p.thread_id=j.thread_id AND p.status='processing')
 ORDER BY j.created ASC LIMIT 1`).bind(now).first<Job>();
 if(!job)return {processed:0};
 let parsedJob:any=null;
 try{parsedJob=JSON.parse(job.payload);}catch{}
 const isDm=parsedJob?.channel==='dm';
 const waitMs=Math.max(0,(s.replyDelaySeconds||0))*1000;
 if(isDm&&waitMs>0){
  const threadJobs=(await db().prepare("SELECT id,created,payload FROM jobs WHERE thread_id=? AND status='pending' AND attempts<5").bind(job.thread_id).all<{id:string;created:number;payload:string}>()).results;
  let latestMsgAt=0;
  for(const tj of threadJobs){
   try{
    const p=JSON.parse(tj.payload);
    const msgAt=Number(p.at)||tj.created;
    if(msgAt>latestMsgAt)latestMsgAt=msgAt;
   }catch{
    if(tj.created>latestMsgAt)latestMsgAt=tj.created;
   }
  }
  if(latestMsgAt>0){
   const elapsed=now-latestMsgAt;
   if(elapsed<waitMs){
    const waitUntil=latestMsgAt+waitMs;
    await db().prepare("UPDATE jobs SET created=? WHERE thread_id=? AND status='pending'").bind(waitUntil,job.thread_id).run();
    return {processed:0,deferred:true};
   }
  }
 }
 const claim=await db().prepare("UPDATE jobs SET status='processing',attempts=attempts+1,created=? WHERE id=? AND status='pending' AND NOT EXISTS (SELECT 1 FROM jobs p WHERE p.thread_id=? AND p.status='processing')").bind(now,job.id,job.thread_id).run();
 if(!claim.meta.changes)return {processed:0};
 const group=[job];
 const candidates=(await db().prepare("SELECT * FROM jobs WHERE thread_id=? AND status='pending' AND attempts<5 AND id!=? ORDER BY created ASC LIMIT 50").bind(job.thread_id,job.id).all<Job>()).results;
 for(const other of candidates){const r=await db().prepare("UPDATE jobs SET status='processing',attempts=attempts+1,created=? WHERE id=? AND status='pending'").bind(now,other.id).run();if(r.meta.changes)group.push(other);}
 const ids=group.map(j=>j.id);
 try{
  const events=group.map(j=>({...JSON.parse(j.payload),id:j.id})).sort((a,b)=>a.at-b.at);
  const cutoff=s.autoDeleteEnabled!==false?(Date.now()-s.retention*86400000):0;
  const usable=events.filter(e=>(cutoff===0||e.at>cutoff)&&e.text);
  if(!usable.length){await finish(ids,'done');return {processed:group.length};}
  const e=usable.at(-1)!;
  let t:Thread;try{t=await getThread(e.threadId);}catch(error){if(!(error instanceof AppError)||error.status!==404)throw error;t={accountId:e.accountId||'legacy-instagram',id:e.threadId,name:e.username,username:e.username,channel:e.channel,demo:false,status:'open',takeover:false,ai:true,messages:[],draft:'',lastInbound:e.at,updated:e.at,version:0,recipientId:e.recipientId,commentId:e.commentId,mediaId:e.mediaId,mediaType:e.mediaType};}
  if(e.mediaId)t.mediaId=e.mediaId;
  if(e.mediaType)t.mediaType=e.mediaType;
  const fresh=usable.filter(e=>t.lastReplyEventId!==e.id&&!t.lastReplyEventIds?.includes(e.id));
  if(!fresh.length){await finish(ids,'done');return {processed:group.length};}
  for(const item of fresh)if(!t.messages.some(m=>m.role==='incoming'&&(m.eventId===item.id||(!m.eventId&&m.at===item.at&&m.text===item.text))))t.messages.push({role:'incoming',eventId:item.id,text:item.text,at:item.at});
  if(s.autoDeleteEnabled!==false&&cutoff>0){
   t.messages=t.messages.filter(m=>m.at>cutoff).slice(-200);
  }else{
   t.messages=t.messages.slice(-200);
  }
  t.lastInbound=Math.max(t.lastInbound,e.at);t.draft='';if(t.status!=='sending'&&t.status!=='uncertain')t.status='open';
  const input=fresh.map(e=>e.text).join('\n').slice(-6000);t.flagged=reviewFlag(input)||undefined;if(t.flagged?.startsWith('Explicit message'))t.flagged=undefined;
  if(t.channel==='comment'){
   let dynamicMedia: any = null;
   if(t.mediaId){
    try{ dynamicMedia = await fetchInstagramMediaDetails(t.mediaId, t.accountId); }catch{}
   }
   if(dynamicMedia?.media_product_type) t.mediaType = dynamicMedia.media_product_type.toLowerCase();
   const matched = s.postCatalog?.length
    ? ((t.mediaId && s.postCatalog.find(p=>p.id===t.mediaId)) || s.postCatalog.find(p=>p.title&&(input.toLowerCase().includes(p.title.toLowerCase())||(p.caption&&input.toLowerCase().includes(p.caption.toLowerCase())))))
    : null;
   if(matched && dynamicMedia?.caption){
    t.postContext = `${matched.title ? matched.title + ': ' : ''}${matched.description} (Instagram Reel Caption: "${dynamicMedia.caption}")`;
   }else if(matched){
    t.postContext = `${matched.title ? matched.title + ': ' : ''}${matched.description}${matched.caption ? ' (Caption: "' + matched.caption + '")' : ''}`;
   }else if(dynamicMedia?.caption){
    t.postContext = `Instagram Reel Caption: "${dynamicMedia.caption}" (${dynamicMedia.media_product_type || 'REELS'})`;
   }
  }
  await saveThread(t);t.version=(t.version||0)+1;
  const account=(await instagramAccounts()).find(a=>a.id===(e.accountId||t.accountId||'legacy-instagram'));const excluded=s.excludedUsers||[];
  const accountDm=account?account.dmEnabled!==false:true;
  const accountComments=account?account.commentsEnabled!==false:true;
  const accountAi=account?account.aiEnabled!==false:true;
  const channelAllowed=t.channel==='dm'?(s.dm&&accountDm):(s.comments&&accountComments);
  const eligibleBase=account?.enabled&&accountAi&&account.verified&&!excluded.includes(String(e.recipientId))&&!excluded.includes(account.id+':'+e.recipientId)&&t.status!=='sending'&&t.status!=='uncertain'&&!t.takeover&&t.ai&&channelAllowed&&t.lastInbound<=e.at;
  if(eligibleBase&&!window.active){
   const nextActive=window.nextChangeAt||(Date.now()+60000);
   await postpone(group,nextActive,true);
   return {processed:group.length,deferred:true};
  }
  const eligible=window.active&&eligibleBase;
  if(eligible){
   if(t.channel==='dm'&&Date.now()-t.lastInbound>=86400000)throw new AppError('The 24-hour DM reply window has closed.',422);
   if(t.flagged&&!t.flagged.startsWith('Explicit message')){t.status='review';await saveThread(t);t.version=(t.version||0)+1;}
   else{
    if(t.channel==='dm'&&(s.replyDelaySeconds||0)>0){
     const newer=await db().prepare("SELECT created FROM jobs WHERE thread_id=? AND status='pending' ORDER BY created DESC LIMIT 1").bind(t.id).first<{created:number}>();
     if(newer&&newer.created>now){
      await postpone(group,newer.created+500,true);
      return {processed:group.length,deferred:true};
     }
    }
    const history=t.messages.filter(m=>!(m.role==='incoming'&&ids.includes(m.eventId||'')));
    const isUncensoredTone=((account?.tone||s.tone)==='erotic'||(account?.tone||s.tone)==='spicy');
    const draft=await generateReply(input,t.channel,history,t.accountId,undefined,{uncensored:isUncensoredTone,postContext:t.postContext,mediaType:t.mediaType,recipientUsername:t.username});
    t.draft=draft;
    if(s.approval){
     t.status='review';
     await saveThread(t);
     t.version=(t.version||0)+1;
    }else{
     t.status='open';
     await saveThread(t);
     t.version=(t.version||0)+1;
     await sendReply(t,draft,e.id,ids);
    }
   }
  }
  await finish(ids,'done');await audit('Interaction received','Saved a '+t.channel+' message group');return {processed:group.length};
 }catch(error){
  const attempts=Math.max(...group.map(j=>j.attempts));const providerWait=error instanceof AppError&&error.status===429&&!!error.retryAt;let canRetry=(providerWait||(error instanceof AppError&&(error.retryable||error.status===409)))&&attempts<5;
  try{const t=await getThread(job.thread_id);if(t.status==='sending'||t.status==='uncertain')canRetry=false;}catch{}
  if(canRetry){const delay=error instanceof AppError&&error.status===429?300000:15000*(2**Math.min(attempts,4));await postpone(group,providerWait?(error as AppError).retryAt!:Date.now()+delay,providerWait);await audit('Reply retry queued','Temporary failure; retry will wait before another attempt.');}
  else{await finish(ids,'failed');await audit('Needs attention',error instanceof AppError?error.message:(error as any)?.message||'A queued interaction needs attention.');}
  return {processed:group.length,retryQueued:canRetry};
 }
}

export async function processQueueBatch(limit=1, resetStuck=false): Promise<{processed:number;queue:any}>{
 if(resetStuck){
  const now=Date.now();
  await db().prepare("UPDATE jobs SET status='pending',attempts=0,created=? WHERE status='pending' AND attempts>=5").bind(now).run();
  await db().prepare("UPDATE jobs SET status='pending',attempts=0,created=? WHERE status='processing' AND created<?").bind(now,now-30000).run();
 }
 const reviewsSent=await drainPendingReviews();
 let totalProcessed=reviewsSent;
 const maxIterations=Math.max(1,Math.min(limit,10));
 for(let i=0;i<maxIterations;i++){
  const res=await processNextJob();
  if(!res.processed)break;
  totalProcessed+=res.processed;
 }
 const status=await queueStatus();
 return {processed:totalProcessed,queue:status};
}

async function postpone(jobs:Job[],at:number,quietPeriod=false){for(const j of jobs)await db().prepare("UPDATE jobs SET status='pending',created=?,attempts=MAX(0,attempts-?) WHERE id=? AND status='processing'").bind(at,quietPeriod?1:0,j.id).run();}
async function finish(ids:string[],status:string){for(const id of ids)await db().prepare("UPDATE jobs SET status=? WHERE id=? AND status='processing'").bind(status,id).run();}
