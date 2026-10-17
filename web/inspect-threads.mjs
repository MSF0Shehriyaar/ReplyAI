import { createClient } from '@libsql/client/web';

const c = createClient({
  url: 'libsql://nina-db-nina-kurain.aws-ap-south-1.turso.io',
  authToken: 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3OTE3MzU3NzcsImlkIjoiMDFhMTJiYzUtZDMwMS03YmNkLWIzNzEtZmM4YjZlMGVjMmI3Iiwia2lkIjoiblRoRGlod2lidXpzUUtlLXc5dFZpOVM2c0V4anREdF9KdUdqc180eVlXRSIsInJpZCI6Ijk0N2IyOWI3LWY4MGItNDNjZS1hMzg3LWEyZDA3NTU4OTRkNSJ9.kn49CDDy31Ncew4wcAChlmknhU5pvGYzHWBv-H1VE0fBAFMvQVTtbzE04vhroO_52evsvR3JLEhzNQ5-6VlFDA'
});

const threads = await c.execute("SELECT id,payload,updated FROM threads ORDER BY updated DESC LIMIT 15");
console.log('--- RECENT THREADS ---');
for (const r of threads.rows) {
  const p = JSON.parse(r.payload);
  console.log(`\nUser: @${p.username} (${p.name}) | Channel: ${p.channel} | Status: ${p.status} | Updated: ${new Date(p.updated).toLocaleString()}`);
  if (p.postContext) console.log(`  Context: ${p.postContext}`);
  if (p.messages && p.messages.length) {
    p.messages.slice(-4).forEach(m => console.log(`  [${m.role}] ${m.text}`));
  }
  if (p.draft) console.log(`  [DRAFT] ${p.draft}`);
}

const activity = await c.execute("SELECT kind,message,created FROM activity ORDER BY created DESC LIMIT 10");
console.log('\n--- RECENT ACTIVITY LOGS ---');
for (const a of activity.rows) {
  console.log(`[${new Date(a.created).toLocaleTimeString()}] ${a.kind}: ${a.message}`);
}


