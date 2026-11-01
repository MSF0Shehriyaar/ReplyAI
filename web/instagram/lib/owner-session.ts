export async function validOwnerSession(token: string | undefined): Promise<boolean> {
  try {
    // Cookie serializers percent-encode base64 padding. Both raw HTTP headers
    // and Next's decoded cookie values must verify the same signed token.
    token=decodeURIComponent(token || '').replace(/^"|"$/g,'');
    const secret = process.env.SESSION_SIGNING_KEY;
    if (!secret || secret.length < 32 || !token) return false;
    const parts = token.split('.');
    if (parts.length !== 2 || !/^[a-f0-9]{64}$/.test(parts[1])) return false;
    const payload = atob(parts[0]);
    const data = JSON.parse(payload);
    if (typeof data.user !== 'string' || !Number.isFinite(data.exp) || data.exp <= Date.now()) return false;
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey('raw', enc.encode(secret), {name:'HMAC',hash:'SHA-256'}, false, ['verify']);
    return await crypto.subtle.verify('HMAC', key, Uint8Array.from(parts[1].match(/../g)!, h => parseInt(h,16)), enc.encode(payload));
  } catch { return false; }
}

// Session presence is mandatory: deleting or revoking the server record invalidates a cookie.
export async function validStoredOwnerSession(token: string | undefined, lookup: (key: string) => Promise<any>): Promise<boolean> {
  if (!await validOwnerSession(token)) return false;
  try {
    token=decodeURIComponent(token || '').replace(/^"|"$/g,'');
    const payload = JSON.parse(atob(token!.split('.')[0]));
    if (typeof payload.jti !== 'string' || !/^[a-f0-9-]{36}$/.test(payload.jti)) return false;
    const session = await lookup('owner_session:' + payload.jti);
    return !!session && !session.revokedAt && session.expiresAt > Date.now() && session.user === payload.user;
  } catch { return false; }
}
