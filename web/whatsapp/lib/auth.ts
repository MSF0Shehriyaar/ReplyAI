// ─── WhatsApp Multi-Tenant Authentication & Authorization ────────────────
import { db, AppError, audit } from './server.ts';
import { validOwnerSession } from '../../instagram/lib/owner-session.ts';

export type UserRole = 'master_admin' | 'business_admin' | 'business_operator';

export type SessionPayload = {
  jti: string;
  userId: string;
  email: string;
  name: string;
  role: UserRole;
  tenantId: string; // 'biz_titan_watches' or registered tenant id
  iat: number;
  exp: number;
};

export const SESSION_COOKIE_NAME = 'wa_session';
export const OWNER_COOKIE_NAME = 'nina_owner_session';

function getSigningKey(): string {
  const key = process.env.SESSION_SIGNING_KEY || '';
  if (key.length < 32) {
    throw new AppError('SESSION_SIGNING_KEY not configured or too short (min 32 chars)', 503);
  }
  return key;
}

// ── Password Hashing ────────────────────────────────────────────────────

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

// ── Token Signing & Verification ────────────────────────────────────────

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

export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  try {
    const secret = getSigningKey();
    if (!token || typeof token !== 'string') return null;
    const parts = token.trim().replace(/^"|"$/g, '').split('.');
    if (parts.length !== 2 || !/^[a-f0-9]{64}$/.test(parts[1])) return false as any;

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

    if (!data.jti || !data.userId || !data.role || !data.exp) return null;
    if (Date.now() >= data.exp) return null;

    // Check revocation in database
    const d = db();
    const sessionRow = await d
      .prepare('SELECT revoked_at, expires_at FROM auth_sessions WHERE id = ?')
      .bind(data.jti)
      .first<{ revoked_at: number | null; expires_at: number }>();

    if (sessionRow && (sessionRow.revoked_at !== null || Date.now() >= sessionRow.expires_at)) {
      return null;
    }

    return data;
  } catch {
    return null;
  }
}

// ── Session Management (Database-backed) ────────────────────────────────

export async function createAuthSession(
  user: { id: string; email: string; name: string; role: UserRole; tenantId: string },
  opts?: { ip?: string; userAgent?: string; durationDays?: number }
): Promise<{ token: string; session: SessionPayload }> {
  const jti = crypto.randomUUID();
  const now = Date.now();
  const duration = (opts?.durationDays || 30) * 86400000;
  const exp = now + duration;

  const payload: SessionPayload = {
    jti,
    userId: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    tenantId: user.tenantId,
    iat: now,
    exp,
  };

  const token = await signSessionToken(payload);

  const d = db();
  await d
    .prepare(
      `INSERT INTO auth_sessions (id, user_id, tenant_id, role, expires_at, created_at, ip, user_agent)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      jti,
      user.id,
      user.tenantId,
      user.role,
      exp,
      now,
      opts?.ip || null,
      opts?.userAgent || null
    )
    .run();

  return { token, session: payload };
}

export async function revokeSession(jti: string) {
  const d = db();
  await d
    .prepare('UPDATE auth_sessions SET revoked_at = ? WHERE id = ?')
    .bind(Date.now(), jti)
    .run();
}

export async function revokeAllUserSessions(userId: string) {
  const d = db();
  await d
    .prepare('UPDATE auth_sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL')
    .bind(Date.now(), userId)
    .run();
}

// ── Request Authorization Helpers ───────────────────────────────────────

export async function getAuthSession(request?: Request): Promise<SessionPayload | null> {
  let cookieHeader: string | null = null;
  let authHeader: string | null = null;

  if (request) {
    cookieHeader = request.headers.get('cookie');
    authHeader = request.headers.get('authorization');
  } else {
    try {
      const { headers } = await import('next/headers');
      const h = await headers();
      cookieHeader = h.get('cookie');
      authHeader = h.get('authorization');
    } catch {}
  }

  // 1. Check Bearer token
  if (authHeader?.startsWith('Bearer ')) {
    const bearer = authHeader.slice(7).trim();
    const session = await verifySessionToken(bearer);
    if (session) return session;
  }

  // 2. Check wa_session cookie
  if (cookieHeader) {
    const cookies = Object.fromEntries(
      cookieHeader.split(';').map((c) => {
        const [k, ...v] = c.trim().split('=');
        return [k, v.join('=')];
      })
    );

    if (cookies[SESSION_COOKIE_NAME]) {
      const session = await verifySessionToken(cookies[SESSION_COOKIE_NAME]);
      if (session) return session;
    }

    // 3. Fallback: Nina Master Admin session from Instagram Control Room
    if (cookies[OWNER_COOKIE_NAME]) {
      const isOwner = await validOwnerSession(cookies[OWNER_COOKIE_NAME]);
      if (isOwner) {
        return {
          jti: 'owner_session',
          userId: 'nina_admin',
          email: 'nina@ninakurainservices.in',
          name: 'Nina Kurain',
          role: 'master_admin',
          tenantId: 'biz_titan_watches',
          iat: Date.now(),
          exp: Date.now() + 86400000,
        };
      }
    }
  }

  return null;
}

export async function requireAuth(request?: Request): Promise<SessionPayload> {
  const session = await getAuthSession(request);
  if (!session) {
    throw new AppError('Authentication required. Please sign in.', 401);
  }

  // Origin / CSRF validation on mutating methods
  if (request && ['POST', 'PUT', 'DELETE', 'PATCH'].includes(request.method)) {
    const origin = process.env.NEXT_PUBLIC_APP_URL;
    const reqOrigin = request.headers.get('origin');
    if (origin && reqOrigin && new URL(origin).origin !== reqOrigin) {
      throw new AppError('Invalid request origin.', 403);
    }
  }

  return session;
}

export async function requireTenantAccess(
  request?: Request,
  targetTenantId?: string | null
): Promise<{ session: SessionPayload; tenantId: string }> {
  const session = await requireAuth(request);

  let effectiveTenantId = session.tenantId;

  // Master admin can inspect any requested tenant
  if (session.role === 'master_admin') {
    if (targetTenantId) {
      effectiveTenantId = targetTenantId;
    }
  } else {
    // Non-master admin CANNOT access other tenants
    if (targetTenantId && targetTenantId !== session.tenantId) {
      throw new AppError('Access forbidden: cannot access another business workspace.', 403);
    }
    effectiveTenantId = session.tenantId;
  }

  // Check if tenant is suspended (master admin can still inspect suspended tenants)
  const d = db();
  const tenantRow = await d
    .prepare('SELECT status, name FROM business_tenants WHERE id = ?')
    .bind(effectiveTenantId)
    .first<{ status: string; name: string }>();

  if (tenantRow && tenantRow.status === 'suspended' && session.role !== 'master_admin') {
    throw new AppError(`Access suspended: '${tenantRow.name}' has been deactivated by administrator.`, 403);
  }

  return { session, tenantId: effectiveTenantId };
}

export async function requireMasterAdmin(request?: Request): Promise<SessionPayload> {
  const session = await requireAuth(request);
  if (session.role !== 'master_admin') {
    throw new AppError('Forbidden: Master administrator access required.', 403);
  }
  return session;
}
