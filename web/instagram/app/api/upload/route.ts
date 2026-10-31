import { NextRequest, NextResponse } from 'next/server';
import { requireWorkspaceRequest, audit, getPublicAppOrigin } from '@/lib/server';
import { uploadGoogleDriveFile } from '@/lib/google-drive';

export const dynamic = 'force-dynamic';

export function parseGoogleDriveId(url: string): string | null {
  if (!url) return null;
  const fileMatch = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (fileMatch && fileMatch[1]) return fileMatch[1];
  const idParam = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (idParam && idParam[1]) return idParam[1];
  const openMatch = url.match(/\/open\?id=([a-zA-Z0-9_-]+)/);
  if (openMatch && openMatch[1]) return openMatch[1];
  const driveParam = url.match(/[?&]driveId=([a-zA-Z0-9_-]+)/);
  if (driveParam && driveParam[1]) return driveParam[1];
  return null;
}

export async function POST(request: NextRequest) {
  try {
    await requireWorkspaceRequest(request);

    const body = await request.json() as any;
    const { dataUrl, name = 'Photoshoot Snap', googleDriveUrl } = body || {};

    const origin = getPublicAppOrigin(request);

    // 1. Google Drive Link Import
    if (googleDriveUrl) {
      const driveId = parseGoogleDriveId(googleDriveUrl);
      if (!driveId) {
        return NextResponse.json({ 
          error: 'Invalid Google Drive link. Please paste a valid Google Drive share link.' 
        }, { status: 400 });
      }

      // Stream directly from Google Drive via /api/media?driveId=...
      const driveDirectUrl = `${origin}/api/media?driveId=${driveId}`;

      return NextResponse.json({
        ok: true,
        url: driveDirectUrl,
        driveId,
        message: 'Google Drive photo linked successfully!'
      });
    }

    // 2. Direct Image Upload -> Store directly to Google Drive
    if (!dataUrl) {
      return NextResponse.json({ error: 'No image data provided.' }, { status: 400 });
    }

    const mimeMatch = dataUrl.match(/^data:([^;]+);base64,/);
    const mimeType = mimeMatch ? mimeMatch[1] : 'image/jpeg';
    const base64Data = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;

    const binaryString = atob(base64Data);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    // Upload directly to Google Drive via Drive OAuth API
    const driveFile = await uploadGoogleDriveFile(bytes.buffer, name, mimeType);

    const directUrl = `${origin}/api/media?driveId=${driveFile.id}`;

    return NextResponse.json({
      ok: true,
      id: driveFile.id,
      driveId: driveFile.id,
      url: directUrl,
      name: driveFile.name,
      message: 'Photo uploaded directly to Google Drive!'
    });
  } catch (err: any) {
    if (err?.status === 412 || err?.message?.includes('Google Drive is not connected')) {
      return NextResponse.json({ 
        error: 'Google Drive is not connected. Please connect your Google Drive in Connections first so photos upload directly to Drive.' 
      }, { status: 412 });
    }
    return NextResponse.json({ error: err?.message || 'Failed to upload photo to Google Drive.' }, { status: 500 });
  }
}
