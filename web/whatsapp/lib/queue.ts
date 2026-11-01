import { claimThreadJobs, releaseThread } from './queue-ownership';
import {missingBusinessProfile} from './business-profile';
import {confirmCatalogCheckout,isCatalogConfirmation} from './catalog-checkout';
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

async function reserveRule(rule:AutoReplyRule,tenantId:string,threadId:string) {
  const now=Date.now(),day=new Date(now).toISOString().slice(0,10);
  return db().transaction(async tx=>{
    const recent=await tx.prepare('SELECT last_used FROM auto_rule_threads WHERE tenant_id=? AND rule_id=? AND thread_id=?').bind(tenantId,rule.id,threadId).first<{last_used:number}>();
    if(recent&&recent.last_used+rule.cooldownMinutes*60000>now)return false;
    const usage=await tx.prepare('SELECT uses FROM auto_rule_daily WHERE tenant_id=? AND rule_id=? AND day=?').bind(tenantId,rule.id,day).first<{uses:number}>();
    if(Number(usage?.uses||0)>=rule.maxUsesPerDay)return false;
    await tx.prepare('INSERT INTO auto_rule_daily(tenant_id,rule_id,day,uses) VALUES (?,?,?,1) ON CONFLICT(tenant_id,rule_id,day) DO UPDATE SET uses=uses+1').bind(tenantId,rule.id,day).run();
    await tx.prepare('INSERT INTO auto_rule_threads(tenant_id,rule_id,thread_id,last_used) VALUES (?,?,?,?) ON CONFLICT(tenant_id,rule_id,thread_id) DO UPDATE SET last_used=excluded.last_used').bind(tenantId,rule.id,threadId,now).run();
    return true;
  });
}

// ── Escalation Check ────────────────────────────────────────────────────

