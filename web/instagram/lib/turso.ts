import { createClient, type Client, type InStatement } from '@libsql/client/web';

export class TursoPreparedStatement {
  public _client: Client;
  public _sql: string;
  public _params: unknown[];

  constructor(client: Client, sql: string, params: unknown[] = []) {
    this._client = client;
    this._sql = sql;
    this._params = params;
  }

  bind(...values: unknown[]) {
    const params = values.length === 1 && Array.isArray(values[0]) ? values[0] : values;
    return new TursoPreparedStatement(this._client, this._sql, params);
  }

  async first<T = unknown>(colName?: string): Promise<T | null> {
    const res = await this._client.execute({ sql: this._sql, args: this._params as any });
    if (!res.rows || res.rows.length === 0) return null;
    const row = res.rows[0];
    if (colName) return ((row as Record<string, unknown>)[colName] ?? null) as T;
    return row as unknown as T;
  }

  async all<T = unknown>(): Promise<{ results: T[]; success: boolean; meta: { changes: number } }> {
    const res = await this._client.execute({ sql: this._sql, args: this._params as any });
    return {
      results: (res.rows || []) as unknown as T[],
      success: true,
      meta: { changes: res.rowsAffected || 0 }
    };
  }

  async run<T = unknown>(): Promise<{ results: T[]; success: boolean; meta: { changes: number } }> {
    const res = await this._client.execute({ sql: this._sql, args: this._params as any });
    return {
      results: (res.rows || []) as unknown as T[],
      success: true,
      meta: { changes: res.rowsAffected || 0 }
    };
  }
}

export class TursoDatabase {
  public client: Client;
  constructor(client: Client) {
    this.client = client;
  }

  prepare(sql: string) {
    return new TursoPreparedStatement(this.client, sql);
  }

  async batch<T = unknown>(statements: TursoPreparedStatement[]) {
    const stmts: InStatement[] = statements.map(s => ({
      sql: s._sql,
      args: s._params as any
    }));
    const results = await this.client.batch(stmts, 'write');
    return results.map(res => ({
      results: (res.rows || []) as unknown as T[],
      success: true,
      meta: { changes: res.rowsAffected || 0 }
    }));
  }

  async exec(sql: string) {
    await this.client.executeMultiple(sql);
    return { count: 1, duration: 0 };
  }
}

let cachedTursoDb: TursoDatabase | null = null;
let cachedTursoClient: Client | null = null;
let lastTursoUrl = '';
let lastTursoToken = '';

export function createTursoAdapter(url: string, authToken: string): TursoDatabase {
  if (cachedTursoDb && lastTursoUrl === url && lastTursoToken === authToken) {
    return cachedTursoDb;
  }
  cachedTursoClient = createClient({ url, authToken });
  cachedTursoDb = new TursoDatabase(cachedTursoClient);
  lastTursoUrl = url;
  lastTursoToken = authToken;
  return cachedTursoDb;
}
