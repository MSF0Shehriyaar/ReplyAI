import type { createTursoAdapter } from './turso';

const definitions: Record<string, { key: string; columns: string }> = {
  wa_threads: { key: 'id', columns: 'id TEXT NOT NULL, payload TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1, updated INTEGER NOT NULL DEFAULT 0' },
  wa_jobs: { key: 'id', columns: "id TEXT NOT NULL, thread_id TEXT NOT NULL, payload TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', attempts INTEGER NOT NULL DEFAULT 0, created INTEGER NOT NULL" },
  wa_activity: { key: 'id', columns: 'id TEXT NOT NULL, kind TEXT NOT NULL, message TEXT NOT NULL, created INTEGER NOT NULL' },
  wa_customers: { key: 'phone', columns: 'phone TEXT NOT NULL, payload TEXT NOT NULL, updated INTEGER NOT NULL DEFAULT 0' },
  wa_orders: { key: 'id', columns: "id TEXT NOT NULL, thread_id TEXT NOT NULL, phone TEXT NOT NULL, payload TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'confirmed', created INTEGER NOT NULL, updated INTEGER NOT NULL" },
  webhook_idempotency: { key: 'id', columns: 'id TEXT NOT NULL, received_at INTEGER NOT NULL' },
};

export async function migrateTenantTables(database: ReturnType<typeof createTursoAdapter>, legacyTenant = process.env.LEGACY_WHATSAPP_TENANT_ID || 'biz_titan_watches') {
  await database.transaction(async tx => {
    for (const [table, definition] of Object.entries(definitions)) {
      const info = (await tx.prepare(`PRAGMA table_info(${table})`).all<{ name: string; pk: number }>()).results;
      const create = (name: string) => `CREATE TABLE ${name} (${definition.columns}, tenant_id TEXT NOT NULL, PRIMARY KEY (tenant_id, ${definition.key}))`;
      if (!info.length) { await tx.exec(create(table)); continue; }
      if (info.find(c => c.name === 'tenant_id')?.pk && info.find(c => c.name === definition.key)?.pk) continue;
      const hasTenant = info.some(c => c.name === 'tenant_id');
      const count = await tx.prepare(`SELECT count(*) AS n FROM ${table}`).first<{ n: number }>();
      if (!hasTenant && count?.n && (!legacyTenant || !/^[a-zA-Z0-9_-]{1,100}$/.test(legacyTenant))) {
        throw new Error('Legacy WhatsApp data requires an explicit LEGACY_WHATSAPP_TENANT_ID ownership mapping before migration.');
      }
      const columns = definition.columns.split(',').map(c => c.trim().split(' ')[0]);
      await tx.exec(create(`${table}_isolated`));
      await tx.prepare(`INSERT INTO ${table}_isolated (${columns.join(',')},tenant_id) SELECT ${columns.join(',')},${hasTenant ? 'tenant_id' : '?'} FROM ${table}`)
        .bind(...(hasTenant ? [] : [legacyTenant || 'biz_titan_watches'])).run();
      await tx.exec(`DROP TABLE ${table}`);
      await tx.exec(`ALTER TABLE ${table}_isolated RENAME TO ${table}`);
    }
    await tx.exec('CREATE INDEX IF NOT EXISTS idx_wa_threads_tenant ON wa_threads(tenant_id,updated DESC)');
    await tx.exec('CREATE INDEX IF NOT EXISTS idx_wa_jobs_tenant ON wa_jobs(tenant_id,status,created)');
    await tx.exec('CREATE INDEX IF NOT EXISTS idx_wa_activity_tenant ON wa_activity(tenant_id,created DESC)');
    await tx.exec('CREATE INDEX IF NOT EXISTS idx_wa_orders_tenant ON wa_orders(tenant_id,created DESC)');
    await tx.exec('CREATE TABLE IF NOT EXISTS queue_leases (tenant_id TEXT NOT NULL, thread_id TEXT NOT NULL, token TEXT NOT NULL, expires_at INTEGER NOT NULL, PRIMARY KEY(tenant_id,thread_id))');
    await tx.exec('CREATE TABLE IF NOT EXISTS outbound_deliveries (tenant_id TEXT NOT NULL, id TEXT NOT NULL, status TEXT NOT NULL, message_id TEXT, created INTEGER NOT NULL, PRIMARY KEY(tenant_id,id))');
    await tx.exec('CREATE TABLE IF NOT EXISTS auth_rate_limits (key TEXT PRIMARY KEY, count INTEGER NOT NULL, reset_at INTEGER NOT NULL)');
    await tx.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_connection_phone_unique ON tenant_connections(phone_number_id) WHERE phone_number_id IS NOT NULL');
  });
}
