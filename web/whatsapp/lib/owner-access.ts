import { headers } from 'next/headers';
import { validStoredOwnerSession } from '../../instagram/lib/owner-session';
import { AppError, db } from './server';

export async function requireOwner(request?: Request) {
  const h = request?.headers ?? await headers();
  const token = h.get('cookie')?.split(';').map(v => v.trim()).find(v => v.startsWith('nina_owner_session='))?.slice(19);
  if (!await validStoredOwnerSession(token,async key=>{const row=await db().prepare('SELECT payload FROM workspace_state WHERE key=?').bind(key).first<{payload:string}>();return row?JSON.parse(row.payload):null;})) throw new AppError('Owner authentication required.', 401);
  if (request && !['GET','HEAD'].includes(request.method)) {
    const origin = process.env.NEXT_PUBLIC_APP_URL;
    if (!origin || h.get('origin') !== new URL(origin).origin) throw new AppError('Invalid request origin.', 403);
  }
}
