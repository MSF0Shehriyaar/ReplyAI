// ─── Order Intelligence & Precision Parser ──────────────────────────────
// Extracts single and bulk order details, line items, quantities, discounts,
// and exact payable amounts from WhatsApp customer inquiries and AI confirmations.

import { CatalogItem, WAOrderItem } from './model';

export interface ExtractedOrderData {
  type: 'bulk' | 'single';
  productName: string;
  productId?: string;
  items?: WAOrderItem[];
  quantity: number;
  subtotal: number;
  discountAmount: number;
  discountCode?: string;
  amount: number; // Final payable amount stored in wa_orders
}

export function extractOrdersFromThread(
  messages: Array<{ text: string; role?: string; at?: number }>,
  catalog: CatalogItem[]
): ExtractedOrderData[] {
  if (!messages?.length || !catalog?.length) return [];

  const fullChat = messages.map((m) => m.text).join('\n');
  const hasDiscountCode = /TITAN10/i.test(fullChat);

  // ── 1. Check for Bulk Cart Order Pattern ───────────────────────────────
  const bulkItems: WAOrderItem[] = [];
  const lineRegex = /(?:(\d+)\.\s*)?\*?([A-Za-z0-9\s-]+?)\*?(?:\s*\((?:Qty:?\s*)?(\d+)\)|\s*[×x]\s*(\d+))(?:\s*[—–-]\s*₹?\s*([0-9,]+))?/gi;
  let match: RegExpExecArray | null;

  while ((match = lineRegex.exec(fullChat)) !== null) {
    const rawName = match[2].trim();
    if (!rawName || rawName.length < 3) continue;

    const qty = parseInt(match[3] || match[4] || '1', 10);
    const catItem = catalog.find((c) => {
      const cName = c.name.toLowerCase();
      const rawLower = rawName.toLowerCase();
      const slug = c.id.replace('titan-', '').replace(/-/g, ' ');
      return rawLower.includes(cName) || cName.includes(rawLower) || rawLower.includes(slug);
    });

    if (catItem && !bulkItems.some((bi) => bi.productId === catItem.id)) {
      const linePrice = match[5]
        ? parseInt(match[5].replace(/,/g, ''), 10)
        : catItem.price * qty;

      bulkItems.push({
        productId: catItem.id,
        productName: catItem.name,
        quantity: qty,
        unitPrice: catItem.price,
        totalPrice: linePrice,
      });
    }
  }

  const payableMatch = fullChat.match(
    /(?:Final Payable|Total Payable|Grand Total|Total Amount|Payable)\s*(?::|—|-)?\s*₹?\s*([0-9,]+)/i
  );
  const subtotalMatch = fullChat.match(/(?:Subtotal)\s*(?::|—|-)?\s*₹?\s*([0-9,]+)/i);

  if (bulkItems.length > 0) {
    const totalQty = bulkItems.reduce((s, i) => s + i.quantity, 0);
    const computedSubtotal = subtotalMatch
      ? parseInt(subtotalMatch[1].replace(/,/g, ''), 10)
      : bulkItems.reduce((s, i) => s + i.totalPrice, 0);

    const computedDiscount = hasDiscountCode ? Math.round(computedSubtotal * 0.1) : 0;
    const finalAmount = payableMatch
      ? parseInt(payableMatch[1].replace(/,/g, ''), 10)
      : computedSubtotal - computedDiscount;

    const summaryName = bulkItems.map((i) => `${i.productName} (x${i.quantity})`).join(', ');

    return [
      {
        type: 'bulk',
        productName: summaryName,
        productId: bulkItems[0]?.productId,
        items: bulkItems,
        quantity: totalQty,
        subtotal: computedSubtotal,
        discountAmount: computedDiscount,
        discountCode: hasDiscountCode ? 'TITAN10' : undefined,
        amount: finalAmount,
      },
    ];
  }

  // ── 2. Check for Single Timepiece Orders ────────────────────────────────
  const singleOrders: ExtractedOrderData[] = [];

  for (const m of messages) {
    const txt = m.text;
    const singleMatch = txt.match(
      /(?:order(?:ed|ing)?\s+(?:the\s+)?|booking\s+for\s+|order\s+for\s+|want\s+to\s+buy\s+)([^()\n!.,]+?)(?:\s*\(\s*₹?\s*([0-9,]+)\s*\)|\s*at\s*₹?\s*([0-9,]+)|\s*with|\s*is now confirmed|\s*has been confirmed|$)/i
    );

    if (singleMatch) {
      const candidateName = singleMatch[1].trim();
      const catItem = catalog.find((c) => {
        const cName = c.name.toLowerCase();
        const candLower = candidateName.toLowerCase();
        const slug = c.id.replace('titan-', '').replace(/-/g, ' ');
        return candLower.includes(cName) || cName.includes(candLower) || candLower.includes(slug);
      });

      if (catItem && !singleOrders.some((so) => so.productId === catItem.id)) {
        let price = catItem.price;
        if (singleMatch[2]) price = parseInt(singleMatch[2].replace(/,/g, ''), 10);
        else if (singleMatch[3]) price = parseInt(singleMatch[3].replace(/,/g, ''), 10);

        const discount = hasDiscountCode ? Math.round(price * 0.1) : 0;
        const finalAmount = hasDiscountCode ? price - discount : price;

        singleOrders.push({
          type: 'single',
          productName: catItem.name,
          productId: catItem.id,
          quantity: 1,
          subtotal: price,
          discountAmount: discount,
          discountCode: hasDiscountCode ? 'TITAN10' : undefined,
          amount: finalAmount,
          items: [
            {
              productId: catItem.id,
              productName: catItem.name,
              quantity: 1,
              unitPrice: catItem.price,
              totalPrice: catItem.price,
            },
          ],
        });
      }
    }
  }

  if (singleOrders.length > 0) {
    return singleOrders;
  }

  // ── 3. Fallback: Reverse Scan for Specific Watch Mentions ───────────────
  for (const m of messages.slice(-8).reverse()) {
    const textLower = m.text.toLowerCase();
    if (textLower.includes('current collection') || textLower.includes('curated collection')) continue;

    for (const item of catalog) {
      const key = item.id.replace('titan-', '').replace(/-/g, ' ');
      if (textLower.includes(item.name.toLowerCase()) || textLower.includes(key)) {
        const pMatch = m.text.match(/₹\s*([0-9,]+)/);
        const price = pMatch ? parseInt(pMatch[1].replace(/,/g, ''), 10) : item.price;
        const discount = hasDiscountCode ? Math.round(price * 0.1) : 0;
        const finalAmount = hasDiscountCode ? price - discount : price;

        return [
          {
            type: 'single',
            productName: item.name,
            productId: item.id,
            quantity: 1,
            subtotal: price,
            discountAmount: discount,
            discountCode: hasDiscountCode ? 'TITAN10' : undefined,
            amount: finalAmount,
            items: [
              {
                productId: item.id,
                productName: item.name,
                quantity: 1,
                unitPrice: item.price,
                totalPrice: item.price,
              },
            ],
          },
        ];
      }
    }
  }

  // Ultimate fallback to default product with real catalog price
  const fallback = catalog[0];
  const discount = hasDiscountCode ? Math.round(fallback.price * 0.1) : 0;
  return [
    {
      type: 'single',
      productName: fallback.name,
      productId: fallback.id,
      quantity: 1,
      subtotal: fallback.price,
      discountAmount: discount,
      discountCode: hasDiscountCode ? 'TITAN10' : undefined,
      amount: fallback.price - discount,
      items: [
        {
          productId: fallback.id,
          productName: fallback.name,
          quantity: 1,
          unitPrice: fallback.price,
          totalPrice: fallback.price,
        },
      ],
    },
  ];
}

