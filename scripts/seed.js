'use strict';

// Seeds a demo seller with products and a spread of paid/pending orders so the
// dashboard has something to show. Run: npm run seed
const db = require('../src/db');
const util = require('../src/util');

const phone = '+2348030000001';
db.exec('DELETE FROM orders; DELETE FROM products; DELETE FROM sessions; DELETE FROM sellers;');

const seller = db
  .prepare('INSERT INTO sellers (phone, name, business_name, pin_hash, created_at) VALUES (?,?,?,?,?)')
  .run(phone, 'Amaka', 'Amaka Styles', util.hashPin('1234'), Date.now());
const sellerId = Number(seller.lastInsertRowid);

const products = [
  { name: 'Blue Ankara Dress', price: 15000, stock: 8 },
  { name: 'Beaded Slippers', price: 6500, stock: 2 },
  { name: 'Gold Hoop Earrings', price: 4500, stock: 25 },
  { name: 'Silk Headwrap', price: 3000, stock: 1 },
];
const productIds = products.map((p) => {
  const info = db
    .prepare('INSERT INTO products (seller_id,name,price_kobo,stock,low_stock_at,pay_token,created_at) VALUES (?,?,?,?,?,?,?)')
    .run(sellerId, p.name, util.koboFromNaira(p.price), p.stock, 3, util.randomToken(9), Date.now());
  return { id: Number(info.lastInsertRowid), ...p };
});

const DAY = 86400000;
const channels = ['whatsapp', 'instagram', 'link', 'tiktok'];
let created = 0;
for (let day = 6; day >= 0; day--) {
  const orderCount = Math.floor(Math.random() * 4) + (day === 0 ? 2 : 1);
  for (let i = 0; i < orderCount; i++) {
    const prod = productIds[Math.floor(Math.random() * productIds.length)];
    const ts = Date.now() - day * DAY - Math.floor(Math.random() * DAY * 0.6);
    const paid = Math.random() > 0.15;
    db.prepare(
      `INSERT INTO orders (seller_id,product_id,product_name,buyer_name,buyer_phone,amount_kobo,quantity,channel,status,provider_ref,confirmation_sent,created_at,paid_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`
    ).run(
      sellerId, prod.id, prod.name,
      ['Tunde', 'Chidi', 'Ngozi', 'Bola', 'Emeka', 'Fatima'][Math.floor(Math.random() * 6)],
      '+23480' + Math.floor(10000000 + Math.random() * 89999999),
      util.koboFromNaira(prod.price), 1,
      channels[Math.floor(Math.random() * channels.length)],
      paid ? 'paid' : 'pending',
      `SEED_${created}`, paid ? 1 : 0, ts, paid ? ts : null
    );
    created++;
  }
}

console.log(`Seeded seller "Amaka Styles" (phone ${phone}, PIN 1234) with ${productIds.length} products and ${created} orders.`);
