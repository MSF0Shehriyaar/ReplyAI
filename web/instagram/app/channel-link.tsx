import {ArrowUpRight,MessageCircle} from 'lucide-react';
export default function WhatsAppManagementLink() {
  return <a href="/whatsapp" className="private-whatsapp-link"><MessageCircle size={18} aria-hidden="true"/><span>WhatsApp management</span><ArrowUpRight size={16} aria-hidden="true"/></a>;
}
