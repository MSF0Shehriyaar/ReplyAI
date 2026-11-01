import {requireOwnerPage} from '@/lib/owner-page';
import AdminWorkspace from './admin-workspace';
import {headers} from 'next/headers';
import {whatsappServiceOrigin} from '@/lib/whatsapp-entry';
export const dynamic='force-dynamic';
export default async function WhatsAppEntry() {
  const owner=await requireOwnerPage('/whatsapp');
  const businessOrigin=whatsappServiceOrigin((await headers()).get('host'))||'';
  return <AdminWorkspace ownerName={owner.name} businessOrigin={businessOrigin}/>;
}
