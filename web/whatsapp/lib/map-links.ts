export function mapQuery(loc?:{raw?:string;lat?:number;lng?:number}|null) {
  return loc && Number.isFinite(loc.lat)&&Number.isFinite(loc.lng)?`${loc.lat},${loc.lng}`:loc?.raw || '';
}
export function mapSearch(loc?:Parameters<typeof mapQuery>[0]) {return 'https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(mapQuery(loc));}
export function mapDirections(loc?:Parameters<typeof mapQuery>[0]) {return 'https://www.google.com/maps/dir/?api=1&destination='+encodeURIComponent(mapQuery(loc));}
