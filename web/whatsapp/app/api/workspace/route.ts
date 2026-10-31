// ─── WhatsApp Workspace API — Full state management ─────────────────────
import { NextRequest, NextResponse } from 'next/server';
import {
  initDatabase,
  readState,
  writeState,
  settings,
  allThreads,
  allOrders,
  saveOrder,
  getOrder,
  deleteOrder,
  connectionStatus,
  computeAnalytics,
  errorResponse,
  AppError,
  audit,
  saveSecret,
  secret,
  db,
  getThread,
  saveThread,
  sendReply,
  getOrCreateCustomer,
  saveCustomerProfile,
  selectedProvider,
  providerSecretId,
} from '@/lib/server';
import { providerConfig } from '@/lib/provider-config';
import { queueStatus, processNextJob } from '@/lib/queue';
import { waDefaults, type WASettings } from '@/lib/model';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// GET — Load entire workspace state
export async function GET() {
  try {
    await initDatabase();
    const [s, threads, orders, connections, logs, analytics, queue, usage] = await Promise.all([
      settings(),
      allThreads(),
      allOrders(),
      connectionStatus(),
      db()
        .prepare('SELECT * FROM wa_activity ORDER BY created DESC LIMIT 100')
        .all()
        .then((r: any) => r?.results || []),
      computeAnalytics(),
      queueStatus(),
      readState('wa_usage', { calls: 0, tokens: 0, sent: 0 }),
    ]);

    return NextResponse.json({
      settings: s,
      threads,
      orders,
      connections,
      logs,
      analytics,
      queue,
      usage,
      storageReady: true,
    }, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        Pragma: 'no-cache',
        Expires: '0',
      },
    });
  } catch (e) {
    return errorResponse(e);
  }
}

