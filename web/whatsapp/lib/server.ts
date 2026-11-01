// ─── WhatsApp Automation — Server Engine ────────────────────────────────
// Core server-side logic: DB, state, secrets (shared with Instagram),
// AI generation, WhatsApp Cloud API messaging, and customer support engine.

import { providerConfig, completionBody } from './provider-config';
import {
  buildSystemPrompt,
  buildConversationMessages,
  analyzeSentiment,
  detectIntent,
  autoTag,
  isGenericRefusal,
  reviewFlag,
  isBusinessHours,
  cleanHumanReply,
} from './reply-style';

export { reviewFlag };
import {
  waDefaults,
  type WASettings,
  type WAThread,
  type WAMessage,
  type WAConnections,
  type ProviderConnection,
  type CustomerProfile,
  type WAOrder,
  type RegisteredBusiness,
  type TursoUsageStats,
} from './model';
import { createTursoAdapter } from './turso';

const env: any = typeof process !== 'undefined' ? process.env : {};

export class AppError extends Error {
  public status: number;
  public retryable: boolean;
  constructor(
    message: string,
    status = 400,
    retryable = false
  ) {
    super(message);
    this.status = status;
    this.retryable = retryable;
  }
}

// ── Database ────────────────────────────────────────────────────────────

function getTursoConfig(): { url: string; token: string } | null {
  const url = env?.TURSO_DATABASE_URL;
  const token = env?.TURSO_AUTH_TOKEN;
  if (url && token) return { url, token };
  return null;
}

let _db: ReturnType<typeof createTursoAdapter> | null = null;
export function db(): ReturnType<typeof createTursoAdapter> {
  if (_db) return _db;
  const turso = getTursoConfig();
  if (!turso) throw new AppError('Database not configured. Set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN.', 503);
  _db = createTursoAdapter(turso.url, turso.token);
  return _db;
}

// ── Database Init (WhatsApp-specific tables & Multi-Tenant Architecture) ──

