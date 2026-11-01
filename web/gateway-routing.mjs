export function routeTarget(urlPath,{instagramPort=3000,whatsappPort=3001}={}){
  const pathname=urlPath.split('?')[0];
  const business=pathname==='/business'||pathname.startsWith('/business/')||pathname.startsWith('/api/whatsapp/')||pathname==='/catalog'||pathname.startsWith('/catalog/');
  return {host:'127.0.0.1',port:business?whatsappPort:instagramPort};
}
export function upstreamPath(urlPath,target,whatsappPort=3001){
  if(target.port!==whatsappPort)return urlPath;
  if(urlPath.startsWith('/api/whatsapp/'))return '/business/api/'+urlPath.slice('/api/whatsapp/'.length);
  if(urlPath.startsWith('/catalog'))return '/business'+urlPath;
  return urlPath;
}
export function channelHeaders(headers,target,whatsappPort=3001){
  const result={...headers};delete result['x-private-workspace-proof'];
  if(target.port===whatsappPort&&result.cookie)result.cookie=result.cookie.split(';').filter(part=>!part.trim().startsWith('nina_owner_session=')).join(';');
  return result;
}
