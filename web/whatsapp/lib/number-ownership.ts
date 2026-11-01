import {db,assertActiveTenant,AppError} from './server';

export function normalizeBusinessPhone(value:string) {
  const phone=value.replace(/[^0-9]/g,'');
  if(!/^[1-9][0-9]{7,14}$/.test(phone))throw new AppError('Use a valid international WhatsApp number with country code.',400);
  return phone;
}
export async function claimWhatsAppNumber(tenantId:string,value:string) {
  await assertActiveTenant(tenantId);
  const phone=normalizeBusinessPhone(value);
  await db().transaction(async tx=>{
    const owner=await tx.prepare('SELECT tenant_id FROM whatsapp_number_owners WHERE phone=?').bind(phone).first<{tenant_id:string}>();
    if(owner&&owner.tenant_id!==tenantId)throw new AppError('This WhatsApp number is already linked to another business. Ask the administrator to review its ownership.',409);
    const legacy=(await tx.prepare("SELECT tenant_id,display_phone_number FROM tenant_connections WHERE tenant_id<>? AND display_phone_number IS NOT NULL").bind(tenantId).all<{tenant_id:string;display_phone_number:string}>()).results;
    if(legacy.some(row=>row.display_phone_number.replace(/[^0-9]/g,'')===phone))throw new AppError('This WhatsApp number is already assigned to another business.',409);
    await tx.prepare('DELETE FROM whatsapp_number_owners WHERE tenant_id=? AND phone<>?').bind(tenantId,phone).run();
    await tx.prepare('INSERT INTO whatsapp_number_owners(phone,tenant_id,updated_at) VALUES (?,?,?) ON CONFLICT(phone) DO UPDATE SET updated_at=excluded.updated_at').bind(phone,tenantId,Date.now()).run();
  });
  return phone;
}
