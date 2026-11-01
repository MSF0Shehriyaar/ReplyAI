// ─── WhatsApp Automation — Job Queue Processor ──────────────────────────
// Processes incoming WhatsApp messages: generates AI replies, handles
// escalation rules, auto-replies, and customer support workflows.

import {
  db,
  settings,
  getThread,
  saveThread,
  generateReply,
  sendReply,
  audit,
  AppError,
  getOrCreateCustomer,
  saveCustomerProfile,
} from './server';
import { analyzeSentiment, detectIntent, autoTag, isBusinessHours, reviewFlag } from './reply-style';
import type { WAThread, WAMessage, WASettings, AutoReplyRule, CustomerProfile, WAOrder } from './model';

type Job = {
  id: string;
  thread_id: string;
  payload: string;
  attempts: number;
  created: number;
  tenant_id?: string;
};

// ── Auto-Reply Rule Matching ────────────────────────────────────────────

function matchAutoReplyRule(
  rules: AutoReplyRule[],
  text: string,
  channel: 'personal' | 'group',
  isFirstMessage: boolean,
  withinHours: boolean
): AutoReplyRule | null {
  const sorted = rules.filter((r) => r.enabled).sort((a, b) => b.priority - a.priority);

  for (const rule of sorted) {
    if (rule.channel !== 'all' && rule.channel !== channel) continue;
    if (rule.usesToday >= rule.maxUsesPerDay) continue;

    switch (rule.triggerType) {
      case 'first_message':
        if (isFirstMessage) return rule;
        break;
      case 'time':
        if (rule.triggerValue === 'outside_hours' && !withinHours) return rule;
        break;
      case 'keyword': {
        const keywords = rule.triggerValue.split(',').map((k) => k.trim().toLowerCase());
        if (keywords.some((k) => text.toLowerCase().includes(k))) return rule;
        break;
      }
      case 'regex':
        try {
          if (new RegExp(rule.triggerValue, 'i').test(text)) return rule;
        } catch {}
        break;
      case 'intent': {
        const intent = detectIntent(text);
        if (intent === rule.triggerValue) return rule;
        break;
      }
    }
  }
  return null;
}

// ── Escalation Check ────────────────────────────────────────────────────

async function checkEscalation(thread: WAThread, s: WASettings): Promise<boolean> {
  for (const rule of s.escalationRules) {
    if (!rule.enabled) continue;

    switch (rule.condition) {
      case 'sentiment_negative':
        if (thread.sentiment === 'angry' || thread.sentiment === 'negative') {
          thread.status = 'escalated';
          thread.priority = rule.priority;
          await audit('Escalation', `${rule.name}: ${thread.name} — ${thread.sentiment} sentiment`);
          return true;
        }
        break;
      case 'keyword': {
        const lastMsg = thread.messages.filter((m) => m.role === 'incoming').at(-1);
        if (lastMsg && new RegExp(rule.conditionValue, 'i').test(lastMsg.text)) {
          thread.status = 'escalated';
          thread.priority = rule.priority;
          await audit('Escalation', `${rule.name}: keyword match in ${thread.name}`);
          return true;
        }
        break;
      }
      case 'wait_time': {
        const waitMinutes = (Date.now() - thread.lastInbound) / 60000;
        if (waitMinutes > parseInt(rule.conditionValue || '30')) {
          thread.status = 'escalated';
          thread.priority = rule.priority;
          await audit('Escalation', `${rule.name}: ${thread.name} waited ${Math.round(waitMinutes)}min`);
          return true;
        }
        break;
      }
      case 'vip_customer':
        if (thread.customerProfile?.vip) {
          thread.priority = rule.priority;
          await audit('VIP Priority', `${rule.name}: VIP customer ${thread.name}`);
          return false; // Don't escalate, just bump priority
        }
        break;
    }
  }
  return false;
}

// ── Queue Status ────────────────────────────────────────────────────────

