import {db,settings,AppError} from './server';
import {tenantIdSchema} from './request-security';
import type {CatalogItem} from './model';
import {catalogPublication} from './catalog-publication';
export type PublicCatalog={businessId:string;name:string;tagline:string;phone:string;products:CatalogItem[];slug?:string;categories?:string[]};
export async function publicCatalog(businessId:string):Promise<PublicCatalog> {
  if(!tenantIdSchema.safeParse(businessId).success)throw new AppError('Invalid catalog.',400);
  const business=await db().prepare("SELECT name,tagline FROM business_tenants WHERE id=? AND status='active'").bind(businessId).first<{name:string;tagline:string}>();
  if(!business)throw new AppError('This catalog is unavailable.',404);
  const publication=await catalogPublication(businessId);
  if(!publication.published)throw new AppError('This catalog is unavailable.',404);
  const config=await settings(businessId);
  const connection=await db().prepare('SELECT display_phone_number FROM tenant_connections WHERE tenant_id=?').bind(businessId).first<{display_phone_number?:string}>();
  const verified=await db().prepare('SELECT phone FROM whatsapp_number_owners WHERE tenant_id=?').bind(businessId).first<{phone:string}>();
  // Explicit public allowlist: no prompts, provider configuration, customer data, or secrets.
  return {businessId,slug:publication.slug,categories:config.categories||[],name:config.businessName||business.name,tagline:config.tagline||business.tagline||'',phone:(verified?.phone||connection?.display_phone_number||config.supportPhone||'').replace(/[^0-9]/g,''),
    products:(config.catalog||[]).map(p=>({id:p.id,name:p.name,category:p.category,price:p.price,mrp:p.mrp,currency:p.currency,description:p.description,features:p.features||[],inStock:p.inStock,bestseller:p.bestseller,image:p.image,link:p.link}))};
}
