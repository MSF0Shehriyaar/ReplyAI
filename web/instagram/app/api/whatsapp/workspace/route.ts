import { NextRequest, NextResponse } from 'next/server';
import { db, errorResponse } from '@/lib/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// GET — Load WhatsApp workspace state from shared Turso DB
export async function GET() {
  try {
    const d = db();

    // 1. Settings
    let settings = null;
    try {
      const row = await d.prepare('SELECT payload FROM wa_state WHERE key = ?').bind('wa_settings').first<{ payload: string }>();
      if (row?.payload) settings = JSON.parse(row.payload);
    } catch {}

    // 2. Threads
    let threads: any[] = [];
    try {
      const rows = (await d.prepare('SELECT payload FROM wa_threads ORDER BY updated DESC LIMIT 100').all<{ payload: string }>()).results;
      threads = (rows || []).map((r) => {
        const t = JSON.parse(r.payload);
        if (t.deliveryLocation?.raw && /mohommadiya|mohammadiya|shanthinagar|shantinagar/i.test(t.deliveryLocation.raw)) {
          t.deliveryLocation.lat = 12.3297;
          t.deliveryLocation.lng = 76.6792;
          t.deliveryLocation.pincode = t.deliveryLocation.pincode || '570019';
          t.deliveryLocation.city = 'Mysuru';
        }
        return t;
      });
    } catch {}

    // 3. Orders (with automatic thread reconciliation & multi-order support)
    let orders: any[] = [];
    try {
      const rows = (await d.prepare('SELECT payload FROM wa_orders ORDER BY created DESC LIMIT 200').all<{ payload: string }>()).results;
      orders = (rows || []).map((r) => {
        const o = JSON.parse(r.payload);
        if (o.deliveryLocation?.raw && /mohommadiya|mohammadiya|shanthinagar|shantinagar/i.test(o.deliveryLocation.raw)) {
          o.deliveryLocation.lat = 12.3297;
          o.deliveryLocation.lng = 76.6792;
          o.deliveryLocation.pincode = o.deliveryLocation.pincode || '570019';
          o.deliveryLocation.city = 'Mysuru';
        }
        return o;
      });

      // Reconcile any confirmed thread missing from orders using order-parser
      const { extractOrdersFromThread } = await import('@/lib/whatsapp/order-parser');
      const { titanWatchesCatalog } = await import('@/lib/whatsapp/model');

      for (const thread of threads) {
        const fullChat = (thread.messages || []).map((m: any) => m.text).join('\n');
        const hasConfirmation =
          (thread.tags || []).includes('order_confirmed') ||
          /\b(?:order.*(is|now)?.*confirmed|your order for .* is now confirmed|order has been confirmed|booking confirmed)\b/i.test(fullChat);

        if (hasConfirmation) {
          const parsedOrders = extractOrdersFromThread(thread.messages || [], settings.catalog || titanWatchesCatalog || []);

          const loc = thread.deliveryLocation;
          if (loc?.raw && /mohommadiya|mohammadiya|shanthinagar|shantinagar/i.test(loc.raw)) {
            loc.lat = 12.3297;
            loc.lng = 76.6792;
            loc.pincode = loc.pincode || '570019';
            loc.city = 'Mysuru';
          }
          const isReady = !!(loc && loc.pincode && !loc.pincodeMissing);
          const isUpi = /upi|online|prepaid/i.test(fullChat);

          for (const item of parsedOrders) {
            const existing = orders.find((o: any) => o.threadId === thread.id && (o.productId === item.productId || o.productName === item.productName));
            if (existing) {
              let updated = false;
              if (existing.amount !== item.amount) {
                existing.amount = item.amount;
                updated = true;
              }
              if (existing.productName !== item.productName) {
                existing.productName = item.productName;
                existing.productId = item.productId;
                updated = true;
              }
              if (item.items && (!existing.items || existing.items.length !== item.items.length)) {
                existing.items = item.items;
                existing.quantity = item.quantity;
                existing.subtotal = item.subtotal;
                existing.discountAmount = item.discountAmount;
                updated = true;
              }
              if (loc && (!existing.deliveryLocation || existing.deliveryLocation.lat !== loc.lat)) {
                existing.deliveryLocation = loc;
                updated = true;
              }
              if (updated) {
                existing.updatedAt = Date.now();
                await d.prepare('UPDATE wa_orders SET payload=?, status=?, updated=? WHERE id=?')
                  .bind(JSON.stringify(existing), existing.orderStatus, Date.now(), existing.id).run();
              }
              continue;
            }

            const orderNum = Math.floor(1000 + Math.random() * 9000);
            const newOrder = {
              id: `ORD-${orderNum}`,
              threadId: thread.id,
              customerName: thread.name || 'Customer',
              customerPhone: thread.phone || '',
              productName: item.productName,
              productId: item.productId,
              items: item.items,
              quantity: item.quantity,
              subtotal: item.subtotal,
              discountAmount: item.discountAmount,
              amount: item.amount,
              currency: 'INR',
              discountCode: item.discountCode || 'TITAN10',
              paymentMode: isUpi ? 'UPI' : 'COD',
              paymentStatus: isUpi ? 'paid' : 'pending',
              orderStatus: isReady ? 'ready_for_dispatch' : 'confirmed',
              deliveryLocation: loc,
              courierPartner: 'BlueDart',
              createdAt: Date.now(),
              updatedAt: Date.now(),
            };
            await d.prepare('INSERT INTO wa_orders (id,thread_id,phone,payload,status,created,updated) VALUES (?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,status=excluded.status,updated=excluded.updated')
              .bind(newOrder.id, newOrder.threadId, newOrder.customerPhone, JSON.stringify(newOrder), newOrder.orderStatus, newOrder.createdAt, Date.now()).run();
            orders.unshift(newOrder);
          }
        }
      }
    } catch {}

    // 4. Activity Logs
    let logs: any[] = [];
    try {
      const rows = (await d.prepare('SELECT * FROM wa_activity ORDER BY created DESC LIMIT 50').all<any>()).results;
      logs = rows || [];
    } catch {}

    // 5. Connection Status
    let connections = {
      connected: true,
      ready: true,
      phone: '+91 99728 09609',
      name: 'Titan Watches Luxury Concierge',
    };

    return NextResponse.json({
      settings: settings || {
        enabled: true,
        businessName: 'Titan Watches',
        businessDescription: 'Iconic luxury watchmaker since 1984.',
        language: 'English',
        tone: 'Luxury Concierge',
        approval: false,
        discountCode: 'TITAN10',
        shippingPolicy: 'Free Pan-India Express Delivery in 2-4 days',
        warrantyPolicy: '2 Years International Warranty',
      },
      threads,
      orders,
      connections,
      logs,
      analytics: {
        totalOrders: orders.length,
        readyOrders: orders.filter((o) => o.orderStatus === 'ready_for_dispatch').length,
        totalRevenue: orders.reduce((sum, o) => sum + (o.amount || 0), 0),
        activeThreads: threads.length,
      },
      storageReady: true,
    }, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        Pragma: 'no-cache',
        Expires: '0',
      },
    });
  } catch (e) {
    return errorResponse(e);
  }
}