export async function queueStatus(tenantId?: string) {
  const d = db();
  let queryResult;
  if (tenantId) {
    queryResult = await d
      .prepare('SELECT status, COUNT(*) count FROM wa_jobs WHERE tenant_id = ? GROUP BY status')
      .bind(tenantId)
      .all();
  } else {
    queryResult = await d
      .prepare('SELECT status, COUNT(*) count FROM wa_jobs GROUP BY status')
      .all();
  }
  const rows = (queryResult?.results || []) as { status: string; count: number }[];
  const counts = Object.fromEntries(rows.map((r) => [r.status, Number(r.count)]));
  return {
    pending: counts.pending || 0,
    processing: counts.processing || 0,
    failed: counts.failed || 0,
    done: counts.done || 0,
  };
}

// ── Process Jobs (Batched per Thread for Clean Bulk Replies) ─────────────

export async function processThreadJobs(threadId: string, tenantId: string = 'biz_titan_watches'): Promise<{ processed: number }> {
  // Guard: Suspended business tenants cannot process background jobs
  const tenantRow = await db()
    .prepare('SELECT status FROM business_tenants WHERE id = ?')
    .bind(tenantId)
    .first<{ status: string }>();

  if (tenantRow && tenantRow.status === 'suspended') {
    console.warn(`[WA Queue] Aborting jobs: business tenant ${tenantId} is suspended.`);
    await db()
      .prepare("UPDATE wa_jobs SET status='failed' WHERE thread_id=? AND tenant_id=? AND status='pending'")
      .bind(threadId, tenantId)
      .run();
    return { processed: 0 };
  }

  const s = await settings(tenantId);

  const queryResult = await db()
    .prepare(
      `SELECT * FROM wa_jobs WHERE thread_id=? AND tenant_id=? AND status='pending' AND attempts<? AND created<=?
       ORDER BY created ASC`
    )
    .bind(threadId, tenantId, s.maxRetries ?? 3, Date.now())
    .all();
  const jobs = (queryResult?.results || []) as Job[];

  if (!jobs.length) return { processed: 0 };

  // Mark all pending jobs for this thread as processing immediately
  for (const job of jobs) {
    await db()
      .prepare("UPDATE wa_jobs SET status='processing',attempts=attempts+1 WHERE id=?")
      .bind(job.id)
      .run();
  }

  try {
    let thread = await getThread(threadId, tenantId);
    const isFirstMessage = !thread;
    const firstEvent = JSON.parse(jobs[0].payload);

    if (!thread) {
      const customer = await getOrCreateCustomer(firstEvent.senderPhone, firstEvent.senderName, tenantId);
      thread = {
        id: threadId,
        name: firstEvent.senderName || firstEvent.senderPhone,
        phone: firstEvent.senderPhone,
        channel: firstEvent.channel || 'personal',
        status: 'open',
        takeover: false,
        ai: true,
        messages: [],
        draft: '',
        lastInbound: Date.now(),
        recipientId: firstEvent.jid || firstEvent.senderPhone,
        updated: Date.now(),
        version: 0,
        priority: customer.vip ? 'high' : 'normal',
        tags: [],
        customerProfile: customer,
      };
    }

    // Accumulate all incoming messages from this batch into the thread
    const incomingTexts: string[] = [];
    for (const job of jobs) {
      const event = JSON.parse(job.payload);
      if (event.jid) thread.recipientId = event.jid;

      const newMessage: WAMessage = {
        id: event.id || crypto.randomUUID(),
        role: 'incoming',
        text: event.text || '',
        mediaType: event.mediaType,
        at: event.at || Date.now(),
        senderName: event.senderName,
        senderPhone: event.senderPhone,
      };
      thread.messages.push(newMessage);
      thread.lastInbound = newMessage.at;
      if (event.text?.trim()) incomingTexts.push(event.text.trim());
    }

    thread.status = 'open';
    thread.updated = Date.now();

    const compositeText = incomingTexts.join('\n');

    // Extract real phone number and name from composite message text
    if (compositeText) {
      const phoneMatch = compositeText.match(/\b([6-9][0-9]{9})\b/);
      if (phoneMatch) {
        thread.phone = `+91 ${phoneMatch[1]}`;
      }

      const lines = compositeText.split('\n').map((l: string) => l.trim()).filter(Boolean);
      if (lines.length >= 2 && phoneMatch) {
        const nameCandidate = lines.find((l: string) => !/\d/.test(l) && !/cash|upi|cod|card|net|bank|pay/i.test(l) && l.length >= 2 && l.length <= 30);
        if (nameCandidate) {
          thread.name = nameCandidate;
        }
      } else {
        const nameMatch = compositeText.match(/(?:my name is|i am|this is|naam)\s+([A-Za-z\s]{2,25})/i);
        if (nameMatch && nameMatch[1]) {
          thread.name = nameMatch[1].trim();
        }
      }
    }

    // Update customer profile
    const customer = await getOrCreateCustomer(thread.phone, thread.name, tenantId);
    customer.name = thread.name;
    customer.lastContact = Date.now();
    customer.totalMessages += jobs.length;
    thread.customerProfile = customer;

    // Auto-tag
    if (s.autoTagEnabled && compositeText) {
      const newTags = autoTag(compositeText);
      for (const tag of newTags) {
        if (!thread.tags.includes(tag)) thread.tags.push(tag);
      }
    }

    // Address & Delivery Location Detection & Geocoding
    if (compositeText) {
      try {
        const { parseAndMapAddress } = await import('./location-service');
        const parsedLoc = await parseAndMapAddress(compositeText, thread.deliveryLocation);
        if (parsedLoc) {
          thread.deliveryLocation = parsedLoc;
          customer.deliveryLocation = parsedLoc;
          if (parsedLoc.raw) customer.address = parsedLoc.raw;
          if (parsedLoc.city) customer.city = parsedLoc.city;

          if (parsedLoc.pincodeMissing) {
            if (!thread.tags.includes('missing_pincode')) thread.tags.push('missing_pincode');
            thread.tags = thread.tags.filter((t) => t !== 'address_verified');
          } else {
            if (!thread.tags.includes('address_verified')) thread.tags.push('address_verified');
            thread.tags = thread.tags.filter((t) => t !== 'missing_pincode');
          }
        }
      } catch (locErr) {
        console.error('[WA] Address parsing error:', locErr);
      }
    }

    // Check if order is confirmed from composite incoming messages
    await syncOrderIfConfirmed(thread, compositeText, null, s, customer, tenantId);

    // Sentiment analysis
    if (s.sentimentAnalysisEnabled && compositeText) {
      thread.sentiment = analyzeSentiment(compositeText);
    }

    // Check for sensitive content
    if (compositeText) {
      const flag = reviewFlag(compositeText);
      if (flag) {
        thread.flagged = flag;
        thread.status = 'escalated';
        thread.priority = 'urgent';
        await saveThread(thread, tenantId);
        await saveCustomerProfile(customer, tenantId);
        for (const j of jobs) {
          await db().prepare("UPDATE wa_jobs SET status='done' WHERE id=?").bind(j.id).run();
        }
        await audit('Flagged', `${flag} — ${thread.name}`, tenantId);
        return { processed: jobs.length };
      }
    }

    // Check escalation rules
    const escalated = await checkEscalation(thread, s);
    if (escalated) {
      await saveThread(thread, tenantId);
      await saveCustomerProfile(customer, tenantId);
      for (const j of jobs) {
        await db().prepare("UPDATE wa_jobs SET status='done' WHERE id=?").bind(j.id).run();
      }
      return { processed: jobs.length };
    }

    // Check auto-reply rules
    const withinHours = isBusinessHours(s);
    const autoReply = matchAutoReplyRule(
      s.autoReplyRules,
      compositeText,
      thread.channel,
      isFirstMessage,
      withinHours
    );

    if (autoReply) {
      const replyText =
        autoReply.response ||
        (autoReply.triggerType === 'first_message' ? s.welcomeMessage : '') ||
        (autoReply.triggerType === 'time' ? s.awayMessage : '');

      if (replyText && !s.approval) {
        await sendReply(thread, replyText, tenantId);
        for (const j of jobs) {
          await db().prepare("UPDATE wa_jobs SET status='done' WHERE id=?").bind(j.id).run();
        }
        return { processed: jobs.length };
      } else if (replyText) {
        thread.draft = replyText;
        thread.status = 'review';
        await saveThread(thread, tenantId);
        await saveCustomerProfile(customer, tenantId);
        for (const j of jobs) {
          await db().prepare("UPDATE wa_jobs SET status='done' WHERE id=?").bind(j.id).run();
        }
        return { processed: jobs.length };
      }
    }

    // Skip AI if takeover mode
    if (thread.takeover || !thread.ai || !s.enabled) {
      await saveThread(thread, tenantId);
      await saveCustomerProfile(customer, tenantId);
      for (const j of jobs) {
        await db().prepare("UPDATE wa_jobs SET status='done' WHERE id=?").bind(j.id).run();
      }
      return { processed: jobs.length };
    }

    // Generate SINGLE cohesive AI reply for the combined incoming messages
    console.log(`[WA] 🤖 Generating bulk AI reply for ${thread.name} (${thread.phone}) [${tenantId}]...`);
    const startTime = Date.now();
    const draft = await generateReply(thread, tenantId);
    thread.responseTimeMs = Date.now() - startTime;
    console.log(`[WA] 💡 AI response generated in ${thread.responseTimeMs}ms: "${draft.slice(0, 60)}..."`);

    if (draft) {
      if (s.approval) {
        console.log(`[WA] 📝 Approval mode is ON: saved as review draft for ${thread.name}`);
        thread.draft = draft;
        thread.status = 'review';
        await saveThread(thread, tenantId);
      } else {
        const delay = thread.channel === 'group' ? s.groupReplyDelaySeconds : s.personalReplyDelaySeconds;
        if (delay > 0) {
          console.log(`[WA] ⏳ Waiting ${delay}s delay before sending...`);
          await new Promise((r) => setTimeout(r, delay * 1000));
        }
        console.log(`[WA] 🚀 Auto-sending single consolidated reply to ${thread.name}...`);
        await sendReply(thread, draft, tenantId);
      }

      // Auto-sync order if confirmed in reply or draft
      await syncOrderIfConfirmed(thread, compositeText, draft, s, customer, tenantId);
    } else {
      await saveThread(thread, tenantId);
    }

    await saveCustomerProfile(customer, tenantId);
    for (const j of jobs) {
      await db().prepare("UPDATE wa_jobs SET status='done' WHERE id=?").bind(j.id).run();
    }
    return { processed: jobs.length };
  } catch (err) {
    console.error(`[WA] Error in processThreadJobs for ${threadId}:`, err);
    for (const j of jobs) {
      await db().prepare("UPDATE wa_jobs SET status='pending' WHERE id=?").bind(j.id).run();
    }
    return { processed: 0 };
  }
}

