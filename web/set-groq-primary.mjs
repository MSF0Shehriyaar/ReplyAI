import { createClient } from '@libsql/client/web';

const c = createClient({
  url: 'libsql://nina-db-nina-kurain.aws-ap-south-1.turso.io',
  authToken: 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3OTE3MzU3NzcsImlkIjoiMDFhMTJiYzUtZDMwMS03YmNkLWIzNzEtZmM4YjZlMGVjMmI3Iiwia2lkIjoiblRoRGlod2lidXpzUUtlLXc5dFZpOVM2c0V4anREdF9KdUdqc180eVlXRSIsInJpZCI6Ijk0N2IyOWI3LWY4MGItNDNjZS1hMzg3LWEyZDA3NTU4OTRkNSJ9.kn49CDDy31Ncew4wcAChlmknhU5pvGYzHWBv-H1VE0fBAFMvQVTtbzE04vhroO_52evsvR3JLEhzNQ5-6VlFDA'
});

// Set Groq as primary provider
await c.execute("UPDATE workspace_state SET payload='\"dab637ec-59ff-410e-87a7-ed0396cb5175\"' WHERE key='primary_provider'");
await c.execute("UPDATE workspace_state SET payload='\"dab637ec-59ff-410e-87a7-ed0396cb5175\"' WHERE key='provider_route_active'");

const routing = {
  shared: true,
  enabled: true,
  order: ["dab637ec-59ff-410e-87a7-ed0396cb5175", "add44617-6787-457d-93c1-0928f1de55e7", "59c44be4-e817-4f2d-8185-b8fafc6ba095"],
  approvedIds: ["dab637ec-59ff-410e-87a7-ed0396cb5175", "add44617-6787-457d-93c1-0928f1de55e7", "59c44be4-e817-4f2d-8185-b8fafc6ba095"]
};
await c.execute({
  sql: "UPDATE workspace_state SET payload=? WHERE key='provider_routing'",
  args: [JSON.stringify(routing)]
});

console.log('Updated primary provider to Groq!');
