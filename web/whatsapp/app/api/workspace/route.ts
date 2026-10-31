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
import { waDefaults, type WASettings, type RegisteredBusiness, type TursoUsageStats } from '@/lib/model';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const SECRET_SIGN_KEY = 'nina_secure_owner_auth_key_2026';

async function verifyAdminToken(token: string): Promise<boolean> {
  try {
    const [payloadB64, sigHex] = token.split('.');
    if (!payloadB64 || !sigHex) return false;
    const payload = atob(payloadB64);
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      enc.encode(SECRET_SIGN_KEY),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );
    const sigBytes = new Uint8Array(sigHex.match(/../g)!.map((h) => parseInt(h, 16)));
    const valid = await crypto.subtle.verify('HMAC', key, sigBytes, enc.encode(payload));
    if (!valid) return false;
    const data = JSON.parse(payload);
    if (data.exp && Date.now() > data.exp) return false;
    return true;
  } catch {
    return false;
  }
}

async function signAdminToken(user: string = 'nina_admin'): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(SECRET_SIGN_KEY),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const now = Date.now();
  const payload = JSON.stringify({ user, iat: now, exp: now + 30 * 86400000 });
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(payload));
  const sigHex = Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${btoa(payload)}.${sigHex}`;
}

const defaultRegisteredAccounts: RegisteredBusiness[] = [
  {
    id: 'biz_titan_watches',
    name: 'Titan Watches',
    ownerName: 'Nina Kurain',
    phone: '+91 99000 12345',
    category: 'Luxury Watches & Boutique',
    tagline: 'Timeless Craftsmanship, Modern Innovation',
    themeColor: '#10b981',
    createdAt: 1729000000000,
    lastActive: Date.now(),
    deviceStatus: 'connected',
    status: 'active',
  },
];

async function getTursoStats(): Promise<TursoUsageStats> {
  try {
    const d = db();
    const [tRow, oRow, cRow, jRow, aRow, sRow] = await Promise.all([
      d.prepare('SELECT count(*) as cnt FROM wa_threads').first<{ cnt: number }>().catch(() => ({ cnt: 0 })),
      d.prepare('SELECT count(*) as cnt FROM wa_orders').first<{ cnt: number }>().catch(() => ({ cnt: 0 })),
      d.prepare('SELECT count(*) as cnt FROM wa_customers').first<{ cnt: number }>().catch(() => ({ cnt: 0 })),
      d.prepare('SELECT count(*) as cnt FROM wa_jobs').first<{ cnt: number }>().catch(() => ({ cnt: 0 })),
      d.prepare('SELECT count(*) as cnt FROM wa_activity').first<{ cnt: number }>().catch(() => ({ cnt: 0 })),
      d.prepare('SELECT count(*) as cnt FROM wa_state').first<{ cnt: number }>().catch(() => ({ cnt: 0 })),
    ]);

    const threadsCount = Number(tRow?.cnt || 0);
    const ordersCount = Number(oRow?.cnt || 0);
    const customersCount = Number(cRow?.cnt || 0);
    const jobsCount = Number(jRow?.cnt || 0);
    const activityCount = Number(aRow?.cnt || 0);
    const stateCount = Number(sRow?.cnt || 0);

    const totalRows = threadsCount + ordersCount + customersCount + jobsCount + activityCount + stateCount;
    const estimatedBytes =
      threadsCount * 4096 +
      ordersCount * 1536 +
      customersCount * 1024 +
      jobsCount * 1024 +
      activityCount * 512 +
      stateCount * 10240;
    const storageEstimateKb = Math.round(estimatedBytes / 1024);
    const storageEstimateMb = (storageEstimateKb / 1024).toFixed(2);

    return {
      connected: true,
      provider: 'Turso LibSQL (Cloud Distributed)',
      totalRows,
      tableCounts: {
        threads: threadsCount,
        orders: ordersCount,
        customers: customersCount,
        jobs: jobsCount,
        activity: activityCount,
        state: stateCount,
      },
      storageEstimateKb,
      storageEstimateMb,
      health: 'Operational (Turso LibSQL Cloud)',
      lastChecked: Date.now(),
    };
  } catch (e: any) {
    return {
      connected: false,
      provider: 'Turso LibSQL',
      totalRows: 0,
      tableCounts: { threads: 0, orders: 0, customers: 0, jobs: 0, activity: 0, state: 0 },
      storageEstimateKb: 0,
      storageEstimateMb: '0.00',
      health: `Degraded: ${e?.message || 'Check credentials'}`,
      lastChecked: Date.now(),
    };
  }
}

// GET — Load entire workspace state
export async function GET(request: NextRequest) {
  try {
    await initDatabase();
    const ninaCookie =
      request.cookies.get('nina_owner_session')?.value || request.cookies.get('wa_admin_session')?.value;
    const isNinaAdmin = ninaCookie ? await verifyAdminToken(ninaCookie) : false;

    const [s, threads, orders, connections, logs, analytics, queue, usage, tursoStats, registeredAccounts, activeAccountId] =
      await Promise.all([
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
        getTursoStats(),
        readState<RegisteredBusiness[]>('wa_registered_accounts', defaultRegisteredAccounts),
        readState<string>('wa_active_account_id', 'biz_titan_watches'),
      ]);

    // Update dynamic stats on registered accounts
    const enrichedAccounts = registeredAccounts.map((acc) => ({
      ...acc,
      threadCount: threads.length,
      orderCount: orders.length,
    }));

    return NextResponse.json(
      {
        settings: s,
        threads,
        orders,
        connections,
        logs,
        analytics,
        queue,
        usage,
        storageReady: true,
        tursoStats,
        isNinaAdmin,
        registeredAccounts: enrichedAccounts,
        activeAccountId,
      },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
          Pragma: 'no-cache',
          Expires: '0',
        },
      }
    );
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

    // ── Nina Master Admin Authentication ────────────────────────────
    if (action === 'admin-login') {
      const pin = String(body.pin || '').trim();
      if (pin === '123456' || pin === 'admin' || pin === 'nina' || pin === 'nina123') {
        const token = await signAdminToken('nina_master_owner');
        const res = NextResponse.json({ ok: true, isNinaAdmin: true });
        res.cookies.set('wa_admin_session', token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          maxAge: 30 * 86400,
          path: '/',
        });
        await audit('Admin login', 'Nina Master Admin authenticated into WhatsApp Automation');
        return res;
      }
      throw new AppError('Incorrect Nina Master Admin PIN.', 401);
    }

    if (action === 'admin-logout') {
      const res = NextResponse.json({ ok: true, isNinaAdmin: false });
      res.cookies.delete('wa_admin_session');
      res.cookies.delete('nina_owner_session');
      await audit('Admin logout', 'Nina Master Admin signed out');
      return res;
    }

    // ── Client Business Management (Multi-tenant) ─────────────────────
    if (action === 'register-business') {
      const accounts = await readState<RegisteredBusiness[]>('wa_registered_accounts', defaultRegisteredAccounts);
      const bizId = `biz_${Date.now()}`;
      const newBiz: RegisteredBusiness = {
        id: bizId,
        name: body.name?.trim() || 'My Business Store',
        ownerName: body.ownerName?.trim() || 'Business Owner',
        phone: body.phone?.trim() || '+91 99000 00000',
        category: body.category?.trim() || 'Retail & Commerce',
        tagline: body.tagline?.trim() || 'Exclusive WhatsApp Automated Ordering',
        themeColor: body.themeColor?.trim() || '#10b981',
        createdAt: Date.now(),
        lastActive: Date.now(),
        deviceStatus: 'disconnected',
        status: 'active',
      };
      accounts.unshift(newBiz);
      await writeState('wa_registered_accounts', accounts);
      await writeState('wa_active_account_id', newBiz.id);

      // Auto update current settings
      const currentS = await settings();
      currentS.businessName = newBiz.name;
      currentS.tagline = newBiz.tagline;
      currentS.industry = newBiz.category;
      currentS.category = newBiz.category;
      await writeState('wa_settings', currentS);

      await audit('Business registered', `Client business "${newBiz.name}" registered in WhatsApp automation`);
      return NextResponse.json({
        ok: true,
        business: newBiz,
        registeredAccounts: accounts,
        settings: currentS,
        activeAccountId: newBiz.id,
      });
    }

    if (action === 'switch-business') {
      const accounts = await readState<RegisteredBusiness[]>('wa_registered_accounts', defaultRegisteredAccounts);
      const target = accounts.find((a) => a.id === body.businessId);
      if (!target) throw new AppError('Business not found', 404);

      target.lastActive = Date.now();
      await writeState('wa_active_account_id', target.id);
      await writeState('wa_registered_accounts', accounts);

      const currentS = await settings();
      currentS.businessName = target.name;
      currentS.tagline = target.tagline;
      currentS.industry = target.category;
      currentS.category = target.category;
      await writeState('wa_settings', currentS);

      await audit('Business switched', `Active business switched to "${target.name}"`);
      return NextResponse.json({
        ok: true,
        activeAccountId: target.id,
        business: target,
        settings: currentS,
        registeredAccounts: accounts,
      });
    }

    if (action === 'delete-business') {
      let accounts = await readState<RegisteredBusiness[]>('wa_registered_accounts', defaultRegisteredAccounts);
      accounts = accounts.filter((a) => a.id !== body.businessId);
      if (!accounts.length) accounts = defaultRegisteredAccounts;
      await writeState('wa_registered_accounts', accounts);
      await audit('Business deleted', `Business ${body.businessId} removed by Nina Admin`);
      return NextResponse.json({ ok: true, registeredAccounts: accounts });
    }

    // ── Turso DB Live Stats ──────────────────────────────────────────
    if (action === 'refresh-turso-stats') {
      const tursoStats = await getTursoStats();
      return NextResponse.json({ ok: true, tursoStats });
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
