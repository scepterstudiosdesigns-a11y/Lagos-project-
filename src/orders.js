'use strict';

const db = require('./db');
const whatsapp = require('./services/whatsapp');
const { formatNaira } = require('./util');

// Create a PENDING order when a buyer starts checkout. We record it up front so
// that bank-transfer / slow settlements show up in "pending" on the dashboard.
function createPendingOrder({ seller, product, buyerName, buyerPhone, channel, reference, quantity = 1 }) {
  const now = Date.now();
  const info = db
    .prepare(
      `INSERT INTO orders
        (seller_id, product_id, product_name, buyer_name, buyer_phone, amount_kobo, quantity, channel, status, provider_ref, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`
    )
    .run(
      seller.id,
      product.id,
      product.name,
      buyerName || null,
      buyerPhone || null,
      product.price_kobo * quantity,
      quantity,
      channel || 'link',
      reference,
      now
    );
  return getOrderById(info.lastInsertRowid);
}

function getOrderById(id) {
  return db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
}

function getOrderByRef(reference) {
  return db.prepare('SELECT * FROM orders WHERE provider_ref = ?').get(reference);
}

// THE PRODUCT: the instant a payment clears, everything below happens
// automatically with zero manual input from the seller. Idempotent — safe to
// call from a webhook that may be delivered more than once.
async function settlePaidOrder(reference, { paidAt = Date.now() } = {}) {
  const order = getOrderByRef(reference);
  if (!order) return { ok: false, reason: 'order_not_found' };
  if (order.status === 'paid') {
    return { ok: true, alreadySettled: true, order };
  }

  const seller = db.prepare('SELECT * FROM sellers WHERE id = ?').get(order.seller_id);
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(order.product_id);

  // 1. Mark the order paid + 2. decrement stock, atomically.
  db.exec('BEGIN');
  try {
    db.prepare("UPDATE orders SET status = 'paid', paid_at = ? WHERE id = ? AND status != 'paid'").run(
      paidAt,
      order.id
    );
    if (product) {
      db.prepare('UPDATE products SET stock = MAX(stock - ?, 0) WHERE id = ?').run(
        order.quantity,
        product.id
      );
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  // 3. Send the confirmation back into the WhatsApp thread automatically.
  let confirmation = { sent: false, simulated: true };
  try {
    confirmation = await whatsapp.sendConfirmation({
      toPhone: order.buyer_phone,
      buyerName: order.buyer_name,
      productName: order.product_name,
      amountText: formatNaira(order.amount_kobo),
      businessName: seller ? seller.business_name || seller.name : '',
    });
  } catch (_) {
    /* never let confirmation failure break settlement */
  }
  // Mark the confirmation step as completed once it has run — whether it was
  // really delivered (live WhatsApp) or simulated (no credentials configured).
  if (confirmation.sent || confirmation.simulated) {
    db.prepare('UPDATE orders SET confirmation_sent = 1 WHERE id = ?').run(order.id);
  }

  // 4. Totals are derived live from the orders table (see dashboard.js), so the
  // running totals are already up to date the moment the row above committed.
  return { ok: true, order: getOrderById(order.id), confirmation };
}

module.exports = {
  createPendingOrder,
  getOrderById,
  getOrderByRef,
  settlePaidOrder,
};
