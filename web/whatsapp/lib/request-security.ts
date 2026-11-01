import { z } from 'zod';

export class RequestError extends Error { constructor(message: string, public status = 400) { super(message); } }
export function isAllowedOrigin(origin: string | null, requestUrl?: string): boolean {
  if (!origin) return false;
  const configured = process.env.NEXT_PUBLIC_APP_URL;
  if (configured) {
    try {
      if (origin === new URL(configured).origin) return true;
    } catch {}
  }
  if (requestUrl) {
    try {
      if (origin === new URL(requestUrl).origin) return true;
    } catch {}
  }
  // Allow local development and loopback origins
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
    return true;
  }
  return false;
}

export function requireOrigin(request: Request) {
  const origin = request.headers.get('origin');
  if (!isAllowedOrigin(origin, request.url)) {
    throw new RequestError('Invalid request origin.', 403);
  }
}
export const tenantIdSchema = z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/);
export async function readJSON(request: Request, limit = 128000): Promise<unknown> {
  if (!request.headers.get('content-type')?.includes('application/json')) throw new RequestError('JSON content type required.',415);
  const reader = request.body?.getReader();
  if (!reader) throw new RequestError('Request body required.');
  const chunks: Uint8Array[] = []; let size = 0;
  for (;;) { const {value,done} = await reader.read(); if (done) break; size += value.length; if (size > limit) { await reader.cancel(); throw new RequestError('Request too large.',413); } chunks.push(value); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk,offset); offset += chunk.length; }
  try { return JSON.parse(new TextDecoder().decode(bytes)); } catch { throw new RequestError('Invalid JSON.'); }
}
