import {headers} from 'next/headers';
import {redirect} from 'next/navigation';
import {whatsappServiceOrigin} from '@/lib/whatsapp-entry';
export const dynamic='force-dynamic';
export default async function CatalogEntry({searchParams}:{searchParams:Promise<{business?:string}>}) {
  const origin=whatsappServiceOrigin((await headers()).get('host'));
  const {business}=await searchParams;
  redirect((origin||'')+'/business/catalog'+(typeof business==='string'?'?business='+encodeURIComponent(business):''));
  return <main className="page"><h1>Business catalog</h1><p>Open your business catalog link through the platform gateway.</p></main>;
}
