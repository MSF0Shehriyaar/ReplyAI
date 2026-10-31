import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  return NextResponse.json({
    connected: true,
    phone: '+91 99728 09609',
    name: 'Titan Watches Luxury Concierge',
    ready: true,
    pairingCode: null,
    qr: null,
    mode: 'baileys',
  }, {
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      Pragma: 'no-cache',
    },
  });
}

