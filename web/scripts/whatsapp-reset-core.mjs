export const WHATSAPP_TABLES=['catalog_checkouts','catalog_publications','outbound_deliveries','queue_leases','webhook_idempotency','whatsapp_number_owners','auto_rule_threads','auto_rule_daily','auth_sessions','tenant_connections','tenant_credentials','tenant_daily_usage','tenant_usage','tenant_settings','wa_orders','wa_jobs','wa_threads','wa_customers','wa_activity','wa_state','auth_rate_limits','business_users','business_tenants'];
const legacyKeys=['wa_access_token','wa_app_secret','wa_verify_token','wa_token','whatsapp_token'];
const scopedKeys=[...legacyKeys,'groq_key','gemini_key','openrouter_key','xai_key','cloudflare_key','horde_key'];
export async function inspectWhatsApp(database){
  const available=new Set((await database.prepare("SELECT name FROM sqlite_master WHERE type='table'").all()).results.map(row=>row.name));
  const counts={};for(const table of WHATSAPP_TABLES)if(available.has(table))counts[table]=Number((await database.prepare('SELECT count(*) AS n FROM '+table).first()).n);
  return {tables:Object.keys(counts),counts};
}
export async function resetWhatsApp(database,{ownerSettings,backupSink,now=Date.now()}){
  if(typeof backupSink!=='function')throw new Error('A protected backup sink is mandatory.');
  return database.transaction(async tx=>{
    const plan=await inspectWhatsApp(tx);
    if(plan.tables.includes('wa_jobs')&&(await tx.prepare("SELECT count(*) AS n FROM wa_jobs WHERE status='processing'").first()).n)throw new Error('A WhatsApp job is currently processing. Stop it before resetting.');
    if(plan.tables.includes('queue_leases')&&(await tx.prepare('SELECT count(*) AS n FROM queue_leases WHERE expires_at>?').bind(now).first()).n)throw new Error('A live WhatsApp queue lease exists. Stop processing before resetting.');
    if(plan.tables.includes('whatsapp_number_owners')&&(await tx.prepare('SELECT count(*) AS n FROM whatsapp_number_owners').first()).n)throw new Error('Disconnect active WhatsApp numbers before resetting.');
    if(plan.tables.includes('tenant_connections')&&(await tx.prepare("SELECT count(*) AS n FROM tenant_connections WHERE device_status='connected' OR phone_number_id IS NOT NULL").first()).n)throw new Error('Disconnect active WhatsApp connections before resetting.');
    const snapshot={version:1,createdAt:now,tables:{},legacySecrets:[]};
    for(const table of plan.tables)snapshot.tables[table]=(await tx.prepare('SELECT * FROM '+table).all()).results;
    const tenantIds=(snapshot.tables.business_tenants||[]).map(row=>row.id);
    const secrets=(await tx.prepare('SELECT key,cipher FROM encrypted_secrets').all()).results;
    snapshot.legacySecrets=secrets.filter(row=>legacyKeys.includes(row.key)||tenantIds.some(id=>scopedKeys.some(key=>row.key===key+'_'+id)));
    const backup=await backupSink(snapshot);
    if(!backup?.written)throw new Error('Backup was not verified; no data was removed.');
    for(const table of plan.tables)await tx.exec('DELETE FROM '+table);
    for(const secret of snapshot.legacySecrets)await tx.prepare('DELETE FROM encrypted_secrets WHERE key=?').bind(secret.key).run();
    const id='biz_titan_watches';
    await tx.prepare("INSERT INTO business_tenants(id,name,owner_name,owner_email,phone,category,tagline,theme_color,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,'active',?,?)").bind(id,ownerSettings.businessName,ownerSettings.profile.name,ownerSettings.supportEmail,ownerSettings.supportPhone||'',ownerSettings.industry,ownerSettings.tagline,'#6550c8',now,now).run();
    await tx.prepare('INSERT INTO tenant_settings(tenant_id,payload,updated_at) VALUES (?,?,?)').bind(id,JSON.stringify({...ownerSettings,enabled:false,approval:true,catalog:[]}),now).run();
    await tx.prepare('INSERT INTO wa_activity(id,kind,message,created,tenant_id) VALUES (?,?,?,?,?)').bind(crypto.randomUUID(),'WhatsApp reset','Historical WhatsApp registrations and data were cleared by the owner. Private owner setup created; automatic replies remain paused.',now,id).run();
    return {deleted:plan.counts,legacySecretsRemoved:snapshot.legacySecrets.length,ownerWorkspace:id,backup};
  });
}
