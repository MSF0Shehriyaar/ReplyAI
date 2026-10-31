// ─── WhatsApp Automation — Turso Database Adapter ───────────────────────
// Connects to the SAME Turso database as the Instagram automation.
// Uses a separate key prefix (wa_*) to avoid data collisions.

import { createClient } from '@libsql/client';

export function createTursoAdapter(url: string, authToken: string) {
  const client = createClient({ url, authToken });

  return {
    prepare(sql: string) {
      return {
        bind(...args: unknown[]) {
          return {
            async run() {
              const result = await client.execute({ sql, args: args as any[] });
              return { meta: { changes: result.rowsAffected } };
            },
            async first<T>(): Promise<T | null> {
              const result = await client.execute({ sql, args: args as any[] });
              return (result.rows[0] as T) ?? null;
            },
            async all<T>(): Promise<{ results: T[] }> {
              const result = await client.execute({ sql, args: args as any[] });
              return { results: result.rows as T[] };
            },
          };
        },
        async run() {
          const result = await client.execute(sql);
          return { meta: { changes: result.rowsAffected } };
        },
        async first<T>(): Promise<T | null> {
          const result = await client.execute(sql);
          return (result.rows[0] as T) ?? null;
        },
        async all<T>(): Promise<{ results: T[] }> {
          const result = await client.execute(sql);
          return { results: result.rows as T[] };
        },
      };
    },
    async batch(statements: ReturnType<typeof this.prepare extends (...args: any[]) => infer R ? () => R : never>[]) {
      // Execute statements sequentially for compatibility
      const results = [];
      for (const stmt of statements as any[]) {
        try {
          results.push(await stmt.run());
        } catch {
          results.push({ meta: { changes: 0 } });
        }
      }
      return results;
    },
    async exec(sql: string) {
      await client.execute(sql);
    },
  };
}
