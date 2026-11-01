import { db, assertActiveTenant } from './server';

export async function claimThreadJobs(tenantId: string,threadId: string,maxRetries: number) {
  await assertActiveTenant(tenantId);
  const token=crypto.randomUUID(),now=Date.now();
  return db().transaction(async tx=>{
    const lease=await tx.prepare(`INSERT INTO queue_leases(tenant_id,thread_id,token,expires_at) VALUES (?,?,?,?)
      ON CONFLICT(tenant_id,thread_id) DO UPDATE SET token=excluded.token,expires_at=excluded.expires_at WHERE expires_at<?`)
      .bind(tenantId,threadId,token,now+600000,now).run();
    if(!lease.meta.changes) return {token,jobs:[]};
    await tx.prepare("UPDATE wa_jobs SET status='pending' WHERE tenant_id=? AND thread_id=? AND status='processing'").bind(tenantId,threadId).run();
    await tx.prepare("UPDATE wa_jobs SET status='failed' WHERE tenant_id=? AND thread_id=? AND status='pending' AND attempts>=?").bind(tenantId,threadId,maxRetries).run();
    const jobs=(await tx.prepare("SELECT * FROM wa_jobs WHERE tenant_id=? AND thread_id=? AND status='pending' AND attempts<? AND created<=? ORDER BY created LIMIT 100")
      .bind(tenantId,threadId,maxRetries,now).all<any>()).results;
    for(const job of jobs) await tx.prepare("UPDATE wa_jobs SET status='processing',attempts=attempts+1 WHERE tenant_id=? AND id=?").bind(tenantId,job.id).run();
    return {token,jobs};
  });
}
export async function releaseThread(tenantId:string,threadId:string,token:string) {
  await db().prepare('DELETE FROM queue_leases WHERE tenant_id=? AND thread_id=? AND token=?').bind(tenantId,threadId,token).run();
}

// Deduplication and enqueue commit together: a crash cannot mark an event received without saving its job.
export async function enqueueEvent(tenantId:string,event:{id:string;threadId:string;[key:string]:unknown}) {
  await assertActiveTenant(tenantId);
  return db().transaction(async tx=>{
    const inserted=await tx.prepare('INSERT OR IGNORE INTO webhook_idempotency(id,tenant_id,received_at) VALUES (?,?,?)').bind(event.id,tenantId,Date.now()).run();
    if(!inserted.meta.changes) return false;
    await tx.prepare("INSERT INTO wa_jobs(id,thread_id,payload,status,attempts,created,tenant_id) VALUES (?,?,?,'pending',0,?,?)")
      .bind(event.id,event.threadId,JSON.stringify({...event,tenantId}),Date.now(),tenantId).run();
    await tx.prepare('INSERT INTO tenant_usage(tenant_id,received,updated_at) VALUES (?,1,?) ON CONFLICT(tenant_id) DO UPDATE SET received=received+1,updated_at=excluded.updated_at').bind(tenantId,Date.now()).run();
    await tx.prepare('INSERT INTO tenant_daily_usage(tenant_id,day,received) VALUES (?,?,1) ON CONFLICT(tenant_id,day) DO UPDATE SET received=received+1').bind(tenantId,new Date().toISOString().slice(0,10)).run();
    return true;
  });
}
