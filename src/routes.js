'use strict';

const db = require('./db');
const config = require('./config');
const { Router, sendJson, readBody, parseCookies, cookie } = require('./http');
const util = require('./util');
const paystack = require('./services/paystack');
const orders = require('./orders');
const dashboard = require('./dashboard');

const router = new Router();

// ---- auth helpers -------------------------------------------------------
function currentSeller(req) {
  const cookies = parseCookies(req);
  let token = cookies.sid;
  const auth = req.headers.authorization;
  if (!token && auth && auth.startsWith('Bearer ')) token = auth.slice(7);
  if (!token) return null;
  const row = db
    .prepare(
      `SELECT s.* FROM sessions ses JOIN sellers s ON s.id = ses.seller_id WHERE ses.token = ?`
    )
    .get(token);
  return row || null;
}

function requireSeller(req, res) {
  const seller = currentSeller(req);
  if (!seller) {
    sendJson(res, 401, { error: 'not_authenticated' });
    return null;
  }
  return seller;
}

function publicSeller(s) {
  return { id: s.id, phone: s.phone, name: s.name, business_name: s.business_name };
}

function publicProduct(p) {
  return {
    id: p.id,
    name: p.name,
    price_kobo: p.price_kobo,
    price_naira: util.nairaFromKobo(p.price_kobo),
    photo_url: p.photo_url,
    stock: p.stock,
    low_stock_at: p.low_stock_at,
    low_stock: p.stock <= p.low_stock_at,
    pay_token: p.pay_token,
    payment_link: util.paymentLink(p.pay_token),
    archived: !!p.archived,
  };
}

