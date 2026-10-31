// ─── WhatsApp Automation — Incoming Message Handler ───────────────────────
import {
  initDatabase,
  db,
  readState,
  writeState,
  getOrCreateCustomer,
  saveCustomerProfile,
} from './server';
import { processThreadJobs } from './queue';

// Per-thread debounce timer to collect consecutive messages into a single bulk reply
const threadDebounceTimers = new Map<string, NodeJS.Timeout>();

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

    console.log(`[WA] Enqueueing incoming job ${jobId} from ${event.senderName} (${event.senderPhone}): "${event.text?.slice(0, 50)}"`);

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

    // Debounce processing for this thread (2000ms pause):
    // If the customer sends multiple rapid messages (e.g. "The most basic one" then "Please"),
    // wait for them to finish typing so all thoughts are answered in ONE single cohesive bulk response!
    const existingTimer = threadDebounceTimers.get(threadId);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    const timer = setTimeout(async () => {
      threadDebounceTimers.delete(threadId);
      try {
        console.log(`[WA] ⏱️ Debounce finished for ${threadId}. Processing all pending jobs in bulk...`);
        await processThreadJobs(threadId);
      } catch (err) {
        console.error(`[WA] Error processing bulk jobs for thread ${threadId}:`, err);
      }
    }, 2000);

    threadDebounceTimers.set(threadId, timer);
  } catch (e) {
    console.error('[WA] handleIncomingMessage error:', e);
  }
}

