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
import { migrateTenantTables } from './tenant-migration';
import { RequestError } from './request-security';
import {missingBusinessProfile} from './business-profile';
import {OWNER_WORKSPACE_ID,ownerWhatsAppSettings} from './owner-workspace';

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

let initialization: Promise<void> | undefined;
export async function initDatabase() {
  if (!initialization) initialization = initializeDatabase().catch(error => { initialization = undefined; throw error; });
  return initialization;
}
async function initializeDatabase() {
  const d = db();
  await d.exec('CREATE TABLE IF NOT EXISTS workspace_state(key TEXT PRIMARY KEY,payload TEXT NOT NULL)');
  await d.exec('CREATE TABLE IF NOT EXISTS tenant_daily_usage(tenant_id TEXT NOT NULL,day TEXT NOT NULL,calls INTEGER NOT NULL DEFAULT 0,tokens INTEGER NOT NULL DEFAULT 0,sent INTEGER NOT NULL DEFAULT 0,received INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(tenant_id,day))');
  await d.exec('CREATE TABLE IF NOT EXISTS whatsapp_number_owners(phone TEXT PRIMARY KEY,tenant_id TEXT NOT NULL UNIQUE,updated_at INTEGER NOT NULL)');
  await d.exec('CREATE TABLE IF NOT EXISTS auto_rule_daily(tenant_id TEXT NOT NULL,rule_id TEXT NOT NULL,day TEXT NOT NULL,uses INTEGER NOT NULL,PRIMARY KEY(tenant_id,rule_id,day))');
  await d.exec('CREATE TABLE IF NOT EXISTS auto_rule_threads(tenant_id TEXT NOT NULL,rule_id TEXT NOT NULL,thread_id TEXT NOT NULL,last_used INTEGER NOT NULL,PRIMARY KEY(tenant_id,rule_id,thread_id))');

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
  const sessionColumns=(await d.prepare('PRAGMA table_info(auth_sessions)').all<{name:string}>()).results;
  if(!sessionColumns.some(column=>column.name==='last_seen_at')) {
    try {await d.exec('ALTER TABLE auth_sessions ADD COLUMN last_seen_at INTEGER');}
    catch(error) {if(!(await d.prepare('PRAGMA table_info(auth_sessions)').all<{name:string}>()).results.some(column=>column.name==='last_seen_at'))throw error;}
  }

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

  await migrateTenantTables(d);

  // 15. Encrypted secrets table
  await d.exec(`
    CREATE TABLE IF NOT EXISTS encrypted_secrets (
      key TEXT PRIMARY KEY,
      cipher TEXT NOT NULL
    )
  `);

  await d.exec(`CREATE TABLE IF NOT EXISTS catalog_publications(tenant_id TEXT PRIMARY KEY,slug TEXT UNIQUE,published INTEGER NOT NULL DEFAULT 0,updated_at INTEGER NOT NULL)`);
  await d.exec(`CREATE TABLE IF NOT EXISTS catalog_checkouts(id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL,reference_hash TEXT UNIQUE NOT NULL,customer_hash TEXT NOT NULL,request_key TEXT NOT NULL,fingerprint TEXT NOT NULL,items TEXT NOT NULL,address_cipher TEXT NOT NULL,amount REAL NOT NULL,currency TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'pending_chat',created_at INTEGER NOT NULL,expires_at INTEGER NOT NULL,order_id TEXT,UNIQUE(tenant_id,request_key))`);
  await d.exec('CREATE INDEX IF NOT EXISTS idx_catalog_checkout_tenant ON catalog_checkouts(tenant_id,status,expires_at)');
  await d.exec('CREATE INDEX IF NOT EXISTS idx_catalog_checkout_expiry ON catalog_checkouts(status,expires_at)');

  // Private owner setup. Sample businesses belong only in the standalone demo.
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
          'Nina Kurain',
          'Nina Kurain',
          'insta.ninak12@gmail.com',
          '',
          'Creator & community conversations',
          'Thoughtful conversations, in my own voice.',
          '#6550c8',
          'active',
          now,
          now
        )
        .run();
      const row=await d.prepare('SELECT payload FROM workspace_state WHERE key=?').bind('settings').first<{payload:string}>();
      const profile=ownerWhatsAppSettings(row?JSON.parse(row.payload):{});
      await d.prepare('INSERT OR IGNORE INTO tenant_settings(tenant_id,payload,updated_at) VALUES (?,?,?)').bind(OWNER_WORKSPACE_ID,JSON.stringify(profile),now).run();
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

