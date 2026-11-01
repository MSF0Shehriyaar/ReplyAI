import { NextRequest, NextResponse } from 'next/server';
import { readState, writeState, db } from '@/lib/server';

// In-memory brute-force protection
const failedAttempts = new Map<string, { count: number; lockedUntil: number }>();
const SESSION_COOKIE_NAME = 'nina_owner_session';
const SECRET_SIGN_KEY = process.env.SESSION_SIGNING_KEY || '';

export interface OwnerCredentials {
  username?: string;
  usernameHash?: string;
  passwordHash?: string;
  pinHash?: string;
  salt?: string;
  pin?: string;
  hasSignedUp?: boolean;
  createdAt?: number;
  pinUpdatedAt?: number;
}

export async function hashString(value: string, salt: string): Promise<string> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(value + salt),
    { name: 'PBKDF2' },
    false,
    ['deriveBits', 'deriveKey']
  );
  const derived = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: enc.encode(salt),
      iterations: 100000,
      hash: 'SHA-256'
    },
    keyMaterial,
    256
  );
  return Array.from(new Uint8Array(derived)).map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function signToken(payload: string): Promise<string> {
  if (SECRET_SIGN_KEY.length < 32) throw new Error('Session signing is not configured.');
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(SECRET_SIGN_KEY),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(payload));
  const sigHex = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
  return `${btoa(payload)}.${sigHex}`;
}

export async function verifyToken(token: string): Promise<boolean> {
  return (await import('@/lib/owner-session')).validOwnerSession(token);

}

export async function GET(req: NextRequest) {
  try {
    const creds = await readState<OwnerCredentials | null>('owner_credentials', null);
    const hasSignedUp = !!creds?.hasSignedUp;
    
    const cookie = req.cookies.get(SESSION_COOKIE_NAME)?.value;
    const authenticated = cookie ? await verifyToken(cookie) : false;

    return NextResponse.json({
      authenticated,
      hasSignedUp,
      username: authenticated ? (creds?.username || 'Owner') : undefined,
      hasPin: !!(creds?.pinHash || creds?.pin),
      user: authenticated ? { userId: 'owner', displayName: creds?.username || 'Workspace Owner' } : undefined
    }, { status: authenticated ? 200 : 401 });
  } catch (err: any) {
    return NextResponse.json({ authenticated: false, hasSignedUp: false, error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for') || '127.0.0.1';
  const now = Date.now();

  const attempt = failedAttempts.get(ip);
  if (attempt && attempt.lockedUntil > now) {
    const waitSecs = Math.ceil((attempt.lockedUntil - now) / 1000);
    return NextResponse.json(
      { error: `Too many failed attempts. Locked for security. Try again in ${waitSecs} seconds.` },
      { status: 429 }
    );
  }

  try {
    const body: any = await req.json();
    const action = String(body?.action || 'login').trim();
    let creds = await readState<OwnerCredentials | null>('owner_credentials', null);

    // ACTION: SET / CHANGE PIN FROM DASHBOARD
    if (action === 'set-pin') {
      const cookie = req.cookies.get(SESSION_COOKIE_NAME)?.value;
      const isAuth = cookie ? await verifyToken(cookie) : false;
      if (!isAuth) {
        return NextResponse.json({ error: 'Unauthorized. Sign in as owner first.' }, { status: 401 });
      }

      const newPin = String(body?.newPin || '').trim();
      const currentPassword = String(body?.currentPassword || '').trim();

      if (!newPin || newPin.length < 4 || newPin.length > 12) {
        return NextResponse.json({ error: 'PIN must be between 4 and 12 characters/digits.' }, { status: 400 });
      }

      if (!creds || !creds.salt) {
        return NextResponse.json({ error: 'Owner credentials not found.' }, { status: 404 });
      }

      // Verify current password if provided
      if (currentPassword && creds.passwordHash) {
        const passHash = await hashString(currentPassword, creds.salt);
        if (passHash !== creds.passwordHash) {
          return NextResponse.json({ error: 'Incorrect current password.' }, { status: 403 });
        }
      }

      const pinHash = await hashString(newPin, creds.salt);
      const updatedCreds: OwnerCredentials = {
        ...creds,
        pinHash,
        pin: newPin, // keep backwards compatibility
        pinUpdatedAt: now
      };

      await writeState('owner_credentials', updatedCreds);
      return NextResponse.json({ ok: true, message: 'Owner PIN updated successfully.' });
    }

    // ACTION: SIGN UP (First-time permanent credentials setup)
    if (action === 'signup') {
      return NextResponse.json({ error: 'Public owner registration is disabled.' }, { status: 403 });
    }

    // ACTION: LOGIN USING USERNAME + PASSWORD OR PIN
    const enteredUser = String(body?.username || '').trim();
    const enteredPass = String(body?.password || body?.pin || '').trim();

    let authenticated = false;

    if (creds?.hasSignedUp && creds.passwordHash && creds.salt) {
      // 1. Verify username (case-insensitive check against stored username or hash)
      let userMatches = true;
      if (enteredUser) {
        if (creds.username) {
          userMatches = enteredUser.toLowerCase() === creds.username.toLowerCase();
        } else if (creds.usernameHash) {
          const uHash = await hashString(enteredUser.toLowerCase(), creds.salt);
          userMatches = uHash === creds.usernameHash;
        }
      }

      if (!userMatches) {
        authenticated = false;
      } else {
        // 2. Verify password or PIN
        const hash = await hashString(enteredPass, creds.salt);
        const passMatches = hash === creds.passwordHash;
        const pinMatches = (creds.pinHash && hash === creds.pinHash) || (creds.pin && enteredPass === creds.pin);

        if (passMatches || pinMatches) {
          authenticated = true;
        }
      }
    } else {
      // Fallback to configured pin before signup
      const expectedPin = process.env.OWNER_PIN;
      if (expectedPin && expectedPin.length >= 12 && enteredPass === expectedPin) {
        authenticated = true;
      }
    }

    if (!authenticated) {
      const count = (attempt?.count || 0) + 1;
      const lockedUntil = count >= 5 ? now + 15 * 60 * 1000 : 0;
      failedAttempts.set(ip, { count, lockedUntil });

      const remaining = 5 - count;
      return NextResponse.json(
        { 
          error: remaining > 0 
            ? `Incorrect credentials. ${remaining} attempts remaining before temporary lockout.` 
            : 'Too many failed attempts. Security lockout active for 15 minutes.' 
        },
        { status: 401 }
      );
    }

    // Reset failed attempts on success
    failedAttempts.delete(ip);

    // Create session (30 days validity)
    const token = await signToken(JSON.stringify({
      user: creds?.username || 'owner',
      iat: now,
      exp: now + 30 * 24 * 60 * 60 * 1000
    }));

    const res = NextResponse.json({
      ok: true,
      user: { userId: 'owner', displayName: creds?.username || 'Workspace Owner' }
    });

    res.cookies.set(SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 30 * 24 * 60 * 60
    });

    return res;
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Authentication failed' }, { status: 400 });
  }
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(SESSION_COOKIE_NAME);
  return res;
}