// POST — Handle WhatsApp workspace actions
export async function POST(request: NextRequest) {
  try {
    const body: any = await request.json();
    const { action } = body;
    const d = db();

    switch (action) {
      case 'update-order-status': {
        const { orderId, status, courierPartner, trackingNumber } = body;
        const row = await d.prepare('SELECT payload FROM wa_orders WHERE id=?').bind(orderId).first<{ payload: string }>();
        if (row?.payload) {
          const ord = JSON.parse(row.payload);
          if (status) ord.orderStatus = status;
          if (courierPartner) ord.courierPartner = courierPartner;
          if (trackingNumber !== undefined) ord.trackingNumber = trackingNumber;
          ord.updatedAt = Date.now();
          await d.prepare('UPDATE wa_orders SET payload=?, status=?, updated=? WHERE id=?')
            .bind(JSON.stringify(ord), ord.orderStatus, ord.updatedAt, orderId)
            .run();
        }
        return NextResponse.json({ ok: true, message: 'Order updated' });
      }

      case 'delete-order': {
        const { orderId } = body;
        await d.prepare('DELETE FROM wa_orders WHERE id=?').bind(orderId).run();
        return NextResponse.json({ ok: true, message: 'Order deleted' });
      }

      case 'create-order': {
        const { order } = body;
        if (!order || !order.id) {
          return NextResponse.json({ error: 'Invalid order payload' }, { status: 400 });
        }
        await d.prepare(
          'INSERT INTO wa_orders (id,thread_id,phone,payload,status,created,updated) VALUES (?,?,?,?,?,?,?)'
        )
          .bind(
            order.id,
            order.threadId || `manual-${Date.now()}`,
            order.customerPhone || '',
            JSON.stringify(order),
            order.orderStatus || 'ready_for_dispatch',
            order.createdAt || Date.now(),
            order.updatedAt || Date.now()
          )
          .run();
        return NextResponse.json({ ok: true, order });
      }

      case 'save-settings': {
        const { settings } = body;
        await d.prepare('INSERT INTO wa_state (key,payload) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET payload=excluded.payload')
          .bind('wa_settings', JSON.stringify(settings))
          .run();
        return NextResponse.json({ ok: true, message: 'Settings saved' });
      }

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (e) {
    return errorResponse(e);
  }
}

