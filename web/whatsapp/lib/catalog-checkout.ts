import {db,settings,AppError} from './server';
import {publicCatalog} from './public-catalog';
import {normalizeCustomerPhone,formatDeliveryAddress,type CatalogCheckoutInput} from './checkout-contract';
import type {CatalogItem,DeliveryAddress,DeliveryLocation,WAOrder,WAOrderItem,WASettings} from './model';
const encoder=new TextEncoder();
async function key(usage:KeyUsage[]){const value=process.env.CREDENTIALS_KEY||'';if(!/^[a-fA-F0-9]{64}$/.test(value))throw new AppError('Secure checkout is unavailable.',503);return crypto.subtle.importKey('raw',Uint8Array.from(value.match(/../g)!,v=>parseInt(v,16)),usage.includes('encrypt')?'AES-GCM':{name:'HMAC',hash:'SHA-256'},false,usage);}
async function digest(value:string){return Buffer.from(await crypto.subtle.sign('HMAC',await key(['sign']),encoder.encode('catalog-checkout:v1:'+value))).toString('hex');}
async function seal(address:DeliveryAddress,context:string){const iv=crypto.getRandomValues(new Uint8Array(12));const data=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:encoder.encode(context)},await key(['encrypt','decrypt']),encoder.encode(JSON.stringify(address)));return JSON.stringify({iv:Buffer.from(iv).toString('base64'),data:Buffer.from(data).toString('base64')});}
async function unseal(cipher:string,context:string):Promise<DeliveryAddress>{const value=JSON.parse(cipher);return JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:Buffer.from(value.iv,'base64'),additionalData:encoder.encode(context)},await key(['encrypt','decrypt']),Buffer.from(value.data,'base64'))));}
function priceItems(cart:CatalogCheckoutInput['items'],products:CatalogItem[]){
  const ids=new Set<string>();let currency='';
  const items:WAOrderItem[]=cart.map(line=>{
    if(ids.has(line.productId))throw new AppError('Combine duplicate products in your bag.',400);ids.add(line.productId);
    const product=products.find(p=>p.id===line.productId);
    if(!product||!product.inStock)throw new AppError('A product is no longer available. Refresh your bag.',409);
    if(currency&&currency!==product.currency)throw new AppError('All items must use the same currency.',400);currency=product.currency;
    if(!Number.isFinite(product.price)||product.price<0)throw new AppError('Product pricing is unavailable.',409);
    return {productId:product.id,productName:product.name,quantity:line.quantity,unitPrice:product.price,totalPrice:Math.round(product.price*line.quantity*100)/100};
  });
  const amount=Math.round(items.reduce((sum,item)=>sum+item.totalPrice,0)*100)/100;
  return {items,amount,currency};
}
export async function createCatalogCheckout(input:CatalogCheckoutInput){
  await purgeExpiredCatalogCheckouts();
  const publication=await db().prepare('SELECT tenant_id FROM catalog_publications WHERE slug=? AND published=1').bind(input.slug).first<{tenant_id:string}>();
  if(!publication)throw new AppError('This catalog is unavailable.',404);
  const tenantId=publication.tenant_id,catalog=await publicCatalog(tenantId);
  if(!catalog.phone)throw new AppError('The business must configure an enquiry number before accepting orders.',412);
  const priced=priceItems(input.items,catalog.products);
  const fingerprint=await digest(JSON.stringify({items:input.items,address:input.address}));
  let existing=await db().prepare('SELECT id,fingerprint,status,expires_at,amount,currency FROM catalog_checkouts WHERE tenant_id=? AND request_key=?').bind(tenantId,input.requestKey).first<any>();
  if(existing&&(existing.fingerprint!==fingerprint||existing.status!=='pending_chat'||existing.expires_at<=Date.now()))throw new AppError('This checkout request has changed or expired. Start a new checkout.',409);
  if(!existing){
    const id=crypto.randomUUID(),reference='CK-'+id.replace(/-/g,'').toUpperCase(),now=Date.now();
    const cipher=await seal(input.address,tenantId+':'+id);
    await db().prepare('INSERT OR IGNORE INTO catalog_checkouts(id,tenant_id,reference_hash,customer_hash,request_key,fingerprint,items,address_cipher,amount,currency,status,created_at,expires_at) VALUES (?,?,?,?,?,?,?,?,?,?,\'pending_chat\',?,?)').bind(id,tenantId,await digest(reference),await digest('phone:'+input.address.phone),input.requestKey,fingerprint,JSON.stringify(priced.items),cipher,priced.amount,priced.currency,now,now+86400000).run();
    existing=await db().prepare('SELECT id,fingerprint,status,expires_at,amount,currency FROM catalog_checkouts WHERE tenant_id=? AND request_key=?').bind(tenantId,input.requestKey).first<any>();
    if(!existing||existing.fingerprint!==fingerprint)throw new AppError('Checkout changed. Refresh and retry.',409);
  }
  const reference='CK-'+existing.id.replace(/-/g,'').toUpperCase();
  return {reference,amount:existing.amount,currency:existing.currency,expiresAt:existing.expires_at,confirmationText:'CONFIRM ORDER '+reference,whatsappUrl:'https://wa.me/'+catalog.phone+'?text='+encodeURIComponent('CONFIRM ORDER '+reference)};
}
export function isCatalogConfirmation(text:string){return /^CONFIRM\s+ORDER\s+CK-[A-F0-9]{32}$/i.test(text.trim());}
export async function confirmCatalogCheckout(tenantId:string,senderPhone:string,text:string,threadId:string){
  if(!isCatalogConfirmation(text))return null;
  const reference=text.trim().match(/CK-[A-F0-9]{32}$/i)![0].toUpperCase();
  const referenceHash=await digest(reference),customerHash=await digest('phone:'+normalizeCustomerPhone(senderPhone));
  return db().transaction(async tx=>{
    const row=await tx.prepare('SELECT * FROM catalog_checkouts WHERE tenant_id=? AND reference_hash=? AND customer_hash=?').bind(tenantId,referenceHash,customerHash).first<any>();
    if(!row)throw new AppError('This checkout could not be verified for your WhatsApp number. Open the catalog and check the number entered.',403);
    if(row.status==='confirmed'){
      const saved=await tx.prepare('SELECT payload FROM wa_orders WHERE tenant_id=? AND id=?').bind(tenantId,row.order_id).first<{payload:string}>();
      if(!saved)throw new AppError('This order needs the business team to review its status.',409);
      return {order:JSON.parse(saved.payload) as WAOrder,reply:'Your order '+row.order_id+' is already confirmed. Payment remains subject to verification.'};
    }
    if(row.status!=='pending_chat'||row.expires_at<=Date.now())throw new AppError('This checkout has expired. Review the catalog and create a new checkout.',410);
    const tenant=await tx.prepare("SELECT id FROM business_tenants WHERE id=? AND status='active'").bind(tenantId).first();
    const publication=await tx.prepare('SELECT published FROM catalog_publications WHERE tenant_id=?').bind(tenantId).first<{published:number}>();
    if(!tenant||!publication?.published)throw new AppError('The business is not accepting catalog orders.',409);
    const stored=await tx.prepare('SELECT payload FROM tenant_settings WHERE tenant_id=?').bind(tenantId).first<{payload:string}>();
    const config=stored?JSON.parse(stored.payload) as WASettings:null;
    const items=JSON.parse(row.items) as WAOrderItem[];
    const latest=priceItems(items.map(item=>({productId:item.productId!,quantity:item.quantity})),config?.catalog||[]);
    if(latest.amount!==row.amount||latest.currency!==row.currency||latest.items.some((item,index)=>item.unitPrice!==items[index].unitPrice))throw new AppError('Prices or availability changed. Review the catalog and create a new checkout.',409);
    const address=await unseal(row.address_cipher,tenantId+':'+row.id),raw=formatDeliveryAddress(address),point=address.coordinates;
    const location:DeliveryLocation={raw,formattedAddress:raw,structuredAddress:address,pincode:address.pincode,pincodeMissing:false,hasAddressDetails:true,street:address.line1+', '+address.line2,locality:address.locality,city:address.city,state:address.state,lat:point?.lat,lng:point?.lng,source:'customer',precision:point?'supplied':'unknown',confidence:point&&point.accuracy<=50?'high':'medium',verified:false,needsReview:true,mappedAt:Date.now()};
    const now=Date.now(),order:WAOrder={id:'ORD-'+crypto.randomUUID(),checkoutId:row.id,threadId,customerName:address.fullName,customerPhone:address.phone,productName:items.map(item=>item.productName+' × '+item.quantity).join(', '),items,quantity:items.reduce((sum,item)=>sum+item.quantity,0),amount:row.amount,subtotal:row.amount,currency:row.currency,paymentMode:'Pending',paymentStatus:'pending',orderStatus:'confirmed',deliveryLocation:location,notes:'Confirmed from the checkout phone number in WhatsApp. Address and payment require merchant verification.',createdAt:now,updatedAt:now};
    await tx.prepare('INSERT INTO wa_orders(id,thread_id,phone,payload,status,created,updated,tenant_id) VALUES (?,?,?,?,?,?,?,?)').bind(order.id,threadId,address.phone,JSON.stringify(order),'confirmed',now,now,tenantId).run();
    await tx.prepare("UPDATE catalog_checkouts SET status='confirmed',order_id=?,address_cipher='' WHERE id=? AND tenant_id=? AND status='pending_chat'").bind(order.id,row.id,tenantId).run();
    await tx.prepare('INSERT INTO wa_activity(id,kind,message,created,tenant_id) VALUES (?,?,?,?,?)').bind(crypto.randomUUID(),'Catalog order confirmed','A catalog checkout was confirmed by the matching WhatsApp sender.',now,tenantId).run();
    return {order,reply:'Order '+order.id+' is confirmed for '+order.currency+' '+order.amount+'. Your delivery address is saved. The team will verify the address, payment and dispatch details.'};
  });
}
export async function purgeExpiredCatalogCheckouts(){await db().prepare("DELETE FROM catalog_checkouts WHERE status='pending_chat' AND expires_at<=?").bind(Date.now()).run();}
