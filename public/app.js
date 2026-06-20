'use strict';

const App = (() => {
  const el = (id) => document.getElementById(id);
  const app = el('app');
  let state = { seller: null, tab: 'home', integrations: {} };

  // ---- helpers ----------------------------------------------------------
  async function api(method, path, body) {
    const res = await fetch(path, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `request failed (${res.status})`);
    return data;
  }

  function naira(kobo) {
    return '₦' + (kobo / 100).toLocaleString('en-NG', { maximumFractionDigits: 2 });
  }

  function toast(msg, ms = 2600) {
    const t = el('toast');
    t.innerHTML = `<div class="toast">${msg}</div>`;
    setTimeout(() => (t.innerHTML = ''), ms);
  }

  function esc(s) {
    return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }

  function timeAgo(ts) {
    if (!ts) return '';
    const s = Math.floor((Date.now() - ts) / 1000);
    if (s < 60) return 'just now';
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
    return `${Math.floor(s / 86400)}d ago`;
  }

  // ---- auth screen ------------------------------------------------------
  function renderAuth(mode = 'signup') {
    app.innerHTML = `
      <div class="brand"><span class="dot"></span> LedgerLink
        <small>Your WhatsApp &amp; Instagram sales — finally visible</small>
      </div>
      <div class="card">
        <h1>${mode === 'signup' ? 'Start in under 10 minutes' : 'Welcome back'}</h1>
        <p class="muted">${mode === 'signup' ? 'Keep selling the way you already do. We just record every payment for you.' : 'Log in to your dashboard.'}</p>
        <div id="authForm" class="mt"></div>
      </div>
      <p class="center muted">
        ${mode === 'signup'
          ? 'Already have an account? <button class="btn-link" id="toLogin">Log in</button>'
          : 'New here? <button class="btn-link" id="toSignup">Create account</button>'}
      </p>`;

    const form = el('authForm');
    form.innerHTML =
      (mode === 'signup'
        ? `<div class="field"><label>Your name</label><input id="f_name" placeholder="e.g. Amaka" /></div>
           <div class="field"><label>Business name (optional)</label><input id="f_biz" placeholder="e.g. Amaka Styles" /></div>`
        : '') +
      `<div class="field"><label>Phone number</label><input id="f_phone" inputmode="tel" placeholder="0803 123 4567" /></div>
       <div class="field"><label>${mode === 'signup' ? 'Create a 4-digit PIN' : 'PIN'}</label><input id="f_pin" inputmode="numeric" maxlength="6" type="password" placeholder="••••" /></div>
       <button class="btn" id="f_submit">${mode === 'signup' ? 'Create my account' : 'Log in'}</button>`;

    el('f_submit').onclick = async () => {
      const phone = el('f_phone').value.trim();
      const pin = el('f_pin').value.trim();
      try {
        if (mode === 'signup') {
          const name = el('f_name').value.trim();
          if (!name) return toast('Please enter your name');
          await api('POST', '/api/signup', { name, business_name: el('f_biz').value.trim(), phone, pin });
        } else {
          await api('POST', '/api/login', { phone, pin });
        }
        await boot();
      } catch (e) {
        toast(e.message);
      }
    };
    if (el('toLogin')) el('toLogin').onclick = () => renderAuth('login');
    if (el('toSignup')) el('toSignup').onclick = () => renderAuth('signup');
  }

  // ---- shell + tabs -----------------------------------------------------
  function shell(inner) {
    app.innerHTML = `
      <div class="brand"><span class="dot"></span> LedgerLink
        <small>${esc(state.seller.business_name || state.seller.name)}</small>
      </div>
      <div id="screen">${inner}</div>`;
    renderTabbar();
  }

  function renderTabbar() {
    let bar = document.querySelector('.tabbar');
    if (!bar) {
      bar = document.createElement('div');
      bar.className = 'tabbar';
      document.body.appendChild(bar);
    }
    const tabs = [
      ['home', '📊', 'Sales'],
      ['products', '🏷️', 'Products'],
      ['orders', '🧾', 'Orders'],
      ['grow', '🚀', 'Grow'],
    ];
    bar.innerHTML = tabs
      .map(([id, ic, label]) => `<button data-tab="${id}" class="${state.tab === id ? 'active' : ''}"><span class="ic">${ic}</span>${label}</button>`)
      .join('');
    bar.querySelectorAll('button').forEach((b) => (b.onclick = () => go(b.dataset.tab)));
  }

  function go(tab) {
    state.tab = tab;
    if (tab === 'home') renderHome();
    else if (tab === 'products') renderProducts();
    else if (tab === 'orders') renderOrders();
    else if (tab === 'grow') renderGrow();
  }

  // ---- home / dashboard -------------------------------------------------
  async function renderHome() {
    shell('<div class="empty">Loading your numbers…</div>');
    let d;
    try {
      d = await api('GET', '/api/dashboard');
    } catch (e) {
      return shell(`<div class="empty">${e.message}</div>`);
    }

    const delta = d.weekDeltaPct;
    const trendPill =
      delta > 0 ? `<span class="pill up">▲ ${delta}% vs last week</span>`
      : delta < 0 ? `<span class="pill down">▼ ${Math.abs(delta)}% vs last week</span>`
      : `<span class="pill flat">— same as last week</span>`;

    const max = Math.max(1, ...d.trend.map((t) => t.total_kobo));
    const bars = d.trend
      .map((t, i) => {
        const h = Math.round((t.total_kobo / max) * 100);
        const today = i === d.trend.length - 1;
        return `<div class="bar ${today ? 'today' : ''}" style="height:${Math.max(h, 3)}%" title="${esc(t.date)}: ${naira(t.total_kobo)}"></div>`;
      })
      .join('');
    const dayLabels = d.trend.map((t) => `<span>${['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'][new Date(t.date).getUTCDay()]}</span>`).join('');

    const top = d.topProducts.length
      ? d.topProducts
          .map(
            (p, i) => `<div class="row"><div><span class="title">${i + 1}. ${esc(p.product_name)}</span><div class="meta">${p.units} sold</div></div><div class="amount">${naira(p.revenue_kobo)}</div></div>`
          )
          .join('')
      : '<div class="empty">No sales yet. Share a payment link to get started.</div>';

    const low = d.lowStock.length
      ? d.lowStock
          .map((p) => `<div class="row"><div class="title">${esc(p.name)}</div><div><span class="badge low">${p.stock} left</span></div></div>`)
          .join('')
      : '<div class="empty">Nothing running low 👍</div>';

    shell(`
      <div class="grid-2">
        <div class="card stat"><div class="label">Today</div><div class="value">${naira(d.today.revenue_kobo)}</div><div class="sub">${d.today.orders} order${d.today.orders === 1 ? '' : 's'}</div></div>
        <div class="card stat"><div class="label">This week</div><div class="value">${naira(d.week.revenue_kobo)}</div><div class="sub">${d.week.orders} order${d.week.orders === 1 ? '' : 's'}</div></div>
      </div>

      <div class="card">
        <div class="flex-between"><h2 style="margin:0">This week</h2>${trendPill}</div>
        <div class="spark">${bars}</div>
        <div class="spark-labels">${dayLabels}</div>
      </div>

      <div class="grid-2">
        <div class="card stat"><div class="label">Money received</div><div class="value" style="color:var(--accent)">${naira(d.week.revenue_kobo)}</div><div class="sub">cleared this week</div></div>
        <div class="card stat"><div class="label">Still pending</div><div class="value" style="color:var(--warn)">${naira(d.pending.amount_kobo)}</div><div class="sub">${d.pending.count} awaiting payment</div></div>
      </div>

      <div class="card"><h2>Top products</h2>${top}</div>
      <div class="card"><h2>Stock running low</h2>${low}</div>
    `);
  }

  // ---- products ---------------------------------------------------------
  async function renderProducts() {
    shell('<div class="empty">Loading products…</div>');
    let products = [];
    try {
      products = (await api('GET', '/api/products')).products;
    } catch (e) {
      return shell(`<div class="empty">${e.message}</div>`);
    }

    const list = products.length
      ? products
          .map(
            (p) => `
        <div class="card">
          <div class="product">
            <div class="thumb">${p.photo_url ? `<img src="${esc(p.photo_url)}" class="thumb" style="margin:0" />` : '🏷️'}</div>
            <div class="info">
              <div class="name">${esc(p.name)}</div>
              <div class="meta">${naira(p.price_kobo)} · <span class="${p.low_stock ? '' : 'muted'}">${p.stock} in stock${p.low_stock ? ' ⚠️' : ''}</span></div>
            </div>
          </div>
          <div class="linkbox">
            <input readonly value="${esc(p.payment_link)}" />
            <button class="btn-sm" data-copy="${esc(p.payment_link)}">Copy</button>
          </div>
          <div class="linkbox">
            <button class="btn-sm" data-edit="${p.id}">Edit</button>
            <button class="btn-sm" data-restock="${p.id}">Restock</button>
            <a class="btn-sm" href="${esc(p.payment_link)}" target="_blank" style="text-decoration:none">Open link ↗</a>
          </div>
        </div>`
          )
          .join('')
      : '<div class="empty">No products yet. Add your first one below — it only takes a moment.</div>';

    shell(`
      <h1>Products</h1>
      <p class="muted">Each product gets its own payment link. Paste it in WhatsApp, Instagram, anywhere.</p>
      <button class="btn mt" id="addBtn">+ Add product</button>
      <div id="prodList" class="mt">${list}</div>`);

    el('addBtn').onclick = () => productForm();
    document.querySelectorAll('[data-copy]').forEach((b) => (b.onclick = () => {
      navigator.clipboard?.writeText(b.dataset.copy);
      toast('Payment link copied — paste it to your customer');
    }));
    document.querySelectorAll('[data-edit]').forEach((b) => (b.onclick = () => productForm(products.find((p) => p.id == b.dataset.edit))));
    document.querySelectorAll('[data-restock]').forEach((b) => (b.onclick = () => restock(products.find((p) => p.id == b.dataset.restock))));
  }

  function productForm(existing) {
    const isEdit = !!existing;
    app.querySelector('#screen').innerHTML = `
      <h1>${isEdit ? 'Edit product' : 'Add product'}</h1>
      <div class="card mt">
        <div class="field"><label>Product name</label><input id="p_name" value="${esc(existing?.name || '')}" placeholder="Blue dress" /></div>
        <div class="field"><label>Price (₦)</label><input id="p_price" inputmode="decimal" value="${existing ? existing.price_kobo / 100 : ''}" placeholder="15000" /></div>
        <div class="field"><label>Stock count</label><input id="p_stock" inputmode="numeric" value="${existing ? existing.stock : ''}" placeholder="10" /></div>
        <div class="field"><label>Photo URL (optional)</label><input id="p_photo" value="${esc(existing?.photo_url || '')}" placeholder="https://…" /></div>
        <div class="field"><label>Flag as low stock when at or below</label><input id="p_low" inputmode="numeric" value="${existing ? existing.low_stock_at : 3}" /></div>
        <button class="btn" id="p_save">${isEdit ? 'Save changes' : 'Add product'}</button>
        ${isEdit ? '<button class="btn danger mt" id="p_delete">Remove product</button>' : ''}
        <button class="btn secondary mt" id="p_cancel">Cancel</button>
      </div>`;

    el('p_save').onclick = async () => {
      const payload = {
        name: el('p_name').value.trim(),
        price_naira: parseFloat(el('p_price').value),
        stock: parseInt(el('p_stock').value || '0', 10),
        photo_url: el('p_photo').value.trim(),
        low_stock_at: parseInt(el('p_low').value || '3', 10),
      };
      if (!payload.name) return toast('Enter a product name');
      if (!(payload.price_naira > 0)) return toast('Enter a valid price');
      try {
        if (isEdit) await api('PATCH', `/api/products/${existing.id}`, payload);
        else await api('POST', '/api/products', payload);
        toast(isEdit ? 'Saved' : 'Product added — payment link ready');
        renderProducts();
      } catch (e) {
        toast(e.message);
      }
    };
    if (el('p_delete'))
      el('p_delete').onclick = async () => {
        if (!confirm('Remove this product?')) return;
        await api('DELETE', `/api/products/${existing.id}`);
        toast('Removed');
        renderProducts();
      };
    el('p_cancel').onclick = () => renderProducts();
  }

  async function restock(p) {
    const add = prompt(`Add stock for "${p.name}". Current: ${p.stock}. How many to add?`, '10');
    if (add === null) return;
    const n = parseInt(add, 10);
    if (!Number.isFinite(n)) return;
    await api('PATCH', `/api/products/${p.id}`, { stock: p.stock + n });
    toast(`Stock updated to ${p.stock + n}`);
    renderProducts();
  }

  // ---- orders -----------------------------------------------------------
  async function renderOrders() {
    shell('<div class="empty">Loading orders…</div>');
    let orders = [];
    try {
      orders = (await api('GET', '/api/orders')).orders;
    } catch (e) {
      return shell(`<div class="empty">${e.message}</div>`);
    }
    const rows = orders.length
      ? orders
          .map(
            (o) => `
        <div class="row">
          <div>
            <span class="title">${esc(o.product_name)}</span>
            <div class="meta">${esc(o.buyer_name || 'Customer')} · ${esc(o.channel)} · ${timeAgo(o.created_at)}${o.status === 'paid' && o.confirmation_sent ? ' · ✅ confirmed' : ''}</div>
          </div>
          <div class="right">
            <div class="amount">${o.amount_text}</div>
            <span class="badge ${o.status}">${o.status}</span>
          </div>
        </div>`
          )
          .join('')
      : '<div class="empty">No orders yet.</div>';
    shell(`<h1>Orders</h1><p class="muted">Every payment becomes a record here automatically.</p><div class="card mt">${rows}</div>`);
  }

  // ---- grow / formalization --------------------------------------------
  async function renderGrow() {
    shell('<div class="empty">Loading…</div>');
    let s;
    try {
      s = await api('GET', '/api/statement');
    } catch (e) {
      return shell(`<div class="empty">${e.message}</div>`);
    }
    const months = s.months.length
      ? s.months
          .map((m) => `<div class="row"><div class="title">${esc(m.month)}</div><div class="amount">${naira(m.revenue_kobo)}<div class="meta right">${m.orders} orders</div></div></div>`)
          .join('')
      : '<div class="empty">Your revenue history will build up here as you sell.</div>';

    shell(`
      <h1>Grow &amp; formalize</h1>
      <p class="muted">Your real, verifiable revenue history — the record banks and lenders never had before.</p>

      <div class="grid-2 mt">
        <div class="card stat"><div class="label">Total revenue</div><div class="value">${naira(s.totals.revenue_kobo)}</div><div class="sub">${s.totals.orders} paid orders</div></div>
        <div class="card stat"><div class="label">Avg / month</div><div class="value">${naira(Math.round(s.avg_monthly_revenue_naira * 100))}</div><div class="sub">${s.months_active} month${s.months_active === 1 ? '' : 's'} active</div></div>
      </div>

      <div class="card"><h2>Monthly revenue statement</h2>${months}</div>

      <div class="card">
        <h2>Ready when you are</h2>
        <p class="muted">After a few months of clean history you can use this to access working capital, inventory financing, or register formally.</p>
        <a class="btn" href="/api/export.csv" style="text-decoration:none;display:block;text-align:center">⬇ Download sales statement (CSV)</a>
        <button class="btn secondary mt" id="logoutBtn">Log out</button>
      </div>`);

    el('logoutBtn').onclick = async () => {
      await api('POST', '/api/logout');
      location.reload();
    };
  }

  // ---- boot -------------------------------------------------------------
  async function boot() {
    try {
      const me = await api('GET', '/api/me');
      if (me.seller) {
        state.seller = me.seller;
        state.integrations = me.integrations || {};
        go('home');
      } else {
        renderAuth('signup');
      }
    } catch (_) {
      renderAuth('signup');
    }
  }

  return { boot };
})();

App.boot();
