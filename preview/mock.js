/* In-memory mock of the LedgerLink backend, used only by preview.html so the
 * real UI (public/app.js) can run offline with no server. The seeded numbers
 * mirror `npm run seed`. This file is NOT used by the production app. */
(function () {
  'use strict';

  const N = (naira) => Math.round(naira * 100); // → kobo

  const db = {
    seller: { id: 1, phone: '+2348030000001', name: 'Amaka', business_name: 'Amaka Styles' },
    products: [
      { id: 1, name: 'Blue Ankara Dress', price_kobo: N(15000), photo_url: null, stock: 8, low_stock_at: 3, pay_token: 'demoBlueDress', archived: false },
      { id: 2, name: 'Beaded Slippers', price_kobo: N(6500), photo_url: null, stock: 2, low_stock_at: 3, pay_token: 'demoSlippers', archived: false },
      { id: 3, name: 'Gold Hoop Earrings', price_kobo: N(4500), photo_url: null, stock: 25, low_stock_at: 3, pay_token: 'demoEarrings', archived: false },
      { id: 4, name: 'Silk Headwrap', price_kobo: N(3000), photo_url: null, stock: 1, low_stock_at: 3, pay_token: 'demoHeadwrap', archived: false },
    ],
    orders: [],
    nextProductId: 5,
    nextOrderId: 1,
  };

  // Build a week of paid/pending orders so the dashboard looks alive.
  const DAY = 86400000;
  const names = ['Tunde', 'Chidi', 'Ngozi', 'Bola', 'Emeka', 'Fatima'];
  const channels = ['whatsapp', 'instagram', 'link', 'tiktok'];
  let seed = 7;
  const rand = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
  for (let day = 6; day >= 0; day--) {
    const count = Math.floor(rand() * 3) + (day === 0 ? 2 : 1);
    for (let i = 0; i < count; i++) {
      const p = db.products[Math.floor(rand() * db.products.length)];
      const ts = Date.now() - day * DAY - Math.floor(rand() * DAY * 0.5);
      const paid = rand() > 0.18;
      db.orders.push({
        id: db.nextOrderId++, product_id: p.id, product_name: p.name,
        buyer_name: names[Math.floor(rand() * names.length)],
        buyer_phone: '+23480' + Math.floor(10000000 + rand() * 89999999),
        amount_kobo: p.price_kobo, quantity: 1,
        channel: channels[Math.floor(rand() * channels.length)],
        status: paid ? 'paid' : 'pending', confirmation_sent: paid,
        created_at: ts, paid_at: paid ? ts : null,
      });
    }
  }

  // Guarantee a couple of pending orders (e.g. bank transfers not yet cleared)
  // so the "money received vs pending" card has something to show.
  db.orders.push(
    { id: db.nextOrderId++, product_id: 1, product_name: 'Blue Ankara Dress', buyer_name: 'Zainab', buyer_phone: '+2348051234567', amount_kobo: db.products[0].price_kobo, quantity: 1, channel: 'whatsapp', status: 'pending', confirmation_sent: false, created_at: Date.now() - 3600000, paid_at: null },
    { id: db.nextOrderId++, product_id: 3, product_name: 'Gold Hoop Earrings', buyer_name: 'Kemi', buyer_phone: '+2348069876543', amount_kobo: db.products[2].price_kobo, quantity: 1, channel: 'instagram', status: 'pending', confirmation_sent: false, created_at: Date.now() - 1200000, paid_at: null }
  );

  const naira = (k) => k;
  const LAGOS = 3600000;
  const startToday = () => Math.floor((Date.now() + LAGOS) / DAY) * DAY - LAGOS;

  function dashboard() {
    const today0 = startToday();
    const week0 = today0 - 6 * DAY, lastWeek0 = week0 - 7 * DAY;
    const sum = (from, to) => db.orders.filter((o) => o.status === 'paid' && o.paid_at >= from && o.paid_at < to)
      .reduce((a, o) => ({ total: a.total + o.amount_kobo, count: a.count + 1 }), { total: 0, count: 0 });
    const today = sum(today0, Date.now() + 1), week = sum(week0, Date.now() + 1), last = sum(lastWeek0, week0);

    const byProduct = {};
    db.orders.filter((o) => o.status === 'paid').forEach((o) => {
      byProduct[o.product_id] = byProduct[o.product_id] || { product_id: o.product_id, product_name: o.product_name, revenue_kobo: 0, units: 0 };
      byProduct[o.product_id].revenue_kobo += o.amount_kobo;
      byProduct[o.product_id].units += o.quantity;
    });
    const topProducts = Object.values(byProduct).sort((a, b) => b.revenue_kobo - a.revenue_kobo).slice(0, 3);
    const lowStock = db.products.filter((p) => !p.archived && p.stock <= p.low_stock_at).sort((a, b) => a.stock - b.stock);
    const pending = db.orders.filter((o) => o.status === 'pending').reduce((a, o) => ({ amount_kobo: a.amount_kobo + o.amount_kobo, count: a.count + 1 }), { amount_kobo: 0, count: 0 });
    const trend = [];
    for (let i = 6; i >= 0; i--) { const d0 = today0 - i * DAY; const s = sum(d0, d0 + DAY); trend.push({ date: new Date(d0).toISOString().slice(0, 10), total_kobo: s.total }); }
    const delta = last.total === 0 ? (week.total > 0 ? 100 : 0) : Math.round(((week.total - last.total) / last.total) * 100);
    return { today: { revenue_kobo: today.total, orders: today.count }, week: { revenue_kobo: week.total, orders: week.count }, lastWeek: { revenue_kobo: last.total, orders: last.count }, weekDeltaPct: delta, topProducts, lowStock, pending, trend };
  }

  function publicProduct(p) {
    return { id: p.id, name: p.name, price_kobo: p.price_kobo, price_naira: p.price_kobo / 100, photo_url: p.photo_url, stock: p.stock, low_stock_at: p.low_stock_at, low_stock: p.stock <= p.low_stock_at, pay_token: p.pay_token, payment_link: location.origin + '/pay/' + p.pay_token, archived: p.archived };
  }

  function statement() {
    const months = {};
    db.orders.filter((o) => o.status === 'paid').forEach((o) => {
      const m = new Date(o.paid_at + LAGOS).toISOString().slice(0, 7);
      months[m] = months[m] || { month: m, orders: 0, revenue_kobo: 0 };
      months[m].orders++; months[m].revenue_kobo += o.amount_kobo;
    });
    const list = Object.values(months).sort((a, b) => a.month.localeCompare(b.month));
    const totalRev = list.reduce((a, m) => a + m.revenue_kobo, 0);
    const totalOrders = list.reduce((a, m) => a + m.orders, 0);
    return { business: db.seller, generated_at: Date.now(), months: list.map((m) => ({ ...m, revenue_naira: m.revenue_kobo / 100 })), totals: { orders: totalOrders, revenue_kobo: totalRev, revenue_naira: totalRev / 100 }, months_active: list.length, avg_monthly_revenue_naira: list.length ? totalRev / 100 / list.length : 0 };
  }

  // Override fetch for the endpoints app.js calls.
  const json = (obj, status = 200) => Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(obj) });
  window.fetch = function (path, opts = {}) {
    const method = (opts.method || 'GET').toUpperCase();
    const body = opts.body ? JSON.parse(opts.body) : {};
    const m = path.match(/\/api\/products\/(\d+)/);
    if (path === '/api/me') return json({ seller: db.seller, integrations: { paystack: false, whatsapp: false } });
    if (path === '/api/logout') { return json({ ok: true }); }
    if (path === '/api/dashboard') return json(dashboard());
    if (path === '/api/statement') return json(statement());
    if (path === '/api/orders') return json({ orders: db.orders.slice().sort((a, b) => b.created_at - a.created_at).map((o) => ({ ...o, amount_text: '₦' + (o.amount_kobo / 100).toLocaleString('en-NG') })) });
    if (path === '/api/products' && method === 'GET') return json({ products: db.products.filter((p) => !p.archived).map(publicProduct) });
    if (path === '/api/products' && method === 'POST') {
      const p = { id: db.nextProductId++, name: body.name, price_kobo: Math.round((body.price_naira || 0) * 100), photo_url: body.photo_url || null, stock: body.stock || 0, low_stock_at: body.low_stock_at ?? 3, pay_token: 'demo' + Math.random().toString(36).slice(2, 8), archived: false };
      db.products.unshift(p); return json({ product: publicProduct(p) }, 201);
    }
    if (m && method === 'PATCH') {
      const p = db.products.find((x) => x.id == m[1]);
      if (body.name != null) p.name = body.name;
      if (body.price_naira != null) p.price_kobo = Math.round(body.price_naira * 100);
      if (body.photo_url != null) p.photo_url = body.photo_url || null;
      if (body.stock != null) p.stock = body.stock;
      if (body.low_stock_at != null) p.low_stock_at = body.low_stock_at;
      return json({ product: publicProduct(p) });
    }
    if (m && method === 'DELETE') { const p = db.products.find((x) => x.id == m[1]); if (p) p.archived = true; return json({ ok: true }); }
    return json({ error: 'not found in preview' }, 404);
  };
})();
