import { NextRequest, NextResponse } from 'next/server';
import { requireWorkspaceRequest } from '@/lib/server';
import { getGoogleDriveCredentials } from '@/lib/google-drive';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    await requireWorkspaceRequest(request);

    const creds = await getGoogleDriveCredentials();
    const clientId = creds.clientId;
    if (!clientId) {
      return NextResponse.json({ 
        error: 'Save your Google OAuth Client ID in Connections first.' 
      }, { status: 412 });
    }

    const { searchParams } = new URL(request.url);
    const origin = new URL(request.url).origin;
    
    // Support Google Cloud registered callback URIs
    const customUri = searchParams.get('redirect_uri');
    const envRedirect = (typeof process !== 'undefined' ? process.env?.GOOGLE_REDIRECT_URI : '') || '';
    const redirectUri = customUri || envRedirect || `${origin}/api/integrations/google-drive/callback`;

    const scope = encodeURIComponent('https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/userinfo.email');

    // Encode origin and redirectUri in state so callback has exact matching parameters
    const statePayload = JSON.stringify({ origin, redirectUri });
    const state = encodeURIComponent(statePayload);

    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${scope}&access_type=offline&prompt=consent&state=${state}`;

    return NextResponse.json({ authUrl, redirectUri });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed to initiate Google OAuth.' }, { status: 500 });
  }
}