// POST — Handle all workspace actions
export async function POST(request: NextRequest) {
  try {
    await initDatabase();
    const body = await request.json();
    const action = body.action;

    // ── Settings ────────────────────────────────────────────────────
    if (action === 'save-settings') {
      await writeState('wa_settings', body.settings);
      await audit('Settings updated', 'WhatsApp automation settings saved');
      return NextResponse.json({ ok: true, settings: await settings() });
    }

    // ── Connections — Save credentials ──────────────────────────────
    if (action === 'save-credentials') {
      let count = 0;
      if (body.waAccessToken) {
        await saveSecret('wa_access_token', body.waAccessToken);
        count++;
      }
      if (body.waPhoneNumberId) {
        const c = await readState<any>('wa_connection', {});
        c.phoneNumberId = body.waPhoneNumberId;
        await writeState('wa_connection', c);
        await writeState('wa_phone_number_id', body.waPhoneNumberId);
        count++;
      }
      if (body.waBusinessAccountId) {
        const c = await readState<any>('wa_connection', {});
        c.businessAccountId = body.waBusinessAccountId;
        await writeState('wa_connection', c);
        count++;
      }
      if (body.waAppSecret) {
        await saveSecret('wa_app_secret', body.waAppSecret);
        count++;
      }
      if (body.waVerifyToken) {
        await saveSecret('wa_verify_token', body.waVerifyToken);
        count++;
      }
      // AI provider keys — these go to the SAME encrypted_secrets table
      if (body.groqKey) {
        await saveSecret('groq_key', body.groqKey);
        count++;
      }
      if (!count) throw new AppError('Provide at least one credential to save.');
      await audit('Credentials saved', `Saved ${count} credential(s)`);
      return NextResponse.json({ ok: true, connections: await connectionStatus() });
    }

    // ── Test WhatsApp Connection ────────────────────────────────────
    if (action === 'test-whatsapp') {
      const token = await secret('wa_access_token');
      if (!token) throw new AppError('Save your WhatsApp access token first.', 412);
      const s = await settings();

      const phoneNumberId = await readState<string>('wa_phone_number_id', '');
      if (!phoneNumberId) throw new AppError('Save your Phone Number ID first.', 412);

      const response = await fetch(
        `https://graph.facebook.com/${s.graphVersion || 'v21.0'}/${phoneNumberId}?fields=display_phone_number,verified_name,quality_rating`,
        {
          headers: { Authorization: 'Bearer ' + token },
          signal: AbortSignal.timeout(15000),
        }
      );

      if (!response.ok) {
        throw new AppError(
          `WhatsApp API rejected the connection (HTTP ${response.status}). Check credentials.`,
          502
        );
      }

      const data: any = await response.json();
      const c = await readState<any>('wa_connection', {});
      c.verified = true;
      c.displayPhoneNumber = data.display_phone_number;
      c.verifiedName = data.verified_name;
      c.qualityRating = data.quality_rating;
      c.testedAt = Date.now();
      await writeState('wa_connection', c);
      await audit('WhatsApp verified', `Verified ${data.display_phone_number} (${data.verified_name})`);

      return NextResponse.json({
        ok: true,
        phone: data.display_phone_number,
        name: data.verified_name,
        quality: data.quality_rating,
        connections: await connectionStatus(),
      });
    }

    // ── Test AI Provider ────────────────────────────────────────────
    if (action === 'test-ai') {
      const provider = await selectedProvider();
      if (!provider) throw new AppError('No AI provider configured.', 412);

      const key = await secret(providerSecretId(provider.id));
      if (!key) throw new AppError(`API key for ${provider.label} not found.`, 412);

      const config = providerConfig[provider.provider];
      let testUrl = `${config.base}/models`;
      let headers: Record<string, string> = { Authorization: 'Bearer ' + key };

      if (provider.provider === 'cloudflare') {
        const [cfAccount, cfToken] = key.split(':');
        testUrl = `${config.base}/${cfAccount}/ai/models/search`;
        headers = { Authorization: 'Bearer ' + cfToken };
      }

      const response = await fetch(testUrl, {
        headers,
        signal: AbortSignal.timeout(15000),
      });

      if (!response.ok) {
        throw new AppError(`${provider.label} rejected the key (HTTP ${response.status}).`, 502);
      }

      await audit('AI verified', `${provider.label} (${provider.provider}) verified for WhatsApp automation`);
      return NextResponse.json({ ok: true, provider: provider.label, connections: await connectionStatus() });
    }

    // ── Thread Actions ──────────────────────────────────────────────
    if (action === 'approve-thread') {
      const thread = await getThread(body.threadId);
      if (!thread) throw new AppError('Thread not found.', 404);
      if (!thread.draft) throw new AppError('No draft to approve.');

      await sendReply(thread, thread.draft);
      thread.draft = '';
      return NextResponse.json({ ok: true });
    }

    if (action === 'edit-draft') {
      const thread = await getThread(body.threadId);
      if (!thread) throw new AppError('Thread not found.', 404);
      thread.draft = body.draft || '';
      await saveThread(thread);
      return NextResponse.json({ ok: true });
    }

    if (action === 'send-manual') {
      const thread = await getThread(body.threadId);
      if (!thread) throw new AppError('Thread not found.', 404);
      await sendReply(thread, body.text);
      return NextResponse.json({ ok: true });
    }

    if (action === 'takeover') {
      const thread = await getThread(body.threadId);
      if (!thread) throw new AppError('Thread not found.', 404);
      thread.takeover = !thread.takeover;
      thread.ai = !thread.takeover;
      await saveThread(thread);
      await audit('Takeover', `${thread.takeover ? 'Manual' : 'AI'} mode for ${thread.name}`);
      return NextResponse.json({ ok: true });
    }

    if (action === 'resolve') {
      const thread = await getThread(body.threadId);
      if (!thread) throw new AppError('Thread not found.', 404);
      thread.status = 'resolved';
      thread.draft = '';
      await saveThread(thread);
      await audit('Resolved', `Conversation with ${thread.name} resolved`);
      return NextResponse.json({ ok: true });
    }

    if (action === 'set-priority') {
      const thread = await getThread(body.threadId);
      if (!thread) throw new AppError('Thread not found.', 404);
      thread.priority = body.priority;
      await saveThread(thread);
      return NextResponse.json({ ok: true });
    }

    if (action === 'add-tag') {
      const thread = await getThread(body.threadId);
      if (!thread) throw new AppError('Thread not found.', 404);
      if (!thread.tags.includes(body.tag)) thread.tags.push(body.tag);
      await saveThread(thread);
      return NextResponse.json({ ok: true });
    }

    if (action === 'remove-tag') {
      const thread = await getThread(body.threadId);
      if (!thread) throw new AppError('Thread not found.', 404);
      thread.tags = thread.tags.filter((t) => t !== body.tag);
      await saveThread(thread);
      return NextResponse.json({ ok: true });
    }

    // ── Customer Profile ────────────────────────────────────────────
    if (action === 'update-customer') {
      const customer = await getOrCreateCustomer(body.phone);
      Object.assign(customer, body.updates);
      await saveCustomerProfile(customer);
      return NextResponse.json({ ok: true, customer });
    }

    if (action === 'toggle-vip') {
      const customer = await getOrCreateCustomer(body.phone);
      customer.vip = !customer.vip;
      await saveCustomerProfile(customer);
      await audit('VIP', `${customer.name} ${customer.vip ? 'marked' : 'unmarked'} as VIP`);
      return NextResponse.json({ ok: true, customer });
    }

    // ── Manual Process ──────────────────────────────────────────────
    if (action === 'process') {
      const result = await processNextJob();
      return NextResponse.json({ ok: true, ...result });
    }

    // ── Quick Reply Management ──────────────────────────────────────
    if (action === 'send-quick-reply') {
      const thread = await getThread(body.threadId);
      if (!thread) throw new AppError('Thread not found.', 404);
      await sendReply(thread, body.text);

      // Update usage count
      const s = await settings();
      const qr = s.quickReplies.find((q) => q.id === body.quickReplyId);
      if (qr) {
        qr.usageCount++;
        await writeState('wa_settings', s);
      }

      return NextResponse.json({ ok: true });
    }

    // ── Order Management ────────────────────────────────────────────
    if (action === 'save-order') {
      await saveOrder(body.order);
      await audit('Order saved', `Order ${body.order.id} for ${body.order.customerName} saved/updated`);
      return NextResponse.json({ ok: true, orders: await allOrders() });
    }

    if (action === 'delete-order') {
      await deleteOrder(body.orderId);
      await audit('Order deleted', `Order ${body.orderId} deleted`);
      return NextResponse.json({ ok: true, orders: await allOrders() });
    }

    if (action === 'update-order-status') {
      const order = await getOrder(body.orderId);
      if (!order) throw new AppError('Order not found', 404);
      order.orderStatus = body.status;
      if (body.trackingNumber) order.trackingNumber = body.trackingNumber;
      if (body.courierPartner) order.courierPartner = body.courierPartner;
      order.updatedAt = Date.now();
      await saveOrder(order);
      await audit('Order status updated', `Order ${order.id} status changed to ${order.orderStatus}`);
      return NextResponse.json({ ok: true, orders: await allOrders() });
    }

    // ── Wipe / Reset Database ───────────────────────────────────────
    if (action === 'clear-all-data') {
      await db().exec('DELETE FROM wa_threads');
      await db().exec('DELETE FROM wa_jobs');
      await db().exec('DELETE FROM wa_activity');
      await db().exec('DELETE FROM wa_customers');
      await db().exec('DELETE FROM wa_orders');
      await db().exec('DELETE FROM wa_state');
      await writeState('wa_settings', waDefaults);

      return NextResponse.json({
        ok: true,
        message: 'Successfully removed all data from database (threads, jobs, activity, customers, state). Fresh start initialized.',
      });
    }

    throw new AppError('Unknown action: ' + action, 400);
  } catch (e) {
    return errorResponse(e);
  }
}
