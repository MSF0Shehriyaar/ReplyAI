import {test} from 'node:test';
import assert from 'node:assert/strict';
process.env.TURSO_DATABASE_URL='file::memory:';process.env.TURSO_AUTH_TOKEN='fixture';process.env.SESSION_SIGNING_KEY='checkout-tests-'.repeat(4);process.env.CREDENTIALS_KEY='12'.repeat(32);process.env.NEXT_PUBLIC_APP_URL='https://catalog.test';
const server=await import('./whatsapp/lib/server.ts');
const auth=await import('./whatsapp/app/api/auth/route.ts');
const checkoutRoute=await import('./whatsapp/app/api/checkout/route.ts');
const {saveCatalogPublication}=await import('./whatsapp/lib/catalog-publication.ts');
const {publicCatalog}=await import('./whatsapp/lib/public-catalog.ts');
const {confirmCatalogCheckout,createCatalogCheckout,purgeExpiredCatalogCheckouts}=await import('./whatsapp/lib/catalog-checkout.ts');
const {enqueueEvent}=await import('./whatsapp/lib/queue-ownership.ts');
const {processThreadJobs}=await import('./whatsapp/lib/queue.ts');
const {NextRequest}=await import('./whatsapp/node_modules/next/server.js');
const request=(body,origin='https://catalog.test')=>new NextRequest('https://catalog.test/business/api/checkout',{method:'POST',headers:{origin,'Content-Type':'application/json'},body:JSON.stringify(body)});
const address={fullName:'Fixture Customer',phone:'919876543210',line1:'Flat 4, Fixture House',line2:'Sample Road, Block A',locality:'Fixture locality',city:'Bengaluru',state:'Karnataka',pincode:'560001',country:'India',type:'home'};
test('published catalog checkout, private delivery details and authoritative WhatsApp confirmation',async t=>{
  await server.initDatabase();const businesses=[];
  for(const name of ['Alpha','Beta']){const response=await auth.POST(new NextRequest('https://catalog.test/business/api/auth',{method:'POST',headers:{origin:'https://catalog.test','Content-Type':'application/json'},body:JSON.stringify({action:'register',businessName:name,ownerName:'Fixture Owner',email:name.toLowerCase()+'@example.test',password:'fixture-long-password'})}));assert.equal(response.status,200);businesses.push(await response.json());}
  const [a,b]=businesses,product={id:'watch',name:'Fixture watch',category:'Owner-created category',price:1000,currency:'INR',description:'Fixture',features:[],inStock:true};
  for(const business of businesses)await server.saveSettings({...await server.settings(business.tenantId),industry:'Watches',businessDescription:'A fixture business',supportEmail:'support@example.test',supportPhone:'919999999999',storeAddress:'Online across India',paymentMethods:'Confirmed with the team',shippingPolicy:'Team verifies delivery',returnPolicy:'Return terms provided before payment',warrantyPolicy:'No warranty offered',knowledge:'Only fixture products are sold.',catalog:[product]},business.tenantId);
  await t.test('private drafts stay unavailable until an owner chooses a unique URL',async()=>{
    await assert.rejects(publicCatalog(a.tenantId),error=>error.status===404);
    await assert.rejects(saveCatalogPublication(a.tenantId,'',true),error=>error.status===400);
    const publication=await saveCatalogPublication(a.tenantId,'alpha-watches',true);assert.equal(publication.url,'https://catalog.test/business/catalog/alpha-watches');
    await assert.rejects(saveCatalogPublication(b.tenantId,'alpha-watches',true),error=>error.status===409);
    await saveCatalogPublication(b.tenantId,'beta-watches',true);
    await assert.rejects(publicCatalog('biz_titan_watches'),error=>error.status===404);
  });
  const input={slug:'alpha-watches',requestKey:crypto.randomUUID(),items:[{productId:'watch',quantity:2}],address,consent:true};let receipt;
  await t.test('checkout rejects CSRF, missing address fields and customer-supplied pricing',async()=>{
    assert.equal((await checkoutRoute.POST(request(input,'https://attacker.test'))).status,403);
    assert.equal((await checkoutRoute.POST(request({...input,amount:1,paymentStatus:'paid'}))).status,400);
    assert.equal((await checkoutRoute.POST(request({...input,address:{...address,line2:''}}))).status,400);
    assert.equal((await checkoutRoute.POST(request({...input,items:[{productId:'watch',quantity:0}]}))).status,400);
    assert.equal((await checkoutRoute.POST(request({...input,consent:false}))).status,400);
  });
  await t.test('server prices the bag, encrypts the pending address and deduplicates retries',async()=>{
    const response=await checkoutRoute.POST(request(input));assert.equal(response.status,200,await response.clone().text());receipt=await response.json();assert.equal(receipt.amount,2000);
    assert.deepEqual(await (await checkoutRoute.POST(request(input))).json(),receipt);assert.equal((await server.allOrders(a.tenantId)).length,0);
    assert.ok(!receipt.whatsappUrl.includes('Fixture'));assert.ok(!receipt.whatsappUrl.includes('919876543210'));
    const row=await server.db().prepare('SELECT address_cipher FROM catalog_checkouts').first();assert.ok(!row.address_cipher.includes('Fixture House'));assert.ok(!row.address_cipher.includes(address.phone));
  });
  await t.test('only the matching tenant and transport phone can confirm an order',async()=>{
    await assert.rejects(confirmCatalogCheckout(b.tenantId,address.phone,receipt.confirmationText,'fixture-thread'),error=>error.status===403);
    await assert.rejects(confirmCatalogCheckout(a.tenantId,'911111111111',receipt.confirmationText,'fixture-thread'),error=>error.status===403);
    assert.equal(await confirmCatalogCheckout(a.tenantId,address.phone,'UPI paid '+receipt.confirmationText,'fixture-thread'),null);
    const confirmation=await confirmCatalogCheckout(a.tenantId,address.phone,receipt.confirmationText,'fixture-thread');assert.equal(confirmation.order.amount,2000);assert.equal(confirmation.order.paymentStatus,'pending');assert.equal(confirmation.order.orderStatus,'confirmed');assert.equal(confirmation.order.deliveryLocation.structuredAddress.line1,address.line1);assert.equal(confirmation.order.deliveryLocation.verified,false);
    assert.equal((await confirmCatalogCheckout(a.tenantId,address.phone,receipt.confirmationText,'fixture-thread')).order.id,confirmation.order.id);assert.equal((await server.allOrders(a.tenantId)).length,1);assert.equal((await server.allOrders(b.tenantId)).length,0);
  });
  await t.test('reads preserve separate repeated purchases and never recreate orders from AI chat',async()=>{
    const order=(await server.allOrders(a.tenantId))[0];await server.saveOrder({...order,id:'another-purchase',checkoutId:undefined},a.tenantId);assert.equal((await server.allOrders(a.tenantId)).length,2);assert.equal((await server.allOrders(a.tenantId)).length,2);
    const fake={id:'ai-claims',version:0,phone:address.phone,name:'Fixture',messages:[{id:'message',role:'outgoing',text:'Your order for Fixture watch is confirmed. UPI paid.',at:Date.now()}],tags:['order_confirmed'],channel:'personal',status:'open',ai:true,takeover:false,draft:'',updated:Date.now(),lastInbound:Date.now(),recipientId:address.phone,priority:'normal'};
    await server.saveThread(fake,a.tenantId);assert.equal((await server.allOrders(a.tenantId)).length,2);
  });
  await t.test('queued confirmation saves an order and a review draft while automation is paused',async()=>{
    const next=await (await checkoutRoute.POST(request({...input,requestKey:crypto.randomUUID()}))).json();const original=globalThis.fetch;globalThis.fetch=async()=>{throw new Error('No external calls allowed.');};
    try{await enqueueEvent(a.tenantId,{id:'confirmation-event',threadId:'queued-checkout',senderPhone:address.phone,senderName:'Fixture Customer',text:next.confirmationText,channel:'personal',at:Date.now()});const processed=await processThreadJobs('queued-checkout',a.tenantId);assert.equal(processed.processed,1);const thread=await server.getThread('queued-checkout',a.tenantId);assert.equal(thread.status,'review');assert.ok(thread.draft.includes('confirmed'));assert.equal((await server.allOrders(a.tenantId)).length,3);}finally{globalThis.fetch=original;}
  });
  await t.test('changed prices reject confirmation and expired pending addresses are purged',async()=>{
    const pending=await createCatalogCheckout({...input,requestKey:crypto.randomUUID()});const config=await server.settings(a.tenantId);
    await server.saveSettings({...config,catalog:[{...product,price:1100}]},a.tenantId);
    await assert.rejects(confirmCatalogCheckout(a.tenantId,address.phone,pending.confirmationText,'price-changed'),error=>error.status===409);
    await server.saveSettings(config,a.tenantId);
    await server.db().prepare("UPDATE catalog_checkouts SET expires_at=0 WHERE status='pending_chat'").run();await purgeExpiredCatalogCheckouts();
    assert.equal((await server.db().prepare("SELECT count(*) AS n FROM catalog_checkouts WHERE status='pending_chat'").first()).n,0);
    const confirmed=(await server.db().prepare("SELECT address_cipher FROM catalog_checkouts WHERE status='confirmed'").all()).results;assert.ok(confirmed.length>0);assert.ok(confirmed.every(row=>row.address_cipher===''));
  });
});
