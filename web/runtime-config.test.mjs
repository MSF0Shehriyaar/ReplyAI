import {test} from 'node:test';
import assert from 'node:assert/strict';
import {assertSessionRuntime} from './scripts/runtime-config.mjs';
test('production gateway refuses to start without a strong signing key',()=>{
  for(const key of [undefined,'','short',' '.repeat(64)])assert.throws(()=>assertSessionRuntime({SESSION_SIGNING_KEY:key}),/SESSION_SIGNING_KEY/);
  assert.doesNotThrow(()=>assertSessionRuntime({SESSION_SIGNING_KEY:crypto.randomUUID()+crypto.randomUUID()}));
});
