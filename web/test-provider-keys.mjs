import { createClient } from '@libsql/client/web';

const c = createClient({
  url: 'libsql://nina-db-nina-kurain.aws-ap-south-1.turso.io',
  authToken: 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3OTE3MzU3NzcsImlkIjoiMDFhMTJiYzUtZDMwMS03YmNkLWIzNzEtZmM4YjZlMGVjMmI3Iiwia2lkIjoiblRoRGlod2lidXpzUUtlLXc5dFZpOVM2c0V4anREdF9KdUdqc180eVlXRSIsInJpZCI6Ijk0N2IyOWI3LWY4MGItNDNjZS1hMzg3LWEyZDA3NTU4OTRkNSJ9.kn49CDDy31Ncew4wcAChlmknhU5pvGYzHWBv-H1VE0fBAFMvQVTtbzE04vhroO_52evsvR3JLEhzNQ5-6VlFDA'
});

const keyHex = '4ae125f573abe0392a0de900e8336c39b8984d073a0510b4100d19dd9dfce473';
const matches = keyHex.match(/../g) || [];
const bytes = new Uint8Array(matches.map(v => parseInt(v, 16)));
const cryptoKey = await crypto.subtle.importKey('raw', bytes, 'AES-GCM', false, ['encrypt', 'decrypt']);

async function decrypt(keyName) {
  const row = await c.execute(`SELECT cipher FROM encrypted_secrets WHERE key='${keyName}'`);
  if (!row.rows[0]) return null;
  const cipher = JSON.parse(row.rows[0].cipher);
  return new TextDecoder().decode(await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: new Uint8Array(cipher.iv), additionalData: new TextEncoder().encode(keyName) },
    cryptoKey,
    new Uint8Array(cipher.data)
  ));
}

const groqKey = await decrypt('provider:dab637ec-59ff-410e-87a7-ed0396cb5175');
console.log('Groq Key exists:', !!groqKey, 'starts with:', groqKey?.slice(0, 8));

const cfKey = await decrypt('provider:add44617-6787-457d-93c1-0928f1de55e7');
console.log('Cloudflare Key exists:', !!cfKey, 'starts with:', cfKey?.slice(0, 8));

const hordeKey = await decrypt('provider:59c44be4-e817-4f2d-8185-b8fafc6ba095');
console.log('Horde Key exists:', !!hordeKey, 'starts with:', hordeKey?.slice(0, 8));

// Test Groq directly
console.log('\nTesting Groq completion...');
const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer ' + groqKey,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    model: 'openai/gpt-oss-120b',
    messages: [{ role: 'user', content: 'Say hi sweet' }],
    max_tokens: 50
  })
});
console.log('Groq status:', groqRes.status);
const groqData = await groqRes.json();
console.log('Groq reply:', groqData?.choices?.[0]?.message?.content || groqData);
