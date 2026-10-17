import { NextRequest, NextResponse } from 'next/server';
import { requireWorkspaceRequest, secret, saveSecret, readState, writeState, audit, db } from '@/lib/server';
import { 
  getGoogleDriveCredentials, 
  saveGoogleDriveCredentials, 
  listGoogleDriveImages, 
  downloadGoogleDriveFile,
  getOrCreateAutomationFolder
} from '@/lib/google-drive';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    await requireWorkspaceRequest(request);
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');

    const origin = new URL(request.url).origin;
    const redirectUri = `${origin}/api/google-drive/callback`;

    const credentials = await getGoogleDriveCredentials();
    const info = await readState<any>('google_drive_info', { connected: false });

    if (action === 'files') {
      if (!info.connected) {
        return NextResponse.json({ error: 'Google Drive is not connected.' }, { status: 412 });
      }
      const folder = await getOrCreateAutomationFolder();
      const files = await listGoogleDriveImages(60);
      return NextResponse.json({ ok: true, files, folderName: folder.name, folderId: folder.id });
    }

    return NextResponse.json({
      ok: true,
      connected: !!info.connected,
      email: info.email || '',
      connectedAt: info.connectedAt || 0,
      hasCredentials: !!(credentials.clientId && credentials.clientSecret),
      clientIdSaved: !!credentials.clientId,
      clientSecretSaved: !!credentials.clientSecret,
      redirectUri
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed to fetch Google Drive status.' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireWorkspaceRequest(request);
    const body = await request.json() as any;
    const { action } = body || {};

    if (action === 'save-credentials') {
      const { clientId, clientSecret } = body;
      if (!clientId || !clientSecret) {
        return NextResponse.json({ error: 'Please provide both Google Client ID and Client Secret.' }, { status: 400 });
      }
      await saveGoogleDriveCredentials(clientId, clientSecret);
      return NextResponse.json({ ok: true, message: 'Google OAuth credentials saved.' });
    }

    if (action === 'disconnect') {
      await db().prepare("DELETE FROM encrypted_secrets WHERE key IN ('google_drive_access_token','google_drive_refresh_token','google_drive_token_expires_at')").run();
      await writeState('google_drive_info', { connected: false, email: '' });
      await audit('Google Drive disconnected', 'Revoked Google Drive session');
      return NextResponse.json({ ok: true, message: 'Google Drive disconnected.' });
    }

    if (action === 'import-file') {
      const { fileId, name } = body;
      if (!fileId) {
        return NextResponse.json({ error: 'File ID is required.' }, { status: 400 });
      }

      const origin = new URL(request.url).origin;
      const directUrl = `${origin}/api/media?driveId=${fileId}`;

      await audit('Drive photo linked', `Selected photo "${name || fileId}" directly from Google Drive`);

      return NextResponse.json({
        ok: true,
        id: fileId,
        driveId: fileId,
        url: directUrl,
        name: name || 'Google Drive Photo',
        message: 'Google Drive photo linked successfully!'
      });
    }

    return NextResponse.json({ error: 'Invalid action.' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Operation failed.' }, { status: 500 });
  }
}
