import { createClient } from '@libsql/client/web';

const c = createClient({
  url: 'libsql://nina-db-nina-kurain.aws-ap-south-1.turso.io',
  authToken: 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3OTE3MzU3NzcsImlkIjoiMDFhMTJiYzUtZDMwMS03YmNkLWIzNzEtZmM4YjZlMGVjMmI3Iiwia2lkIjoiblRoRGlod2lidXpzUUtlLXc5dFZpOVM2c0V4anREdF9KdUdqc180eVlXRSIsInJpZCI6Ijk0N2IyOWI3LWY4MGItNDNjZS1hMzg3LWEyZDA3NTU4OTRkNSJ9.kn49CDDy31Ncew4wcAChlmknhU5pvGYzHWBv-H1VE0fBAFMvQVTtbzE04vhroO_52evsvR3JLEhzNQ5-6VlFDA'
});

const jobs = await c.execute("SELECT id, thread_id, attempts, created, payload FROM jobs WHERE status='pending' AND attempts >= 5 LIMIT 10");
for (const j of jobs.rows) {
  const p = JSON.parse(j.payload);
  console.log({ id: j.id, thread: j.thread_id, attempts: j.attempts, channel: p.channel, text: p.text, at: new Date(p.at).toLocaleString() });
}

const processing = await c.execute("SELECT id, thread_id, attempts, created, payload FROM jobs WHERE status='processing'");
console.log('\nProcessing count:', processing.rows.length);
for (const j of processing.rows) {
  console.log({ id: j.id, thread: j.thread_id, attempts: j.attempts, created: new Date(Number(j.created)).toLocaleString() });
}
