import { NextRequest, NextResponse } from 'next/server';
import { readState, writeState, db, audit, isAllowedOrigin } from '@/lib/server';
import {sessionSigningSecret,SessionConfigurationError} from '../../../../shared/session-config';


const SESSION_COOKIE_NAME = 'nina_owner_session';
function requestToken(req:NextRequest){const authorization=req.headers.get('authorization');return authorization?authorization.startsWith('Bearer ')?authorization.slice(7).trim():undefined:req.cookies.get(SESSION_COOKIE_NAME)?.value;}

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

async function hashString(value: string, salt: string): Promise<string> {
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

async function signToken(payload: string): Promise<string> {
  const SECRET_SIGN_KEY=sessionSigningSecret();
  const data = { ...JSON.parse(payload), jti: crypto.randomUUID() };
  payload = JSON.stringify(data);
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
  await writeState('owner_session:' + data.jti, { user: data.user, expiresAt: data.exp,createdAt:data.iat||Date.now(),lastSeenAt:Date.now() });
  return `${btoa(payload)}.${sigHex}`;
}

async function verifyToken(token: string): Promise<boolean> {
  return (await import('@/lib/owner-session')).validStoredOwnerSession(token, async key => { const row=await db().prepare('SELECT payload FROM workspace_state WHERE key=?').bind(key).first<{payload:string}>(); return row?JSON.parse(row.payload):null; });

}

export async function GET(req: NextRequest) {
  try {
    let creds: OwnerCredentials | null = null;
    try {
      creds = await readState<OwnerCredentials | null>('owner_credentials', null);
    } catch {}
    const hasSignedUp = creds ? !!creds.hasSignedUp : true;
    
    let authenticated = false;
    try {
      const cookie = requestToken(req);
      authenticated = cookie ? await verifyToken(cookie) : false;
    } catch {
      authenticated = false;
    }

    return NextResponse.json({
      authenticated,
      hasSignedUp,
      username: authenticated ? (creds?.username || 'Owner') : undefined,
      hasPin: !!(creds?.pinHash || creds?.pin),
      user: authenticated ? { userId: 'owner', displayName: creds?.username || 'Workspace Owner' } : undefined
    }, { status: 200, headers: { 'Cache-Control': 'no-store' } });
  } catch (err: any) {
    console.error('[auth] GET error:', err);
    return NextResponse.json({ authenticated: false, hasSignedUp: true, error: null }, { status: 200 });
  }
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for') || '127.0.0.1';
  const now = Date.now();

  try {
    const origin = req.headers.get('origin');
    if (origin && !isAllowedOrigin(origin, req.url)) {
      return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403 });
    }
    const bucket = 'owner_login_rate:' + ip;
    try {
      const limit = await db().prepare(`INSERT INTO workspace_state(key,payload) VALUES (?,?)
        ON CONFLICT(key) DO UPDATE SET payload=CASE WHEN json_extract(payload,'$.until')<=? THEN excluded.payload
        ELSE json_set(payload,'$.count',json_extract(payload,'$.count')+1) END RETURNING payload`)
        .bind(bucket, JSON.stringify({ count: 1, until: now + 15 * 60000 }), now).first<{ payload: string }>();
      if (limit && JSON.parse(limit.payload).count > 20) {
        return NextResponse.json({ error: 'Too many attempts. Try again later.' }, { status: 429 });
      }
    } catch (rateErr) {
      // Non-fatal rate limiting storage fallback
    }
    const raw = await req.text();
    if (raw.length > 8192) return NextResponse.json({ error: 'Request too large.' }, { status: 413 });
    let body:any;
    try{body=JSON.parse(raw);}catch{return NextResponse.json({error:'Send a valid JSON sign-in request.'},{status:400,headers:{'Cache-Control':'no-store'}});}
    if(!body||typeof body!=='object'||Array.isArray(body))return NextResponse.json({error:'Invalid sign-in request.'},{status:400});

    const action = String(body?.action || 'login').trim();
    if(!['login','set-pin','signup'].includes(action))return NextResponse.json({error:'Unknown authentication action.'},{status:400});
    if(action==='login')sessionSigningSecret();
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
      if (!currentPassword || !creds.passwordHash) return NextResponse.json({error:"Current password required."},{status:403});
      if (creds.passwordHash) {
        const passHash = await hashString(currentPassword, creds.salt);
        if (passHash !== creds.passwordHash) {
          return NextResponse.json({ error: 'Incorrect current password.' }, { status: 403 });
        }
      }

      const pinHash = await hashString(newPin, creds.salt);
      const updatedCreds: OwnerCredentials = {
        ...creds,
        pinHash,
        pin: undefined,
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
      let userMatches = !!enteredUser;
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
        const pinMatches = creds.pinHash && hash === creds.pinHash;

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
      await audit('Login failed','Owner sign-in rejected');
      return NextResponse.json({error:'Incorrect credentials.'},{status:401});
    }
    await writeState(bucket,{count:0,until:0});
    if (creds?.pin) { delete creds.pin; await writeState('owner_credentials',creds); }
    // Create session (30 days validity)
    const token = await signToken(JSON.stringify({
      user: creds?.username || 'owner',
      iat: now,
      exp: now + 30 * 24 * 60 * 60 * 1000
    }));
    await audit('Owner login','Owner signed in');

    const res = NextResponse.json({
      ok: true,
      user: { userId: 'owner', displayName: creds?.username || 'Workspace Owner' }
    },{headers:{'Cache-Control':'no-store','Pragma':'no-cache'}});

    res.cookies.set(SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 30 * 24 * 60 * 60
    });

    return res;
  } catch (err: any) {
    if(err instanceof SessionConfigurationError){console.error('[auth] AUTH_CONFIGURATION_UNAVAILABLE: configure SESSION_SIGNING_KEY (at least 32 random characters) in the service runtime.');return NextResponse.json({error:err.message,code:err.code},{status:503,headers:{'Cache-Control':'no-store'}});}
    console.error('[auth] Authentication service failed.');
    return NextResponse.json({ error:'Authentication is temporarily unavailable. Please try again shortly.',code:'AUTH_SERVICE_UNAVAILABLE' }, { status:503,headers:{'Cache-Control':'no-store'} });
  }
}

export async function DELETE(request: NextRequest) {
  const origin = request.headers.get('origin');
  const token = requestToken(request);
  const bearer=request.headers.get('authorization')?.startsWith('Bearer ');
  if (!(bearer&&token&&await verifyToken(token))&&!isAllowedOrigin(origin, request.url)) return NextResponse.json({error:'Invalid request origin.'},{status:403});
  if (token && await verifyToken(token)) {
    const payload = JSON.parse(atob(decodeURIComponent(token).split('.')[0]));
    await writeState('owner_session:'+payload.jti,{revokedAt:Date.now()});
    await audit('Owner logout','Owner session revoked');
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(SESSION_COOKIE_NAME);
  return res;
}
