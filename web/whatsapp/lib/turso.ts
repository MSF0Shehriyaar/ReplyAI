import { createClient, type InStatement } from '@libsql/client';

function adapter(client: Pick<ReturnType<typeof createClient>, 'execute' | 'batch'>) {
  function statement(sql: string, args: unknown[] = []) {
    const query = { sql, args } as InStatement;
    return {
      query,
      bind: (...values: unknown[]) => statement(sql, values),
      async run() { const r = await client.execute(query); return { meta: { changes: r.rowsAffected } }; },
      async first<T>(): Promise<T | null> { const r = await client.execute(query); return (r.rows[0] as T) ?? null; },
      async all<T>(): Promise<{ results: T[] }> { const r = await client.execute(query); return { results: r.rows as T[] }; },
    };
  }
  return {
    prepare: statement,
    async exec(sql: string) { await client.execute(sql); },
    async batch(statements: { query: InStatement }[]) {
      return (await client.batch(statements.map(s => s.query), 'write')).map(r => ({ meta: { changes: r.rowsAffected } }));
    },
  };
}

export function createTursoAdapter(url: string, authToken: string) {
  const client = createClient({ url, authToken });
  return {
    ...adapter(client),
    async transaction<T>(operation: (tx: ReturnType<typeof adapter>) => Promise<T>): Promise<T> {
      const tx = await client.transaction('write');
      try { const result = await operation(adapter(tx)); await tx.commit(); return result; }
      catch (error) { await tx.rollback(); throw error; }
      finally { tx.close(); }
    },
  };
}
