// ─── WhatsApp Multi-Tenant Authentication API ────────────────────────────
import { NextRequest, NextResponse } from 'next/server';
import {
  initDatabase,
  db,
  AppError,
  errorResponse,
  audit,
  saveSettings,
} from '@/lib/server';
import {
  hashPassword,
  createAuthSession,
  revokeSession,
  getAuthSession,
  SESSION_COOKIE_NAME,
} from '@/lib/auth';
import { waDefaults } from '@/lib/model';

export const dynamic = 'force-dynamic';

// In-memory rate limiter for login/register attempts
const loginAttempts = new Map<string, { count: number; lockedUntil: number }>();

function checkRateLimit(ip: string): void {
  const now = Date.now();
  const entry = loginAttempts.get(ip);
  if (entry) {
    if (entry.lockedUntil > now) {
      const waitMinutes = Math.ceil((entry.lockedUntil - now) / 60000);
      throw new AppError(`Too many failed attempts. Try again in ${waitMinutes} minute(s).`, 429);
    }
    if (now - entry.lockedUntil > 300000) {
      loginAttempts.delete(ip);
    }
  }
}

function recordFailedAttempt(ip: string): void {
  const now = Date.now();
  const entry = loginAttempts.get(ip) || { count: 0, lockedUntil: 0 };
  entry.count++;
  if (entry.count >= 5) {
    entry.lockedUntil = now + 15 * 60 * 1000; // 15-minute lock
  }
  loginAttempts.set(ip, entry);
}

function clearRateLimit(ip: string): void {
  loginAttempts.delete(ip);
}

// GET — Current authenticated user & tenant session
export async function GET(request: NextRequest) {
  try {
    await initDatabase();
    const session = await getAuthSession(request);
    if (!session) {
      return NextResponse.json({ authenticated: false }, { status: 200 });
    }

    const d = db();
    const tenant = await d
      .prepare('SELECT id, name, owner_name, category, tagline, theme_color, status FROM business_tenants WHERE id = ?')
      .bind(session.tenantId)
      .first<any>();

    return NextResponse.json({
      authenticated: true,
      user: {
        id: session.userId,
        email: session.email,
        name: session.name,
        role: session.role,
        tenantId: session.tenantId,
      },
      tenant: tenant || {
        id: session.tenantId,
        name: 'Titan Watches',
        status: 'active',
        themeColor: '#10b981',
      },
      isNinaAdmin: session.role === 'master_admin',
    });
  } catch (e) {
    return errorResponse(e);
  }
}