// ---- auth routes --------------------------------------------------------
router.post('/api/signup', async (req, res) => {
  const body = await readBody(req);
  const phone = util.normalisePhone(body.phone);
  const name = (body.name || '').trim();
  const businessName = (body.business_name || '').trim();
  const pin = String(body.pin || '');
  if (!phone || !name) return sendJson(res, 400, { error: 'phone and name are required' });
  if (!/^\d{4,6}$/.test(pin)) return sendJson(res, 400, { error: 'pin must be 4-6 digits' });

  const existing = db.prepare('SELECT id FROM sellers WHERE phone = ?').get(phone);
  if (existing) return sendJson(res, 409, { error: 'phone already registered, please log in' });

  const info = db
    .prepare(
      `INSERT INTO sellers (phone, name, business_name, pin_hash, created_at)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(phone, name, businessName || null, util.hashPin(pin), Date.now());

  const token = util.randomToken();
  db.prepare('INSERT INTO sessions (token, seller_id, created_at) VALUES (?, ?, ?)').run(
    token,
    info.lastInsertRowid,
    Date.now()
  );
  const seller = db.prepare('SELECT * FROM sellers WHERE id = ?').get(info.lastInsertRowid);
  sendJson(res, 201, { seller: publicSeller(seller), token }, { 'Set-Cookie': cookie('sid', token) });
});

router.post('/api/login', async (req, res) => {
  const body = await readBody(req);
  const phone = util.normalisePhone(body.phone);
  const pin = String(body.pin || '');
  const seller = db.prepare('SELECT * FROM sellers WHERE phone = ?').get(phone);
  if (!seller || !util.verifyPin(pin, seller.pin_hash)) {
    return sendJson(res, 401, { error: 'invalid phone or pin' });
  }
  const token = util.randomToken();
  db.prepare('INSERT INTO sessions (token, seller_id, created_at) VALUES (?, ?, ?)').run(
    token,
    seller.id,
    Date.now()
  );
  sendJson(res, 200, { seller: publicSeller(seller), token }, { 'Set-Cookie': cookie('sid', token) });
});

router.post('/api/logout', async (req, res) => {
  const cookies = parseCookies(req);
  if (cookies.sid) db.prepare('DELETE FROM sessions WHERE token = ?').run(cookies.sid);
  sendJson(res, 200, { ok: true }, { 'Set-Cookie': cookie('sid', '', { maxAge: 0 }) });
});

router.get('/api/me', async (req, res) => {
  const seller = currentSeller(req);
  if (!seller) return sendJson(res, 200, { seller: null });
  sendJson(res, 200, {
    seller: publicSeller(seller),
    integrations: { paystack: config.paystack.enabled, whatsapp: config.whatsapp.enabled },
  });
});

// ---- products -----------------------------------------------------------
router.get('/api/products', async (req, res) => {
  const seller = requireSeller(req, res);
  if (!seller) return;
  const rows = db
    .prepare('SELECT * FROM products WHERE seller_id = ? AND archived = 0 ORDER BY created_at DESC')
    .all(seller.id);
  sendJson(res, 200, { products: rows.map(publicProduct) });
});

router.post('/api/products', async (req, res) => {
  const seller = requireSeller(req, res);
  if (!seller) return;
  const body = await readBody(req);
  const name = (body.name || '').trim();
  const priceKobo = body.price_kobo != null ? Math.round(Number(body.price_kobo)) : util.koboFromNaira(body.price_naira);
  const stock = Math.max(0, parseInt(body.stock ?? 0, 10) || 0);
  const lowStockAt = Math.max(0, parseInt(body.low_stock_at ?? 3, 10) || 0);
  if (!name) return sendJson(res, 400, { error: 'name is required' });
  if (!Number.isFinite(priceKobo) || priceKobo <= 0) return sendJson(res, 400, { error: 'price must be greater than 0' });

  const info = db
    .prepare(
      `INSERT INTO products (seller_id, name, price_kobo, photo_url, stock, low_stock_at, pay_token, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(seller.id, name, priceKobo, (body.photo_url || '').trim() || null, stock, lowStockAt, util.randomToken(9), Date.now());
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(info.lastInsertRowid);
  sendJson(res, 201, { product: publicProduct(product) });
});

router.patch('/api/products/:id', async (req, res) => {
  const seller = requireSeller(req, res);
  if (!seller) return;
  const product = db.prepare('SELECT * FROM products WHERE id = ? AND seller_id = ?').get(req.params.id, seller.id);
  if (!product) return sendJson(res, 404, { error: 'product not found' });
  const body = await readBody(req);
  const fields = {
    name: body.name != null ? String(body.name).trim() : product.name,
    price_kobo: body.price_kobo != null ? Math.round(Number(body.price_kobo)) : (body.price_naira != null ? util.koboFromNaira(body.price_naira) : product.price_kobo),
    photo_url: body.photo_url != null ? (String(body.photo_url).trim() || null) : product.photo_url,
    stock: body.stock != null ? Math.max(0, parseInt(body.stock, 10) || 0) : product.stock,
    low_stock_at: body.low_stock_at != null ? Math.max(0, parseInt(body.low_stock_at, 10) || 0) : product.low_stock_at,
  };
  db.prepare(
    'UPDATE products SET name=?, price_kobo=?, photo_url=?, stock=?, low_stock_at=? WHERE id=?'
  ).run(fields.name, fields.price_kobo, fields.photo_url, fields.stock, fields.low_stock_at, product.id);
  sendJson(res, 200, { product: publicProduct(db.prepare('SELECT * FROM products WHERE id = ?').get(product.id)) });
});

router.delete('/api/products/:id', async (req, res) => {
  const seller = requireSeller(req, res);
  if (!seller) return;
  const product = db.prepare('SELECT * FROM products WHERE id = ? AND seller_id = ?').get(req.params.id, seller.id);
  if (!product) return sendJson(res, 404, { error: 'product not found' });
  db.prepare('UPDATE products SET archived = 1 WHERE id = ?').run(product.id);
  sendJson(res, 200, { ok: true });
});

// ---- orders + dashboard -------------------------------------------------
router.get('/api/orders', async (req, res) => {
  const seller = requireSeller(req, res);
  if (!seller) return;
  const rows = db
    .prepare('SELECT * FROM orders WHERE seller_id = ? ORDER BY created_at DESC LIMIT 100')
    .all(seller.id);
  sendJson(res, 200, {
    orders: rows.map((o) => ({
      id: o.id,
      product_name: o.product_name,
      buyer_name: o.buyer_name,
      buyer_phone: o.buyer_phone,
      amount_kobo: o.amount_kobo,
      amount_text: util.formatNaira(o.amount_kobo),
      quantity: o.quantity,
      channel: o.channel,
      status: o.status,
      confirmation_sent: !!o.confirmation_sent,
      created_at: o.created_at,
      paid_at: o.paid_at,
    })),
  });
});

router.get('/api/dashboard', async (req, res) => {
  const seller = requireSeller(req, res);
  if (!seller) return;
  sendJson(res, 200, dashboard.getDashboard(seller.id));
});

// ---- formalization: statement + CSV export ------------------------------
router.get('/api/statement', async (req, res) => {
  const seller = requireSeller(req, res);
  if (!seller) return;
  const stmt = dashboard.getStatement(seller.id);
  sendJson(res, 200, {
    business: publicSeller(seller),
    generated_at: Date.now(),
    months: stmt.months.map((m) => ({ ...m, revenue_naira: util.nairaFromKobo(m.revenue_kobo) })),
    totals: { ...stmt.totals, revenue_naira: util.nairaFromKobo(stmt.totals.revenue_kobo) },
    months_active: stmt.monthsActive,
    avg_monthly_revenue_naira: util.nairaFromKobo(stmt.avgMonthlyRevenueKobo),
  });
});

router.get('/api/export.csv', async (req, res) => {
  const seller = requireSeller(req, res);
  if (!seller) return;
  const rows = db
    .prepare("SELECT * FROM orders WHERE seller_id = ? AND status = 'paid' ORDER BY paid_at ASC")
    .all(seller.id);
  const header = 'date,product,buyer,phone,channel,quantity,amount_naira\n';
  const lines = rows
    .map((o) => {
      const date = new Date(o.paid_at).toISOString();
      const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
      return [date, esc(o.product_name), esc(o.buyer_name), esc(o.buyer_phone), o.channel, o.quantity, util.nairaFromKobo(o.amount_kobo)].join(',');
    })
    .join('\n');
  res.writeHead(200, {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': 'attachment; filename="ledgerlink-sales.csv"',
  });
  res.end(header + lines + (lines ? '\n' : ''));
});

// ---- public checkout info ----------------------------------------------
router.get('/api/pay/:token/info', async (req, res) => {
  const product = db.prepare('SELECT * FROM products WHERE pay_token = ? AND archived = 0').get(req.params.token);
  if (!product) return sendJson(res, 404, { error: 'product not found' });
  const seller = db.prepare('SELECT * FROM sellers WHERE id = ?').get(product.seller_id);
  sendJson(res, 200, {
    product: {
      name: product.name,
      price_kobo: product.price_kobo,
      price_text: util.formatNaira(product.price_kobo),
      photo_url: product.photo_url,
      in_stock: product.stock > 0,
    },
    business: { name: seller.business_name || seller.name },
    demo_mode: !paystack.enabled(),
  });
});

// Start checkout. In live mode returns a Paystack authorization_url; in demo
// mode returns a reference the page can "simulate" paying.
router.post('/api/pay/:token/init', async (req, res) => {
  const product = db.prepare('SELECT * FROM products WHERE pay_token = ? AND archived = 0').get(req.params.token);
  if (!product) return sendJson(res, 404, { error: 'product not found' });
  if (product.stock <= 0) return sendJson(res, 409, { error: 'out of stock' });
  const seller = db.prepare('SELECT * FROM sellers WHERE id = ?').get(product.seller_id);
  const body = await readBody(req);
  const buyerName = (body.buyer_name || '').trim();
  const buyerPhone = util.normalisePhone(body.buyer_phone);
  const email = (body.email || '').trim() || `${buyerPhone || 'buyer'}@no-email.ledgerlink`;
  const channel = (body.channel || 'link').trim().toLowerCase();

  const reference = `LL_${product.id}_${util.randomToken(8)}`;
  orders.createPendingOrder({ seller, product, buyerName, buyerPhone, channel, reference });

  if (paystack.enabled()) {
    try {
      const data = await paystack.initTransaction({
        email,
        amountKobo: product.price_kobo,
        reference,
        metadata: { seller_id: seller.id, product_id: product.id, buyer_name: buyerName, buyer_phone: buyerPhone, channel },
        callbackUrl: `${config.baseUrl}/pay/${product.pay_token}?ref=${reference}`,
      });
      return sendJson(res, 200, { mode: 'live', authorization_url: data.authorization_url, reference });
    } catch (err) {
      return sendJson(res, 502, { error: `payment init failed: ${err.message}` });
    }
  }

  // Demo mode — no real money moves.
  sendJson(res, 200, { mode: 'demo', reference });
});

// Demo-only: simulate a successful payment, driving the real settlement pipeline.
router.post('/api/pay/:token/simulate', async (req, res) => {
  if (paystack.enabled()) return sendJson(res, 403, { error: 'simulation disabled in live mode' });
  const body = await readBody(req);
  if (!body.reference) return sendJson(res, 400, { error: 'reference required' });
  const result = await orders.settlePaidOrder(body.reference);
  if (!result.ok) return sendJson(res, 404, { error: result.reason || 'could not settle' });
  sendJson(res, 200, { ok: true, status: 'paid', confirmation: result.confirmation });
});

// ---- Paystack webhook ---------------------------------------------------
// Registered with the raw body in server.js (needs the exact bytes to verify
// the x-paystack-signature HMAC). Always returns 200 quickly.
async function paystackWebhook(req, res, rawBody) {
  const signature = req.headers['x-paystack-signature'];
  const expected = util.hmacSha512(config.paystack.secretKey, rawBody);
  if (!config.paystack.enabled || !signature || !util.timingSafeEqualStr(signature, expected)) {
    return sendJson(res, 401, { error: 'invalid signature' });
  }
  let event;
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch (_) {
    return sendJson(res, 400, { error: 'invalid json' });
  }
  // Respond fast; do the work after.
  sendJson(res, 200, { received: true });
  if (event && event.event === 'charge.success' && event.data && event.data.reference) {
    try {
      await orders.settlePaidOrder(event.data.reference, {
        paidAt: event.data.paid_at ? Date.parse(event.data.paid_at) : Date.now(),
      });
    } catch (err) {
      console.error('[webhook] settlement failed:', err.message);
    }
  }
}

module.exports = { router, paystackWebhook };
