'use strict';

const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');

const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const dbPath = process.env.DB_PATH || path.join(dataDir, 'ledgerlink.sqlite');
const db = new DatabaseSync(dbPath);

db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

db.exec(`
  CREATE TABLE IF NOT EXISTS sellers (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    phone         TEXT NOT NULL UNIQUE,
    name          TEXT NOT NULL,
    business_name TEXT,
    pin_hash      TEXT NOT NULL,
    created_at    INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token      TEXT PRIMARY KEY,
    seller_id  INTEGER NOT NULL REFERENCES sellers(id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS products (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    seller_id   INTEGER NOT NULL REFERENCES sellers(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    price_kobo  INTEGER NOT NULL,
    photo_url   TEXT,
    stock       INTEGER NOT NULL DEFAULT 0,
    low_stock_at INTEGER NOT NULL DEFAULT 3,
    pay_token   TEXT NOT NULL UNIQUE,
    archived    INTEGER NOT NULL DEFAULT 0,
    created_at  INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS orders (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    seller_id     INTEGER NOT NULL REFERENCES sellers(id) ON DELETE CASCADE,
    product_id    INTEGER NOT NULL REFERENCES products(id),
    product_name  TEXT NOT NULL,
    buyer_name    TEXT,
    buyer_phone   TEXT,
    amount_kobo   INTEGER NOT NULL,
    quantity      INTEGER NOT NULL DEFAULT 1,
    channel       TEXT NOT NULL DEFAULT 'link',
    status        TEXT NOT NULL DEFAULT 'pending', -- pending | paid | failed
    provider_ref  TEXT,
    confirmation_sent INTEGER NOT NULL DEFAULT 0,
    created_at    INTEGER NOT NULL,
    paid_at       INTEGER
  );

  CREATE INDEX IF NOT EXISTS idx_orders_seller_status ON orders(seller_id, status);
  CREATE INDEX IF NOT EXISTS idx_orders_seller_paid ON orders(seller_id, paid_at);
  CREATE INDEX IF NOT EXISTS idx_orders_ref ON orders(provider_ref);
  CREATE INDEX IF NOT EXISTS idx_products_seller ON products(seller_id, archived);
`);

module.exports = db;
