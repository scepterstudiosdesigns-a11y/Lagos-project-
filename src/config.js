'use strict';

const fs = require('node:fs');
const path = require('node:path');

// Minimal .env loader (no dependency). Lines like KEY=value; ignores # comments.
function loadDotEnv() {
  const envPath = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(envPath)) return;
  const raw = fs.readFileSync(envPath, 'utf8');
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

loadDotEnv();

const PORT = parseInt(process.env.PORT || '3000', 10);

const config = {
  port: PORT,
  baseUrl: (process.env.BASE_URL || `http://localhost:${PORT}`).replace(/\/$/, ''),
  appSecret: process.env.APP_SECRET || 'dev-insecure-secret-change-me',
  paystack: {
    secretKey: process.env.PAYSTACK_SECRET_KEY || '',
    publicKey: process.env.PAYSTACK_PUBLIC_KEY || '',
    get enabled() {
      return Boolean(this.secretKey);
    },
  },
  whatsapp: {
    token: process.env.WHATSAPP_TOKEN || '',
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || '',
    get enabled() {
      return Boolean(this.token && this.phoneNumberId);
    },
  },
};

module.exports = config;
