// ─── WhatsApp Webhook — Receives WhatsApp Cloud API events ─────────────
import { NextRequest, NextResponse } from 'next/server';
import {
  db,
  initDatabase,
  readState,
  writeState,
  secret,
  settings,
  errorResponse,
  AppError,
  audit,
} from '@/lib/server';
import { processNextJob } from '@/lib/queue';

export const dynamic = 'force-dynamic';

// GET — Webhook Verification (WhatsApp Cloud API)
export async function GET(request: NextRequest) {
  try {
    await initDatabase();

    const url = new URL(request.url);
    const mode = url.searchParams.get('hub.mode');
    const challenge = url.searchParams.get('hub.challenge');
    const verifyToken = url.searchParams.get('hub.verify_token');

    const savedToken = await secret('wa_verify_token');
    if (!savedToken) {
      return NextResponse.json({ error: 'Verify token not configured' }, { status: 412 });
    }

    if (mode !== 'subscribe' || !verifyToken || savedToken.trim() !== verifyToken.trim() || !challenge) {
      return NextResponse.json({ error: 'Invalid verification request' }, { status: 403 });
    }

    // Mark webhook as verified
    const c = await readState<any>('wa_connection', {});
    c.webhookVerifiedAt = Date.now();
    await writeState('wa_connection', c);
    await audit('Webhook verified', 'WhatsApp webhook verification successful');

    return new Response(challenge, {
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  } catch (e) {
    return errorResponse(e);
  }
}

// POST — Receive WhatsApp Messages
export async function POST(request: NextRequest) {
  try {
    await initDatabase();

    const raw = await request.text();
    if (raw.length > 500000) throw new AppError('Event too large.', 413);

    // Verify webhook signature
    const signature = request.headers.get('x-hub-signature-256');
    const appSecret = await secret('wa_app_secret');
    if (appSecret && signature) {
      const key = await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(appSecret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
      );
      const digest = new Uint8Array(
        await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(raw))
      );
      const expected =
        'sha256=' + Array.from(digest, (b) => b.toString(16).padStart(2, '0')).join('');
      if (expected !== signature) {
        throw new AppError('Invalid webhook signature.', 403);
      }
    }

    const payload = JSON.parse(raw);

    // WhatsApp Cloud API sends events under "entry"
    if (payload.object !== 'whatsapp_business_account') {
      return NextResponse.json({ accepted: 0 });
    }

    let count = 0;
    const s = await settings();

    for (const entry of payload.entry || []) {
      for (const change of entry.changes || []) {
        if (change.field !== 'messages') continue;
        const value = change.value;
        if (!value) continue;

        // Process incoming messages
        for (const msg of value.messages || []) {
          if (!msg.from || !msg.id) continue;

          // Determine message text
          let text = '';
          let mediaType: string | undefined;
          if (msg.type === 'text') {
            text = msg.text?.body || '';
          } else if (msg.type === 'image') {
            mediaType = 'image';
            text = msg.image?.caption || '[Image]';
          } else if (msg.type === 'video') {
            mediaType = 'video';
            text = msg.video?.caption || '[Video]';
          } else if (msg.type === 'audio') {
            mediaType = 'audio';
            text = '[Voice Message]';
          } else if (msg.type === 'document') {
            mediaType = 'document';
            text = msg.document?.filename || '[Document]';
          } else if (msg.type === 'sticker') {
            mediaType = 'sticker';
            text = '[Sticker]';
          } else if (msg.type === 'location') {
            mediaType = 'location';
            text = `[Location: ${msg.location?.latitude},${msg.location?.longitude}]`;
          } else if (msg.type === 'contacts') {
            mediaType = 'contact';
            text = '[Contact Shared]';
          } else if (msg.type === 'reaction') {
            continue; // Skip reactions
          } else if (msg.type === 'interactive') {
            text = msg.interactive?.button_reply?.title || msg.interactive?.list_reply?.title || '';
          }

          // Get sender name from contacts
          const senderName =
            value.contacts?.find((c: any) => c.wa_id === msg.from)?.profile?.name || msg.from;

          const event = {
            id: `wa:${msg.id}`,
            threadId: `wa:${msg.from}`,
            channel: 'personal',
            senderPhone: msg.from,
            senderName,
            text: text.slice(0, 2000),
            mediaType,
            at: msg.timestamp ? parseInt(msg.timestamp) * 1000 : Date.now(),
          };

          const r = await db()
            .prepare(
              "INSERT OR IGNORE INTO wa_jobs (id,thread_id,payload,status,attempts,created) VALUES (?,?,?,'pending',0,?)"
            )
            .bind(event.id, event.threadId, JSON.stringify(event), Date.now())
            .run();
          count += r.meta.changes ?? 0;
        }

        // Track status updates
        for (const status of value.statuses || []) {
          // Log delivery status changes (sent, delivered, read, failed)
          if (status.status === 'failed') {
            await audit(
              'Delivery failed',
              `Message to ${status.recipient_id}: ${status.errors?.[0]?.message || 'Unknown error'}`
            );
          }
        }
      }
    }

    // Update last event
    if (count > 0) {
      const c = await readState<any>('wa_connection', {});
      c.lastEvent = Date.now();
      await writeState('wa_connection', c);

      // Auto-process jobs
      try {
        let p = 0;
        while (p < 10) {
          const res = await processNextJob();
          if (!res.processed) break;
          p += res.processed;
        }
      } catch (e) {
        console.warn('Auto drain error:', e);
      }
    }

    return NextResponse.json({ accepted: count });
  } catch (e) {
    return errorResponse(e);
  }
}
