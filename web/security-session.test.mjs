import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validOwnerSession } from './instagram/lib/owner-session.ts';

test('owner sessions fail closed and reject forgery and expiry', async () => {
  process.env.SESSION_SIGNING_KEY = 'a'.repeat(48);
  assert.equal(await validOwnerSession(undefined), false);
  assert.equal(await validOwnerSession('forged'), false);
  async function sign(exp) {
    const payload = JSON.stringify({user:'owner',exp});
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey('raw',enc.encode(process.env.SESSION_SIGNING_KEY),{name:'HMAC',hash:'SHA-256'},false,['sign']);
    const sig = Buffer.from(await crypto.subtle.sign('HMAC',key,enc.encode(payload))).toString('hex');
    return `${btoa(payload)}.${sig}`;
  }
  assert.equal(await validOwnerSession(await sign(Date.now()+60000)), true);
  assert.equal(await validOwnerSession(await sign(Date.now()-1)), false);
  assert.equal(await validOwnerSession(await sign(undefined)), false);
  const token = await sign(Date.now()+60000);
  process.env.SESSION_SIGNING_KEY = '';
  assert.equal(await validOwnerSession(token), false);
});
