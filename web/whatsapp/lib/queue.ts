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

export async function queueStatus() {
  const queryResult = await db()
    .prepare('SELECT status, COUNT(*) count FROM wa_jobs GROUP BY status')
    .all();
  const rows = (queryResult?.results || []) as { status: string; count: number }[];
  const counts = Object.fromEntries(rows.map((r) => [r.status, Number(r.count)]));
  return {
    pending: counts.pending || 0,
    processing: counts.processing || 0,
    failed: counts.failed || 0,
    done: counts.done || 0,
  };
}

// ── Process Next Job ────────────────────────────────────────────────────

export async function processNextJob(): Promise<{ processed: number }> {
  const s = await settings();

  // Recover stale processing jobs
  const cutoff = Date.now() - 120000;
  await db()
    .prepare(
      "UPDATE wa_jobs SET status='pending',attempts=0,created=? WHERE status='processing' AND created<?"
    )
    .bind(Date.now(), cutoff)
    .run();

  const queryResult = await db()
    .prepare(
      `SELECT * FROM wa_jobs WHERE status='pending' AND attempts<? AND created<=?
       ORDER BY created ASC LIMIT 10`
    )
    .bind(s.maxRetries ?? 3, Date.now())
    .all();
  const candidateJobs = (queryResult?.results || []) as Job[];

  if (!candidateJobs.length) return { processed: 0 };

  let processed = 0;

  for (const job of candidateJobs) {
    try {
      // Mark as processing
      await db()
        .prepare("UPDATE wa_jobs SET status='processing',attempts=attempts+1 WHERE id=?")
        .bind(job.id)
        .run();

      const event = JSON.parse(job.payload);
      const threadId = event.threadId || `wa:${event.senderPhone}`;

      // Get or create thread
      let thread = await getThread(threadId);
      const isFirstMessage = !thread;

      if (!thread) {
        const customer = await getOrCreateCustomer(event.senderPhone, event.senderName);
        thread = {
          id: threadId,
          name: event.senderName || event.senderPhone,
          phone: event.senderPhone,
          channel: event.channel || 'personal',
          status: 'open',
          takeover: false,
          ai: true,
          messages: [],
          draft: '',
          lastInbound: Date.now(),
          recipientId: event.jid || event.senderPhone,
          updated: Date.now(),
          version: 0,
          priority: customer.vip ? 'high' : 'normal',
          tags: [],
          customerProfile: customer,
        };
      } else {
        if (event.jid) thread.recipientId = event.jid;
      }

      // Add incoming message
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
      thread.status = 'open';
      thread.updated = Date.now();

      // Extract real phone number and name from message text if shared by customer
      if (event.text) {
        const phoneMatch = event.text.match(/\b([6-9][0-9]{9})\b/);
        if (phoneMatch) {
          thread.phone = `+91 ${phoneMatch[1]}`;
        }

        const lines = event.text.split('\n').map((l: string) => l.trim()).filter(Boolean);
        if (lines.length >= 2 && phoneMatch) {
          const nameCandidate = lines.find((l: string) => !/\d/.test(l) && !/cash|upi|cod|card|net|bank|pay/i.test(l) && l.length >= 2 && l.length <= 30);
          if (nameCandidate) {
            thread.name = nameCandidate;
          }
        } else {
          const nameMatch = event.text.match(/(?:my name is|i am|this is|naam)\s+([A-Za-z\s]{2,25})/i);
          if (nameMatch && nameMatch[1]) {
            thread.name = nameMatch[1].trim();
          }
        }
      }

      // Update customer profile
      const customer = await getOrCreateCustomer(thread.phone, thread.name);
      customer.name = thread.name;
      customer.lastContact = Date.now();
      customer.totalMessages++;
      thread.customerProfile = customer;

      // Auto-tag
      if (s.autoTagEnabled && event.text) {
        const newTags = autoTag(event.text);
        for (const tag of newTags) {
          if (!thread.tags.includes(tag)) thread.tags.push(tag);
        }
      }

      // Address & Delivery Location Detection & Geocoding
      if (event.text) {
        try {
          const { parseAndMapAddress } = await import('./location-service');
          const parsedLoc = await parseAndMapAddress(event.text, thread.deliveryLocation);
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

      // Check if order is confirmed from customer message
      await syncOrderIfConfirmed(thread, event.text || '', null, s, customer);

      // Sentiment analysis
      if (s.sentimentAnalysisEnabled && event.text) {
        thread.sentiment = analyzeSentiment(event.text);
      }

      // Check for sensitive content
      if (event.text) {
        const flag = reviewFlag(event.text);
        if (flag) {
          thread.flagged = flag;
          thread.status = 'escalated';
          thread.priority = 'urgent';
          await saveThread(thread);
          await saveCustomerProfile(customer);
          await db().prepare("UPDATE wa_jobs SET status='done' WHERE id=?").bind(job.id).run();
          await audit('Flagged', `${flag} — ${thread.name}`);
          processed++;
          continue;
        }
      }

      // Check escalation rules
      const escalated = await checkEscalation(thread, s);
      if (escalated) {
        await saveThread(thread);
        await saveCustomerProfile(customer);
        await db().prepare("UPDATE wa_jobs SET status='done' WHERE id=?").bind(job.id).run();
        processed++;
        continue;
      }

      // Check auto-reply rules
      const withinHours = isBusinessHours(s);
      const autoReply = matchAutoReplyRule(
        s.autoReplyRules,
        event.text || '',
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
          await sendReply(thread, replyText);
          await db().prepare("UPDATE wa_jobs SET status='done' WHERE id=?").bind(job.id).run();
          processed++;
          continue;
        } else if (replyText) {
          thread.draft = replyText;
          thread.status = 'review';
          await saveThread(thread);
          await saveCustomerProfile(customer);
          await db().prepare("UPDATE wa_jobs SET status='done' WHERE id=?").bind(job.id).run();
          processed++;
          continue;
        }
      }

      // Skip AI if takeover mode
      if (thread.takeover || !thread.ai || !s.enabled) {
        await saveThread(thread);
        await saveCustomerProfile(customer);
        await db().prepare("UPDATE wa_jobs SET status='done' WHERE id=?").bind(job.id).run();
        processed++;
        continue;
      }

      // Generate AI reply
      console.log(`[WA] 🤖 Generating AI reply for ${thread.name} (${thread.phone})...`);
      const startTime = Date.now();
      const draft = await generateReply(thread);
      thread.responseTimeMs = Date.now() - startTime;
      console.log(`[WA] 💡 AI response generated in ${thread.responseTimeMs}ms: "${draft.slice(0, 60)}..."`);

      if (draft) {
        if (s.approval) {
          console.log(`[WA] 📝 Approval mode is ON: saved as review draft for ${thread.name}`);
          thread.draft = draft;
          thread.status = 'review';
          await saveThread(thread);
        } else {
          // Apply delay
          const delay = thread.channel === 'group' ? s.groupReplyDelaySeconds : s.personalReplyDelaySeconds;
          if (delay > 0) {
            console.log(`[WA] ⏳ Waiting ${delay}s delay before sending...`);
            await new Promise((r) => setTimeout(r, delay * 1000));
          }
          console.log(`[WA] 🚀 Auto-sending reply to ${thread.name}...`);
          await sendReply(thread, draft);
        }

        // Auto-sync order if confirmed in reply or draft
        await syncOrderIfConfirmed(thread, event.text || '', draft, s, customer);
      } else {
        await saveThread(thread);
      }

      await saveCustomerProfile(customer);
      await db().prepare("UPDATE wa_jobs SET status='done' WHERE id=?").bind(job.id).run();
      processed++;
    } catch (err) {
      console.error('Job processing error:', err);
      await db()
        .prepare("UPDATE wa_jobs SET status='pending' WHERE id=?")
        .bind(job.id)
        .run();
    }
  }

  return { processed };
}

// ── Order Auto-Sync Helper ──────────────────────────────────────────────
async function syncOrderIfConfirmed(
  thread: WAThread,
  eventText: string,
  draft: string | null,
  s: WASettings,
  customer: CustomerProfile
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
    const isConfirmed = aiFeedback.isConfirmed || isAIDraftConfirming || isCustomerRegexConfirming;

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
    const targetOrderData = parsedOrders[0];

    if (!targetOrderData) {
      console.log(`[WA] ℹ️ No specific timepiece identified in thread.`);
      return;
    }

    const isUpi =
      fullChatText.includes('upi') ||
      fullChatText.includes('online') ||
      fullChatText.includes('prepaid');

    const { allOrders, saveOrder } = await import('./server');
    const existingOrders = await allOrders();
    const targetProductId = targetOrderData.productId || 'titan-watch';

    const currentCustName = thread.name || customer.name || 'Customer';
    const currentCustPhone = thread.phone || customer.phone || '';

    // If there is an existing pending draft order for this exact thread and watch, update it;
    // Otherwise, create a clean new order record so multiple customer bookings are never clobbered!
    let order = existingOrders.find(
      (o) => o.threadId === thread.id && o.orderStatus === 'confirmed' && (o.productId === targetProductId || o.productName === targetOrderData.productName)
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
        deliveryLocation: loc,
        courierPartner: 'BlueDart',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      await saveOrder(newOrder);
      console.log(`[WA] 📦 New order confirmed and saved: ${newOrder.id} for ${newOrder.customerName} (${newOrder.productName} - ₹${newOrder.amount})`);
    } else {
      order.customerName = currentCustName;
      order.customerPhone = currentCustPhone;
      order.deliveryLocation = loc;
      order.productName = targetOrderData.productName;
      order.productId = targetProductId;
      order.items = targetOrderData.items;
      order.quantity = targetOrderData.quantity;
      order.subtotal = targetOrderData.subtotal;
      order.discountAmount = targetOrderData.discountAmount;
      order.amount = targetOrderData.amount;
      order.orderStatus = targetOrderStatus;
      order.updatedAt = Date.now();
      await saveOrder(order);
      console.log(`[WA] 📦 Order updated in wa_orders: ${order.id} for ${order.customerName} (${order.productName} - ₹${order.amount})`);
    }

    if (!thread.tags.includes('order_confirmed')) {
      thread.tags.push('order_confirmed');
    }
  } catch (ordErr) {
    console.error('[WA] Order auto-sync error:', ordErr);
  }
}
