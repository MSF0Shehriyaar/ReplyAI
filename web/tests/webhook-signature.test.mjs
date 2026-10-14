import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {verifyWebhookSignature} from '../lib/webhook-signature.ts';

const instagramKey = 'test-instagram-secret';
const metaKey = 'test-parent-secret';
const body = '{ "object":"instagram", "entry":[], "text":"hello 🌿" }\n';
const signature = key => 'sha256=' + createHmac('sha256', key).update(body).digest('hex');
const raw = new TextEncoder().encode(body).buffer;

test('accepts Instagram secret with the different parent secret present', async () => {
  assert.equal(await verifyWebhookSignature(raw, signature(instagramKey), [instagramKey, metaKey]), true);
});
test('preserves parent secret compatibility and accepts either configured key', async () => {
  assert.equal(await verifyWebhookSignature(raw, signature(metaKey), [null, metaKey]), true);
  assert.equal(await verifyWebhookSignature(raw, signature(metaKey), [instagramKey, metaKey]), true);
});
test('rejects wrong keys, missing keys, and any raw body modification', async () => {
  assert.equal(await verifyWebhookSignature(raw, signature(instagramKey), [metaKey]), false);
  assert.equal(await verifyWebhookSignature(raw, signature(instagramKey), []), false);
  assert.equal(await verifyWebhookSignature(body.trim(), signature(instagramKey), [instagramKey]), false);
  assert.equal(await verifyWebhookSignature(body.replace('🌿', 'x'), signature(instagramKey), [instagramKey]), false);
});
test('rejects missing and malformed signatures without throwing', async () => {
  for (const value of [null, '', 'sha256=', 'sha1=' + 'a'.repeat(64), 'sha256=' + 'g'.repeat(64)]) {
    assert.equal(await verifyWebhookSignature(raw, value, [instagramKey]), false);
  }
});
