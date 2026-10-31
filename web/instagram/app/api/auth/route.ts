import { NextRequest, NextResponse } from 'next/server';
import { readState, writeState, db } from '@/lib/server';

// In-memory brute-force protection
const failedAttempts = new Map<string, { count: number; lockedUntil: number }>();
const DEFAULT_PIN = '123456';
const SESSION_COOKIE_NAME = 'nina_owner_session';
const SECRET_SIGN_KEY = 'nina_secure_owner_auth_key_2026';

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
  try {
    const [payloadB64, sigHex] = token.split('.');
    if (!payloadB64 || !sigHex) return false;
    const payload = atob(payloadB64);
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      enc.encode(SECRET_SIGN_KEY),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );
    const sigBytes = new Uint8Array(sigHex.match(/../g)!.map(h => parseInt(h, 16)));
    const valid = await crypto.subtle.verify('HMAC', key, sigBytes, enc.encode(payload));
    if (!valid) return false;
    const data = JSON.parse(payload);
    if (data.exp && Date.now() > data.exp) return false;
    return true;
  } catch {
    return false;
  }
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
      if (creds?.hasSignedUp) {
        return NextResponse.json(
          { error: 'An owner account is already registered. Please sign in.' },
          { status: 409 }
        );
      }

      const username = String(body?.username || '').trim();
      const password = String(body?.password || '').trim();
      const pin = String(body?.pin || '').trim();

      if (!username || username.length < 3) {
        return NextResponse.json({ error: 'Username must be at least 3 characters long.' }, { status: 400 });
      }
      if (!password || password.length < 6) {
        return NextResponse.json({ error: 'Password must be at least 6 characters long.' }, { status: 400 });
      }

      const salt = crypto.randomUUID();
      const passwordHash = await hashString(password, salt);
      const usernameHash = await hashString(username.toLowerCase(), salt);
      const pinHash = pin ? await hashString(pin, salt) : undefined;

      const newCreds: OwnerCredentials = {
        username,
        usernameHash,
        passwordHash,
        pinHash,
        pin: pin || undefined,
        salt,
        hasSignedUp: true,
        createdAt: now
      };

      await writeState('owner_credentials', newCreds);

      // Create session for the new owner
      const token = await signToken(JSON.stringify({
        user: username,
        iat: now,
        exp: now + 30 * 24 * 60 * 60 * 1000
      }));

      const res = NextResponse.json({
        ok: true,
        registered: true,
        user: { userId: 'owner', displayName: username }
      });

      res.cookies.set(SESSION_COOKIE_NAME, token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 30 * 24 * 60 * 60
      });

      return res;
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
      const expectedPin = process.env.OWNER_PIN || DEFAULT_PIN;
      if (enteredPass === expectedPin) {
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
