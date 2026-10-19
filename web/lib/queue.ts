import {db,settings,getThread,saveThread,generateReply,sendReply,reviewFlag,audit,AppError,instagramAccounts,cleanupHistory,fetchInstagramMediaDetails,checkUserFollowsBusiness,createSnapToken,syncSingleReelIfNew,syncInstagramReels,readState,writeState} from './server';
import {automationWindow, channelAutomationWindow} from './automation-window';
import type {Thread, Channel, Message} from './model';

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
 const accounts=await instagramAccounts();
 try{
  const pendingReviews=(await db().prepare("SELECT payload FROM threads WHERE demo=0 AND json_extract(payload,'$.status')='review' AND json_extract(payload,'$.draft')!='' LIMIT 1").all<{payload:string}>()).results;
  let sent=0;
  for(const r of pendingReviews){
   const revT=JSON.parse(r.payload) as Thread;
   const acc=accounts.find(a=>a.id===(revT.accountId||'legacy-instagram'));
   const win=channelAutomationWindow(s,revT.channel,acc,Date.now());
   if(!win.active)continue;
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
 await throttledCleanup();await recoverStaleJobs();const s=await settings();
 const accounts=await instagramAccounts();
 const now=Date.now();
 const candidateJobs=(await db().prepare(`SELECT j.* FROM jobs j WHERE j.status='pending' AND j.attempts<5 AND j.created<=?
 AND NOT EXISTS (SELECT 1 FROM jobs p WHERE p.thread_id=j.thread_id AND p.status='processing')
 ORDER BY j.created ASC LIMIT 25`).bind(now).all<Job>()).results;
 if(!candidateJobs || candidateJobs.length===0) return {processed:0};

 let job: Job | null = null;
 let parsedJob: any = null;
 let channel: Channel = 'comment';
 let account: any = null;

 for(const candidate of candidateJobs){
  let p:any=null;
  try{p=JSON.parse(candidate.payload);}catch{}
  const ch:Channel=p?.channel==='comment'?'comment':'dm';
  const acc=accounts.find(a=>a.id===(p?.accountId||'legacy-instagram'));
  const win=channelAutomationWindow(s,ch,acc,now);

  if(!win.active){
   const postponeUntil=(win.nextChangeAt && win.nextChangeAt > now)?win.nextChangeAt:(now + 3600000);
   await db().prepare("UPDATE jobs SET created=? WHERE id=? AND status='pending'").bind(postponeUntil,candidate.id).run();
   continue;
  }
  job=candidate;
  parsedJob=p;
  channel=ch;
  account=acc;
  break;
 }

 if(!job) return {processed:0,sleeping:true};

 // Wait window calculation (channel-wise and account-wise):
 const waitSeconds = channel === 'dm'
  ? (account?.dmReplyDelaySeconds ?? account?.replyDelaySeconds ?? s.dmReplyDelaySeconds ?? s.replyDelaySeconds ?? 30)
  : (account?.commentReplyDelaySeconds ?? account?.replyDelaySeconds ?? s.commentReplyDelaySeconds ?? 5);
 const waitMs = Math.max(0, waitSeconds) * 1000;

 if(waitMs>0){
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
    try{
     await syncSingleReelIfNew(t.mediaId, t.accountId);
     dynamicMedia = await fetchInstagramMediaDetails(t.mediaId, t.accountId);
    }catch{}
   }
   if(dynamicMedia?.media_product_type) t.mediaType = dynamicMedia.media_product_type.toLowerCase();

   // 1. Reel upload age cutoff (default 7 days, 0 = unlimited):
   const maxAgeDays = s.commentMaxAgeDays ?? 7;
   const isFollowGateActive = !!s.followGateEnabled;
   if(maxAgeDays > 0 && !isFollowGateActive){
    const publishedTime = dynamicMedia?.timestamp
     ? new Date(dynamicMedia.timestamp).getTime()
     : (s.postCatalog?.find(p=>p.id===t.mediaId)?.dateAdded);
    if(publishedTime && !isNaN(publishedTime)){
     const ageDays = (Date.now() - publishedTime) / 86400000;
     if(ageDays > maxAgeDays){
      await finish(ids,'done');
      await audit('Comment skipped (Reel age cutoff)',`Reel ${t.mediaId} was uploaded ${Math.round(ageDays)} days ago (exceeds ${maxAgeDays} day limit)`);
      return {processed:group.length,skippedOldReel:true};
     }
    }
   }

   // 2. Selective Reel comments toggle (check if comments are enabled on this reel):
   if(t.mediaId){
    const reelEntry=s.postCatalog?.find(p=>p.id===t.mediaId);
    if(reelEntry && reelEntry.commentsEnabled===false){
     await finish(ids,'done');
     await audit('Comment skipped (Reel comments disabled)',`Comments disabled for Reel: "${reelEntry.title||t.mediaId}"`);
     return {processed:group.length,reelCommentsDisabled:true};
    }
   }

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

  // 1. PURE CODE AUTOMATION (FOLLOW GATE & VIEW-ONCE SNAP)
  // Runs independently of AI or general DM automation toggles
  if (s.followGateEnabled && (t.channel === 'dm' || t.channel === 'comment')) {
    const lower = input.toLowerCase().trim();
    const kw = (s.followGateKeyword || '').toLowerCase().trim();
    const isTargetReel = Boolean(t.mediaId && s.followGateReelIds && s.followGateReelIds.length > 0 && s.followGateReelIds.includes(t.mediaId));
    const isKeywordMatch = kw ? (lower === kw || lower.includes(kw)) : false;
    const isExplicitSnapRequest = /\b(snap|view once|once view|pic bhejo|photo bhejo|send pic|send photo|link bhejo|link send|dm link|exclusive pic|photoshoot pic|unlock|unlocked|claim|done|followed)\b/i.test(lower);
    const shouldTriggerSnap = isKeywordMatch || isExplicitSnapRequest || (isTargetReel && !kw);

    if (shouldTriggerSnap && account?.enabled && account?.verified && !excluded.includes(String(e.recipientId)) && !excluded.includes(account.id+':'+e.recipientId) && t.status!=='sending' && t.status!=='uncertain' && !t.takeover) {
      if (t.channel === 'dm' && Date.now() - t.lastInbound >= 86400000) {
        throw new AppError('The 24-hour DM reply window has closed.', 422);
      }
      const followerStatus = await checkUserFollowsBusiness(t.recipientId || '', t.accountId);
      const targetUsername = account?.username || 'ninakurain';
      let draft = '';
      if (!followerStatus.isFollowing) {
        const reminderTemplate = s.followGateUnfollowedMsg || 'Hey! You need to follow @{username} first to unlock this exclusive photoshoot snap 🥺 Follow now and reply "DONE" to claim it 🤍';
        draft = reminderTemplate.replace(/\{username\}/g, targetUsername);
      } else {
        const matchedReel = s.postCatalog?.find(p => p.id === t.mediaId);
        let chosenPhotoUrl = matchedReel?.snapUrl?.trim();
        if (!chosenPhotoUrl) {
          const photos = (s.followGatePhotos && s.followGatePhotos.length > 0) ? s.followGatePhotos : [{ id: '1', url: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=1000&q=80', label: 'Golden Hour Park Photoshoot' }];
          const chosenPhoto = photos[Math.floor(Math.random() * photos.length)];
          chosenPhotoUrl = chosenPhoto.url;
        }
        const snapToken = await createSnapToken({
          imageUrl: chosenPhotoUrl,
          recipientId: t.recipientId || '',
          username: t.username || 'follower',
          accountId: t.accountId || 'legacy-instagram',
          durationSeconds: s.followGateDurationSeconds || 7
        });
        const successTemplate = s.followGateSuccessMsg || 'Yay! Here is your exclusive photoshoot snap (opens only once 😉):';
        draft = `${successTemplate}\nhttps://automation.ninakurainservices.in/snap/${snapToken}\n\n⚠️ Tap to view under card. Anti-screenshot protected & self-destructs after ${s.followGateDurationSeconds || 7}s!`;
      }

      t.draft = draft;
      if (s.approval) {
        t.status = 'review';
        await saveThread(t);
        t.version = (t.version || 0) + 1;
      } else {
        t.status = 'open';
        await saveThread(t);
        t.version = (t.version || 0) + 1;
        await sendReply(t, draft, undefined, ids);
      }
      await finish(ids, 'done');
      await audit('Follow-gate snap delivered', `Delivered automated snap link to ${t.username || t.recipientId} (Rule-based, AI independent)`);
      return { processed: group.length, sent: true };
    }
  }

  // 2. AI CONVERSATIONAL REPLIES (Subject to channel & AI toggles)
  const accountDm=account?account.dmEnabled!==false:true;
  const accountComments=account?account.commentsEnabled!==false:true;
  const accountAi=account?account.aiEnabled!==false:true;
  const channelAllowed=t.channel==='dm'?(s.dm&&accountDm):(s.comments&&accountComments);
  const win=channelAutomationWindow(s,t.channel,account,now);
  const eligibleBase=account?.enabled&&accountAi&&account.verified&&!excluded.includes(String(e.recipientId))&&!excluded.includes(account.id+':'+e.recipientId)&&t.status!=='sending'&&t.status!=='uncertain'&&!t.takeover&&t.ai&&channelAllowed&&t.lastInbound<=e.at;
  if(eligibleBase&&!win.active){
   const nextActive=win.nextChangeAt||(Date.now()+60000);
   await postpone(group,nextActive,true);
   return {processed:group.length,deferred:true};
  }
  const eligible=win.active&&eligibleBase;
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
    let draft = '';
    let history=t.messages.filter(m=>!(m.role==='incoming'&&ids.includes(m.eventId||'')));
      if(t.channel==='comment'&&history.length<=1){
        try{
          if(t.username && t.username !== 'Instagram user' && !t.username.startsWith('ig_')){
            const past=await db().prepare("SELECT payload FROM threads WHERE id!=? AND json_extract(payload,'$.channel')='comment' AND json_extract(payload,'$.username')=? ORDER BY updated DESC LIMIT 4").bind(t.id,t.username).all<{payload:string}>();
            const pastMessages: Message[]=[];
            for(const row of (past.results||[]).reverse()){
              try{
                const pt=JSON.parse(row.payload);
                if(Array.isArray(pt.messages)){
                  for(const pm of pt.messages){
                    pastMessages.push(pm);
                  }
                }
              }catch{}
            }
            if(pastMessages.length>0){
              history=[...pastMessages.slice(-6),...history];
            }
          }
        }catch{}
      }
      const isUncensoredTone=t.channel==='dm'&&((account?.tone||s.tone)==='erotic'||(account?.tone||s.tone)==='spicy');
      draft=await generateReply(input,t.channel,history,t.accountId,undefined,{uncensored:isUncensoredTone,postContext:t.postContext,mediaType:t.mediaType,recipientUsername:t.username});
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
  
  // Lightweight background check for newly published reels (stops immediately at existing reels)
  const lastReelScan = await readState<number>('last_reel_sync_at', 0);
  if (now - lastReelScan > 300000) {
    await writeState('last_reel_sync_at', now);
    syncInstagramReels(undefined, true).catch(() => {});
  }
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
