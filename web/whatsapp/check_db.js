import { allThreads, allOrders } from './lib/server.js';

async function main() {
  try {
    const threads = await allThreads();
    console.log("=== THREADS ===");
    for (const t of threads) {
      console.log(`Thread ID: ${t.id}, Name: ${t.name}, Phone: ${t.phone}`);
      console.log(`Delivery Loc:`, t.deliveryLocation);
      console.log(`Messages (${t.messages.length}):`);
      for (const m of t.messages.slice(-6)) {
        console.log(` [${m.role}] ${m.text}`);
      }
    }

    const orders = await allOrders();
    console.log("\n=== ORDERS ===");
    for (const o of orders) {
      console.log(`Order: ${o.id}, Customer: ${o.customerName}, Product: ${o.productName}, Amt: ${o.amount}, Loc:`, o.deliveryLocation?.raw);
    }
  } catch (err) {
    console.error(err);
  }
}

main();
