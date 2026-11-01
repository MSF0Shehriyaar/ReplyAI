import {readdirSync,readFileSync,statSync} from 'node:fs';
import {join} from 'node:path';
import assert from 'node:assert/strict';
// Verify final customer artifacts, including Hermes' compiled string table.
for(const directory of ['web/whatsapp/.next/static','outputs/expo-business']){
  const files=readdirSync(directory,{recursive:true}).map(file=>join(directory,file)).filter(file=>statSync(file).isFile());
  assert.ok(files.length,'Build artifacts are required for '+directory);
  for(const forbidden of ['Nina','nina_owner_session','/api/owner-mobile-auth','/api/whatsapp-service','localhost:3000']){
    assert.equal(files.filter(file=>readFileSync(file).includes(Buffer.from(forbidden))).length,0,'Private content in '+directory+': '+forbidden);
  }
  console.log(directory+': private branding and admin endpoint checks passed');
}
for(const directory of ['web/whatsapp/.next','web/instagram/.next']){
  const files=readdirSync(directory,{recursive:true}).map(file=>join(directory,file)).filter(file=>statSync(file).isFile()&&!file.includes('cache'));
  for(const forbidden of ['titan-demo-01','/demo-api/','titan-demo.sqlite','LOCAL DEMO STUDIO'])assert.equal(files.filter(file=>readFileSync(file).includes(Buffer.from(forbidden))).length,0,'Demo included in production: '+directory+' '+forbidden);
  console.log(directory+': local demo excluded from production artifacts');
}
