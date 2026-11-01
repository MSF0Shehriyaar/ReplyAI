// Address detection preserves customer input. Geocoding never substitutes a guessed city or house.
export interface ParsedAddress {
  raw: string; pincode?: string; pincodeMissing: boolean; hasAddressDetails: boolean;
  street?: string; locality?: string; city?: string; state?: string;
  lat?: number; lng?: number; mapUrl?: string; directionsUrl?: string;
  formattedAddress?: string; verified: boolean; mappedAt?: number;
  confidence?: 'low' | 'medium' | 'high';
  precision?: 'supplied' | 'rooftop' | 'interpolated' | 'area' | 'unknown';
  source?: 'customer' | 'google' | 'text';
  needsReview?: boolean;
}
export const SPELLING_CORRECTIONS: [RegExp,string][] = [
  [/\bmysore\b/gi,'Mysuru'],[/\bbangalore\b/gi,'Bengaluru'],
  [/\bmain\s+rd\b/gi,'Main Road'],[/\bopp\.?(?=\s)/gi,'Opposite'],
];
export function extractPincode(text:string):string|null {
  return text.match(/\b([1-9]\d{2})\s?(\d{3})\b/)?.slice(1).join('') || null;
}
export function extractAddressText(text:string):string {
  const marked=text.match(/(?:delivery\s+address|my\s+address|address)\s*(?:is|:|-)?\s*([\s\S]+)/i);
  return (marked?.[1] || text).split('\n').filter(line=>!/^\s*(?:phone|mobile|contact|name)\s*:/i.test(line))
    .join(', ').replace(/\s+/g,' ').trim().slice(0,2000);
}
export function containsAddress(text:string):boolean {
  return /\b(?:address|flat|apartment|house|plot|street|road|lane|sector|layout|colony|nagar|pincode|pin code)\b/i.test(text) &&
    (text.trim().length>=12 || /address\s*:/i.test(text));
}
export function cleanAndSpellCheckAddress(text:string) {
  let normalizedText=extractAddressText(text);
  for(const [pattern,replacement] of SPELLING_CORRECTIONS) normalizedText=normalizedText.replace(pattern,replacement);
  const city=normalizedText.match(/\b(Mysuru|Bengaluru|Mumbai|Delhi|Chennai|Hyderabad|Kolkata|Pune|Jaipur|Kochi|Ahmedabad)\b/i)?.[0] || '';
  return {normalizedText,detectedCity:city,detectedPincode:extractPincode(normalizedText),searchQuery:normalizedText};
}
function coordinates(text:string):{lat:number;lng:number}|null {
  const shared=text.match(/\[Location:\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\]/i);
  const maps=text.match(/https:\/\/(?:www\.)?(?:google\.com\/maps|maps\.google\.com)[^\s]*/i)?.[0];
  const pair=shared || maps?.match(/(?:@|[?&](?:q|query)=)(-?\d+(?:\.\d+)?)(?:,|%2C)\s*(-?\d+(?:\.\d+)?)/i);
  if(!pair) return null;
  const lat=Number(pair[1]),lng=Number(pair[2]);
  return Number.isFinite(lat)&&Number.isFinite(lng)&&Math.abs(lat)<=90&&Math.abs(lng)<=180?{lat,lng}:null;
}
export async function geocodeAddress(query:string,cityHint?:string):Promise<{lat:number;lng:number;displayName:string;precision:'rooftop'|'interpolated'|'area';pincode?:string;city?:string;state?:string;partial:boolean}|null> {
  const key=process.env.GOOGLE_GEOCODING_API_KEY;
  if(!key) return null;
  const url=new URL('https://maps.googleapis.com/maps/api/geocode/json');
  url.searchParams.set('address',query);url.searchParams.set('key',key);
  // No regional default: businesses may receive addresses from different states or countries.
  try {
    const response=await fetch(url,{signal:AbortSignal.timeout(6000),cache:'no-store'});
    if(!response.ok) return null;
    const data=await response.json();
    const result=data.status==='OK'?data.results?.[0]:null;
    const point=result?.geometry?.location;
    if(!point || !Number.isFinite(point.lat)||!Number.isFinite(point.lng)||Math.abs(point.lat)>90||Math.abs(point.lng)>180) return null;
    const component=(type:string)=>result.address_components?.find((c:any)=>c.types?.includes(type))?.long_name;
    const suppliedPin=extractPincode(query),foundPin=component('postal_code');
    if(suppliedPin && foundPin && suppliedPin!==foundPin) return null;
    if(cityHint && !String(result.formatted_address).toLowerCase().includes(cityHint.toLowerCase())) return null;
    return {lat:point.lat,lng:point.lng,displayName:result.formatted_address,
      precision:result.geometry.location_type==='ROOFTOP'?'rooftop':result.geometry.location_type==='RANGE_INTERPOLATED'?'interpolated':'area',
      pincode:foundPin,city:component('locality'),state:component('administrative_area_level_1'),partial:!!result.partial_match};
  } catch { return null; }
}
export async function parseAndMapAddress(text:string,existingLocation?:ParsedAddress):Promise<ParsedAddress|null> {
  const point=coordinates(text);
  const pin=extractPincode(text);
  const pinOnly=/^\s*(?:(?:pin(?:code)?|postal code)\s*[: -]?\s*)?[1-9]\d{2}\s?\d{3}\s*$/i.test(text);
  if(!point && !containsAddress(text) && !(pinOnly&&existingLocation?.raw)) return null;
  const raw=pinOnly&&existingLocation?existingLocation.raw.replace(/\b[1-9]\d{2}\s?\d{3}\b/g,'').replace(/[,\s]+$/,'')+', '+pin:extractAddressText(text);
  const checked=cleanAndSpellCheckAddress(raw);
  const geo=!point?await geocodeAddress(checked.normalizedText,checked.detectedCity):null;
  const position=point || geo;
  const query=position?`${position.lat},${position.lng}`:checked.searchQuery;
  return {raw:checked.normalizedText,pincode:pin || geo?.pincode || undefined,pincodeMissing:!(pin||geo?.pincode),
    hasAddressDetails:!point&&containsAddress(raw),city:geo?.city || checked.detectedCity || undefined,state:geo?.state,
    lat:position?.lat,lng:position?.lng,formattedAddress:geo?.displayName || checked.normalizedText,
    mapUrl:'https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(query),
    directionsUrl:'https://www.google.com/maps/dir/?api=1&destination='+encodeURIComponent(query),
    verified:false,source:point?'customer':geo?'google':'text',
    precision:point?'supplied':geo?.precision || 'unknown',
    confidence:point?'high':geo?.precision==='rooftop'&&!geo.partial?'high':geo?'medium':'low',
    needsReview:true,mappedAt:Date.now()};
}
export function formatDeliveryConfirmation(loc:ParsedAddress):string {
  return ['Delivery address received',loc.raw,loc.pincode?'Postal code: '+loc.pincode:'Postal code required',
    loc.source==='customer'?'Customer-shared map position':loc.lat!==undefined?'Suggested map match; confirm before dispatch':'Map position not confirmed',
    loc.mapUrl || ''].filter(Boolean).join('\n');
}

