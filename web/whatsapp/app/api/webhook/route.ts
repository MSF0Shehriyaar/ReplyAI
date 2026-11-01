import { enqueueEvent } from '@/lib/queue-ownership';
// ─── WhatsApp Webhook — Multi-Tenant Cloud API Events ────────────────────
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

// POST — Receive WhatsApp Messages with Signature & Tenant Resolution
export async function POST(request: NextRequest) {
  try {
    await initDatabase();

    const raw = await request.text();
    if (raw.length > 500000) throw new AppError('Event payload exceeds size limit.', 413);

    // 1. Mandatory Webhook Signature Validation
    const signature = request.headers.get('x-hub-signature-256');
    const appSecret = await secret('wa_app_secret');
    if (!appSecret || !signature) throw new AppError('Webhook signature required.', 403);

    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      enc.encode(appSecret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    const digest = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(raw)));
    const expected = 'sha256=' + Array.from(digest, (b) => b.toString(16).padStart(2, '0')).join('');
    if (expected !== signature) {
      throw new AppError('Invalid webhook signature.', 403);
    }

    const payload = JSON.parse(raw);
    if (payload.object !== 'whatsapp_business_account') {
      return NextResponse.json({ accepted: 0 });
    }

    let count = 0;
    const d = db();
    const touchedTenants = new Set<string>();

    for (const entry of payload.entry || []) {
      for (const change of entry.changes || []) {
        if (change.field !== 'messages') continue;
        const value = change.value;
        if (!value) continue;

        // 2. Resolve Tenant from Verified Metadata (phone_number_id)
        const phoneNumberId = value.metadata?.phone_number_id;
        let tenantId: string | undefined;

        if (phoneNumberId) {
          const conn = await d
            .prepare('SELECT tenant_id FROM tenant_connections WHERE phone_number_id = ?')
            .bind(phoneNumberId)
            .first<{ tenant_id: string }>();
          if (conn?.tenant_id) {
            tenantId = conn.tenant_id;
          }
        }

        if (!tenantId) continue; // Unknown phones never fall back to the admin workspace.

        // 3. Verify Tenant is not suspended
        const tenantRow = await d
          .prepare('SELECT status, name FROM business_tenants WHERE id = ?')
          .bind(tenantId)
          .first<{ status: string; name: string }>();

        if (!tenantRow || tenantRow.status !== 'active') {
          await audit('Webhook dropped', `Dropped event for suspended tenant: ${tenantRow?.name || tenantId}`, tenantId);
          continue;
        }

        touchedTenants.add(tenantId);

        // 4. Process incoming messages with idempotency
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
            continue;
          } else if (msg.type === 'interactive') {
            text = msg.interactive?.button_reply?.title || msg.interactive?.list_reply?.title || '';
          }

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
            tenantId,
          };

          if (await enqueueEvent(tenantId,event)) count++;

        }

        // Track delivery status updates
        for (const status of value.statuses || []) {
          if (status.status === 'failed') {
            await audit(
              'Delivery failed',
              `Message to ${status.recipient_id}: ${status.errors?.[0]?.message || 'Unknown error'}`,
              tenantId
            );
          }
        }
      }
    }

    // Auto-process queue for touched tenants
    if (count > 0) {
      for (const tId of touchedTenants) {
        try {
          await processNextJob(tId);
        } catch (e) {
          console.warn(`[WA Webhook] Queue process notice for ${tId}:`, e);
        }
      }
    }

    return NextResponse.json({ accepted: count });
  } catch (e) {
    return errorResponse(e);
  }
}