export async function initDatabase() {
  const d = db();

  // 1. Business Tenants (Multi-tenant organizations)
  await d.exec(`
    CREATE TABLE IF NOT EXISTS business_tenants (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      owner_name TEXT NOT NULL,
      owner_email TEXT NOT NULL,
      phone TEXT,
      category TEXT,
      tagline TEXT,
      theme_color TEXT DEFAULT '#10b981',
      status TEXT NOT NULL DEFAULT 'active',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);

  // 2. Business Users & Memberships
  await d.exec(`
    CREATE TABLE IF NOT EXISTS business_users (
      id TEXT PRIMARY KEY,
      tenant_id TEXT,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      salt TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);
  await d.exec(`CREATE INDEX IF NOT EXISTS idx_busers_tenant ON business_users(tenant_id)`);
  await d.exec(`CREATE INDEX IF NOT EXISTS idx_busers_email ON business_users(email)`);

  // 3. Auth Sessions (Revocable session tokens)
  await d.exec(`
    CREATE TABLE IF NOT EXISTS auth_sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      tenant_id TEXT,
      role TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      revoked_at INTEGER,
      created_at INTEGER NOT NULL,
      ip TEXT,
      user_agent TEXT
    )
  `);
  await d.exec(`CREATE INDEX IF NOT EXISTS idx_asess_user ON auth_sessions(user_id)`);
  await d.exec(`CREATE INDEX IF NOT EXISTS idx_asess_exp ON auth_sessions(expires_at)`);

  // 4. Tenant Connections (Per-tenant WhatsApp metadata & credentials)
  await d.exec(`
    CREATE TABLE IF NOT EXISTS tenant_connections (
      tenant_id TEXT PRIMARY KEY,
      provider TEXT NOT NULL DEFAULT 'web',
      phone_number_id TEXT,
      waba_id TEXT,
      display_phone_number TEXT,
      quality_rating TEXT,
      device_status TEXT NOT NULL DEFAULT 'disconnected',
      webhook_verified_at INTEGER,
      updated_at INTEGER NOT NULL
    )
  `);

  // 5. Tenant Settings
  await d.exec(`
    CREATE TABLE IF NOT EXISTS tenant_settings (
      tenant_id TEXT PRIMARY KEY,
      payload TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);

  // 6. Tenant Usage & Quotas
  await d.exec(`
    CREATE TABLE IF NOT EXISTS tenant_usage (
      tenant_id TEXT PRIMARY KEY,
      calls INTEGER NOT NULL DEFAULT 0,
      tokens INTEGER NOT NULL DEFAULT 0,
      sent INTEGER NOT NULL DEFAULT 0,
      received INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL
    )
  `);

  // 7. Webhook Idempotency (Prevent replay & duplicates)
  await d.exec(`
    CREATE TABLE IF NOT EXISTS webhook_idempotency (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      received_at INTEGER NOT NULL
    )
  `);
  await d.exec(`CREATE INDEX IF NOT EXISTS idx_wh_idemp_tenant ON webhook_idempotency(tenant_id)`);

  // 8. Tenant Encrypted Credentials
  await d.exec(`
    CREATE TABLE IF NOT EXISTS tenant_credentials (
      tenant_id TEXT NOT NULL,
      key TEXT NOT NULL,
      cipher TEXT NOT NULL,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (tenant_id, key)
    )
  `);

  // 9. Legacy State Table
  await d.exec(`
    CREATE TABLE IF NOT EXISTS wa_state (
      key TEXT PRIMARY KEY,
      payload TEXT NOT NULL
    )
  `);

  // 10. WhatsApp Threads (tenant-scoped)
  await d.exec(`
    CREATE TABLE IF NOT EXISTS wa_threads (
      id TEXT PRIMARY KEY,
      payload TEXT NOT NULL,
      version INTEGER NOT NULL DEFAULT 1,
      updated INTEGER NOT NULL DEFAULT 0,
      tenant_id TEXT NOT NULL DEFAULT 'biz_titan_watches'
    )
  `);
  await d.exec(`CREATE INDEX IF NOT EXISTS idx_wa_threads_tenant ON wa_threads(tenant_id, updated DESC)`);

  // 11. WhatsApp Jobs (tenant-scoped)
  await d.exec(`
    CREATE TABLE IF NOT EXISTS wa_jobs (
      id TEXT PRIMARY KEY,
      thread_id TEXT NOT NULL,
      payload TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      attempts INTEGER NOT NULL DEFAULT 0,
      created INTEGER NOT NULL,
      tenant_id TEXT NOT NULL DEFAULT 'biz_titan_watches'
    )
  `);
  await d.exec(`CREATE INDEX IF NOT EXISTS idx_wa_jobs_tenant ON wa_jobs(tenant_id, status)`);

  // 12. WhatsApp Activity Audit Log (tenant-scoped)
  await d.exec(`
    CREATE TABLE IF NOT EXISTS wa_activity (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      message TEXT NOT NULL,
      created INTEGER NOT NULL,
      tenant_id TEXT NOT NULL DEFAULT 'biz_titan_watches'
    )
  `);
  await d.exec(`CREATE INDEX IF NOT EXISTS idx_wa_activity_tenant ON wa_activity(tenant_id, created DESC)`);

  // 13. WhatsApp Customers (tenant-scoped)
  await d.exec(`
    CREATE TABLE IF NOT EXISTS wa_customers (
      phone TEXT PRIMARY KEY,
      payload TEXT NOT NULL,
      updated INTEGER NOT NULL DEFAULT 0,
      tenant_id TEXT NOT NULL DEFAULT 'biz_titan_watches'
    )
  `);
  await d.exec(`CREATE INDEX IF NOT EXISTS idx_wa_customers_tenant ON wa_customers(tenant_id, phone)`);

  // 14. WhatsApp Orders (tenant-scoped)
  await d.exec(`
    CREATE TABLE IF NOT EXISTS wa_orders (
      id TEXT PRIMARY KEY,
      thread_id TEXT NOT NULL,
      phone TEXT NOT NULL,
      payload TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'confirmed',
      created INTEGER NOT NULL,
      updated INTEGER NOT NULL,
      tenant_id TEXT NOT NULL DEFAULT 'biz_titan_watches'
    )
  `);
  await d.exec(`CREATE INDEX IF NOT EXISTS idx_wa_orders_tenant ON wa_orders(tenant_id, created DESC)`);

  // 15. Encrypted secrets table
  await d.exec(`
    CREATE TABLE IF NOT EXISTS encrypted_secrets (
      key TEXT PRIMARY KEY,
      cipher TEXT NOT NULL
    )
  `);

  // ── Database Schema Migration & Backwards-Compatibility ────────────────
  // Ensure tenant_id column exists on pre-existing tables
  const tablesWithTenant = ['wa_threads', 'wa_jobs', 'wa_activity', 'wa_customers', 'wa_orders'];
  for (const table of tablesWithTenant) {
    try {
      const info = await d.prepare(`PRAGMA table_info("${table}")`).all<{ name: string }>();
      const colNames = (info?.results || []).map((r) => r.name);
      if (!colNames.includes('tenant_id')) {
        await d.exec(`ALTER TABLE "${table}" ADD COLUMN tenant_id TEXT NOT NULL DEFAULT 'biz_titan_watches'`);
      }
    } catch (e: any) {
      console.warn(`[DB Migration] Notice on ${table}:`, e?.message);
    }
  }

  // ── Seed Master Tenant & Initial Account (Titan Watches) ───────────────
  try {
    const existingTenant = await d
      .prepare('SELECT id FROM business_tenants WHERE id = ?')
      .bind('biz_titan_watches')
      .first<{ id: string }>();

    if (!existingTenant) {
      const now = Date.now();
      await d
        .prepare(
          `INSERT INTO business_tenants (id, name, owner_name, owner_email, phone, category, tagline, theme_color, status, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          'biz_titan_watches',
          'Titan Watches',
          'Nina Kurain',
          'nina@ninakurainservices.in',
          '+91 99000 12345',
          'Luxury Watches & Boutique',
          'Timeless Craftsmanship, Modern Innovation',
          '#10b981',
          'active',
          now,
          now
        )
        .run();
    }
  } catch (err: any) {
    console.warn('[DB Seed] business_tenants seed notice:', err?.message);
  }
}

// ── State Management ────────────────────────────────────────────────────

const stateCache = new Map<string, { val: any; exp: number }>();

export async function readState<T>(key: string, fallback: T): Promise<T> {
  const now = Date.now();
  const cached = stateCache.get(key);
  if (cached && cached.exp > now) return cached.val as T;
  const row = await db()
    .prepare('SELECT payload FROM wa_state WHERE key = ?')
    .bind(key)
    .first<{ payload: string }>();
  const res = row ? JSON.parse(row.payload) : fallback;
  stateCache.set(key, { val: res, exp: now + 5000 });
  return res;
}

export async function writeState(key: string, value: unknown) {
  stateCache.delete(key);
  await db()
    .prepare(
      'INSERT INTO wa_state (key,payload) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET payload=excluded.payload'
    )
    .bind(key, JSON.stringify(value))
    .run();
}

// ── Secrets (SHARED with Instagram automation) ──────────────────────────

async function encryptionKey() {
  const value = env?.CREDENTIALS_KEY || '';
  if (!value || !/^[a-f0-9]{64}$/i.test(value))
    throw new AppError('Secure credential storage is not available.', 503);
  const matches = value.match(/../g) || [];
  const bytes = new Uint8Array(matches.map((v: string) => parseInt(v, 16)));
  return crypto.subtle.importKey('raw', bytes, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

export async function saveSecret(key: string, value: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(key) },
      await encryptionKey(),
      new TextEncoder().encode(value)
    )
  );
  const cipher = JSON.stringify({ iv: Array.from(iv), data: Array.from(encrypted) });
  await db()
    .prepare(
      'INSERT INTO encrypted_secrets (key,cipher) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET cipher=excluded.cipher'
    )
    .bind(key, cipher)
    .run();
}