export function freshBusinessSettings(name = 'My business'): WASettings {
  return {...structuredClone(waDefaults),enabled:false,approval:true,tone:'friendly',language:'auto',emoji:0,playfulness:0,humanDelay:false,typingIndicator:false,personalReplyDelaySeconds:0,groupReplyDelaySeconds:0,dailyLimit:100,businessName:name,industry:'',businessDescription:'',tagline:'',website:'',storeAddress:'',supportEmail:'',supportPhone:'',discountCode:'',discountOffer:'',shippingPolicy:'',warrantyPolicy:'',returnPolicy:'',paymentMethods:'',catalog:[],quickReplies:[],autoReplyRules:[],escalationRules:[],instructions:'',knowledge:'',examples:[],welcomeMessage:'Welcome! How can we help?',awayMessage:'We will respond during business hours.',closingMessage:'Thank you for contacting us.',profile:{name:'Support',role:'Customer support',bio:'',denyAi:false,gender:'neutral'}};
}
export async function settings(tenantId: string = 'biz_titan_watches'): Promise<WASettings> {
  const row = await db().prepare('SELECT payload FROM tenant_settings WHERE tenant_id=?').bind(tenantId).first<{payload:string}>();
  if (row) return {...freshBusinessSettings(),...JSON.parse(row.payload)};
  if (tenantId === OWNER_WORKSPACE_ID) return ownerWhatsAppSettings();
  return freshBusinessSettings();
}
export async function assertActiveTenant(tenantId: string) {
  const tenant = await db().prepare('SELECT status FROM business_tenants WHERE id=?').bind(tenantId).first<{status:string}>();
  if (!tenant || tenant.status !== 'active') throw new AppError('Business is unavailable or suspended.',403);
}

export async function saveTenantSecret(tenantId: string,key: string,value: string) {
  const iv=crypto.getRandomValues(new Uint8Array(12));
  const encrypted=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:new TextEncoder().encode(tenantId+':'+key)},await encryptionKey(),new TextEncoder().encode(value)));
  await db().prepare('INSERT INTO tenant_credentials(tenant_id,key,cipher,updated_at) VALUES (?,?,?,?) ON CONFLICT(tenant_id,key) DO UPDATE SET cipher=excluded.cipher,updated_at=excluded.updated_at')
    .bind(tenantId,key,JSON.stringify({iv:Array.from(iv),data:Array.from(encrypted)}),Date.now()).run();
}
export async function tenantSecret(tenantId: string,key: string): Promise<string|null> {
  const row=await db().prepare('SELECT cipher FROM tenant_credentials WHERE tenant_id=? AND key=?').bind(tenantId,key).first<{cipher:string}>();
  if (!row) return secret(key+'_'+tenantId); // Upgrade keys that were already explicitly scoped.
  const c=JSON.parse(row.cipher);
  return new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:new Uint8Array(c.iv),additionalData:new TextEncoder().encode(tenantId+':'+key)},await encryptionKey(),new Uint8Array(c.data)));
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
      'INSERT INTO wa_customers (phone,payload,updated,tenant_id) VALUES (?,?,?,?) ON CONFLICT(tenant_id,phone) DO UPDATE SET payload=excluded.payload,updated=excluded.updated'
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
    const inserted = await db()
      .prepare(
        'INSERT OR IGNORE INTO wa_threads (id,payload,version,updated,tenant_id) VALUES (?,?,1,?,?)'
      )
      .bind(t.id, payload, Date.now(), tenantId)
      .run();
    if (!inserted.meta.changes) throw new AppError('Conversation changed. Refresh and try again.',409);
    t.version = 1;
  } else {
    const result = await db()
      .prepare('UPDATE wa_threads SET payload=?,version=version+1,updated=? WHERE id=? AND version=? AND tenant_id=?')
      .bind(payload, Date.now(), t.id, version, tenantId)
      .run();
    if (!result.meta.changes) throw new AppError('Conversation changed. Refresh and try again.', 409);
    t.version = version + 1;
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
    return thread;
  });
}

// ── Orders & Delivery Location Hub ─────────────────────────────────────

