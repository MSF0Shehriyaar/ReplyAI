import {test} from 'node:test';
import assert from 'node:assert/strict';
import {routeTarget,upstreamPath,channelHeaders} from './gateway-routing.mjs';
test('one-domain gateway keeps public pages, assets and private administration on their owning service',()=>{
  for(const path of ['/business','/business?x=1','/business/catalog','/business/_next/static/chunk.js','/business/api/workspace','/api/whatsapp/webhook','/catalog?business=shop'])assert.equal(routeTarget(path).port,3001,path);
  for(const path of ['/','/login','/whatsapp','/api/whatsapp-service/admin','/_next/static/chunk.js','/business-other','/catalogue'])assert.equal(routeTarget(path).port,3000,path);
  assert.equal(upstreamPath('/api/whatsapp/webhook?verify=1',routeTarget('/api/whatsapp/webhook')),'/business/api/webhook?verify=1');
  assert.equal(upstreamPath('/catalog?business=shop',routeTarget('/catalog')),'/business/catalog?business=shop');
  assert.equal(upstreamPath('/business/_next/static/chunk.js',routeTarget('/business')),'/business/_next/static/chunk.js');
});
test('public gateway removes owner credentials and private service proof, retaining business sessions',()=>{
  const original={cookie:'nina_owner_session=private; wa_session=business; preference=light','x-private-workspace-proof':'private-proof',authorization:'Bearer business'};
  const publicHeaders=channelHeaders(original,routeTarget('/business/api/workspace'));
  assert.equal(publicHeaders.cookie,' wa_session=business; preference=light');assert.equal(publicHeaders.authorization,'Bearer business');assert.equal(publicHeaders['x-private-workspace-proof'],undefined);
  assert.equal(channelHeaders(original,routeTarget('/api/workspace')).cookie,original.cookie);
  assert.equal(original['x-private-workspace-proof'],'private-proof');
});
