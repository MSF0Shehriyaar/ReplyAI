import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseAndMapAddress,extractPincode,cleanAndSpellCheckAddress} from './whatsapp/lib/location-service.ts';
test('addresses never inherit a guessed city or coordinates',async()=>{
  delete process.env.GOOGLE_GEOCODING_API_KEY;
  const address=await parseAndMapAddress('Address: Flat 4, Station Road, Jaipur, 302001');
  assert.equal(address.city,'Jaipur');assert.equal(address.state,undefined);assert.equal(address.lat,undefined);assert.equal(address.verified,false);
  const unknown=await parseAndMapAddress('Address: House 1302, Station Road');
  assert.equal(unknown.city,undefined);assert.equal(unknown.lat,undefined);
  assert.equal(cleanAndSpellCheckAddress('12 Main Road, Pune').detectedCity,'Pune');
  assert.equal(extractPincode('Phone 9876543210'),null);
});
test('customer map coordinates preserve zero and southern/western hemispheres',async()=>{
  const location=await parseAndMapAddress('[Location: 0,-77.3]');
  assert.equal(location.lat,0);assert.equal(location.lng,-77.3);assert.equal(location.source,'customer');assert.equal(location.precision,'supplied');
  assert.equal(await parseAndMapAddress('[Location: 999,77]'),null);
});
test('a postcode-only follow-up retains address but never old guessed coordinates',async()=>{
  const location=await parseAndMapAddress('302001',{raw:'4 Station Road, Jaipur',pincodeMissing:true,hasAddressDetails:true,lat:12, lng:76,verified:false});
  assert.ok(location.raw.includes('Station Road'));assert.equal(location.pincode,'302001');assert.equal(location.lat,undefined);assert.equal(location.verified,false);
  assert.equal(await parseAndMapAddress('302001'),null);
});
test('geocoding rejects mismatched postcodes and keeps approximate results unverified',async()=>{
  process.env.GOOGLE_GEOCODING_API_KEY='mock-key';const original=globalThis.fetch;
  const reply=(pin)=>Response.json({status:'OK',results:[{geometry:{location:{lat:26.9,lng:75.8},location_type:'APPROXIMATE'},formatted_address:'Station Road, Jaipur',address_components:[{types:['postal_code'],long_name:pin}]}]});
  try {
    globalThis.fetch=async()=>reply('999999');
    assert.equal((await parseAndMapAddress('Address: 4 Station Road, Jaipur 302001')).lat,undefined);
    globalThis.fetch=async()=>reply('302001');
    const location=await parseAndMapAddress('Address: 4 Station Road, Jaipur 302001');
    assert.equal(location.lat,26.9);assert.equal(location.precision,'area');assert.equal(location.verified,false);
  } finally {globalThis.fetch=original;delete process.env.GOOGLE_GEOCODING_API_KEY;}
});