// Orders are created by explicit checkout confirmation or an authorized operator.
// Reads must never infer, create, merge or delete purchases.
export async function allOrders(tenantId:string='biz_titan_watches'):Promise<WAOrder[]>{
  const rows=(await db().prepare('SELECT payload FROM wa_orders WHERE tenant_id=? ORDER BY created DESC LIMIT 200').bind(tenantId).all<{payload:string}>()).results;
  return rows.map(row=>JSON.parse(row.payload) as WAOrder);
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
      'INSERT INTO wa_orders (id,thread_id,phone,payload,status,created,updated,tenant_id) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(tenant_id,id) DO UPDATE SET thread_id=excluded.thread_id,phone=excluded.phone,payload=excluded.payload,status=excluded.status,updated=excluded.updated'
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
      .prepare("SELECT * FROM business_tenants WHERE status!='deleted' ORDER BY created_at ASC")
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

export async function updateBusinessTenantStatus(tenantId: string,status:'active'|'suspended') {
  await db().transaction(async tx=>{
    const changed=await tx.prepare("UPDATE business_tenants SET status=?,updated_at=? WHERE id=? AND status!='deleted'").bind(status,Date.now(),tenantId).run();
    if(!changed.meta.changes) throw new AppError('Business not found.',404);
    if(status==='suspended') await tx.prepare('UPDATE auth_sessions SET revoked_at=? WHERE tenant_id=?').bind(Date.now(),tenantId).run();
  });
  if(status==='suspended') {
    const {getWhatsAppClient}=await import('./whatsapp-client');
    await getWhatsAppClient(tenantId).disconnect();
  }
}
export async function deleteBusinessTenant(tenantId:string) {
  if(tenantId==='biz_titan_watches') throw new AppError('Cannot delete primary master tenant.',400);
  await updateBusinessTenantStatus(tenantId,'suspended');
  // Retain history and the audit trail; prevent old tokens or workers from resurrecting a deleted tenant.
  await db().prepare("UPDATE business_tenants SET status='deleted',updated_at=? WHERE id=?").bind(Date.now(),tenantId).run();
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

export async function providerConnections(tenantId: string = 'biz_titan_watches'): Promise<ProviderConnection[]> {
  // The administrator supplies the shared pool to every business. Keys never leave the server.
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
  const s = await settings(tenantId);
  let instagramVerified=false;
  let legacyModel='openai/gpt-oss-120b';
  try {const row=await db().prepare("SELECT payload FROM workspace_state WHERE key='connection'").first<{payload:string}>(); instagramVerified=!!(row&&JSON.parse(row.payload).aiVerified);}catch{}
  try {const row=await db().prepare("SELECT payload FROM workspace_state WHERE key='settings'").first<{payload:string}>();legacyModel=(row&&JSON.parse(row.payload).model)||legacyModel;}catch{}

  const legacyList = sharedKey
    ? [
        {
          id: 'legacy-groq',
          label: 'Shared Groq Key (from Instagram)',
          provider: 'groq' as const,
          model: legacyModel,
          verified: instagramVerified,
        },
      ]
    : [];

  const pool=[...sharedProviders,...waProviders,...legacyList];
  const ownKey=!pool.some(p=>p.verified)?await tenantSecret(tenantId,'groq_key'):null;
  if(!pool.some(p=>p.verified)&&ownKey)pool.push({id:'tenant-groq',label:'Business AI',provider:'groq',model:s.model,verified:true});
  return Array.from(new Map(pool.map(p=>[p.id,p])).values());
}

export async function selectedProvider(preferredId?: string, tenantId: string = 'biz_titan_watches'): Promise<ProviderConnection | undefined> {
  const providers = await providerConnections(tenantId);
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
  await assertActiveTenant(tenantId);
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
  const publication=await (await import('./catalog-publication')).catalogPublication(tenantId);
  const systemPrompt = buildSystemPrompt(s, thread, intent, tenantId,publication.published?publication.url:'');
  const messages = buildConversationMessages(systemPrompt, thread);

  const {completeBusinessAI}=await import('./shared-ai');
  const result=await completeBusinessAI(tenantId,messages,0.6);
  return cleanHumanReply(result,s.profile.gender);
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
  latestMessage: string,
  tenantId: string = 'biz_titan_watches'
): Promise<AIConfirmationFeedback> {
  try {
    const isAffirmativeRegex = /^(yes|yep|yeah|sure|confirm|proceed|ok|okay|haan|ha|bilkul|kar do|place order|done|book it)\b/i.test((latestMessage || '').trim());

    const recentContext = thread.messages
      .slice(-6)
      .map((m) => `${m.role === 'incoming' ? 'Customer' : 'Nina'}: ${m.text}`)
      .join('\n');

    const evalMessages = [
      {
        role: 'system',
        content: `You evaluate order confirmation for this business. Only assess the supplied conversation; never invent product, payment or delivery facts.
Analyze the conversation history and the customer's latest incoming message.
Determine if the customer is confirming, agreeing to, or placing an order (e.g. saying "yes", "confirm", "proceed", "haan", "ok", "book it", "bhej do", "sure", "ha kar do", "yes please", or agreeing to delivery/payment details).

Respond strictly with a JSON object in this format:
{
  "isConfirmed": true or false,
  "productName": "product name or null",
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

    const {completeBusinessAI}=await import('./shared-ai');
    const rawContent=await completeBusinessAI(tenantId,evalMessages,0.1);

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
  await assertActiveTenant(tenantId);
  const conn=await db().prepare('SELECT provider,phone_number_id FROM tenant_connections WHERE tenant_id=?').bind(tenantId).first<{provider:string;phone_number_id:string}>();
  if(conn?.provider==='cloud') {
    const token=await tenantSecret(tenantId,'wa_access_token');
    if(!token) throw new AppError('WhatsApp access token is missing.',412);
    const version=(await settings(tenantId)).graphVersion || 'v21.0';
    const response=await fetch('https://graph.facebook.com/'+version+'/'+conn.phone_number_id+'/messages',{
      method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},
      body:JSON.stringify({messaging_product:'whatsapp',to:targetJidOrPhone.replace(/@.*$/,'').replace(/[^0-9]/g,''),type:'text',text:{body:text}}),
      signal:AbortSignal.timeout(30000)
    });
    if(!response.ok) throw new AppError('WhatsApp delivery failed. Verify provider delivery status before retrying.',502);
    const data:any=await response.json();
    if(!data.messages?.[0]?.id) throw new AppError('WhatsApp delivery status is uncertain.',502);
    return {messageId:data.messages[0].id};
  }
  const { getWhatsAppClient } = await import('./whatsapp-client');
  const client = getWhatsAppClient(tenantId);
  if (!client.isConnected()) throw new AppError('WhatsApp not connected. Scan QR code first.',412);
  return {messageId:await client.sendMessage(targetJidOrPhone,text)};
}

export async function sendReply(thread: WAThread, text: string, tenantId: string = 'biz_titan_watches',automatic=false): Promise<void> {
  if (!text) return;

  const target = thread.recipientId || thread.phone;
  console.log(`[WA] sendReply invoked for ${thread.name} (${target}) [${tenantId}]: "${text.slice(0, 40)}..."`);
  await assertActiveTenant(tenantId);
  const fingerprint=JSON.stringify([thread.id,thread.messages.filter(m=>m.role==='incoming').at(-1)?.id || thread.lastInbound,text]);
  const deliveryId=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(fingerprint)))).map(b=>b.toString(16).padStart(2,'0')).join('');
  const config=automatic?await settings(tenantId):null;
  if(config) {
    const latest=await getThread(thread.id,tenantId);
    if(!config.enabled||missingBusinessProfile(config).length||latest?.takeover||latest?.ai===false||(thread.channel==='group'&&!config.groupChats)||(thread.channel==='personal'&&!config.personalChats))throw new AppError('Automation permissions changed. Review this conversation before replying.',409);
    if(config.approval) {
      thread.draft=text;thread.status='review';await saveThread(thread,tenantId);
      await audit('Reply held for approval','Automation approval was enabled before delivery.',tenantId);
      return;
    }
  }
  const limit=config?.dailyLimit??Infinity;
  const reservation=await db().transaction(async tx=>{
    const existing=await tx.prepare('SELECT id FROM outbound_deliveries WHERE tenant_id=? AND id=?').bind(tenantId,deliveryId).first();
    if(existing)return {meta:{changes:0}};
    if(automatic) {
      const dayStart=new Date().setUTCHours(0,0,0,0);
      const count=await tx.prepare("SELECT count(*) AS n FROM outbound_deliveries WHERE tenant_id=? AND created>=?").bind(tenantId,dayStart).first<{n:number}>();
      if(Number(count?.n||0)>=limit)throw new AppError('Daily reply limit reached. Review the conversation or increase this business’s limit.',429);
    }
    return tx.prepare("INSERT OR IGNORE INTO outbound_deliveries(tenant_id,id,status,created) VALUES (?,?,'sending',?)").bind(tenantId,deliveryId,Date.now()).run();
  });
  let messageId:string;
  if(!reservation.meta.changes) {
    const previous=await db().prepare('SELECT status,message_id FROM outbound_deliveries WHERE tenant_id=? AND id=?').bind(tenantId,deliveryId).first<{status:string;message_id:string}>();
    if(previous?.status!=='sent') throw new AppError('Delivery is uncertain. Check WhatsApp before sending again.',409);
    messageId=previous.message_id;
  } else {
    try {
      ({messageId}=await sendWhatsAppMessage(target,text,tenantId));
      await db().prepare("UPDATE outbound_deliveries SET status='sent',message_id=? WHERE tenant_id=? AND id=?").bind(messageId,tenantId,deliveryId).run();
      await db().prepare('INSERT INTO tenant_usage(tenant_id,sent,updated_at) VALUES (?,1,?) ON CONFLICT(tenant_id) DO UPDATE SET sent=sent+1,updated_at=excluded.updated_at').bind(tenantId,Date.now()).run();
      await db().prepare('INSERT INTO tenant_daily_usage(tenant_id,day,sent) VALUES (?,?,1) ON CONFLICT(tenant_id,day) DO UPDATE SET sent=sent+1').bind(tenantId,new Date().toISOString().slice(0,10)).run();
    } catch(error) {
      await db().prepare("UPDATE outbound_deliveries SET status='uncertain' WHERE tenant_id=? AND id=?").bind(tenantId,deliveryId).run();
      thread.status='review'; thread.draft=text; thread.flagged='Delivery uncertain — check WhatsApp before sending again.';
      await saveThread(thread,tenantId);
      throw error;
    }
  }

  if (!thread.messages.some(m=>m.id===messageId)) thread.messages.push({
    id: messageId || crypto.randomUUID(),
    role: 'outgoing',
    text,
    at: Date.now(),
  });
  thread.status = 'resolved';
  thread.draft = '';
  thread.updated = Date.now();

  // Update customer profile
  const customer = await getOrCreateCustomer(thread.phone, thread.name, tenantId);
  customer.lastContact = Date.now();
  await saveCustomerProfile(customer, tenantId);

  await saveThread(thread, tenantId);
  await audit('Reply sent', `Sent to ${thread.name}: "${text.slice(0, 50)}..."`, tenantId);
}

// ── Connection Status ───────────────────────────────────────────────────

export async function connectionStatus(tenantId: string = 'biz_titan_watches'): Promise<WAConnections> {
  const providers = await providerConnections(tenantId);
  const conn = await db().prepare('SELECT * FROM tenant_connections WHERE tenant_id=?').bind(tenantId).first<any>();
  const {getWhatsAppClient} = await import('./whatsapp-client');
  const client = getWhatsAppClient(tenantId);
  return {providers,primaryProviderId:providers[0]?.id || '',whatsappSaved:!!conn?.phone_number_id || client.isConnected(),whatsappVerified:client.isConnected() || !!conn?.phone_number_id,aiSaved:providers.length>0,aiVerified:providers.some(p=>p.verified),phoneNumberId:conn?.phone_number_id,displayPhoneNumber:client.getConnectedPhone() || conn?.display_phone_number,receiverSeen:!!conn?.webhook_verified_at,webhookVerifiedAt:conn?.webhook_verified_at};
}

// ── Error Handler ───────────────────────────────────────────────────────

export function errorResponse(e: unknown) {
  if (e instanceof AppError || e instanceof RequestError) {
    return Response.json({ error: e.message }, { status: e.status });
  }
  const message = e instanceof Error ? e.message : 'Unknown error';
  console.error('WhatsApp operation failed:', message);
  return Response.json({ error: 'Operation failed. Please try again.' }, { status: 500 });
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
