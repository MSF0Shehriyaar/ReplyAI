// Verify the untouched request bytes with either explicitly configured app key.
// Instagram Login has its own app secret; legacy Meta deliveries may use the parent key.
export async function verifyWebhookSignature(body: string | ArrayBuffer, signature: string | null, secrets: (string | null)[]) {
  if (!signature || !/^sha256=[a-f0-9]{64}$/.test(signature)) return false;
  const digest = Uint8Array.from(signature.slice(7).match(/../g)!, value => parseInt(value, 16));
  const bytes = typeof body === 'string' ? new TextEncoder().encode(body) : new Uint8Array(body);
  for (const secret of new Set(secrets.filter((value): value is string => !!value))) {
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), {name:'HMAC', hash:'SHA-256'}, false, ['verify']);
    if (await crypto.subtle.verify('HMAC', key, digest, bytes)) return true;
  }
  return false;
}