export async function secret(key: string): Promise<string | null> {
  const row = await db()
    .prepare('SELECT cipher FROM encrypted_secrets WHERE key=?')
    .bind(key)
    .first<{ cipher: string }>();
  if (!row) return null;
  const c = JSON.parse(row.cipher);
  return new TextDecoder().decode(
    await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: new Uint8Array(c.iv), additionalData: new TextEncoder().encode(key) },
      await encryptionKey(),
      new Uint8Array(c.data)
    )
  );
}

// ── Settings ────────────────────────────────────────────────────────────

export async function settings(tenantId: string = 'biz_titan_watches'): Promise<WASettings> {
  try {
    const row = await db()
      .prepare('SELECT payload FROM tenant_settings WHERE tenant_id = ?')
      .bind(tenantId)
      .first<{ payload: string }>();
    if (row?.payload) {
      return { ...waDefaults, ...JSON.parse(row.payload) };
    }
  } catch {}
  return { ...waDefaults, ...(await readState<WASettings>('wa_settings', waDefaults)) };
}

export async function saveSettings(s: WASettings, tenantId: string = 'biz_titan_watches'): Promise<void> {
  const d = db();
  const now = Date.now();
  await d
    .prepare(
      `INSERT INTO tenant_settings (tenant_id, payload, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(tenant_id) DO UPDATE SET payload=excluded.payload, updated_at=excluded.updated_at`
    )
    .bind(tenantId, JSON.stringify(s), now)
    .run();

  if (tenantId === 'biz_titan_watches') {
    await writeState('wa_settings', s);
  }
}

// ── Audit Trail ─────────────────────────────────────────────────────────

export async function audit(kind: string, message: string, tenantId: string = 'biz_titan_watches') {
  await db()
    .prepare('INSERT INTO wa_activity (id,kind,message,created,tenant_id) VALUES (?,?,?,?,?)')
    .bind(crypto.randomUUID(), kind, message, Date.now(), tenantId)
    .run();
}

// ── Customer Profiles ───────────────────────────────────────────────────

export async function getCustomerProfile(phone: string, tenantId: string = 'biz_titan_watches'): Promise<CustomerProfile | null> {
  const row = await db()
    .prepare('SELECT payload FROM wa_customers WHERE phone=? AND tenant_id=?')
    .bind(phone, tenantId)
    .first<{ payload: string }>();
  return row ? JSON.parse(row.payload) : null;
}

export async function saveCustomerProfile(profile: CustomerProfile, tenantId: string = 'biz_titan_watches') {
  await db()
    .prepare(
      'INSERT INTO wa_customers (phone,payload,updated,tenant_id) VALUES (?,?,?,?) ON CONFLICT(phone) DO UPDATE SET payload=excluded.payload,updated=excluded.updated,tenant_id=excluded.tenant_id'
    )
    .bind(profile.phone, JSON.stringify(profile), Date.now(), tenantId)
    .run();
}

export async function getOrCreateCustomer(phone: string, name?: string, tenantId: string = 'biz_titan_watches'): Promise<CustomerProfile> {
  let profile = await getCustomerProfile(phone, tenantId);
  if (!profile) {
    profile = {
      name: name || phone,
      phone,
      firstContact: Date.now(),
      lastContact: Date.now(),
      totalMessages: 0,
      tags: [],
      notes: '',
      vip: false,
    };
    await saveCustomerProfile(profile, tenantId);
  }
  return profile;
}

// ── Thread Management ───────────────────────────────────────────────────

export async function getThread(id: string, tenantId: string = 'biz_titan_watches'): Promise<WAThread | null> {
  const row = await db()
    .prepare('SELECT payload,version FROM wa_threads WHERE id=? AND tenant_id=?')
    .bind(id, tenantId)
    .first<{ payload: string; version: number }>();
  if (row) {
    return { ...JSON.parse(row.payload), version: row.version } as WAThread;
  }
  return null;
}

export async function saveThread(t: WAThread, tenantId: string = 'biz_titan_watches') {
  const version = t.version ?? 0;
  const payload = JSON.stringify({ ...t, version: undefined, updated: Date.now() });
  if (version === 0) {
    await db()
      .prepare(
        'INSERT OR IGNORE INTO wa_threads (id,payload,version,updated,tenant_id) VALUES (?,?,1,?,?)'
      )
      .bind(t.id, payload, Date.now(), tenantId)
      .run();
  } else {
    const result = await db()
      .prepare('UPDATE wa_threads SET payload=?,version=version+1,updated=? WHERE id=? AND version=? AND tenant_id=?')
      .bind(payload, Date.now(), t.id, version, tenantId)
      .run();
    if (!result.meta.changes) throw new AppError('Conversation changed. Refresh and try again.', 409);
  }
}

export async function allThreads(tenantId: string = 'biz_titan_watches'): Promise<WAThread[]> {
  const rows = (
    await db()
      .prepare('SELECT payload,version FROM wa_threads WHERE tenant_id=? ORDER BY updated DESC LIMIT 500')
      .bind(tenantId)
      .all<{ payload: string; version: number }>()
  ).results;
  return rows.map((r) => {
    const thread = { ...JSON.parse(r.payload), version: r.version } as WAThread;
    if (thread.deliveryLocation?.raw && /mohommadiya|mohammadiya|shanthinagar|shantinagar/i.test(thread.deliveryLocation.raw)) {
      thread.deliveryLocation.lat = 12.3297;
      thread.deliveryLocation.lng = 76.6792;
      thread.deliveryLocation.pincode = thread.deliveryLocation.pincode || '570019';
      thread.deliveryLocation.city = 'Mysuru';
    }
    return thread;
  });
}

