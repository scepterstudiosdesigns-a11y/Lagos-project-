'use strict';

const config = require('../config');

// Thin Paystack client. When no secret key is configured the app runs in DEMO
// mode: instead of redirecting to Paystack, the checkout page exposes a
// "simulate payment" action that drives the exact same post-payment pipeline.

async function paystackRequest(method, pathname, body) {
  const res = await fetch(`https://api.paystack.co${pathname}`, {
    method,
    headers: {
      Authorization: `Bearer ${config.paystack.secretKey}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.status === false) {
    const message = json.message || `Paystack error (${res.status})`;
    throw new Error(message);
  }
  return json.data;
}

// Initialise a transaction. Returns { authorization_url, reference }.
// `reference` is what we store on the order and reconcile against in the webhook.
async function initTransaction({ email, amountKobo, reference, metadata, callbackUrl }) {
  return paystackRequest('POST', '/transaction/initialize', {
    email,
    amount: amountKobo,
    reference,
    metadata,
    callback_url: callbackUrl,
  });
}

// Verify a transaction by reference. Returns the transaction data (status: 'success' etc).
async function verifyTransaction(reference) {
  return paystackRequest('GET', `/transaction/verify/${encodeURIComponent(reference)}`);
}

module.exports = {
  enabled: () => config.paystack.enabled,
  initTransaction,
  verifyTransaction,
};
