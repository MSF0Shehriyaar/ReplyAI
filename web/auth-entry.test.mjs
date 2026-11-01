import {test} from 'node:test';
import assert from 'node:assert/strict';
// Anonymous entry must work even before database credentials have been configured.
delete process.env.TURSO_DATABASE_URL;
delete process.env.TURSO_AUTH_TOKEN;
const {NextRequest}=await import('./whatsapp/node_modules/next/server.js');
const auth=await import('./whatsapp/app/api/auth/route.ts');
const workspace=await import('./whatsapp/app/api/workspace/route.ts');
const connect=await import('./whatsapp/app/api/connect/route.ts');
test('anonymous session check returns a normal sign-in state without initializing the database',async()=>{
  const response=await auth.GET(new NextRequest('http://localhost:3001/api/auth'));
  assert.equal(response.status,200);assert.deepEqual(await response.json(),{authenticated:false});
  assert.equal(response.headers.get('cache-control'),'no-store');
});
test('protected endpoints reject anonymous requests before database setup',async()=>{
  for(const [path,handler] of [['workspace',workspace.GET],['connect',connect.GET]]) {
    const response=await handler(new NextRequest('http://localhost:3001/api/'+path));
    assert.equal(response.status,401);assert.match((await response.json()).error,/sign in/i);
  }
});
