import { createClient } from '@libsql/client/web';

const c = createClient({
  url: 'libsql://nina-db-nina-kurain.aws-ap-south-1.turso.io',
  authToken: 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3OTE3MzU3NzcsImlkIjoiMDFhMTJiYzUtZDMwMS03YmNkLWIzNzEtZmM4YjZlMGVjMmI3Iiwia2lkIjoiblRoRGlod2lidXpzUUtlLXc5dFZpOVM2c0V4anREdF9KdUdqc180eVlXRSIsInJpZCI6Ijk0N2IyOWI3LWY4MGItNDNjZS1hMzg3LWEyZDA3NTU4OTRkNSJ9.kn49CDDy31Ncew4wcAChlmknhU5pvGYzHWBv-H1VE0fBAFMvQVTtbzE04vhroO_52evsvR3JLEhzNQ5-6VlFDA'
});

const res = await c.execute("SELECT status, attempts, count(*) as count FROM jobs GROUP BY status, attempts");
console.log('Jobs status & attempts:');
for (const r of res.rows) {
  console.log(`- status: ${r.status}, attempts: ${r.attempts} -> ${r.count} jobs`);
}

const unpickable = await c.execute("SELECT count(*) as count FROM jobs WHERE status='pending' AND attempts >= 5");
console.log(`\nPending jobs with attempts >= 5 (BLOCKED): ${unpickable.rows[0].count}`);

const pickable = await c.execute("SELECT count(*) as count FROM jobs WHERE status='pending' AND attempts < 5");
console.log(`Pending jobs with attempts < 5 (PICKABLE): ${pickable.rows[0].count}`);
