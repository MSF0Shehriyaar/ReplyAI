import ControlRoom from './control-room';
import {requireOwnerPage} from '@/lib/owner-page';
export const dynamic = 'force-dynamic';
export default async function Home() { await requireOwnerPage('/');return <ControlRoom initialNow={Date.now()}/>; }