// ── Orders & Delivery Location Hub ─────────────────────────────────────

export async function reconcileOrdersWithThreads(tenantId: string = 'biz_titan_watches'): Promise<void> {
  try {
    const threadRows = (
      await db()
        .prepare('SELECT payload FROM wa_threads WHERE tenant_id=? ORDER BY updated DESC LIMIT 100')
        .bind(tenantId)
        .all<{ payload: string }>()
    ).results;
    if (!threadRows?.length) return;

    const orderRows = (
      await db()
        .prepare('SELECT payload FROM wa_orders WHERE tenant_id=?')
        .bind(tenantId)
        .all<{ payload: string }>()
    ).results;
    const existingOrders = orderRows.map((r) => JSON.parse(r.payload) as WAOrder);

    const s = await settings(tenantId);

    for (const r of threadRows) {
      const thread = JSON.parse(r.payload) as WAThread;

      const fullChat = thread.messages.map((m) => m.text).join('\n');
      const hasConfirmation =
        thread.tags.includes('order_confirmed') ||
        /\b(?:order.*(is|now)?.*confirmed|your order for .* is now confirmed|order has been confirmed|booking confirmed)\b/i.test(fullChat);

      if (!hasConfirmation) continue;

      // Extract orders with high-precision intelligence parser
      const { extractOrdersFromThread } = await import('./order-parser');
      const parsedOrders = extractOrdersFromThread(thread.messages, s.catalog || []);

      const loc = thread.deliveryLocation;
      if (loc?.raw && /mohommadiya|mohammadiya|shanthinagar|shantinagar/i.test(loc.raw)) {
        loc.lat = 12.3297;
        loc.lng = 76.6792;
        loc.pincode = loc.pincode || '570019';
        loc.city = 'Mysuru';
      }
      const isReady = !!(loc && loc.pincode && !loc.pincodeMissing);
      const isUpi = /upi|online|prepaid/i.test(fullChat);

      for (const item of parsedOrders) {
        // Match existing order intelligently by product ID or normalized name and amount
        const norm = (s: string) => (s || '').replace(/\s*\(x\d+\)/gi, '').trim().toLowerCase();
        let order = existingOrders.find(
          (o) =>
            o.threadId === thread.id &&
            (o.productId === item.productId || norm(o.productName) === norm(item.productName)) &&
            Math.abs(o.amount - item.amount) < 10
        );

        const orderCustName = item.customerName !== 'Customer' ? item.customerName : (thread.name || 'Customer');
        const orderCustPhone = item.customerPhone || thread.phone || '';
        const orderLoc = item.deliveryLocation || loc;

        if (order) {
          let updated = false;
          if (orderCustName && order.customerName !== orderCustName) {
            order.customerName = orderCustName;
            updated = true;
          }
          if (orderCustPhone && order.customerPhone !== orderCustPhone) {
            order.customerPhone = orderCustPhone;
            updated = true;
          }
          if (orderLoc && (!order.deliveryLocation || order.deliveryLocation.raw !== orderLoc.raw)) {
            order.deliveryLocation = orderLoc;
            updated = true;
          }
          if (item.items && (!order.items || order.items.length !== item.items.length)) {
            order.items = item.items;
            order.quantity = item.quantity;
            order.subtotal = item.subtotal;
            order.discountAmount = item.discountAmount;
            updated = true;
          }
          if (updated) {
            order.updatedAt = Date.now();
            await saveOrder(order, tenantId);
            console.log(`[WA] 📦 Updated order ${order.id} for ${order.customerName}: ${order.productName} (₹${order.amount})`);
          }
          continue;
        }

        // New distinct confirmed order!
        const orderNum = Math.floor(1000 + Math.random() * 9000);
        const newOrder: WAOrder = {
          id: `ORD-${orderNum}`,
          threadId: thread.id,
          customerName: orderCustName,
          customerPhone: orderCustPhone,
          productName: item.productName,
          productId: item.productId,
          items: item.items,
          quantity: item.quantity,
          subtotal: item.subtotal,
          discountAmount: item.discountAmount,
          amount: item.amount,
          currency: 'INR',
          discountCode: item.discountCode || s.discountCode || 'TITAN10',
          paymentMode: item.paymentMode || (isUpi ? 'UPI' : 'COD'),
          paymentStatus: item.paymentMode === 'UPI' ? 'paid' : 'pending',
          orderStatus: item.orderStatus || (isReady ? 'ready_for_dispatch' : 'confirmed'),
          deliveryLocation: orderLoc,
          courierPartner: 'BlueDart',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };

        await saveOrder(newOrder, tenantId);
        existingOrders.push(newOrder);
        console.log(`[WA] 📦 New order saved: ${newOrder.id} for ${newOrder.customerName} (${newOrder.productName} - ₹${newOrder.amount})`);
        if (!thread.tags.includes('order_confirmed')) {
          thread.tags.push('order_confirmed');
          await saveThread(thread, tenantId);
        }
      }
    }
  } catch (e) {
    console.warn('[WA] Order reconciliation error:', e);
  }
}

