'use strict';

// End-to-end test of the core promise: a payment becomes a record, decrements
// stock, fires a confirmation, and lands in the dashboard totals. Runs against
// an in-memory DB and the real HTTP server. No external services required.

const { test, before, after } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

process.env.DB_PATH = ':memory:';
process.env.PORT = '0';

let server, base;

before(async () => {
  server = require(path.join(__dirname, '..', 'server.js'));
  await new Promise((r) => (server.listening ? r() : server.once('listening', r)));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => server.close());

async function req(method, p, body, cookie) {
  const res = await fetch(base + p, {
    method,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const setCookie = res.headers.get('set-cookie');
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data, cookie: setCookie ? setCookie.split(';')[0] : cookie };
}

test('full sell-to-record flow', async () => {
  // sign up
  let r = await req('POST', '/api/signup', { name: 'Test', business_name: 'Test Shop', phone: '08030000099', pin: '1234' });
  assert.strictEqual(r.status, 201, JSON.stringify(r.data));
  const cookie = r.cookie;
  assert.ok(cookie);

  // add product with stock 2
  r = await req('POST', '/api/products', { name: 'Blue Dress', price_naira: 15000, stock: 2 }, cookie);
  assert.strictEqual(r.status, 201);
  const product = r.data.product;
  assert.ok(product.payment_link.includes('/pay/'));
  assert.strictEqual(product.stock, 2);

  // public checkout info (no auth)
  r = await req('GET', `/api/pay/${product.pay_token}/info`);
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.data.demo_mode, true);

  // buyer starts checkout
  r = await req('POST', `/api/pay/${product.pay_token}/init`, { buyer_name: 'Tunde', buyer_phone: '08031111111', channel: 'whatsapp' });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.data.mode, 'demo');
  const reference = r.data.reference;

  // order should now exist as pending
  r = await req('GET', '/api/orders', null, cookie);
  assert.strictEqual(r.data.orders.length, 1);
  assert.strictEqual(r.data.orders[0].status, 'pending');

  // simulate payment clearing
  r = await req('POST', `/api/pay/${product.pay_token}/simulate`, { reference });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.data.status, 'paid');

  // idempotent: settling again must not double-count
  await req('POST', `/api/pay/${product.pay_token}/simulate`, { reference });

  // stock decremented by exactly one
  r = await req('GET', '/api/products', null, cookie);
  assert.strictEqual(r.data.products[0].stock, 1);

  // order is paid + confirmation recorded
  r = await req('GET', '/api/orders', null, cookie);
  const paid = r.data.orders.find((o) => o.status === 'paid');
  assert.ok(paid, 'should have a paid order');
  assert.strictEqual(paid.confirmation_sent, true);

  // dashboard reflects the sale
  r = await req('GET', '/api/dashboard', null, cookie);
  assert.strictEqual(r.data.today.revenue_kobo, 1500000);
  assert.strictEqual(r.data.today.orders, 1);
  assert.strictEqual(r.data.topProducts[0].product_name, 'Blue Dress');

  // statement reflects exactly one paid order
  r = await req('GET', '/api/statement', null, cookie);
  assert.strictEqual(r.data.totals.orders, 1);
  assert.strictEqual(r.data.totals.revenue_kobo, 1500000);
});

test('out of stock is rejected at checkout', async () => {
  let r = await req('POST', '/api/signup', { name: 'S2', phone: '08030000088', pin: '1234' });
  const cookie = r.cookie;
  r = await req('POST', '/api/products', { name: 'OneOnly', price_naira: 1000, stock: 1 }, cookie);
  const token = r.data.product.pay_token;
  r = await req('POST', `/api/pay/${token}/init`, { buyer_name: 'A' });
  await req('POST', `/api/pay/${token}/simulate`, { reference: r.data.reference });
  // now out of stock
  r = await req('POST', `/api/pay/${token}/init`, { buyer_name: 'B' });
  assert.strictEqual(r.status, 409);
});
