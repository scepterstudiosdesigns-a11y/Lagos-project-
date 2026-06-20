# LedgerLink

**An invisible layer underneath however you already sell — WhatsApp, Instagram, in person — that turns every payment into a structured, visible business record.**

Millions of sellers run real, profitable businesses entirely through WhatsApp and Instagram, but almost none of it is recorded anywhere except memory and a scroll-back through chat history. LedgerLink changes nothing about *how* you sell. It takes the one moment that already happens in every transaction — the payment — and turns it into permanent, usable business intelligence you never had to build, type, or remember.

The product does three things and nothing else at the start: **capture the payment, record the order, show the picture.**

---

## How it works

1. **Seller signs up with a phone number** (and a PIN) — under 10 minutes.
2. **Adds products** — name, price, photo, rough stock count — from the phone.
3. **Each product gets a unique payment link** built on Paystack. No new bank relationship, no new trust to build with customers.
4. **The selling experience doesn't change.** A customer DMs "I want the blue dress." Instead of replying with an account number, the seller pastes that product's payment link. Same five seconds.
5. **The instant the payment clears, four things happen automatically** with zero manual input — *this is the product*:
   - An **order record** is created (buyer, item, amount, time, channel).
   - **Stock decreases by one** — real-time inventory without counting anything.
   - A **confirmation is sent back into the WhatsApp thread** automatically.
   - The sale is added to the seller's **running totals** (today / this week / this product), updated live.
6. **One mobile-first dashboard** shows everything that used to live in the seller's head: today's total, this week's total, top products, stock running low, money received vs pending, and a 7-day trend. No jargon.
7. **Multi-channel for free.** The same link works pasted into Twitter, TikTok, or a QR code on a flyer — every channel feeds the same dashboard.
8. **Formalization over time.** A few months of clean history becomes a verifiable revenue record — a statement for a microfinance lender, a tax-ready summary, eligibility for inventory financing. The credit history that didn't exist before, because the business never produced verifiable records before.

---

## Run it

No dependencies to install — the app is built entirely on Node.js built-ins (`node:http`, `node:sqlite`, `node:crypto`). Requires **Node ≥ 22.5**.

```bash
npm run seed     # optional: demo seller "Amaka Styles" (phone 08030000001, PIN 1234)
npm start        # http://localhost:3000
```

Then open `http://localhost:3000`, log in (or create an account), add a product, copy its payment link, and open the link in another tab to play the buyer. In **demo mode** the checkout simulates a successful payment so you can watch the entire pipeline run — order recorded, stock down by one, confirmation logged, dashboard updated — without moving real money.

Run the end-to-end tests:

```bash
npm test
```

---

## Going live

Everything runs in **demo mode** out of the box. To accept real money and send real WhatsApp confirmations, copy `.env.example` to `.env` and fill in:

| Variable | What it enables |
| --- | --- |
| `BASE_URL` | Your public domain, so payment links work when pasted into WhatsApp/Instagram. |
| `PAYSTACK_SECRET_KEY` / `PAYSTACK_PUBLIC_KEY` | Real Paystack checkout. The simulate endpoint is automatically disabled once a secret key is present. |
| `WHATSAPP_TOKEN` / `WHATSAPP_PHONE_NUMBER_ID` | Real WhatsApp Cloud API confirmations back into the buyer's thread. |
| `APP_SECRET` | A long random string for session security. |

**Paystack webhook:** point your Paystack dashboard webhook at `https://your-domain/api/webhook/paystack`. The signature is verified with HMAC-SHA512 against the raw request body, and settlement is **idempotent** — duplicate deliveries never double-count revenue or stock.

---

## Architecture

```
server.js              HTTP server: routing, static files, raw-body webhook
src/
  config.js            .env loader + integration toggles (no dependency)
  db.js                node:sqlite schema (sellers, products, orders, sessions)
  http.js              tiny router + request/response/cookie helpers
  util.js              money (kobo), phone normalisation, PIN hashing, HMAC
  orders.js            ← the post-payment pipeline (record, decrement, confirm)
  dashboard.js         live analytics + monthly statement (Africa/Lagos time)
  routes.js            auth, products, orders, dashboard, checkout, webhook
  services/
    paystack.js        Paystack client (live) with demo fallback
    whatsapp.js        WhatsApp Cloud API (live) with simulated fallback
public/
  index.html / app.js  seller app (auth, dashboard, products, orders, grow)
  pay.html             customer checkout opened from the payment link
  styles.css           mobile-first dark UI
scripts/seed.js        demo data
test/flow.test.js      end-to-end test of the core promise
```

**Design choices**

- **Money is stored in integer kobo** to avoid floating-point drift.
- **Totals are derived live** from the `orders` table, so they're correct the instant an order is settled — there is no separate counter to keep in sync.
- **Demo-first:** every external integration degrades gracefully to a simulator, so the full flow is demonstrable with zero setup, and production-ready the moment keys are added.
- **Dates use Africa/Lagos (UTC+1, no DST)** so "today" and "this week" mean what the seller expects.

---

## Roadmap

The MVP intentionally does the three core things well. Natural next steps, in order of the problem they unlock:

- OTP login instead of a PIN; staff accounts with their own logins.
- Multiple quantities per order and product variants (size/colour).
- Automatic channel attribution via per-channel link tags (`?c=instagram`).
- Lender-facing statement export (PDF) and an inventory-financing eligibility score driven by proven sales velocity.
- Reconciliation of manual bank-transfer / POS payments against pending orders.