async function checkEscalation(thread: WAThread, s: WASettings, tenantId: string): Promise<boolean> {
  for (const rule of s.escalationRules) {
    if (!rule.enabled) continue;

    switch (rule.condition) {
      case 'sentiment_negative':
        if (thread.sentiment === 'angry' || thread.sentiment === 'negative') {
          thread.status = 'escalated';
          thread.priority = rule.priority;
          await audit('Escalation', `${rule.name}: ${thread.name} — ${thread.sentiment} sentiment`, tenantId);
          return true;
        }
        break;
      case 'keyword': {
        const lastMsg = thread.messages.filter((m) => m.role === 'incoming').at(-1);
        if (lastMsg && rule.conditionValue.split(',').map(word=>word.trim().toLowerCase()).filter(Boolean).some(word=>lastMsg.text.toLowerCase().includes(word))) {
          thread.status = 'escalated';
          thread.priority = rule.priority;
          await audit('Escalation', `${rule.name}: keyword match in ${thread.name}`, tenantId);
          return true;
        }
        break;
      }
      case 'wait_time': {
        const waitMinutes = (Date.now() - thread.lastInbound) / 60000;
        if (waitMinutes > parseInt(rule.conditionValue || '30')) {
          thread.status = 'escalated';
          thread.priority = rule.priority;
          await audit('Escalation', `${rule.name}: ${thread.name} waited ${Math.round(waitMinutes)}min`, tenantId);
          return true;
        }
        break;
      }
      case 'vip_customer':
        if (thread.customerProfile?.vip) {
          thread.priority = rule.priority;
          await audit('VIP Priority', `${rule.name}: VIP customer ${thread.name}`, tenantId);
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

  if (!tenantRow || tenantRow.status !== 'active') {
    console.warn(`[WA Queue] Aborting jobs: business tenant ${tenantId} is suspended.`);
    await db()
      .prepare("UPDATE wa_jobs SET status='failed' WHERE thread_id=? AND tenant_id=? AND status='pending'")
      .bind(threadId, tenantId)
      .run();
    return { processed: 0 };
  }

  const s = await settings(tenantId);

  const {token,jobs} = await claimThreadJobs(tenantId,threadId,s.maxRetries ?? 3);
  if(!jobs.length) { await releaseThread(tenantId,threadId,token); return {processed:0}; }

  try {
    let thread = await getThread(threadId, tenantId);
    if(thread&&jobs.every(job=>{
      const event=JSON.parse(job.payload);
      const position=thread!.messages.findIndex(message=>message.id===event.id&&message.role==='incoming');
      return position>=0&&thread!.messages.slice(position+1).some(message=>message.role==='outgoing');
    })) {
      for(const job of jobs)await db().prepare("UPDATE wa_jobs SET status='done' WHERE tenant_id=? AND id=?").bind(tenantId,job.id).run();
      return {processed:jobs.length};
    }
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
      if (!thread.messages.some(m=>m.id===newMessage.id)) thread.messages.push(newMessage);
      thread.lastInbound = newMessage.at;
      if (event.text?.trim()) incomingTexts.push(event.text.trim());
    }

    thread.status = 'open';
    thread.updated = Date.now();

    const compositeText = incomingTexts.join('\n');
    // Confirmation binds to the verified transport sender, never a number in chat.
    const confirmations=jobs.map(job=>JSON.parse(job.payload)).filter(event=>event.channel!=='group'&&isCatalogConfirmation(event.text||''));
    if(confirmations.length){
      const replies:string[]=[];
      for(const event of confirmations){
        try{const result=await confirmCatalogCheckout(tenantId,event.senderPhone,event.text,thread.id);if(result){replies.push(result.reply);thread.deliveryLocation=result.order.deliveryLocation;thread.tags=Array.from(new Set([...thread.tags,'order_confirmed','catalog_checkout','address_needs_review']));}}
        catch(error){if(error instanceof AppError&&error.status<500)replies.push(error.message);else throw error;}
      }
      thread.draft=replies.join('\n');thread.status='review';
      await saveThread(thread,tenantId);
      if(s.enabled&&!s.approval&&!thread.takeover&&thread.ai&&s.personalChats&&!missingBusinessProfile(s).length&&thread.draft)await sendReply(thread,thread.draft,tenantId,true);
      for(const job of jobs)await db().prepare("UPDATE wa_jobs SET status='done' WHERE id=? AND tenant_id=?").bind(job.id,tenantId).run();
      return {processed:jobs.length};
    }

    // Extract real phone number and name from composite message text
    if (compositeText) {
      const phoneMatch = compositeText.match(/\b([6-9][0-9]{9})\b/);
      // Message text cannot replace the sender's account identity.

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

    // Shipping addresses come only from the structured catalog checkout.

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
          await db().prepare("UPDATE wa_jobs SET status='done' WHERE id=? AND tenant_id=?").bind(j.id,tenantId).run();
        }
        await audit('Flagged', `${flag} — ${thread.name}`, tenantId);
        return { processed: jobs.length };
      }
    }

    // Check escalation rules
    const escalated = await checkEscalation(thread, s, tenantId);
    if (escalated) {
      await saveThread(thread, tenantId);
      await saveCustomerProfile(customer, tenantId);
      for (const j of jobs) {
        await db().prepare("UPDATE wa_jobs SET status='done' WHERE id=? AND tenant_id=?").bind(j.id,tenantId).run();
      }
      return { processed: jobs.length };
    }

    await saveThread(thread,tenantId);

    // Manual takeover and disabled automation apply to rule replies as well as AI.
    if (thread.takeover || !thread.ai || !s.enabled || (thread.channel==='personal'&&!s.personalChats) || (thread.channel==='group'&&!s.groupChats) || missingBusinessProfile(s).length) {
      if(s.enabled&&missingBusinessProfile(s).length) {
        thread.flagged='Complete the business profile before enabling automatic replies.';
        await saveThread(thread,tenantId);
      }
      await saveCustomerProfile(customer,tenantId);
      for(const job of jobs) await db().prepare("UPDATE wa_jobs SET status='done' WHERE tenant_id=? AND id=?").bind(tenantId,job.id).run();
      return {processed:jobs.length};
    }

    // Check auto-reply rules
    if(thread.flagged?.startsWith('Delivery uncertain'))throw new AppError('Verify the previous WhatsApp delivery before retrying.',409);
    const withinHours = isBusinessHours(s);
    const autoReply = matchAutoReplyRule(
      s.autoReplyRules,
      compositeText,
      thread.channel,
      isFirstMessage,
      withinHours
    );

    if (autoReply&&await reserveRule(autoReply,tenantId,threadId)) {
      const replyText =
        autoReply.response ||
        (autoReply.triggerType === 'first_message' ? s.welcomeMessage : '') ||
        (autoReply.triggerType === 'time' ? s.awayMessage : '');

      if (replyText && !s.approval) {
        await sendReply(thread, replyText, tenantId,true);
        for (const j of jobs) {
          await db().prepare("UPDATE wa_jobs SET status='done' WHERE id=? AND tenant_id=?").bind(j.id,tenantId).run();
        }
        return { processed: jobs.length };
      } else if (replyText) {
        thread.draft = replyText;
        thread.status = 'review';
        await saveThread(thread, tenantId);
        await saveCustomerProfile(customer, tenantId);
        for (const j of jobs) {
          await db().prepare("UPDATE wa_jobs SET status='done' WHERE id=? AND tenant_id=?").bind(j.id,tenantId).run();
        }
        return { processed: jobs.length };
      }
    }

    // Skip AI if takeover mode
    if (thread.takeover || !thread.ai || !s.enabled) {
      await saveThread(thread, tenantId);
      await saveCustomerProfile(customer, tenantId);
      for (const j of jobs) {
        await db().prepare("UPDATE wa_jobs SET status='done' WHERE id=? AND tenant_id=?").bind(j.id,tenantId).run();
      }
      return { processed: jobs.length };
    }

    // Generate SINGLE cohesive AI reply for the combined incoming messages
    if(thread.flagged?.startsWith('Automation unavailable')||thread.flagged?.startsWith('Complete the business profile'))thread.flagged='';
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
        await sendReply(thread, draft, tenantId,true);
      }

    } else {
      await saveThread(thread, tenantId);
    }

    await saveCustomerProfile(customer, tenantId);
    for (const j of jobs) {
      await db().prepare("UPDATE wa_jobs SET status='done' WHERE id=? AND tenant_id=?").bind(j.id,tenantId).run();
    }
    return { processed: jobs.length };
  } catch (err) {
    console.error(`[WA] Error in processThreadJobs for ${threadId}:`, err);
    const failedThread=await getThread(threadId,tenantId);
    if(failedThread&&!failedThread.flagged) {
      failedThread.flagged=err instanceof AppError?'Automation unavailable: '+err.message:'Automation unavailable — check connection, AI service and queue status.';
      await saveThread(failedThread,tenantId);
    }
    await audit('Automation failed','Reply processing failed. Incoming messages are preserved; check AI and WhatsApp connection status.',tenantId);
    for (const j of jobs) {
      await db().prepare("UPDATE wa_jobs SET status=CASE WHEN attempts>=? THEN 'failed' ELSE 'pending' END,created=? WHERE id=? AND tenant_id=?").bind(s.maxRetries??3,Date.now()+30000,j.id,tenantId).run();
    }
    return { processed: 0 };
  } finally { await releaseThread(tenantId,threadId,token); }
}

export async function processNextJob(tenantId?: string): Promise<{ processed: number }> {
  const d = db();
  const s = await settings(tenantId || 'biz_titan_watches');

  let queryResult;
  if (tenantId) {
    queryResult = await d
      .prepare(
        `SELECT DISTINCT thread_id, tenant_id FROM wa_jobs WHERE status IN ('pending','processing') AND attempts<? AND created<=? AND tenant_id=? LIMIT 5`
      )
      .bind(s.maxRetries ?? 3, Date.now(), tenantId)
      .all();
  } else {
    queryResult = await d
      .prepare(
        `SELECT DISTINCT thread_id, tenant_id FROM wa_jobs WHERE status IN ('pending','processing') AND attempts<? AND created<=? LIMIT 5`
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

