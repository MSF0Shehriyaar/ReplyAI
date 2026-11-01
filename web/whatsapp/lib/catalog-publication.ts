import {db,settings,AppError,audit} from './server';
import {missingBusinessProfile} from './business-profile';
import type {CatalogPublication} from './model';
export const validCatalogSlug=(slug:string)=>/^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/.test(slug)&&!['admin','api','login','register','catalog','business','whatsapp'].includes(slug);
export function catalogUrl(slug:string){const origin=(process.env.NEXT_PUBLIC_APP_URL||(process.env.NODE_ENV==='production'?'https://automation.ninakurainservices.in':'http://localhost:3000')).replace(/\/+$/,'');return origin+'/business/catalog/'+encodeURIComponent(slug);}
export async function catalogPublication(tenantId:string):Promise<CatalogPublication>{
  const row=await db().prepare('SELECT slug,published FROM catalog_publications WHERE tenant_id=?').bind(tenantId).first<{slug:string;published:number}>();
  return {slug:row?.slug||'',published:!!row?.published,url:row?.slug?catalogUrl(row.slug):''};
}
export async function saveCatalogPublication(tenantId:string,slug:string,published:boolean){
  slug=slug.trim().toLowerCase();
  if(slug&&!validCatalogSlug(slug))throw new AppError('Use 3–64 lowercase letters, numbers and hyphens for your catalog URL.',400);
  if(published&&!slug)throw new AppError('Choose your catalog URL before publishing.',400);
  if(published){const missing=missingBusinessProfile(await settings(tenantId));if(missing.length)throw new AppError('Complete your profile before publishing: '+missing.join(', '),412);}
  const taken=slug?await db().prepare('SELECT tenant_id FROM catalog_publications WHERE slug=? AND tenant_id<>?').bind(slug,tenantId).first():null;
  if(taken)throw new AppError('This catalog URL is already in use. Choose another.',409);
  try{await db().prepare('INSERT INTO catalog_publications(tenant_id,slug,published,updated_at) VALUES (?,?,?,?) ON CONFLICT(tenant_id) DO UPDATE SET slug=excluded.slug,published=excluded.published,updated_at=excluded.updated_at').bind(tenantId,slug||null,published?1:0,Date.now()).run();}
  catch{throw new AppError('This catalog URL could not be saved. It may have just been taken.',409);}
  await audit('Catalog publication',published?'Catalog published at the owner-selected URL.':'Catalog kept private.',tenantId);
  return catalogPublication(tenantId);
}
