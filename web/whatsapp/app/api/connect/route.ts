import {hasSessionCredentials} from '@/lib/session-credentials';
// ─── WhatsApp Connection API — Multi-Tenant QR Device Pairing ────────────
import { NextRequest, NextResponse } from 'next/server';
import { requireTenantAccess } from '@/lib/auth';
import { readJSON, tenantIdSchema } from '@/lib/request-security';
import { z } from 'zod';
import { getWhatsAppClient } from '@/lib/whatsapp-client';
import {
  initDatabase,
  audit,
  errorResponse,
  AppError,
} from '@/lib/server';

export const dynamic = 'force-dynamic';

// GET — Get connection status + QR code for authenticated tenant
export async function GET(request: NextRequest) {
  try {
    if(!hasSessionCredentials(request)) throw new AppError('Authentication required. Please sign in.',401);
    await initDatabase();
    const targetTenantId = request.nextUrl.searchParams.get('tenantId');
    const { tenantId } = await requireTenantAccess(request, targetTenantId);

    const client = getWhatsAppClient(tenantId);
    const status = client.getStatus();
    return NextResponse.json(status);
  } catch (e) {
    return errorResponse(e);
  }
}

// POST — Connection actions (connect, disconnect, logout)
export async function POST(request: NextRequest) {
  try {
    await initDatabase();
    const parsed=z.object({action:z.enum(['connect','disconnect','logout','status']),tenantId:tenantIdSchema.optional()}).strict().safeParse(await readJSON(request,2048));
    if(!parsed.success) throw new AppError('Invalid connection action.',400);
    const body = parsed.data;
    const targetTenantId = body.tenantId || request.nextUrl.searchParams.get('tenantId');
    const { tenantId, session } = await requireTenantAccess(request, targetTenantId);
    if(session.role === 'business_operator') throw new AppError('Business administrator access required.',403);

    const { action } = body;
    const client = getWhatsAppClient(tenantId);

    if (action === 'connect') {
      const { handleIncomingMessage } = await import('@/lib/message-handler');
      client.setMessageHandler(handleIncomingMessage);

      await client.connect();
      await audit('WhatsApp connecting', `Initiating QR code scan for [${tenantId}]`, tenantId);
      return NextResponse.json({ ok: true, status: client.getStatus() });
    }

    if (action === 'disconnect') {
      await client.disconnect();
      await audit('WhatsApp disconnected', `Disconnected device for [${tenantId}]`, tenantId);
      return NextResponse.json({ ok: true });
    }

    if (action === 'logout') {
      await client.logout();
      await audit('WhatsApp logged out', `Logged out and cleared device session for [${tenantId}]`, tenantId);
      return NextResponse.json({ ok: true });
    }

    if (action === 'status') {
      return NextResponse.json(client.getStatus());
    }

    throw new AppError('Unknown action: ' + action, 400);
  } catch (e) {
    return errorResponse(e);
  }
}