export async function processNextJob(tenantId?: string): Promise<{ processed: number }> {
  const d = db();
  const s = await settings(tenantId || 'biz_titan_watches');

  // Recover stale processing jobs
  const cutoff = Date.now() - 120000;
  await d
    .prepare(
      "UPDATE wa_jobs SET status='pending',attempts=0,created=? WHERE status='processing' AND created<?"
    )
    .bind(Date.now(), cutoff)
    .run();

  let queryResult;
  if (tenantId) {
    queryResult = await d
      .prepare(
        `SELECT DISTINCT thread_id, tenant_id FROM wa_jobs WHERE status='pending' AND attempts<? AND created<=? AND tenant_id=? LIMIT 5`
      )
      .bind(s.maxRetries ?? 3, Date.now(), tenantId)
      .all();
  } else {
    queryResult = await d
      .prepare(
        `SELECT DISTINCT thread_id, tenant_id FROM wa_jobs WHERE status='pending' AND attempts<? AND created<=? LIMIT 5`
      )
      .bind(s.maxRetries ?? 3, Date.now())
      .all();
  }
  const threadRows = (queryResult?.results || []) as { thread_id: string; tenant_id?: string }[];

  if (!threadRows.length) return { processed: 0 };

  let processed = 0;
  for (const row of threadRows) {
    const res = await processThreadJobs(row.thread_id, row.tenant_id || tenantId || 'biz_titan_watches');
    processed += res.processed;
  }

  return { processed };
}

