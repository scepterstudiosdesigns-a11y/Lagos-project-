'use strict';

const config = require('../config');

// Sends the "payment received" confirmation back into the buyer's WhatsApp thread.
// With WhatsApp Cloud API credentials configured this sends a real message.
// Without them it returns { sent: false, simulated: true } so the rest of the
// pipeline (recording that a confirmation was generated) still runs.

function buildMessage({ buyerName, productName, amountText, businessName }) {
  const who = buyerName ? `Hi ${buyerName}, ` : '';
  return (
    `${who}your payment of ${amountText} for "${productName}" has been received ✅\n` +
    `Thank you! ${businessName || 'We'} will send your item shortly.`
  );
}

async function sendConfirmation({ toPhone, buyerName, productName, amountText, businessName }) {
  const text = buildMessage({ buyerName, productName, amountText, businessName });

  if (!config.whatsapp.enabled || !toPhone) {
    return { sent: false, simulated: true, text };
  }

  try {
    const to = String(toPhone).replace(/^\+/, '');
    const res = await fetch(
      `https://graph.facebook.com/v21.0/${config.whatsapp.phoneNumberId}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.whatsapp.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to,
          type: 'text',
          text: { body: text },
        }),
      }
    );
    if (!res.ok) {
      const err = await res.text().catch(() => '');
      return { sent: false, simulated: false, error: err || `HTTP ${res.status}`, text };
    }
    return { sent: true, simulated: false, text };
  } catch (err) {
    return { sent: false, simulated: false, error: err.message, text };
  }
}

module.exports = { sendConfirmation, buildMessage };
