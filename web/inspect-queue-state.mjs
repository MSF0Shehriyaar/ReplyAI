import { createClient } from '@libsql/client/web';

const c = createClient({
  url: 'libsql://nina-db-nina-kurain.aws-ap-south-1.turso.io',
  authToken: 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3OTE3MzU3NzcsImlkIjoiMDFhMTJiYzUtZDMwMS03YmNkLWIzNzEtZmM4YjZlMGVjMmI3Iiwia2lkIjoiblRoRGlod2lidXpzUUtlLXc5dFZpOVM2c0V4anREdF9KdUdqc180eVlXRSIsInJpZCI6Ijk0N2IyOWI3LWY4MGItNDNjZS1hMzg3LWEyZDA3NTU4OTRkNSJ9.kn49CDDy31Ncew4wcAChlmknhU5pvGYzHWBv-H1VE0fBAFMvQVTtbzE04vhroO_52evsvR3JLEhzNQ5-6VlFDA'
});

const s = await c.execute("SELECT payload FROM workspace_state WHERE key='settings'");
console.log('Settings:', JSON.parse(s.rows[0].payload));

const jobsByAttempts = await c.execute("SELECT status, attempts, count(id) as c FROM jobs GROUP BY status, attempts");
console.log('Jobs by status & attempts:', jobsByAttempts.rows);

const readyJobs = await c.execute(`SELECT id, thread_id, status, attempts, created FROM jobs WHERE status='pending' AND attempts < 5 AND created <= ${Date.now()} LIMIT 10`);
console.log('Ready to process right now (attempts < 5, created <= now):', readyJobs.rows);

const blockedAttempts = await c.execute("SELECT count(id) as count FROM jobs WHERE status='pending' AND attempts >= 5");
console.log('Pending but blocked by attempts >= 5:', blockedAttempts.rows[0].count);

const blockedFuture = await c.execute(`SELECT count(id) as count FROM jobs WHERE status='pending' AND created > ${Date.now()}`);
console.log('Pending but scheduled in future:', blockedFuture.rows[0].count);
