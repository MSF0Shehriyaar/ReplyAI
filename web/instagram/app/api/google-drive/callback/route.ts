import { NextRequest, NextResponse } from 'next/server';
import { saveSecret, writeState, audit, getPublicAppOrigin } from '@/lib/server';
import { getGoogleDriveCredentials } from '@/lib/google-drive';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get('code');
    const error = searchParams.get('error');
    const rawState = searchParams.get('state');

    let origin = getPublicAppOrigin(request);
    let redirectUri = `${origin}/api/integrations/google-drive/callback`;

    if (rawState) {
      try {
        const decoded = decodeURIComponent(rawState);
        if (decoded.startsWith('{')) {
          const parsed = JSON.parse(decoded);
          if (parsed.origin) origin = parsed.origin;
          if (parsed.redirectUri) redirectUri = parsed.redirectUri;
        } else if (decoded.startsWith('http')) {
          origin = decoded;
        }
      } catch {}
    }

    if (error || !code) {
      return NextResponse.redirect(`${origin}/?view=connections&google_drive_error=${encodeURIComponent(error || 'Access denied by user')}`);
    }

    const creds = await getGoogleDriveCredentials();
    const clientId = creds.clientId;
    const clientSecret = creds.clientSecret;

    // Exchange authorization code for tokens
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code'
      })
    });

    if (!tokenRes.ok) {
      const errData: any = await tokenRes.json().catch(() => ({}));
      const msg = errData?.error_description || errData?.error || tokenRes.statusText;
      return NextResponse.redirect(`${origin}/?view=connections&google_drive_error=${encodeURIComponent(msg)}`);
    }

    const tokenData: any = await tokenRes.json();
    const accessToken = tokenData.access_token;
    const refreshToken = tokenData.refresh_token;
    const expiresAt = Date.now() + ((tokenData.expires_in || 3600) * 1000);

    // Save tokens securely in encrypted secrets
    const saves: Promise<void>[] = [
      saveSecret('google_drive_access_token', accessToken),
      saveSecret('google_drive_token_expires_at', String(expiresAt))
    ];
    if (refreshToken) {
      saves.push(saveSecret('google_drive_refresh_token', refreshToken));
    }
    await Promise.all(saves);

    // Fetch user email to display on dashboard
    let userEmail = 'Google Account';
    try {
      const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      if (userRes.ok) {
        const userData: any = await userRes.json();
        if (userData?.email) userEmail = userData.email;
      }
    } catch {}

    await writeState('google_drive_info', {
      connected: true,
      email: userEmail,
      connectedAt: Date.now()
    });

    await audit('Google Drive connected', `Successfully connected Google Drive (${userEmail})`);

    return NextResponse.redirect(`${origin}/?view=connections&google_drive_connected=true`);
  } catch (err: any) {
    const origin = getPublicAppOrigin(request);
    return NextResponse.redirect(`${origin}/?view=connections&google_drive_error=${encodeURIComponent(err?.message || 'Authentication error')}`);
  }
}
