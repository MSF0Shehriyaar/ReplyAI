import { createClient } from '@libsql/client/web';

const c = createClient({
  url: 'libsql://nina-db-nina-kurain.aws-ap-south-1.turso.io',
  authToken: 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3OTE3MzU3NzcsImlkIjoiMDFhMTJiYzUtZDMwMS03YmNkLWIzNzEtZmM4YjZlMGVjMmI3Iiwia2lkIjoiblRoRGlod2lidXpzUUtlLXc5dFZpOVM2c0V4anREdF9KdUdqc180eVlXRSIsInJpZCI6Ijk0N2IyOWI3LWY4MGItNDNjZS1hMzg3LWEyZDA3NTU4OTRkNSJ9.kn49CDDy31Ncew4wcAChlmknhU5pvGYzHWBv-H1VE0fBAFMvQVTtbzE04vhroO_52evsvR3JLEhzNQ5-6VlFDA'
});

const primary = await c.execute("SELECT payload FROM workspace_state WHERE key='primary_provider'");
console.log('primary_provider:', primary.rows[0]?.payload);

const routing = await c.execute("SELECT payload FROM workspace_state WHERE key='provider_routing'");
console.log('provider_routing:', routing.rows[0]?.payload);

const aiProviders = await c.execute("SELECT payload FROM workspace_state WHERE key='ai_providers'");
console.log('ai_providers:', aiProviders.rows[0]?.payload);

const secrets = await c.execute("SELECT key FROM encrypted_secrets");
console.log('Secret keys:', secrets.rows.map(r => r.key));
