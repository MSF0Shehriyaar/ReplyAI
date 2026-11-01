import {hasSessionCredentials} from '@/lib/session-credentials';
// ─── WhatsApp Multi-Tenant Authentication API ────────────────────────────
import { NextRequest, NextResponse } from 'next/server';
import {
  initDatabase,
  db,
  AppError,
  errorResponse,
  audit,
  saveSettings,
  freshBusinessSettings,
} from '@/lib/server';
import {
  hashPassword,
  createAuthSession,
  revokeSession,
  getAuthSession,
  requireMasterAdmin,
  SESSION_COOKIE_NAME,
} from '@/lib/auth';
import { z } from 'zod';
import { requireOrigin, readJSON } from '@/lib/request-security';
import { consumeRateLimit } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

const authSchema = z.discriminatedUnion('action',[
  z.object({action:z.literal('login'),email:z.string().email().max(254),password:z.string().min(1).max(256)}).strict(),
  z.object({action:z.literal('register'),businessName:z.string().trim().min(2).max(160),ownerName:z.string().trim().min(2).max(160),email:z.string().email().max(254),password:z.string().min(12).max(256),phone:z.string().max(40).optional(),category:z.string().max(160).optional(),tagline:z.string().max(500).optional(),themeColor:z.string().regex(/^#[a-fA-F0-9]{6}$/).optional()}).strict(),
  z.object({action:z.literal('create-business'),businessName:z.string().trim().min(2).max(160),ownerName:z.string().trim().min(2).max(160),email:z.string().email().max(254),password:z.string().min(12).max(256),phone:z.string().max(40).optional(),category:z.string().max(160).optional(),tagline:z.string().max(500).optional(),themeColor:z.string().regex(/^#[a-fA-F0-9]{6}$/).optional()}).strict(),
  z.object({action:z.literal('logout')}).strict(),
]);

// GET — Current authenticated user & tenant session
export async function GET(request: NextRequest) {
  try {
    if(!hasSessionCredentials(request)) return NextResponse.json({authenticated:false},{headers:{'Cache-Control':'no-store'}});
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
    requireOrigin(request);
    const parsed=authSchema.safeParse(await readJSON(request,8192));
    if (!parsed.success) throw new AppError('Check the sign-in or registration fields. Passwords must have at least 12 characters.',400);
    const body:any=parsed.data;
    const action = String(body.action || '').trim().toLowerCase();
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0].trim() || '127.0.0.1';

    // ── ACTION: LOGIN ─────────────────────────────────────────────────────
    if (action === 'login') {
      await consumeRateLimit('auth-ip:'+ip,30,15*60000);
      await consumeRateLimit('login:'+String(body.email).toLowerCase(),10,15*60000);

      const email = String(body.email || '').trim().toLowerCase();
      const password = String(body.password || '');

      if (!email || !password) {
        throw new AppError('Email and password are required.', 400);
      }

      const d = db();
      const user = await d
        .prepare('SELECT * FROM business_users WHERE email = ?')
        .bind(email)
        .first<any>();

      if (!user) {
        await audit('Login failed','Business sign-in rejected');
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

        if (!tenant || tenant.status !== 'active') {
          throw new AppError(`Your business account '${tenant?.name || 'Unavailable'}' is currently suspended. Contact administrator.`, 403);
        }
      }

      // Verify password hash
      const computedHash = await hashPassword(password, user.salt);
      if (computedHash !== user.password_hash) {
        await audit('Login failed','Business sign-in rejected');
        throw new AppError('Invalid credentials.', 401);
      }



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
    if (action === 'register' || action === 'create-business') {
      if(action==='create-business') await requireMasterAdmin(request);
      await consumeRateLimit('auth-ip:'+ip,30,15*60000);
      await consumeRateLimit(action+':'+String(body.email).toLowerCase(),action==='register'?3:10,15*60000);

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
      if (!password || password.length < 12) {
        throw new AppError('Password must be at least 12 characters long.', 400);
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

      const salt = crypto.randomUUID();
      const passwordHash = await hashPassword(password,salt);
      const userId = crypto.randomUUID();
      await d.transaction(async tx => {
        await tx.prepare("INSERT INTO business_tenants(id,name,owner_name,owner_email,phone,category,tagline,theme_color,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,'active',?,?)")
          .bind(tenantId,businessName,ownerName,email,phone,category,tagline,themeColor,now,now).run();
        await tx.prepare("INSERT INTO business_users(id,tenant_id,email,password_hash,salt,name,role,status,created_at,updated_at) VALUES (?,?,?,?,?,?,'business_admin','active',?,?)")
          .bind(userId,tenantId,email,passwordHash,salt,ownerName,now,now).run();
        const settings = {...freshBusinessSettings(businessName),tagline,category,industry:category,supportEmail:email,supportPhone:phone};
        await tx.prepare('INSERT INTO tenant_settings(tenant_id,payload,updated_at) VALUES (?,?,?)').bind(tenantId,JSON.stringify(settings),now).run();
      });

      if(action==='create-business') { await audit('Business created','Master admin created '+businessName,tenantId); return NextResponse.json({ok:true,tenantId}); }

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

      const ownerToken=request.cookies.get('nina_owner_session')?.value;
      if (ownerToken && session?.role==='master_admin') {
        const payload=JSON.parse(atob(ownerToken.split('.')[0]));
        await db().prepare('UPDATE workspace_state SET payload=? WHERE key=?').bind(JSON.stringify({revokedAt:Date.now()}),'owner_session:'+payload.jti).run();
      }
      // Revoke a business cookie too if both identities were present.
      const businessToken=request.cookies.get(SESSION_COOKIE_NAME)?.value;
      if (businessToken) {
        const {verifySessionToken}=await import('@/lib/auth');
        const business=await verifySessionToken(businessToken);
        if(business) await revokeSession(business.jti);
      }
      const res = NextResponse.json({ ok: true });
      res.cookies.delete('nina_owner_session');
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
