import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validOwnerSession,validStoredOwnerSession } from './instagram/lib/owner-session.ts';
import {signPrivateWorkspaceRequest,isPrivateWorkspaceRequest,PRIVATE_WORKSPACE_PROOF_HEADER} from './shared/private-workspace-bridge.ts';

test('private bridge binds method, query and identity across Next base-path normalization',async()=>{
  process.env.SESSION_SIGNING_KEY='bridge-signature-regression-'.repeat(3);
  const transport=new Request('https://internal.test/business/api/admin?page=2',{headers:{cookie:'nina_owner_session=fixture-token'}});
  const proof=await signPrivateWorkspaceRequest(transport);
  const route=new Request('https://internal.test/api/admin?page=2',{headers:{cookie:'nina_owner_session=fixture-token',[PRIVATE_WORKSPACE_PROOF_HEADER]:proof}});
  assert.equal(await isPrivateWorkspaceRequest(route),true);
  for(const changed of [new Request('https://internal.test/api/admin?page=3',{headers:route.headers}),new Request(route,{method:'POST'}),new Request(route,{headers:{cookie:'nina_owner_session=another-token',[PRIVATE_WORKSPACE_PROOF_HEADER]:proof}})])assert.equal(await isPrivateWorkspaceRequest(changed),false);
  route.headers.set(PRIVATE_WORKSPACE_PROOF_HEADER,(Date.now()-60000)+'.'+proof.split('.')[1]);assert.equal(await isPrivateWorkspaceRequest(route),false);
});

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

test('serialized owner cookies authenticate consistently in raw headers and decoded requests',async()=>{
  process.env.SESSION_SIGNING_KEY='b'.repeat(48);
  let payload=JSON.stringify({user:'Registered Owner',jti:crypto.randomUUID(),exp:Date.now()+60000});
  while(payload.length%3===0)payload+=' ';
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(process.env.SESSION_SIGNING_KEY),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const signature=Buffer.from(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(payload))).toString('hex');
  const token=btoa(payload)+'.'+signature;
  assert.ok(encodeURIComponent(token).includes('%3D'));
  const lookup=async()=>({user:'Registered Owner',expiresAt:Date.now()+60000});
  assert.equal(await validStoredOwnerSession(token,lookup),true);
  assert.equal(await validStoredOwnerSession(encodeURIComponent(token),lookup),true);
  assert.equal(await validStoredOwnerSession(encodeURIComponent(token),async()=>({revokedAt:Date.now()})),false);
});
