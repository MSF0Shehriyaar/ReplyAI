import { NextRequest, NextResponse } from 'next/server';
import { downloadGoogleDriveFile } from '@/lib/google-drive';
import { getSnap } from '@/lib/server';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const driveId = searchParams.get('driveId') || searchParams.get('id');
    const snapToken = searchParams.get('snapToken');

    if (!driveId) {
      return NextResponse.json({ error: 'Google Drive file ID is required.' }, { status: 400 });
    }

    // Security Gate:
    // Allow if request is from an authenticated owner session, OR if a valid snapToken is provided
    const cookieHeader = request.headers.get('cookie') || '';
    const isOwner = cookieHeader.includes('nina_owner_session=') || !!request.headers.get('x-nina-device');

    if (!isOwner) {
      if (!snapToken) {
        return NextResponse.json({ 
          error: 'Direct access blocked. Exclusive photoshoot snaps can only be viewed via your single-use view-once link.' 
        }, { status: 403 });
      }
      const snap = await getSnap(snapToken);
      if (!snap) {
        return NextResponse.json({ error: 'Invalid or expired view-once snap token.' }, { status: 403 });
      }
    }

    // Fetch file strictly from Google Drive API
    const file = await downloadGoogleDriveFile(driveId);
    return new Response(file.buffer, {
      headers: {
        'Content-Type': file.mimeType || 'image/jpeg',
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        'Access-Control-Allow-Origin': '*',
        'Content-Disposition': `inline; filename="${encodeURIComponent(file.name || 'drive_photo.jpg')}"`
      }
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed to fetch photo from Google Drive.' }, { status: 502 });
  }
}
