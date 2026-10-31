// ─── WhatsApp Automation — Incoming Message Handler ───────────────────────
import {
  initDatabase,
  db,
  readState,
  writeState,
  getOrCreateCustomer,
  saveCustomerProfile,
} from './server';
import { processNextJob } from './queue';

export async function handleIncomingMessage(event: any) {
  try {
    await initDatabase();

    const jobId = `wa:${event.id}`;
    const threadId = event.isGroup ? `wa:group:${event.groupId}` : `wa:${event.senderPhone}`;

    const jobPayload = {
      id: jobId,
      threadId,
      channel: event.isGroup ? 'group' : 'personal',
      senderPhone: event.senderPhone,
      senderName: event.senderName,
      text: event.text,
      mediaType: event.mediaType,
      at: event.timestamp,
      jid: event.jid,
    };

    console.log(`[WA] Enqueueing incoming job ${jobId} from ${event.senderName} (${event.senderPhone})`);

    await db()
      .prepare(
        "INSERT OR IGNORE INTO wa_jobs (id,thread_id,payload,status,attempts,created) VALUES (?,?,?,'pending',0,?)"
      )
      .bind(jobId, threadId, JSON.stringify(jobPayload), Date.now())
      .run();

    // Update customer profile
    const customer = await getOrCreateCustomer(event.senderPhone, event.senderName);
    customer.totalMessages++;
    customer.lastContact = Date.now();
    await saveCustomerProfile(customer);

    // Update connection last event
    const c = await readState<any>('wa_connection', {});
    c.lastEvent = Date.now();
    await writeState('wa_connection', c);

    // Auto-process queue immediately
    let p = 0;
    while (p < 5) {
      const res = await processNextJob();
      if (!res.processed) break;
      p += res.processed;
    }
  } catch (e) {
    console.error('[WA] handleIncomingMessage error:', e);
  }
}

