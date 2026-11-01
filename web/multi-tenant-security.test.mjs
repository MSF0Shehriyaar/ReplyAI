import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  hashPassword,
  signSessionToken,
  verifySessionSignature,
} from './whatsapp/lib/session.ts';

test('Multi-Tenant Session & Password Cryptographic Hardening', async () => {
  process.env.SESSION_SIGNING_KEY = 'a1b2c3d4e5f60718293a4b5c6d7e8f901234567890abcdef1234567890abcdef';

  // 1. Password hashing with PBKDF2-SHA256
  const salt = 'unique_salt_123456';
  const hash1 = await hashPassword('SecretP@ssw0rd2026', salt);
  const hash2 = await hashPassword('SecretP@ssw0rd2026', salt);
  const hashDifferent = await hashPassword('DifferentPassword', salt);

  assert.equal(hash1, hash2, 'Identical passwords and salts must produce identical hashes');
  assert.notEqual(hash1, hashDifferent, 'Different passwords must produce distinct hashes');
  assert.equal(typeof hash1, 'string');
  assert.equal(hash1.length, 64, 'SHA-256 PBKDF2 hex output must be 64 characters');

  // 2. Session signing & verification
  const validPayload = {
    jti: 'sess_test_123',
    userId: 'usr_biz_admin_01',
    email: 'admin@auraboutique.com',
    name: 'Aura Owner',
    role: 'business_admin',
    tenantId: 'biz_aura_boutique',
    iat: Date.now(),
    exp: Date.now() + 3600000, // 1 hour in future
  };

  const token = await signSessionToken(validPayload);
  assert.ok(token.includes('.'), 'Token must be in format <payloadB64>.<sigHex>');

  // 3. Forged signature rejection
  const [b64, sig] = token.split('.');
  const forgedToken = `${b64}.${sig.slice(0, -4)}0000`;
  const forgedResult = await verifySessionSignature(forgedToken);
  assert.equal(forgedResult, null, 'Forged token signature must be rejected');

  // 4. Expired token rejection
  const expiredPayload = {
    ...validPayload,
    jti: 'sess_expired',
    iat: Date.now() - 7200000,
    exp: Date.now() - 3600000, // 1 hour in past
  };
  const expiredToken = await signSessionToken(expiredPayload);
  const expiredResult = await verifySessionSignature(expiredToken);
  assert.equal(expiredResult, null, 'Expired session must fail verification');

  // 5. Cross-tenant tampering prevention
  // Attempt to tamper with tenantId in base64 payload without changing signature
  const tamperedPayload = { ...validPayload, tenantId: 'biz_titan_watches' };
  const tamperedB64 = Buffer.from(JSON.stringify(tamperedPayload)).toString('base64url');
  const tamperedToken = `${tamperedB64}.${sig}`;
  const tamperedResult = await verifySessionSignature(tamperedToken);
  assert.equal(tamperedResult, null, 'Tampered tenant ID must fail signature verification');
});
