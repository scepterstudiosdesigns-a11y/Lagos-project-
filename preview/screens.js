'use strict';
// Generates an SVG mockup of the three key LedgerLink screens so they can be
// viewed as a single image on a phone, no browser/server needed.
const fs = require('node:fs');

const C = {
  bg: '#0f1115', surface: '#181b22', surface2: '#20242e', border: '#2a2f3a',
  text: '#f4f6fb', muted: '#98a1b3', accent: '#18c07a', accentDim: '#0f7a4e',
  warn: '#f6b73c', danger: '#ff5d5d',
};
const FONT = 'system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif';

let s = [];
const W = 1290, H = 880;
s.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="${FONT}">`);
s.push(`<rect width="${W}" height="${H}" fill="#05070a"/>`);
s.push(`<text x="${W/2}" y="34" fill="${C.text}" font-size="20" font-weight="800" text-anchor="middle">LedgerLink — your WhatsApp &amp; Instagram sales, finally visible</text>`);
s.push(`<text x="${W/2}" y="58" fill="${C.muted}" font-size="13" text-anchor="middle">Same way you already sell. Every payment becomes a record automatically.</text>`);

const PHONE_W = 380, PHONE_H = 760, TOP = 80, GAP = 35;
const xs = [30, 30 + PHONE_W + GAP, 30 + 2 * (PHONE_W + GAP)];

function phone(x, title) {
  s.push(`<rect x="${x}" y="${TOP}" width="${PHONE_W}" height="${PHONE_H}" rx="30" fill="${C.bg}" stroke="${C.border}" stroke-width="2"/>`);
  s.push(`<rect x="${x + PHONE_W/2 - 40}" y="${TOP + 10}" width="80" height="6" rx="3" fill="${C.surface2}"/>`);
  s.push(`<text x="${x + PHONE_W/2}" y="${TOP + PHONE_H + 26}" fill="${C.muted}" font-size="13" font-weight="700" text-anchor="middle">${title}</text>`);
}
function card(x, y, w, h) { s.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="16" fill="${C.surface}" stroke="${C.border}"/>`); }
function t(x, y, str, { size = 14, color = C.text, weight = 400, anchor = 'start' } = {}) {
  s.push(`<text x="${x}" y="${y}" fill="${color}" font-size="${size}" font-weight="${weight}" text-anchor="${anchor}">${str}</text>`);
}
function brand(x, name) {
  s.push(`<circle cx="${x + 28}" cy="${TOP + 42}" r="6" fill="${C.accent}"/>`);
  t(x + 42, TOP + 47, 'LedgerLink', { size: 16, weight: 800 });
  t(x + 42, TOP + 64, name, { size: 11, color: C.muted });
}
function pill(x, y, w, label, color, bg) {
  s.push(`<rect x="${x}" y="${y}" width="${w}" height="22" rx="11" fill="${bg}"/>`);
  t(x + w/2, y + 15, label, { size: 11, color, weight: 700, anchor: 'middle' });
}

// ---------- Screen 1: Sales dashboard ----------
let x = xs[0];
phone(x, 'Sales dashboard — everything that used to live in your head');
brand(x, 'Amaka Styles');
let p = x + 16, iw = PHONE_W - 32;
let y = TOP + 84;
// today / week
card(p, y, iw/2 - 6, 92); card(p + iw/2 + 6, y, iw/2 - 6, 92);
t(p + 14, y + 26, 'Today', { size: 12, color: C.muted });
t(p + 14, y + 58, '₦28,000', { size: 24, weight: 800 });
t(p + 14, y + 78, '3 orders', { size: 11, color: C.muted });
t(p + iw/2 + 20, y + 26, 'This week', { size: 12, color: C.muted });
t(p + iw/2 + 20, y + 58, '₦142,500', { size: 22, weight: 800 });
t(p + iw/2 + 20, y + 78, '18 orders', { size: 11, color: C.muted });
// trend
y += 104; card(p, y, iw, 130);
t(p + 14, y + 26, 'THIS WEEK', { size: 11, color: C.muted, weight: 700 });
pill(p + iw - 130, y + 10, 116, '▲ 19% vs last week', C.accent, 'rgba(24,192,122,0.15)');
const bars = [30, 45, 38, 62, 55, 78, 100];
const bw = (iw - 28 - 6 * 8) / 7;
bars.forEach((b, i) => {
  const bh = (b / 100) * 70;
  const bx = p + 14 + i * (bw + 8);
  s.push(`<rect x="${bx}" y="${y + 110 - bh}" width="${bw}" height="${bh}" rx="3" fill="${i === 6 ? C.accent : C.accentDim}"/>`);
});
['Su','Mo','Tu','We','Th','Fr','Sa'].forEach((d, i) => t(p + 14 + i*(bw+8) + bw/2, y + 124, d, { size: 9, color: C.muted, anchor: 'middle' }));
// received vs pending
y += 142; card(p, y, iw/2 - 6, 88); card(p + iw/2 + 6, y, iw/2 - 6, 88);
t(p + 14, y + 24, 'Money received', { size: 11, color: C.muted });
t(p + 14, y + 54, '₦142,500', { size: 20, weight: 800, color: C.accent });
t(p + 14, y + 74, 'cleared this week', { size: 10, color: C.muted });
t(p + iw/2 + 20, y + 24, 'Still pending', { size: 11, color: C.muted });
t(p + iw/2 + 20, y + 54, '₦19,500', { size: 20, weight: 800, color: C.warn });
t(p + iw/2 + 20, y + 74, '2 awaiting', { size: 10, color: C.muted });
// top products
y += 100; card(p, y, iw, 118);
t(p + 14, y + 24, 'TOP PRODUCTS', { size: 11, color: C.muted, weight: 700 });
const tops = [['1. Blue Ankara Dress','8 sold','₦120,000'],['2. Beaded Slippers','3 sold','₦19,500'],['3. Gold Hoop Earrings','3 sold','₦13,500']];
tops.forEach((row, i) => {
  const ry = y + 50 + i * 24;
  t(p + 14, ry, row[0], { size: 12, weight: 600 });
  t(p + 14, ry + 13, row[1], { size: 9, color: C.muted });
  t(p + iw - 14, ry, row[2], { size: 12, weight: 700, anchor: 'end' });
});
// low stock
y += 130; card(p, y, iw, 96);
t(p + 14, y + 24, 'STOCK RUNNING LOW', { size: 11, color: C.muted, weight: 700 });
[['Silk Headwrap','1 left'],['Beaded Slippers','2 left']].forEach((row, i) => {
  const ry = y + 50 + i * 26;
  t(p + 14, ry, row[0], { size: 12, weight: 600 });
  pill(p + iw - 80, ry - 14, 66, row[1], C.danger, 'rgba(255,93,93,0.15)');
});