// ── Order Auto-Sync Helper ──────────────────────────────────────────────
async function syncOrderIfConfirmed(
  thread: WAThread,
  eventText: string,
  draft: string | null,
  s: WASettings,
  customer: CustomerProfile,
  tenantId: string = 'biz_titan_watches'
) {
  try {
    const loc = thread.deliveryLocation;
    const isReadyForDispatch = !!(loc && loc.pincode && !loc.pincodeMissing);

    const fullChatText = (
      thread.messages.map((m) => m.text).join(' ') +
      ' ' +
      (eventText || '') +
      ' ' +
      (draft || '')
    ).toLowerCase();

    // 1. Take confirmation feedback from AI
    const { queryAIConfirmationFeedback } = await import('./server');
    let aiFeedback: { isConfirmed: boolean; productName?: string; price?: number; paymentMode?: 'COD' | 'UPI'; reason?: string } = { isConfirmed: false };

    if (eventText && eventText.trim()) {
      console.log(`[WA] 🧠 Requesting AI confirmation feedback for customer message: "${eventText}"`);
      aiFeedback = await queryAIConfirmationFeedback(thread, eventText);
      console.log(`[WA] 🤖 AI Confirmation Feedback result: isConfirmed=${aiFeedback.isConfirmed} (${aiFeedback.reason || 'no reason'})`);
    }

    // 2. Check if AI generated response explicitly confirms the order
    const isAIDraftConfirming =
      !!draft &&
      (/\b(order.*(is|now)?.*confirmed|order has been confirmed|order is confirmed|booking confirmed|express delivery scheduled|order now confirmed)\b/i.test(
        draft
      ) ||
        /\byour order for .* is now confirmed\b/i.test(draft));

    // 3. Fallback regex confirmation
    const isCustomerRegexConfirming =
      /^(yes|yep|yeah|sure|confirm|proceed|ok|okay|haan|ha|bilkul|kar do|place order|done|book it)\b/i.test(
        (eventText || '').trim()
      ) ||
      /\b(confirm order|yes confirm|book kar|place order|haan kar do|proceed with cod|proceed with order|confirm it|book this|order confirm)\b/i.test(
        eventText || ''
      );

    // AI feedback is primary; AI draft confirmation and regex serve as safety net
    const isConfirmed = isAIDraftConfirming || ((aiFeedback.isConfirmed || isCustomerRegexConfirming) && (loc?.raw || (eventText && /(?:#|cross|main|street|road|layout|nagar|colony|mysore|pincode|\b\d{6}\b)/i.test(eventText))));

    if (!isConfirmed) {
      console.log(`[WA] ℹ️ Customer message not recognized as confirmation by AI or rules.`);
      return;
    }

    console.log(`[WA] 🎯 Order confirmation APPROVED! [AI Feedback: ${aiFeedback.isConfirmed}, Draft Confirmed: ${isAIDraftConfirming}, Regex: ${isCustomerRegexConfirming}]`);

    // High-precision order extraction using order-parser
    const { extractOrdersFromThread } = await import('./order-parser');
    const allCandidateMsgs = [
      ...thread.messages,
      ...(eventText ? [{ text: eventText, role: 'incoming' }] : []),
      ...(draft ? [{ text: draft, role: 'outgoing' }] : []),
    ];
    const parsedOrders = extractOrdersFromThread(allCandidateMsgs, s.catalog || []);
    // Pick the most recent confirmed order event in the thread
    const targetOrderData = parsedOrders.length > 0 ? parsedOrders[parsedOrders.length - 1] : null;

    if (!targetOrderData) {
      console.log(`[WA] ℹ️ No specific timepiece identified in thread.`);
      return;
    }

    const isUpi =
      fullChatText.includes('upi') ||
      fullChatText.includes('online') ||
      fullChatText.includes('prepaid');

    const { allOrders, saveOrder } = await import('./server');
    const existingOrders = await allOrders(tenantId);
    const targetProductId = targetOrderData.productId || 'titan-watch';

    const currentCustName = targetOrderData.customerName !== 'Customer' ? targetOrderData.customerName : (thread.name || customer.name || 'Customer');
    const currentCustPhone = targetOrderData.customerPhone || thread.phone || customer.phone || '';
    const orderDeliveryLocation = targetOrderData.deliveryLocation || loc;

    // Match intelligently by product ID or normalized name and amount within this thread to never create duplicates
    const norm = (s: string) => (s || '').replace(/\s*\(x\d+\)/gi, '').trim().toLowerCase();
    let order = existingOrders.find(
      (o) =>
        o.threadId === thread.id &&
        (o.productId === targetProductId || norm(o.productName) === norm(targetOrderData.productName)) &&
        Math.abs(o.amount - targetOrderData.amount) < 10
    );

    const targetOrderStatus = isReadyForDispatch ? 'ready_for_dispatch' : 'confirmed';

    if (!order) {
      const orderNum = Math.floor(1000 + Math.random() * 9000);
      const newOrder: WAOrder = {
        id: `ORD-${orderNum}`,
        threadId: thread.id,
        customerName: currentCustName,
        customerPhone: currentCustPhone,
        productName: targetOrderData.productName,
        productId: targetProductId,
        items: targetOrderData.items,
        quantity: targetOrderData.quantity,
        subtotal: targetOrderData.subtotal,
        discountAmount: targetOrderData.discountAmount,
        amount: targetOrderData.amount,
        currency: 'INR',
        discountCode: targetOrderData.discountCode || s.discountCode || 'TITAN10',
        paymentMode: isUpi ? 'UPI' : 'COD',
        paymentStatus: isUpi ? 'paid' : 'pending',
        orderStatus: targetOrderStatus,
        deliveryLocation: orderDeliveryLocation,
        courierPartner: 'BlueDart',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      await saveOrder(newOrder, tenantId);
      console.log(`[WA] 📦 New order confirmed and saved: ${newOrder.id} for ${newOrder.customerName} (${newOrder.productName} - ₹${newOrder.amount})`);
    } else {
      order.customerName = currentCustName;
      order.customerPhone = currentCustPhone;
      order.deliveryLocation = orderDeliveryLocation;
      order.productName = targetOrderData.productName;
      order.productId = targetProductId;
      order.items = targetOrderData.items;
      order.quantity = targetOrderData.quantity;
      order.subtotal = targetOrderData.subtotal;
      order.discountAmount = targetOrderData.discountAmount;
      order.amount = targetOrderData.amount;
      order.orderStatus = targetOrderStatus;
      order.updatedAt = Date.now();
      await saveOrder(order, tenantId);
      console.log(`[WA] 📦 Order updated in wa_orders: ${order.id} for ${order.customerName} (${order.productName} - ₹${order.amount})`);
    }

    if (!thread.tags.includes('order_confirmed')) {
      thread.tags.push('order_confirmed');
    }
  } catch (ordErr) {
    console.error('[WA] Order auto-sync error:', ordErr);
  }
}
