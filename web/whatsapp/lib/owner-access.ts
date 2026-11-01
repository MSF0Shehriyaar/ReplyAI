import { headers } from 'next/headers';
import { validOwnerSession } from '../../instagram/lib/owner-session';
import { AppError } from './server';

export async function requireOwner(request?: Request) {
  const h = request?.headers ?? await headers();
  const token = h.get('cookie')?.split(';').map(v => v.trim()).find(v => v.startsWith('nina_owner_session='))?.slice(19);
  if (!await validOwnerSession(token)) throw new AppError('Owner authentication required.', 401);
  if (request && !['GET','HEAD'].includes(request.method)) {
    const origin = process.env.NEXT_PUBLIC_APP_URL;
    if (!origin || h.get('origin') !== new URL(origin).origin) throw new AppError('Invalid request origin.', 403);
  }
}
