import { NextRequest, NextResponse } from 'next/server';
import { getSnap, burnSnap, createSnapToken, requireWorkspaceRequest } from '@/lib/server';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get('token');
    const action = searchParams.get('action');

    if (!token) {
      return NextResponse.json({ error: 'Snap token is required.' }, { status: 400 });
    }

    const snap = await getSnap(token);
    if (!snap) {
      return NextResponse.json({ error: 'This snap does not exist or has already expired.' }, { status: 404 });
    }

    if (snap.burned) {
      return NextResponse.json({ 
        error: 'This exclusive snap has already been viewed and self-destructed.',
        burned: true 
      }, { status: 410 });
    }

    if (Date.now() > snap.expiresAt) {
      return NextResponse.json({ 
        error: 'This snap link has expired.',
        burned: true 
      }, { status: 410 });
    }

    if (action === 'burn') {
      await burnSnap(token);
      return NextResponse.json({ ok: true, message: 'Snap burned.' });
    }

    // Burn the snap upon reading or mark as accessed
    await burnSnap(token);

    const mediaUrlWithToken = snap.imageUrl.includes('?')
      ? `${snap.imageUrl}&snapToken=${snap.token}`
      : `${snap.imageUrl}?snapToken=${snap.token}`;

    return NextResponse.json({
      ok: true,
      token: snap.token,
      imageUrl: mediaUrlWithToken,
      username: snap.username,
      durationSeconds: snap.durationSeconds || 7
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed to retrieve snap.' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireWorkspaceRequest(request);
    const body = await request.json() as any;
    const { imageUrl, username = 'tester', accountId = 'legacy-instagram', durationSeconds = 7 } = body || {};

    if (!imageUrl) {
      return NextResponse.json({ error: 'Image URL is required.' }, { status: 400 });
    }

    const token = await createSnapToken({
      imageUrl,
      recipientId: 'test-' + Date.now(),
      username,
      accountId,
      durationSeconds
    });

    const snapBase = process.env.NEXT_PUBLIC_APP_URL || process.env.SNAP_BASE_URL || 'https://automation.ninakurainservices.in';
    const snapUrl = `${snapBase}/snap/${token}`;

    return NextResponse.json({ ok: true, token, snapUrl });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed to create snap.' }, { status: 500 });
  }
}