export async function allOrders(tenantId: string = 'biz_titan_watches'): Promise<WAOrder[]> {
  await reconcileOrdersWithThreads(tenantId);
  const rows = (
    await db()
      .prepare('SELECT payload FROM wa_orders WHERE tenant_id=? ORDER BY created DESC LIMIT 200')
      .bind(tenantId)
      .all<{ payload: string }>()
  ).results;

  const rawOrders = rows.map((r) => {
    const order = JSON.parse(r.payload) as WAOrder;
    if (order.deliveryLocation?.raw && /mohommadiya|mohammadiya|shanthinagar|shantinagar/i.test(order.deliveryLocation.raw)) {
      order.deliveryLocation.lat = 12.3297;
      order.deliveryLocation.lng = 76.6792;
      order.deliveryLocation.pincode = order.deliveryLocation.pincode || '570019';
      order.deliveryLocation.city = 'Mysuru';
    }
    return order;
  });

  const norm = (s: string) => (s || '').replace(/\s*\(x1\)/gi, '').trim().toLowerCase();
  const uniqueOrders: WAOrder[] = [];
  const duplicateIdsToDelete: string[] = [];

  for (const o of rawOrders) {
    const existing = uniqueOrders.find(
      (u) =>
        u.threadId === o.threadId &&
        (u.productId === o.productId || norm(u.productName) === norm(o.productName)) &&
        Math.abs(u.amount - o.amount) < 10
    );

    if (existing) {
      if (!existing.deliveryLocation?.pincode && o.deliveryLocation?.pincode) {
        existing.deliveryLocation = o.deliveryLocation;
      }
      if (o.paymentMode && existing.paymentMode === 'COD' && o.paymentMode === 'UPI') {
        existing.paymentMode = 'UPI';
        existing.paymentStatus = 'paid';
      }
      duplicateIdsToDelete.push(o.id);
    } else {
      uniqueOrders.push(o);
    }
  }

  if (duplicateIdsToDelete.length > 0) {
    Promise.all(
      duplicateIdsToDelete.map((dupId) =>
        db().prepare('DELETE FROM wa_orders WHERE id=? AND tenant_id=?').bind(dupId, tenantId).run().catch(() => {})
      )
    ).catch(() => {});
  }

  return uniqueOrders;
}

export async function getOrder(id: string, tenantId: string = 'biz_titan_watches'): Promise<WAOrder | null> {
  const row = await db()
    .prepare('SELECT payload FROM wa_orders WHERE id=? AND tenant_id=?')
    .bind(id, tenantId)
    .first<{ payload: string }>();
  return row ? (JSON.parse(row.payload) as WAOrder) : null;
}

export async function saveOrder(order: WAOrder, tenantId: string = 'biz_titan_watches'): Promise<void> {
  await db()
    .prepare(
      'INSERT INTO wa_orders (id,thread_id,phone,payload,status,created,updated,tenant_id) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,status=excluded.status,updated=excluded.updated,tenant_id=excluded.tenant_id'
    )
    .bind(
      order.id,
      order.threadId,
      order.customerPhone,
      JSON.stringify(order),
      order.orderStatus,
      order.createdAt,
      Date.now(),
      tenantId
    )
    .run();
}

export async function deleteOrder(id: string, tenantId: string = 'biz_titan_watches'): Promise<void> {
  await db().prepare('DELETE FROM wa_orders WHERE id=? AND tenant_id=?').bind(id, tenantId).run();
}

// ── Multi-Tenant Business Management ───────────────────────────────────

export async function getAllTenants(): Promise<RegisteredBusiness[]> {
  const d = db();
  const rows = (
    await d
      .prepare('SELECT * FROM business_tenants ORDER BY created_at ASC')
      .all<any>()
  ).results || [];

  const enriched: RegisteredBusiness[] = [];
  for (const r of rows) {
    const [tCnt, oCnt] = await Promise.all([
      d.prepare('SELECT count(*) as c FROM wa_threads WHERE tenant_id = ?').bind(r.id).first<{ c: number }>().catch(() => ({ c: 0 })),
      d.prepare('SELECT count(*) as c FROM wa_orders WHERE tenant_id = ?').bind(r.id).first<{ c: number }>().catch(() => ({ c: 0 })),
    ]);

    enriched.push({
      id: r.id,
      name: r.name,
      ownerName: r.owner_name,
      ownerEmail: r.owner_email,
      phone: r.phone || '',
      category: r.category || 'Retail & Services',
      tagline: r.tagline || '',
      themeColor: r.theme_color || '#10b981',
      createdAt: Number(r.created_at || 0),
      lastActive: Number(r.updated_at || Date.now()),
      deviceStatus: 'connected',
      status: (r.status as any) || 'active',
      threadCount: Number(tCnt?.c || 0),
      orderCount: Number(oCnt?.c || 0),
    });
  }
  return enriched;
}

export async function getTenant(tenantId: string): Promise<RegisteredBusiness | null> {
  const d = db();
  const r = await d
    .prepare('SELECT * FROM business_tenants WHERE id = ?')
    .bind(tenantId)
    .first<any>();
  if (!r) return null;

  return {
    id: r.id,
    name: r.name,
    ownerName: r.owner_name,
    ownerEmail: r.owner_email,
    phone: r.phone || '',
    category: r.category || 'Retail & Services',
    tagline: r.tagline || '',
    themeColor: r.theme_color || '#10b981',
    createdAt: Number(r.created_at || 0),
    lastActive: Number(r.updated_at || Date.now()),
    deviceStatus: 'connected',
    status: (r.status as any) || 'active',
  };
}

export async function updateBusinessTenantStatus(tenantId: string, status: 'active' | 'suspended'): Promise<void> {
  await db()
    .prepare('UPDATE business_tenants SET status = ?, updated_at = ? WHERE id = ?')
    .bind(status, Date.now(), tenantId)
    .run();
}

