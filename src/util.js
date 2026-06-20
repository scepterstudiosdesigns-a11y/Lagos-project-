'use strict';

const crypto = require('node:crypto');
const config = require('./config');

function randomToken(bytes = 24) {
  return crypto.randomBytes(bytes).toString('base64url');
}

// PIN hashing with scrypt + per-value salt. Format: salt:hash (both hex).
function hashPin(pin) {
  const salt = crypto.randomBytes(16);
  const derived = crypto.scryptSync(String(pin), salt, 32);
  return `${salt.toString('hex')}:${derived.toString('hex')}`;
}

function verifyPin(pin, stored) {
  if (!stored || !stored.includes(':')) return false;
  const [saltHex, hashHex] = stored.split(':');
  const salt = Buffer.from(saltHex, 'hex');
  const expected = Buffer.from(hashHex, 'hex');
  const derived = crypto.scryptSync(String(pin), salt, expected.length);
  return crypto.timingSafeEqual(expected, derived);
}

// Generic HMAC-SHA512 hex (used for Paystack webhook verification).
function hmacSha512(secret, payload) {
  return crypto.createHmac('sha512', secret).update(payload).digest('hex');
}

function timingSafeEqualStr(a, b) {
  const ab = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

// Normalise Nigerian phone numbers to +234XXXXXXXXXX where possible.
function normalisePhone(input) {
  if (!input) return '';
  let p = String(input).replace(/[^\d+]/g, '');
  if (p.startsWith('+')) return p;
  if (p.startsWith('234')) return `+${p}`;
  if (p.startsWith('0')) return `+234${p.slice(1)}`;
  if (p.length === 10) return `+234${p}`;
  return p;
}

function nairaFromKobo(kobo) {
  return (Number(kobo) / 100);
}

function koboFromNaira(naira) {
  return Math.round(Number(naira) * 100);
}

function formatNaira(kobo) {
  return `₦${nairaFromKobo(kobo).toLocaleString('en-NG', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
}

function paymentLink(token) {
  return `${config.baseUrl}/pay/${token}`;
}

module.exports = {
  randomToken,
  hashPin,
  verifyPin,
  hmacSha512,
  timingSafeEqualStr,
  normalisePhone,
  nairaFromKobo,
  koboFromNaira,
  formatNaira,
  paymentLink,
};