// ---------- Screen 2: Products ----------
x = xs[1];
phone(x, 'Products — each one gets its own payment link');
brand(x, 'Amaka Styles');
p = x + 16; y = TOP + 84;
t(p, y + 6, 'Products', { size: 22, weight: 800 });
t(p, y + 28, 'Paste a link in WhatsApp, Instagram, anywhere.', { size: 11, color: C.muted });
y += 44;
s.push(`<rect x="${p}" y="${y}" width="${iw}" height="44" rx="12" fill="${C.accent}"/>`);
t(p + iw/2, y + 28, '+ Add product', { size: 14, weight: 800, color: '#04130c', anchor: 'middle' });
y += 60;
const products = [
  ['Blue Ankara Dress','₦15,000 · 8 in stock','/pay/demoBlueDress'],
  ['Beaded Slippers','₦6,500 · 2 in stock ⚠️','/pay/demoSlippers'],
  ['Gold Hoop Earrings','₦4,500 · 25 in stock','/pay/demoEarrings'],
  ['Silk Headwrap','₦3,000 · 1 in stock ⚠️','/pay/demoHeadwrap'],
];
products.forEach((pr) => {
  card(p, y, iw, 116);
  s.push(`<rect x="${p + 14}" y="${y + 16}" width="44" height="44" rx="11" fill="${C.surface2}"/>`);
  t(p + 36, y + 44, '🏷️', { size: 18, anchor: 'middle' });
  t(p + 68, y + 34, pr[0], { size: 14, weight: 700 });
  t(p + 68, y + 52, pr[1], { size: 11, color: C.muted });
  s.push(`<rect x="${p + 14}" y="${y + 70}" width="${iw - 92}" height="32" rx="9" fill="${C.surface2}" stroke="${C.border}"/>`);
  t(p + 24, y + 90, 'ledgerlink.app' + pr[2], { size: 10, color: C.muted });
  s.push(`<rect x="${p + iw - 70}" y="${y + 70}" width="56" height="32" rx="9" fill="${C.surface2}" stroke="${C.border}"/>`);
  t(p + iw - 42, y + 90, 'Copy', { size: 11, color: C.text, weight: 600, anchor: 'middle' });
  y += 128;
});

// ---------- Screen 3: Customer checkout ----------
x = xs[2];
phone(x, 'What the customer sees when they tap the link');
brand(x, 'Amaka Styles');
p = x + 16; y = TOP + 96;
card(p, y, iw, 84);
s.push(`<rect x="${p + 14}" y="${y + 16}" width="52" height="52" rx="12" fill="${C.surface2}"/>`);
t(p + 40, y + 48, '🛍️', { size: 22, anchor: 'middle' });
t(p + 78, y + 38, 'Blue Ankara Dress', { size: 15, weight: 700 });
t(p + 78, y + 58, 'Pay securely', { size: 11, color: C.muted });
t(p + iw - 14, y + 44, '₦15,000', { size: 16, weight: 800, anchor: 'end' });
y += 100;
card(p, y, iw, 290);
const fields = [['Your name','Full name'],['WhatsApp number','0803…'],['Email (optional)','you@email.com']];
let fy = y + 20;
fields.forEach(([lab, ph]) => {
  t(p + 14, fy + 12, lab, { size: 11, color: C.muted });
  s.push(`<rect x="${p + 14}" y="${fy + 22}" width="${iw - 28}" height="40" rx="11" fill="${C.surface2}" stroke="${C.border}"/>`);
  t(p + 28, fy + 47, ph, { size: 12, color: C.muted });
  fy += 76;
});
s.push(`<rect x="${p + 14}" y="${fy + 6}" width="${iw - 28}" height="44" rx="12" fill="${C.accent}"/>`);
t(p + iw/2, fy + 34, 'Pay ₦15,000', { size: 14, weight: 800, color: '#04130c', anchor: 'middle' });
t(p + iw/2, fy + 70, '🔒 Secured by Paystack', { size: 11, color: C.muted, anchor: 'middle' });
// result card
y += 308;
card(p, y, iw, 150);
t(p + iw/2, y + 56, '✅', { size: 40, anchor: 'middle' });
t(p + iw/2, y + 92, 'Payment successful', { size: 16, weight: 800, anchor: 'middle' });
t(p + iw/2, y + 118, 'Order recorded · stock −1 · seller notified', { size: 11, color: C.accent, anchor: 'middle' });
t(p + iw/2, y + 136, 'A confirmation is sent to the WhatsApp thread', { size: 10, color: C.muted, anchor: 'middle' });

s.push('</svg>');
fs.writeFileSync('ledgerlink-screens.svg', s.join('\n'));
console.log('Wrote ledgerlink-screens.svg');