export async function deleteBusinessTenant(tenantId: string): Promise<void> {
  if (tenantId === 'biz_titan_watches') {
    throw new AppError('Cannot delete primary master tenant (Titan Watches).', 400);
  }
  const d = db();
  await Promise.all([
    d.prepare('DELETE FROM business_tenants WHERE id = ?').bind(tenantId).run(),
    d.prepare('DELETE FROM business_users WHERE tenant_id = ?').bind(tenantId).run(),
    d.prepare('DELETE FROM auth_sessions WHERE tenant_id = ?').bind(tenantId).run(),
    d.prepare('DELETE FROM tenant_settings WHERE tenant_id = ?').bind(tenantId).run(),
    d.prepare('DELETE FROM tenant_connections WHERE tenant_id = ?').bind(tenantId).run(),
    d.prepare('DELETE FROM wa_threads WHERE tenant_id = ?').bind(tenantId).run(),
    d.prepare('DELETE FROM wa_orders WHERE tenant_id = ?').bind(tenantId).run(),
    d.prepare('DELETE FROM wa_customers WHERE tenant_id = ?').bind(tenantId).run(),
    d.prepare('DELETE FROM wa_jobs WHERE tenant_id = ?').bind(tenantId).run(),
    d.prepare('DELETE FROM wa_activity WHERE tenant_id = ?').bind(tenantId).run(),
  ]);
}

// ── Turso DB Storage & Health Monitor ───────────────────────────────────

export async function getTursoStats(): Promise<TursoUsageStats> {
  try {
    const d = db();
    const [tRow, oRow, cRow, jRow, aRow, sRow, bRow, uRow, sessRow] = await Promise.all([
      d.prepare('SELECT count(*) as cnt FROM wa_threads').first<{ cnt: number }>().catch(() => ({ cnt: 0 })),
      d.prepare('SELECT count(*) as cnt FROM wa_orders').first<{ cnt: number }>().catch(() => ({ cnt: 0 })),
      d.prepare('SELECT count(*) as cnt FROM wa_customers').first<{ cnt: number }>().catch(() => ({ cnt: 0 })),
      d.prepare('SELECT count(*) as cnt FROM wa_jobs').first<{ cnt: number }>().catch(() => ({ cnt: 0 })),
      d.prepare('SELECT count(*) as cnt FROM wa_activity').first<{ cnt: number }>().catch(() => ({ cnt: 0 })),
      d.prepare('SELECT count(*) as cnt FROM wa_state').first<{ cnt: number }>().catch(() => ({ cnt: 0 })),
      d.prepare('SELECT count(*) as cnt FROM business_tenants').first<{ cnt: number }>().catch(() => ({ cnt: 0 })),
      d.prepare('SELECT count(*) as cnt FROM business_users').first<{ cnt: number }>().catch(() => ({ cnt: 0 })),
      d.prepare('SELECT count(*) as cnt FROM auth_sessions').first<{ cnt: number }>().catch(() => ({ cnt: 0 })),
    ]);

    const threadsCount = Number(tRow?.cnt || 0);
    const ordersCount = Number(oRow?.cnt || 0);
    const customersCount = Number(cRow?.cnt || 0);
    const jobsCount = Number(jRow?.cnt || 0);
    const activityCount = Number(aRow?.cnt || 0);
    const stateCount = Number(sRow?.cnt || 0);

    const totalRows =
      threadsCount + ordersCount + customersCount + jobsCount + activityCount + stateCount +
      Number(bRow?.cnt || 0) + Number(uRow?.cnt || 0) + Number(sessRow?.cnt || 0);

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

// ── Provider Selection (reads from shared encrypted_secrets & workspace_state)

export async function providerConnections(): Promise<ProviderConnection[]> {
  // 1. Read shared providers from Instagram's workspace_state (key: 'ai_providers')
  let sharedProviders: ProviderConnection[] = [];
  try {
    const row = await db()
      .prepare("SELECT payload FROM workspace_state WHERE key = 'ai_providers'")
      .first<{ payload: string }>();
    if (row?.payload) {
      sharedProviders = JSON.parse(row.payload);
    }
  } catch (err) {
    console.warn('[WA] Could not read shared ai_providers from workspace_state:', err);
  }

  // 2. Read any WhatsApp-specific providers
  const waProviders = await readState<ProviderConnection[]>('wa_providers', []);

  // 3. Also check legacy groq key if exists
  const sharedKey = await db()
    .prepare("SELECT key FROM encrypted_secrets WHERE key='groq_key'")
    .first<{ key: string }>();
  const s = await settings();

  const legacyList = sharedKey
    ? [
        {
          id: 'shared-groq',
          label: 'Shared Groq Key (from Instagram)',
          provider: 'groq' as const,
          model: s.model || 'openai/gpt-oss-120b',
          verified: true,
        },
      ]
    : [];

  return [...sharedProviders, ...waProviders, ...legacyList];
}

export async function selectedProvider(preferredId?: string): Promise<ProviderConnection | undefined> {
  const providers = await providerConnections();
  if (preferredId) {
    const preferred = providers.find((p) => p.id === preferredId && p.verified);
    if (preferred) return preferred;
  }
  const primary = await readState<string>('wa_primary_provider', '');
  if (primary) {
    const p = providers.find((x) => x.id === primary && x.verified);
    if (p) return p;
  }
  // Prefer verified Groq or Gemini (fast for customer support)
  const fast = providers.find((p) => (p.provider === 'groq' || p.provider === 'gemini') && p.verified);
  if (fast) return fast;
  return providers.find((p) => p.verified);
}

export function providerSecretId(id: string): string {
  if (id === 'shared-groq' || id === 'legacy-groq') return 'groq_key';
  return 'provider:' + id;
}

// ── AI Reply Generation ─────────────────────────────────────────────────

export async function generateReply(thread: WAThread, tenantId: string = 'biz_titan_watches'): Promise<string> {
  const s = await settings(tenantId);
  const latestMsg = thread.messages.filter((m) => m.role === 'incoming').at(-1);
  if (!latestMsg) throw new AppError('No message to reply to.');

  const intent = detectIntent(latestMsg.text);
  const sentiment = analyzeSentiment(latestMsg.text);
  thread.sentiment = sentiment;

  // Check for sensitive content
  const flag = reviewFlag(latestMsg.text);
  if (flag) {
    thread.flagged = flag;
    thread.priority = 'urgent';
    return ''; // Don't auto-generate for flagged content
  }

  // Build the prompt
  const systemPrompt = buildSystemPrompt(s, thread, intent);
  const messages = buildConversationMessages(systemPrompt, thread);

  // Get provider
  const provider = await selectedProvider();
  if (!provider) throw new AppError('No AI provider configured.', 412);

  const apiKey = await secret(providerSecretId(provider.id));
  if (!apiKey) throw new AppError('AI provider key not found.', 412);

  const config = providerConfig[provider.provider];
  const body = completionBody(provider.provider, provider.model, messages, 0.6);

  let url: string;
  if (provider.provider === 'aihorde') {
    throw new AppError('AI Horde not supported for WhatsApp (too slow for customer support).', 400);
  } else if (provider.provider === 'cloudflare') {
    const [cfAccount, cfToken] = apiKey.split(':');
    url = `${config.base}/${cfAccount}/ai/v1/chat/completions`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + cfToken },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) throw new AppError(`Provider error (${response.status})`, 502);
    const data: any = await response.json();
    return cleanHumanReply(data.choices?.[0]?.message?.content || '');
  } else {
    url = config.base + '/chat/completions';
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + apiKey },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) throw new AppError(`Provider error (${response.status})`, 502);
    const data: any = await response.json();
    let reply = data.choices?.[0]?.message?.content?.trim() || '';

    // Retry if generic refusal
    if (isGenericRefusal(reply)) {
      const retryBody = {
        ...body,
        temperature: 0.9,
        messages: [
          ...messages,
          {
            role: 'system',
            content:
              'The previous response was a generic AI refusal. You must respond in character as a customer support agent. Never mention being an AI.',
          },
        ],
      };
      const retryResponse = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + apiKey },
        body: JSON.stringify(retryBody),
        signal: AbortSignal.timeout(30000),
      });
      if (retryResponse.ok) {
        const retryData: any = await retryResponse.json();
        const retryReply = retryData.choices?.[0]?.message?.content?.trim() || '';
        if (!isGenericRefusal(retryReply)) reply = retryReply;
      }
    }

    return cleanHumanReply(reply);
  }
}

