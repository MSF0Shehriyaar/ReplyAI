import { enqueueEvent } from './queue-ownership';
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

    const tenantId = event.tenantId || 'biz_titan_watches';

    // Verify tenant status: if suspended, drop automated processing
    const tenantRow = await db()
      .prepare('SELECT status FROM business_tenants WHERE id = ?')
      .bind(tenantId)
      .first<{ status: string }>();

    if (tenantRow && tenantRow.status === 'suspended') {
      console.warn(`[WA] Incoming message dropped: business tenant ${tenantId} is suspended.`);
      return;
    }

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
      tenantId,
    };

    console.log(`[WA] Enqueueing incoming job ${jobId} for [${tenantId}] from ${event.senderName} (${event.senderPhone}): "${event.text?.slice(0, 50)}"`);

    if (!await enqueueEvent(tenantId,jobPayload)) return;

    // Update connection last event
    const c = await readState<any>('wa_connection:'+tenantId, {});
    c.lastEvent = Date.now();
    await writeState('wa_connection:'+tenantId, c);

    // Debounce processing for this thread (2000ms pause)
    const debounceKey = `${tenantId}:${threadId}`;
    const existingTimer = threadDebounceTimers.get(debounceKey);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    const timer = setTimeout(async () => {
      threadDebounceTimers.delete(debounceKey);
      try {
        console.log(`[WA] ⏱️ Debounce finished for ${threadId} [${tenantId}]. Processing pending jobs...`);
        await processThreadJobs(threadId, tenantId);
      } catch (err) {
        console.error(`[WA] Error processing bulk jobs for thread ${threadId}:`, err);
      }
    }, 2000);

    threadDebounceTimers.set(debounceKey, timer);
  } catch (e) {
    console.error('[WA] handleIncomingMessage error:', e);
  }
}