// POST — Login, Register, Logout
export async function POST(request: NextRequest) {
  try {
    await initDatabase();
    const body = await request.json().catch(() => ({}));
    const action = String(body.action || '').trim().toLowerCase();
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0].trim() || '127.0.0.1';

    // ── ACTION: LOGIN ─────────────────────────────────────────────────────
    if (action === 'login') {
      checkRateLimit(ip);

      const email = String(body.email || '').trim().toLowerCase();
      const password = String(body.password || '').trim();

      if (!email || !password) {
        throw new AppError('Email and password are required.', 400);
      }

      const d = db();
      const user = await d
        .prepare('SELECT * FROM business_users WHERE email = ?')
        .bind(email)
        .first<any>();

      if (!user) {
        recordFailedAttempt(ip);
        throw new AppError('Invalid credentials.', 401);
      }

      if (user.status === 'suspended') {
        throw new AppError('Your account has been deactivated.', 403);
      }

      // Check tenant status
      if (user.tenant_id && user.role !== 'master_admin') {
        const tenant = await d
          .prepare('SELECT status, name FROM business_tenants WHERE id = ?')
          .bind(user.tenant_id)
          .first<{ status: string; name: string }>();

        if (tenant && tenant.status === 'suspended') {
          throw new AppError(`Your business account '${tenant.name}' is currently suspended. Contact administrator.`, 403);
        }
      }

      // Verify password hash
      const computedHash = await hashPassword(password, user.salt);
      if (computedHash !== user.password_hash) {
        recordFailedAttempt(ip);
        throw new AppError('Invalid credentials.', 401);
      }

      clearRateLimit(ip);

      // Create session
      const { token, session } = await createAuthSession(
        {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          tenantId: user.tenant_id || 'biz_titan_watches',
        },
        {
          ip,
          userAgent: request.headers.get('user-agent') || undefined,
        }
      );

      await audit('User login', `Logged in: ${user.email} (${user.role})`, session.tenantId);

      const res = NextResponse.json({
        ok: true,
        user: {
          id: session.userId,
          email: session.email,
          name: session.name,
          role: session.role,
          tenantId: session.tenantId,
        },
        isNinaAdmin: session.role === 'master_admin',
      });

      res.cookies.set(SESSION_COOKIE_NAME, token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 30 * 86400,
      });

      return res;
    }

    // ── ACTION: REGISTER (Free business onboarding) ───────────────────────
    if (action === 'register') {
      checkRateLimit(ip);

      const businessName = String(body.businessName || '').trim();
      const ownerName = String(body.ownerName || '').trim();
      const email = String(body.email || '').trim().toLowerCase();
      const password = String(body.password || '').trim();
      const phone = String(body.phone || '').trim();
      const category = String(body.category || 'Retail & Services').trim();
      const tagline = String(body.tagline || 'Excellence in customer care').trim();
      const themeColor = String(body.themeColor || '#10b981').trim();

      if (!businessName || businessName.length < 2) {
        throw new AppError('Business name must be at least 2 characters.', 400);
      }
      if (!ownerName || ownerName.length < 2) {
        throw new AppError('Owner name must be at least 2 characters.', 400);
      }
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        throw new AppError('Valid email address is required.', 400);
      }
      if (!password || password.length < 8) {
        throw new AppError('Password must be at least 8 characters long.', 400);
      }

      const d = db();
      const existing = await d
        .prepare('SELECT id FROM business_users WHERE email = ?')
        .bind(email)
        .first<{ id: string }>();

      if (existing) {
        throw new AppError('An account with this email already exists. Please sign in.', 409);
      }

      // Generate unique tenant ID
      const slug = businessName.toLowerCase().replace(/[^a-z0-9]/g, '_').slice(0, 16);
      const randSuffix = crypto.randomUUID().slice(0, 8);
      const tenantId = `biz_${slug}_${randSuffix}`;

      const now = Date.now();

      // 1. Create business tenant
      await d
        .prepare(
          `INSERT INTO business_tenants (id, name, owner_name, owner_email, phone, category, tagline, theme_color, status, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)`
        )
        .bind(
          tenantId,
          businessName,
          ownerName,
          email,
          phone || null,
          category,
          tagline,
          themeColor,
          now,
          now
        )
        .run();

      // 2. Create business user (business_admin)
      const salt = crypto.randomUUID();
      const passwordHash = await hashPassword(password, salt);
      const userId = crypto.randomUUID();

      await d
        .prepare(
          `INSERT INTO business_users (id, tenant_id, email, password_hash, salt, name, role, status, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, 'business_admin', 'active', ?, ?)`
        )
        .bind(
          userId,
          tenantId,
          email,
          passwordHash,
          salt,
          ownerName,
          now,
          now
        )
        .run();

      // 3. Initialize custom settings for this new business
      await saveSettings(
        {
          ...waDefaults,
          businessName,
          tagline,
          category,
          industry: category,
          supportEmail: email,
          supportPhone: phone,
          catalog: [],
        },
        tenantId
      );

      // 4. Create active session
      const { token, session } = await createAuthSession(
        {
          id: userId,
          email,
          name: ownerName,
          role: 'business_admin',
          tenantId,
        },
        {
          ip,
          userAgent: request.headers.get('user-agent') || undefined,
        }
      );

      await audit('Business registered', `Registered: ${businessName} by ${ownerName} (${email})`, tenantId);

      const res = NextResponse.json({
        ok: true,
        registered: true,
        tenantId,
        user: {
          id: session.userId,
          email: session.email,
          name: session.name,
          role: session.role,
          tenantId: session.tenantId,
        },
        isNinaAdmin: false,
      });

      res.cookies.set(SESSION_COOKIE_NAME, token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 30 * 86400,
      });

      return res;
    }

    // ── ACTION: LOGOUT ────────────────────────────────────────────────────
    if (action === 'logout') {
      const session = await getAuthSession(request);
      if (session) {
        await revokeSession(session.jti);
        await audit('User logout', `Logged out: ${session.email}`, session.tenantId);
      }

      const res = NextResponse.json({ ok: true });
      res.cookies.set(SESSION_COOKIE_NAME, '', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 0,
      });
      return res;
    }

    throw new AppError('Unknown auth action: ' + action, 400);
  } catch (e) {
    return errorResponse(e);
  }
}
