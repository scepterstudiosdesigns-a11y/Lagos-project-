'use strict';

const db = require('./db');

const DAY = 24 * 60 * 60 * 1000;

// Start of "today" in the seller's local time. We keep the server simple and use
// Africa/Lagos (UTC+1, no DST) which is correct for the target market.
const LAGOS_OFFSET_MS = 1 * 60 * 60 * 1000;

function startOfTodayLagos(now = Date.now()) {
  const shifted = now + LAGOS_OFFSET_MS;
  const startShifted = Math.floor(shifted / DAY) * DAY;
  return startShifted - LAGOS_OFFSET_MS;
}

function sumPaid(sellerId, fromTs, toTs) {
  const row = db
    .prepare(
      `SELECT COALESCE(SUM(amount_kobo), 0) AS total, COUNT(*) AS count
       FROM orders
       WHERE seller_id = ? AND status = 'paid' AND paid_at >= ? AND paid_at < ?`
    )
    .get(sellerId, fromTs, toTs);
  return { total: row.total, count: row.count };
}

function getDashboard(sellerId, now = Date.now()) {
  const todayStart = startOfTodayLagos(now);
  const weekStart = todayStart - 6 * DAY; // rolling 7-day window incl. today
  const lastWeekStart = weekStart - 7 * DAY;

  const today = sumPaid(sellerId, todayStart, now + 1);
  const week = sumPaid(sellerId, weekStart, now + 1);
  const lastWeek = sumPaid(sellerId, lastWeekStart, weekStart);

  // Top 3 products by paid revenue (all-time).
  const topProducts = db
    .prepare(
      `SELECT product_id, product_name,
              COALESCE(SUM(amount_kobo), 0) AS revenue_kobo,
              SUM(quantity) AS units
       FROM orders
       WHERE seller_id = ? AND status = 'paid'
       GROUP BY product_id, product_name
       ORDER BY revenue_kobo DESC
       LIMIT 3`
    )
    .all(sellerId);

  // Low stock — flagged automatically against each product's threshold.
  const lowStock = db
    .prepare(
      `SELECT id, name, stock, low_stock_at
       FROM products
       WHERE seller_id = ? AND archived = 0 AND stock <= low_stock_at
       ORDER BY stock ASC`
    )
    .all(sellerId);

  // Money received vs still pending.
  const pending = db
    .prepare(
      `SELECT COALESCE(SUM(amount_kobo), 0) AS total, COUNT(*) AS count
       FROM orders WHERE seller_id = ? AND status = 'pending'`
    )
    .get(sellerId);

  // 7-day trend line (paid revenue per day, oldest -> newest).
  const trend = [];
  for (let i = 6; i >= 0; i--) {
    const dayStart = todayStart - i * DAY;
    const dayEnd = dayStart + DAY;
    const d = sumPaid(sellerId, dayStart, dayEnd);
    trend.push({ date: new Date(dayStart).toISOString().slice(0, 10), total_kobo: d.total });
  }

  const weekDelta =
    lastWeek.total === 0
      ? (week.total > 0 ? 100 : 0)
      : Math.round(((week.total - lastWeek.total) / lastWeek.total) * 100);

  return {
    today: { revenue_kobo: today.total, orders: today.count },
    week: { revenue_kobo: week.total, orders: week.count },
    lastWeek: { revenue_kobo: lastWeek.total, orders: lastWeek.count },
    weekDeltaPct: weekDelta,
    topProducts,
    lowStock,
    pending: { amount_kobo: pending.total, count: pending.count },
    trend,
  };
}

// Formalization layer: a clean monthly revenue statement built from real,
// verifiable transaction history — the credit history that didn't exist before.
function getStatement(sellerId) {
  const months = db
    .prepare(
      `SELECT strftime('%Y-%m', paid_at / 1000, 'unixepoch', '+1 hour') AS month,
              COUNT(*) AS orders,
              COALESCE(SUM(amount_kobo), 0) AS revenue_kobo
       FROM orders
       WHERE seller_id = ? AND status = 'paid'
       GROUP BY month
       ORDER BY month ASC`
    )
    .all(sellerId);

  const totals = db
    .prepare(
      `SELECT COUNT(*) AS orders, COALESCE(SUM(amount_kobo), 0) AS revenue_kobo,
              MIN(paid_at) AS first_sale, MAX(paid_at) AS last_sale
       FROM orders WHERE seller_id = ? AND status = 'paid'`
    )
    .get(sellerId);

  const monthsActive = months.length;
  const avgMonthly = monthsActive ? Math.round(totals.revenue_kobo / monthsActive) : 0;

  return { months, totals, monthsActive, avgMonthlyRevenueKobo: avgMonthly };
}

module.exports = { getDashboard, getStatement, startOfTodayLagos };