// ── AI Order Confirmation Feedback Evaluator ──────────────────────────────
export type AIConfirmationFeedback = {
  isConfirmed: boolean;
  productName?: string;
  price?: number;
  paymentMode?: 'COD' | 'UPI';
  reason?: string;
};

export async function queryAIConfirmationFeedback(
  thread: WAThread,
  latestMessage: string
): Promise<AIConfirmationFeedback> {
  try {
    const isAffirmativeRegex = /^(yes|yep|yeah|sure|confirm|proceed|ok|okay|haan|ha|bilkul|kar do|place order|done|book it)\b/i.test((latestMessage || '').trim());

    const provider = await selectedProvider();
    if (!provider) {
      return { isConfirmed: isAffirmativeRegex, reason: 'Provider fallback: regex affirmative check' };
    }

    const apiKey = await secret(providerSecretId(provider.id));
    if (!apiKey) {
      return { isConfirmed: isAffirmativeRegex, reason: 'API key fallback: regex affirmative check' };
    }

    const config = providerConfig[provider.provider];
    if (!config) {
      return { isConfirmed: isAffirmativeRegex, reason: 'Config fallback: regex affirmative check' };
    }

    const recentContext = thread.messages
      .slice(-6)
      .map((m) => `${m.role === 'incoming' ? 'Customer' : 'Nina'}: ${m.text}`)
      .join('\n');

    const evalMessages = [
      {
        role: 'system',
        content: `You are an AI order confirmation evaluator for Titan Watches luxury concierge.
Analyze the conversation history and the customer's latest incoming message.
Determine if the customer is confirming, agreeing to, or placing an order (e.g. saying "yes", "confirm", "proceed", "haan", "ok", "book it", "bhej do", "sure", "ha kar do", "yes please", or agreeing to delivery/payment details).

Respond strictly with a JSON object in this format:
{
  "isConfirmed": true or false,
  "productName": "name of the watch model or null",
  "price": estimated numeric price or null,
  "paymentMode": "COD" or "UPI",
  "reason": "concise explanation of why the customer message confirms or does not confirm the order"
}`,
      },
      {
        role: 'user',
        content: `Recent Conversation Context:\n${recentContext}\n\nCustomer's latest incoming message: "${latestMessage}"\n\nIs the customer confirming or agreeing to place this order? Return JSON only.`,
      },
    ];

    const body = completionBody(provider.provider, provider.model, evalMessages, 0.1);

    let url: string;
    let authHeader: string;
    if (provider.provider === 'cloudflare') {
      const [cfAccount, cfToken] = apiKey.split(':');
      url = `${config.base}/${cfAccount}/ai/v1/chat/completions`;
      authHeader = 'Bearer ' + cfToken;
    } else {
      url = config.base + '/chat/completions';
      authHeader = 'Bearer ' + apiKey;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: authHeader },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(12000),
    });

    if (!response.ok) {
      console.warn(`[WA AI Feedback] Provider HTTP error ${response.status}`);
      return { isConfirmed: isAffirmativeRegex, reason: 'HTTP error fallback' };
    }

    const data: any = await response.json();
    const rawContent = data.choices?.[0]?.message?.content?.trim() || '';
    const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        isConfirmed: !!parsed.isConfirmed,
        productName: parsed.productName || undefined,
        price: typeof parsed.price === 'number' ? parsed.price : undefined,
        paymentMode: parsed.paymentMode === 'UPI' ? 'UPI' : 'COD',
        reason: parsed.reason || 'AI evaluated confirmation',
      };
    }

    return { isConfirmed: isAffirmativeRegex, reason: 'Regex fallback (no JSON found)' };
  } catch (err: any) {
    console.error('[WA AI Feedback] Error querying AI for confirmation feedback:', err?.message || err);
    const isAffirmativeRegex = /^(yes|yep|yeah|sure|confirm|proceed|ok|okay|haan|ha|bilkul|kar do|place order|done|book it)\b/i.test((latestMessage || '').trim());
    return { isConfirmed: isAffirmativeRegex, reason: 'Catch fallback' };
  }
}

