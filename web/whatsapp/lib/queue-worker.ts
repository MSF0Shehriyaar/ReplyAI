import {db,initDatabase} from './server';
import {processNextJob} from './queue';
import {purgeExpiredCatalogCheckouts} from './catalog-checkout';

type Worker={timer:ReturnType<typeof setInterval>;busy:boolean;cursor:string;startedAt:number;lastStartedAt:number|null;lastCompletedAt:number|null;lastFailureAt:number|null};
const runtime=globalThis as typeof globalThis&{__waQueueWorker?:Worker};
export function startQueueWorker() {
  if(runtime.__waQueueWorker)return;
  const worker:Worker={timer:setInterval(()=>void tick(),5000),busy:false,cursor:'',startedAt:Date.now(),lastStartedAt:null,lastCompletedAt:null,lastFailureAt:null};
  runtime.__waQueueWorker=worker;
  worker.timer.unref();
  async function tick() {
    if(worker.busy)return;worker.busy=true;worker.lastStartedAt=Date.now();
    try {
      await initDatabase();
      await purgeExpiredCatalogCheckouts();
      // Round-robin businesses; thread leases protect overlapping instances.
      const query="SELECT DISTINCT j.tenant_id FROM wa_jobs j JOIN business_tenants b ON b.id=j.tenant_id LEFT JOIN queue_leases l ON l.tenant_id=j.tenant_id AND l.thread_id=j.thread_id WHERE b.status='active' AND j.status IN ('pending','processing') AND j.created<=? AND (l.expires_at IS NULL OR l.expires_at<?) AND j.tenant_id>? ORDER BY j.tenant_id LIMIT 1";
      const now=Date.now();
      let next=await db().prepare(query).bind(now,now,worker.cursor).first<{tenant_id:string}>();
      if(!next){worker.cursor='';next=await db().prepare(query).bind(now,now,'').first<{tenant_id:string}>();}
      if(next){worker.cursor=next.tenant_id;await processNextJob(next.tenant_id);}
      worker.lastCompletedAt=Date.now();
    }catch{worker.lastFailureAt=Date.now();console.error('[WA queue] Background processing unavailable; saved jobs will be checked again.');}
    finally{worker.busy=false;}
  }
  return worker;
}

// Process-local heartbeat; this does not claim other service instances are healthy.
export function queueWorkerStatus(){
  const worker=runtime.__waQueueWorker;
  if(!worker)return {state:'not_started',startedAt:null,lastStartedAt:null,lastCompletedAt:null,lastFailureAt:null};
  const {startedAt,lastStartedAt,lastCompletedAt,lastFailureAt}=worker;
  const state=worker.busy?'processing':lastFailureAt&&lastFailureAt>(lastCompletedAt||0)?'retrying':lastCompletedAt?'running':'starting';
  return {state,startedAt,lastStartedAt,lastCompletedAt,lastFailureAt};
}
