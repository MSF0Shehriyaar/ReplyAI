// ─── WhatsApp Connection API — QR Code Scanning ─────────────────────────
import { NextRequest, NextResponse } from 'next/server';
import { getWhatsAppClient } from '@/lib/whatsapp-client';
import {
  initDatabase,
  db,
  audit,
  readState,
  writeState,
  errorResponse,
  AppError,
  getOrCreateCustomer,
  saveCustomerProfile,
} from '@/lib/server';
import { processNextJob } from '@/lib/queue';

export const dynamic = 'force-dynamic';

// GET — Get connection status + QR code
export async function GET() {
  try {
    const client = getWhatsAppClient();
    const status = client.getStatus();
    return NextResponse.json(status);
  } catch (e) {
    return errorResponse(e);
  }
}

// POST — Connection actions
export async function POST(request: NextRequest) {
  try {
    await initDatabase();
    const { action } = await request.json();

    const client = getWhatsAppClient();

    if (action === 'connect') {
      const { handleIncomingMessage } = await import('@/lib/message-handler');
      client.setMessageHandler(handleIncomingMessage);

      await client.connect();
      await audit('WhatsApp connecting', 'Initiating QR code scan...');
      return NextResponse.json({ ok: true, status: client.getStatus() });
    }

    if (action === 'disconnect') {
      await client.disconnect();
      await audit('WhatsApp disconnected', 'Disconnected from WhatsApp');
      return NextResponse.json({ ok: true });
    }

    if (action === 'logout') {
      await client.logout();
      await audit('WhatsApp logged out', 'Logged out and cleared session');
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