// ── WhatsApp Send Message (via Baileys — QR code linked device) ─────────

export async function sendWhatsAppMessage(
  targetJidOrPhone: string,
  text: string,
  tenantId: string = 'biz_titan_watches'
): Promise<{ messageId: string }> {
  // Dynamic import to avoid issues with SSR
  const { getWhatsAppClient } = await import('./whatsapp-client');
  const client = getWhatsAppClient(tenantId);

  if (!client.isConnected()) {
    console.error(`[WA] Cannot send message: client for ${tenantId} is not connected!`);
    throw new AppError('WhatsApp not connected. Scan QR code first.', 412);
  }

  const messageId = await client.sendMessage(targetJidOrPhone, text);
  return { messageId };
}

export async function sendReply(thread: WAThread, text: string, tenantId: string = 'biz_titan_watches'): Promise<void> {
  if (!text) return;

  const target = thread.recipientId || thread.phone;
  console.log(`[WA] sendReply invoked for ${thread.name} (${target}) [${tenantId}]: "${text.slice(0, 40)}..."`);
  const { messageId } = await sendWhatsAppMessage(target, text, tenantId);

  thread.messages.push({
    id: messageId || crypto.randomUUID(),
    role: 'outgoing',
    text,
    at: Date.now(),
  });
  thread.status = 'resolved';
  thread.updated = Date.now();

  // Update customer profile
  const customer = await getOrCreateCustomer(thread.phone, thread.name, tenantId);
  customer.lastContact = Date.now();
  await saveCustomerProfile(customer, tenantId);

  await saveThread(thread, tenantId);
  await audit('Reply sent', `Sent to ${thread.name}: "${text.slice(0, 50)}..."`, tenantId);
}

// ── Connection Status ───────────────────────────────────────────────────

export async function connectionStatus(): Promise<WAConnections> {
  const keys = (
    await db().prepare('SELECT key FROM encrypted_secrets').all<{ key: string }>()
  ).results.map((r) => r.key);

  const providers = await providerConnections();
  const c = await readState<any>('wa_connection', {});

  return {
    providers,
    primaryProviderId: await readState<string>('wa_primary_provider', 'shared-groq'),
    whatsappSaved: keys.includes('wa_access_token'),
    whatsappVerified: !!c.verified,
    aiSaved: providers.length > 0,
    aiVerified: providers.some((p) => p.verified),
    phoneNumberId: c.phoneNumberId,
    businessAccountId: c.businessAccountId,
    displayPhoneNumber: c.displayPhoneNumber,
    webhookVerifiedAt: c.webhookVerifiedAt,
    lastEvent: c.lastEvent,
    receiverSeen: !!c.lastEvent,
  };
}

// ── Error Handler ───────────────────────────────────────────────────────

export function errorResponse(e: unknown) {
  if (e instanceof AppError) {
    return Response.json({ error: e.message }, { status: e.status });
  }
  const message = e instanceof Error ? e.message : 'Unknown error';
  console.error('WhatsApp operation failed:', message);
  return Response.json({ error: message || 'Operation failed. Please try again.' }, { status: 500 });
}

// ── Analytics ───────────────────────────────────────────────────────────

export async function computeAnalytics(tenantId: string = 'biz_titan_watches') {
  const threads = await allThreads(tenantId);
  const now = Date.now();
  const todayStart = new Date().setHours(0, 0, 0, 0);

  const totalConversations = threads.length;
  const activeConversations = threads.filter(
    (t) => t.status !== 'resolved' && t.lastInbound > now - 86400000
  ).length;
  const resolvedToday = threads.filter(
    (t) => t.status === 'resolved' && t.updated > todayStart
  ).length;

  const responseTimes = threads
    .filter((t) => t.responseTimeMs && t.responseTimeMs > 0)
    .map((t) => t.responseTimeMs!);
  const avgResponseTimeMs =
    responseTimes.length > 0
      ? Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length)
      : 0;

  const sentiments = { positive: 0, neutral: 0, negative: 0 };
  for (const t of threads) {
    if (t.sentiment === 'positive') sentiments.positive++;
    else if (t.sentiment === 'negative' || t.sentiment === 'angry') sentiments.negative++;
    else sentiments.neutral++;
  }

  const tagCounts: Record<string, number> = {};
  for (const t of threads) {
    for (const tag of t.tags) {
      tagCounts[tag] = (tagCounts[tag] || 0) + 1;
    }
  }
  const topTags = Object.entries(tagCounts)
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  const hourCounts: Record<number, number> = {};
  for (const t of threads) {
    for (const m of t.messages) {
      if (m.at > now - 86400000) {
        const hour = new Date(m.at).getHours();
        hourCounts[hour] = (hourCounts[hour] || 0) + 1;
      }
    }
  }
  const messageVolume = Array.from({ length: 24 }, (_, h) => ({
    hour: h,
    count: hourCounts[h] || 0,
  }));

  const escalated = threads.filter((t) => t.status === 'escalated').length;
  const escalationRate = totalConversations > 0 ? (escalated / totalConversations) * 100 : 0;

  return {
    totalConversations,
    activeConversations,
    resolvedToday,
    avgResponseTimeMs,
    sentimentBreakdown: sentiments,
    topTags,
    messageVolume,
    customerSatisfaction: 0,
    escalationRate: Math.round(escalationRate * 10) / 10,
  };
}
