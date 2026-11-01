// ─── WhatsApp Multi-Tenant Authentication & Authorization ────────────────
import { db, AppError, audit } from './server.ts';
import { validStoredOwnerSession } from '../../instagram/lib/owner-session.ts';
import {isPrivateWorkspaceRequest} from '../../shared/private-workspace-bridge';

import { requireOrigin, tenantIdSchema } from './request-security';
import { hashPassword, signSessionToken, verifySessionSignature, SESSION_COOKIE_NAME, OWNER_COOKIE_NAME, type SessionPayload, type UserRole } from './session';
export { hashPassword, signSessionToken, SESSION_COOKIE_NAME, OWNER_COOKIE_NAME };
export type { SessionPayload, UserRole };

export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  const data = await verifySessionSignature(token);
  if (!data) return null;
  const row = await db().prepare(`SELECT s.revoked_at,s.expires_at,s.last_seen_at,u.status,u.role,u.tenant_id
    FROM auth_sessions s JOIN business_users u ON u.id=s.user_id
    JOIN business_tenants t ON t.id=u.tenant_id
    WHERE s.id=? AND s.user_id=? AND s.tenant_id=? AND s.role=? AND t.status='active'`)
    .bind(data.jti,data.userId,data.tenantId,data.role)
    .first<{revoked_at:number|null;expires_at:number;last_seen_at:number|null;status:string;role:string;tenant_id:string}>();
  if (!row || row.revoked_at !== null || row.expires_at <= Date.now() ||
      row.status !== 'active' || row.role !== data.role || row.tenant_id !== data.tenantId) return null;
  if(!row.last_seen_at||row.last_seen_at<Date.now()-60000)await db().prepare('UPDATE auth_sessions SET last_seen_at=? WHERE id=? AND revoked_at IS NULL').bind(Date.now(),data.jti).run();
  return data;
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
      `INSERT INTO auth_sessions (id, user_id, tenant_id, role, expires_at, created_at, ip, user_agent,last_seen_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      jti,
      user.id,
      user.tenantId,
      user.role,
      exp,
      now,
      opts?.ip || null,
      opts?.userAgent || null,
      now
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
    if (session&&session.role!=='master_admin') return session;
  }

  // 2. Check wa_session cookie
  if (cookieHeader||authHeader?.startsWith('Bearer ')) {
    const cookies = Object.fromEntries(
      (cookieHeader||'').split(';').map((c) => {
        const [k, ...v] = c.trim().split('=');
        return [k, v.join('=')];
      })
    );

    // 3. Fallback: Nina Master Admin session from Instagram Control Room
    const ownerToken=authHeader?.startsWith('Bearer ')?authHeader.slice(7).trim():cookies[OWNER_COOKIE_NAME];
    if (ownerToken&&request&&await isPrivateWorkspaceRequest(request)) {
      const isOwner = await validStoredOwnerSession(ownerToken, async key => {
        const row = await db().prepare('SELECT payload FROM workspace_state WHERE key=?').bind(key).first<{payload:string}>();
        return row ? JSON.parse(row.payload) : null;
      });
      if (isOwner) {
        const payload=JSON.parse(atob(decodeURIComponent(ownerToken).split('.')[0]));
        await db().prepare("UPDATE workspace_state SET payload=json_set(payload,'$.lastSeenAt',?) WHERE key=? AND COALESCE(json_extract(payload,'$.lastSeenAt'),0)<?").bind(Date.now(),'owner_session:'+payload.jti,Date.now()-60000).run();
        return {
          jti: payload.jti,
          userId: 'nina_admin',
          email: 'owner@workspace.local',
          name: payload.user,
          role: 'master_admin',
          tenantId: 'biz_titan_watches',
          iat: payload.iat||0,
          exp: payload.exp,
        };
      }
    }
    if(authHeader)return null;
    if (cookies[SESSION_COOKIE_NAME]) {
      const session = await verifySessionToken(cookies[SESSION_COOKIE_NAME]);
      if (session&&session.role!=='master_admin') return session;
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
  if (request && ['POST', 'PUT', 'DELETE', 'PATCH'].includes(request.method)&&!request.headers.get('authorization')?.startsWith('Bearer ')) {
    requireOrigin(request);
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

  if (!tenantIdSchema.safeParse(effectiveTenantId).success) throw new AppError('Invalid workspace.',400);

  // Check if tenant is suspended (master admin can still inspect suspended tenants)
  const d = db();
  const tenantRow = await d
    .prepare('SELECT status, name FROM business_tenants WHERE id = ?')
    .bind(effectiveTenantId)
    .first<{ status: string; name: string }>();

  if (!tenantRow || tenantRow.status === 'deleted') throw new AppError('Workspace not found.',404);
  if (tenantRow.status === 'suspended' && session.role !== 'master_admin') {
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
