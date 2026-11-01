// ─── Cryptographic Session & Password Token Primitives ──────────────────
export type UserRole = 'master_admin' | 'business_admin' | 'business_operator';

export type SessionPayload = {
  jti: string;
  userId: string;
  email: string;
  name: string;
  role: UserRole;
  tenantId: string;
  iat: number;
  exp: number;
};

export const SESSION_COOKIE_NAME = 'wa_session';
export const OWNER_COOKIE_NAME = 'nina_owner_session';

export function getSigningKey(): string {
  const key = process.env.SESSION_SIGNING_KEY || '';
  if (key.length < 32) {
    throw new Error('SESSION_SIGNING_KEY not configured or too short (min 32 chars)');
  }
  return key;
}

export async function hashPassword(password: string, salt: string): Promise<string> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits', 'deriveKey']
  );
  const derivedKey = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: enc.encode(salt),
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'HMAC', hash: 'SHA-256', length: 256 },
    true,
    ['sign']
  );
  const exported = await crypto.subtle.exportKey('raw', derivedKey);
  return Array.from(new Uint8Array(exported))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function signSessionToken(payload: SessionPayload): Promise<string> {
  const secret = getSigningKey();
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const jsonStr = JSON.stringify(payload);
  const payloadB64 = Buffer.from(jsonStr).toString('base64url');
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(payloadB64));
  const sigHex = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return `${payloadB64}.${sigHex}`;
}

export async function verifySessionSignature(token: string): Promise<SessionPayload | null> {
  try {
    const secret = getSigningKey();
    if (!token || typeof token !== 'string') return null;
    const parts = token.trim().replace(/^"|"$/g, '').split('.');
    if (parts.length !== 2 || !/^[a-f0-9]{64}$/.test(parts[1])) return null;

    const [payloadB64, sigHex] = parts;
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      enc.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );

    const sigBytes = new Uint8Array(sigHex.match(/../g)!.map((h) => parseInt(h, 16)));
    const valid = await crypto.subtle.verify('HMAC', key, sigBytes, enc.encode(payloadB64));
    if (!valid) return null;

    const jsonStr = Buffer.from(payloadB64, 'base64url').toString('utf8');
    const data = JSON.parse(jsonStr) as SessionPayload;

    if (typeof data.jti !== 'string' || typeof data.userId !== 'string' ||
        !['business_admin','business_operator'].includes(data.role) ||
        typeof data.tenantId !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(data.tenantId) ||
        !Number.isFinite(data.exp) || !Number.isFinite(data.iat)) return null;
    if (Date.now() >= data.exp) return null;

    return data;
  } catch {
    return null;
  }
}
