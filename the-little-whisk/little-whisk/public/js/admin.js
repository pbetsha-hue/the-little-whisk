/* The Little Whisk — kitchen desk (admin) */
(() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  let SETTINGS = {};
  let MENU = { categories: [], uncategorised: [] };
  let ORDERS = [];
  let STATS = null;
  let RANGE = 30;
  let METRIC = 'orders';

  const sym = () => SETTINGS.currency_symbol || '$';
  const money = (n) => sym() + Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });
  const fmtDate = (d) => d ? new Date(d + (d.length === 10 ? 'T12:00:00' : '')).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '';
  const fmtDay = (d) => new Date(d + 'T12:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

  const STATUS_LABEL = { new: 'New', confirmed: 'Confirmed', baking: 'In the kitchen', ready: 'Ready', completed: 'Completed', cancelled: 'Cancelled' };
  const PAY_LABEL = { unpaid: 'Unpaid', paid: 'Paid', refunded: 'Refunded' };

  function toast(msg) {
    const t = $('#toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), 2200);
  }

  async function api(path, opts = {}) {
    const res = await fetch(path, {
      headers: opts.body ? { 'Content-Type': 'application/json' } : undefined,
      ...opts,
      body: opts.body ? JSON.stringify(opts.body) : undefined
    });
    if (res.status === 401) { showLogin(); throw new Error('Please sign in again.'); }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Something went wrong.');
    return data;
  }

  /* --------------------------------------------------------------- auth */
  function showLogin() { $('#login').hidden = false; $('#app').hidden = true; }
  function showApp() { $('#login').hidden = true; $('#app').hidden = false; }

  $('#loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = $('#loginError'); err.hidden = true;
    try {
      await api('/api/admin/login', { method: 'POST', body: { password: $('#pw').value } });
      $('#pw').value = '';
      showApp(); await loadAll();
    } catch (ex) { err.textContent = ex.message; err.hidden = false; }
  });

  $('#signOut').onclick = async () => { await fetch('/api/admin/logout', { method: 'POST' }); showLogin(); };

  /* ------------------------------------------------------------- views */
  $('#sideNav').addEventListener('click', (e) => {
    const b = e.target.closest('[data-view]'); if (!b) return;
    $$('#sideNav button').forEach((x) => x.classList.toggle('active', x === b));
    $$('[data-page]').forEach((p) => (p.hidden = p.dataset.page !== b.dataset.view));
    if (b.dataset.view === 'orders') loadOrders();
    if (b.dataset.view === 'dashboard') loadStats();
  });

  /* --------------------------------------------------------- dashboard */
  async function loadStats() {
    STATS = await api(`/api/admin/stats?days=${RANGE}`);
    renderTiles(); renderChart(); renderTop(); renderUpcoming();
    const pill = $('#newPill');
    pill.hidden = !STATS.new_orders; pill.textContent = STATS.new_orders;
  }

  function renderTiles() {
    const s = STATS;
    const tiles = [
      { label: 'New orders', value: s.new_orders, note: 'waiting for you to confirm', accent: s.new_orders > 0 },
      { label: `Orders · ${RANGE}d`, value: s.orders_in_range, note: `${s.orders_total} all time` },
      { label: `Revenue · ${RANGE}d`, value: money(Math.round(s.revenue_in_range)), note: `${money(Math.round(s.average_order))} average order` },
      { label: 'Still to collect', value: money(Math.round(s.revenue_outstanding)), note: 'unpaid, not cancelled' },
      { label: 'Upcoming', value: s.upcoming, note: 'due today or later' }
    ];
    $('#tiles').innerHTML = tiles.map((t) => `
      <div class="tile${t.accent ? ' accent' : ''}">
        <div class="label">${esc(t.label)}</div>
        <div class="value">${esc(t.value)}</div>
        <div class="note">${esc(t.note)}</div>
      </div>`).join('');
  }

  function renderChart() {
    const host = $('#chart');
    const tip = $('#chartTip');
    const data = STATS.by_day || [];
    $('#chartTitle').textContent = METRIC === 'orders' ? 'Orders per day' : 'Revenue per day';
    if (!data.length) {
      host.innerHTML = '<div class="chart-empty">No orders in this range yet — they will show up here.</div>';
      host.appendChild(tip); return;
    }
    const W = 900, H = 220, padL = 46, padR = 8, padB = 26, padT = 10;
    const vals = data.map((d) => (METRIC === 'orders' ? d.orders : d.revenue));
    const max = Math.max(...vals, METRIC === 'orders' ? 4 : 100);
    const niceMax = Math.ceil(max / 4) * 4 || 4;
    const plotW = W - padL - padR, plotH = H - padT - padB;
    const step = plotW / data.length;
    const bw = Math.max(3, Math.min(38, step - 2)); // 2px surface gap between bars
    const y = (v) => padT + plotH - (v / niceMax) * plotH;

    const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => niceMax * f);
    const grid = ticks.map((t) => `<line class="gridline" x1="${padL}" x2="${W - padR}" y1="${y(t)}" y2="${y(t)}"></line>
      <text class="axis-label" x="${padL - 8}" y="${y(t) + 3}" text-anchor="end">${METRIC === 'orders' ? t : (t >= 1000 ? Math.round(t / 1000) + 'k' : Math.round(t))}</text>`).join('');

    const bars = data.map((d, i) => {
      const v = METRIC === 'orders' ? d.orders : d.revenue;
      const x = padL + i * step + (step - bw) / 2;
      const top = y(v), h = Math.max(v > 0 ? 3 : 0, padT + plotH - top);
      const r = Math.min(4, bw / 2, h);
      const path = h ? `M${x},${padT + plotH} L${x},${top + r} Q${x},${top} ${x + r},${top} L${x + bw - r},${top} Q${x + bw},${top} ${x + bw},${top + r} L${x + bw},${padT + plotH} Z` : '';
      return `${h ? `<path class="bar" d="${path}"></path>` : ''}
        <rect class="bar-hit" x="${padL + i * step}" y="${padT}" width="${step}" height="${plotH}"
              data-i="${i}" data-x="${padL + i * step + step / 2}" data-y="${top}"></rect>`;
    }).join('');

    const labelEvery = Math.ceil(data.length / 10);
    const xlabels = data.map((d, i) => (i % labelEvery === 0 || i === data.length - 1)
      ? `<text class="axis-label" x="${padL + i * step + step / 2}" y="${H - 8}" text-anchor="middle">${esc(fmtDay(d.day))}</text>` : '').join('');

    host.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${METRIC === 'orders' ? 'Orders' : 'Revenue'} per day">
      ${grid}${bars}${xlabels}
      <line class="gridline" x1="${padL}" x2="${W - padR}" y1="${padT + plotH}" y2="${padT + plotH}" stroke="#d9c8b8"></line>
    </svg>`;
    host.appendChild(tip);

    const svg = host.querySelector('svg');
    svg.addEventListener('mousemove', (e) => {
      const hit = e.target.closest('.bar-hit'); if (!hit) return;
      const d = data[Number(hit.dataset.i)];
      const rect = svg.getBoundingClientRect();
      const scale = rect.width / W;
      tip.innerHTML = `<strong>${esc(fmtDay(d.day))}</strong> · ${d.orders} order${d.orders === 1 ? '' : 's'} · ${esc(money(Math.round(d.revenue)))}`;
      tip.style.left = `${Number(hit.dataset.x) * scale}px`;
      tip.style.top = `${Number(hit.dataset.y) * scale}px`;
      tip.classList.add('show');
    });
    svg.addEventListener('mouseleave', () => tip.classList.remove('show'));
  }

  $('#rangeSeg').addEventListener('click', (e) => {
    const b = e.target.closest('[data-days]'); if (!b) return;
    $$('#rangeSeg button').forEach((x) => x.classList.toggle('on', x === b));
    RANGE = Number(b.dataset.days); loadStats();
  });
  $('#metricSeg').addEventListener('click', (e) => {
    const b = e.target.closest('[data-metric]'); if (!b) return;
    $$('#metricSeg button').forEach((x) => x.classList.toggle('on', x === b));
    METRIC = b.dataset.metric; renderChart();
  });

  function renderTop() {
    const rows = STATS.top_items || [];
    $('#topItems').innerHTML = `<thead><tr><th>Item</th><th>Sold</th><th>Revenue</th></tr></thead><tbody>${
      rows.length ? rows.map((r) => `<tr><td>${esc(r.name)}</td><td>${r.qty}</td><td>${esc(money(Math.round(r.revenue)))}</td></tr>`).join('')
      : '<tr><td colspan="3" class="muted">Nothing sold in this range yet.</td></tr>'}</tbody>`;
  }

  function renderUpcoming() {
    const rows = STATS.upcoming_orders || [];
    $('#upcoming').innerHTML = `<thead><tr><th>Due</th><th>Order</th><th>Status</th><th>Total</th></tr></thead><tbody>${
      rows.length ? rows.map((r) => `<tr>
        <td>${esc(fmtDate(r.wanted_date))}${r.wanted_time ? `<div class="muted">${esc(r.wanted_time)}</div>` : ''}</td>
        <td>${esc(r.customer_name)}<div class="muted mono">${esc(r.order_number)}</div></td>
        <td><span class="chip ${r.status}">${esc(STATUS_LABEL[r.status] || r.status)}</span></td>
        <td>${esc(money(r.total))}</td></tr>`).join('')
      : '<tr><td colspan="4" class="muted">Nothing on the schedule.</td></tr>'}</tbody>`;
  }

  /* ------------------------------------------------------------ orders */
  let ordersTimer;
  ['fQ', 'fStatus', 'fPay', 'fFrom', 'fTo'].forEach((id) => {
    $('#' + id).addEventListener('input', () => { clearTimeout(ordersTimer); ordersTimer = setTimeout(loadOrders, 250); });
  });
  $('#fClear').onclick = () => { ['fQ', 'fStatus', 'fPay', 'fFrom', 'fTo'].forEach((id) => ($('#' + id).value = '')); loadOrders(); };

  async function loadOrders() {
    const qs = new URLSearchParams({ q: $('#fQ').value, status: $('#fStatus').value, payment: $('#fPay').value, from: $('#fFrom').value, to: $('#fTo').value });
    ORDERS = (await api('/api/admin/orders?' + qs)).orders;
    renderOrders();
  }

  function renderOrders() {
    const t = $('#ordersTable');
    if (!ORDERS.length) {
      t.innerHTML = '<tbody><tr><td class="muted" style="padding:2rem 0">No orders match those filters.</td></tr></tbody>';
      return;
    }
    t.innerHTML = `<thead><tr>
        <th>Order</th><th>Customer</th><th>Wanted</th><th>Items</th><th>Total</th><th>Payment</th><th>Status</th>
      </tr></thead><tbody>${ORDERS.map((o) => `
      <tr class="order-row" data-id="${o.id}">
        <td><span class="mono">${esc(o.order_number)}</span><div class="muted">${esc(fmtDate(o.created_at.slice(0, 10)))}</div></td>
        <td>${esc(o.customer_name)}<div class="muted">${esc(o.phone)}</div></td>
        <td>${esc(fmtDate(o.wanted_date))}<div class="muted">${o.fulfillment === 'delivery' ? 'Delivery' : 'Pickup'}${o.wanted_time ? ' · ' + esc(o.wanted_time) : ''}</div></td>
        <td>${o.items.reduce((s, i) => s + i.quantity, 0)}</td>
        <td><strong>${esc(money(o.total))}</strong></td>
        <td><span class="chip ${o.payment_status}">${esc(PAY_LABEL[o.payment_status])}</span><div class="muted" style="font-size:.76rem;margin-top:.15rem">${o.payment_method === 'bank_transfer' ? 'Transfer' : 'Before collection'}</div></td>
        <td><span class="chip ${o.status}">${esc(STATUS_LABEL[o.status])}</span></td>
      </tr>
      <tr class="detail" data-detail="${o.id}" hidden><td colspan="7">${detailHtml(o)}</td></tr>`).join('')}</tbody>`;
  }

  function detailHtml(o) {
    return `<div style="display:grid;grid-template-columns:1.2fr 1fr;gap:1.6rem">
      <div>
        <strong>What they ordered</strong>
        <table class="data" style="margin-top:.4rem">${o.items.map((i) => `<tr>
          <td>${i.quantity} × ${esc(i.item_name)}${i.option_label ? ` <span class="muted">(${esc(i.option_label)})</span>` : ''}${i.notes ? `<div class="muted">“${esc(i.notes)}”</div>` : ''}</td>
          <td style="text-align:right;white-space:nowrap">${esc(money(i.line_total))}</td></tr>`).join('')}
          <tr><td class="muted">Subtotal</td><td style="text-align:right">${esc(money(o.subtotal))}</td></tr>
          ${o.delivery_fee ? `<tr><td class="muted">Delivery</td><td style="text-align:right">${esc(money(o.delivery_fee))}</td></tr>` : ''}
          <tr><td><strong>Total</strong></td><td style="text-align:right"><strong>${esc(money(o.total))}</strong></td></tr>
        </table>
        ${o.notes ? `<p style="margin-top:.8rem"><strong>Their note:</strong> ${esc(o.notes)}</p>` : ''}
      </div>
      <div>
        <strong>Contact</strong>
        <p style="margin:.3rem 0 1rem;font-size:.88rem">
          ${esc(o.customer_name)}<br>
          <a href="mailto:${esc(o.email)}">${esc(o.email)}</a><br>
          <a href="tel:${esc(o.phone.replace(/[^\d+]/g, ''))}">${esc(o.phone)}</a>
          ${o.address ? `<br><span class="muted">${esc(o.address)}</span>` : ''}
        </p>
        <div style="display:flex;gap:.6rem;flex-wrap:wrap;margin-bottom:.8rem">
          <label style="font-size:.78rem">Status<br>
            <select class="inline" data-set-status="${o.id}">${Object.entries(STATUS_LABEL).map(([k, v]) => `<option value="${k}"${o.status === k ? ' selected' : ''}>${v}</option>`).join('')}</select>
          </label>
          <label style="font-size:.78rem">Payment<br>
            <select class="inline" data-set-payment="${o.id}">${Object.entries(PAY_LABEL).map(([k, v]) => `<option value="${k}"${o.payment_status === k ? ' selected' : ''}>${v}</option>`).join('')}</select>
          </label>
        </div>
        <label style="font-size:.78rem">Private note (customers never see this)</label>
        <textarea class="inline" data-note="${o.id}" style="width:100%;min-height:64px;padding:.5rem;border:1px solid var(--line);border-radius:8px;font:inherit;font-size:.85rem">${esc(o.internal_note || '')}</textarea>
        <div style="display:flex;gap:.5rem;margin-top:.5rem">
          <button class="btn small" data-save-note="${o.id}">Save note</button>
          <button class="btn ghost small" data-delete="${o.id}" style="color:#8d2b1c;border-color:#f2c4bc;margin-left:auto">Delete order</button>
        </div>
      </div>
    </div>`;
  }

  $('#ordersTable').addEventListener('click', async (e) => {
    const row = e.target.closest('.order-row');
    if (row && !e.target.closest('select')) {
      const d = $(`[data-detail="${row.dataset.id}"]`);
      d.hidden = !d.hidden;
      return;
    }
    const del = e.target.closest('[data-delete]');
    if (del) {
      const o = ORDERS.find((x) => String(x.id) === del.dataset.delete);
      if (!confirm(`Delete order ${o.order_number}? This cannot be undone.`)) return;
      await api(`/api/admin/orders/${del.dataset.delete}`, { method: 'DELETE' });
      toast('Order deleted'); await loadOrders(); loadStats();
      return;
    }
    const save = e.target.closest('[data-save-note]');
    if (save) {
      const id = save.dataset.saveNote;
      await api(`/api/admin/orders/${id}`, { method: 'PATCH', body: { internal_note: $(`[data-note="${id}"]`).value } });
      toast('Note saved');
    }
  });

  $('#ordersTable').addEventListener('change', async (e) => {
    const st = e.target.closest('[data-set-status]');
    const pay = e.target.closest('[data-set-payment]');
    if (!st && !pay) return;
    const id = (st || pay).dataset.setStatus || (st || pay).dataset.setPayment;
    const body = st ? { status: st.value } : { payment_status: pay.value };
    const { order } = await api(`/api/admin/orders/${id}`, { method: 'PATCH', body });
    const idx = ORDERS.findIndex((o) => o.id === order.id);
    if (idx > -1) ORDERS[idx] = order;
    const openIds = $$('[data-detail]').filter((d) => !d.hidden).map((d) => d.dataset.detail);
    renderOrders();
    openIds.forEach((i) => { const d = $(`[data-detail="${i}"]`); if (d) d.hidden = false; });
    toast('Order updated'); loadStats();
  });

  /* -------------------------------------------------------------- menu */
  async function loadMenu() {
    MENU = await api('/api/admin/menu');
    renderMenuEditor();
  }

  function renderMenuEditor() {
    const groups = MENU.categories.concat(
      (MENU.uncategorised || []).length ? [{ id: null, name: 'Not in a section', blurb: '', items: MENU.uncategorised }] : []
    );
    $('#menuEditor').innerHTML = groups.map((c) => `
      <section class="menu-cat">
        <div class="menu-cat-head">
          <h3>${esc(c.name)}</h3>
          <span class="muted">${c.items.length} item${c.items.length === 1 ? '' : 's'}${c.blurb ? ' · ' + esc(c.blurb) : ''}</span>
          ${c.id ? `<span class="row-actions" style="margin-left:auto">
            <button class="btn ghost small" data-rename-cat="${c.id}">Rename</button>
            <button class="btn ghost small" data-del-cat="${c.id}">Delete</button></span>` : ''}
        </div>
        <div class="item-rows">${c.items.map(itemRowHtml).join('') || '<p class="muted">Nothing here yet.</p>'}</div>
      </section>`).join('');
  }

  function itemRowHtml(it) {
    const opts = it.options || [];
    return `<div class="item-row${it.is_available ? '' : ' hidden-item'}" data-item="${it.id}">
      ${it.image_url ? `<img src="${esc(it.image_url)}" alt="">` : `<div class="ph">${esc(it.emoji || '🍰')}</div>`}
      <div>
        <div class="nm">${esc(it.name)}${it.is_featured ? ' <span class="chip ready" style="font-size:.68rem">favourite</span>' : ''}</div>
        <div class="meta">${esc(it.description || '').slice(0, 90)}${(it.description || '').length > 90 ? '…' : ''}</div>
        ${opts.length ? `<div class="meta">${esc(it.option_label || 'Choices')}: ${opts.map((o) => esc(o.label) + (o.price_delta ? ` (${money(it.base_price + o.price_delta)})` : '')).join(' · ')}</div>` : ''}
      </div>
      <div><strong>${esc(money(it.base_price))}</strong><div class="meta">${esc(it.unit || '')}</div></div>
      <label class="switch"><input type="checkbox" data-avail="${it.id}"${it.is_available ? ' checked' : ''}> ${it.is_available ? 'Available' : 'Hidden'}</label>
      <div class="row-actions"><button class="btn ghost small" data-edit="${it.id}">Edit</button></div>
    </div>`;
  }

  $('#menuEditor').addEventListener('change', async (e) => {
    const av = e.target.closest('[data-avail]'); if (!av) return;
    await api(`/api/admin/items/${av.dataset.avail}`, { method: 'PATCH', body: { is_available: av.checked } });
    toast(av.checked ? 'Back on the menu' : 'Hidden from the menu');
    loadMenu();
  });

  $('#menuEditor').addEventListener('click', async (e) => {
    const edit = e.target.closest('[data-edit]');
    if (edit) return openItem(findItem(Number(edit.dataset.edit)));
    const ren = e.target.closest('[data-rename-cat]');
    if (ren) {
      const cat = MENU.categories.find((c) => String(c.id) === ren.dataset.renameCat);
      const name = prompt('Section name', cat.name); if (name === null) return;
      const blurb = prompt('Short description (optional)', cat.blurb || '');
      await api(`/api/admin/categories/${cat.id}`, { method: 'PATCH', body: { name, blurb: blurb || '' } });
      toast('Section updated'); loadMenu(); return;
    }
    const del = e.target.closest('[data-del-cat]');
    if (del) {
      if (!confirm('Delete this section?')) return;
      try { await api(`/api/admin/categories/${del.dataset.delCat}`, { method: 'DELETE' }); toast('Section deleted'); loadMenu(); }
      catch (ex) { alert(ex.message); }
    }
  });

  $('#addCategory').onclick = async () => {
    const name = prompt('What should this section be called? e.g. Holiday specials'); if (!name) return;
    await api('/api/admin/categories', { method: 'POST', body: { name, blurb: '' } });
    toast('Section added'); loadMenu();
  };

  function findItem(id) {
    return MENU.categories.flatMap((c) => c.items).concat(MENU.uncategorised || []).find((i) => i.id === id);
  }

  /* ------------------------------------------------------- item editor */
  let editingId = null;

  function optionRow(o = { label: '', price_delta: 0 }) {
    const div = document.createElement('div');
    div.className = 'opt-row';
    div.innerHTML = `<input placeholder="e.g. 8 inch" value="${esc(o.label)}" data-opt-label>
      <input type="number" step="0.01" placeholder="+ price" value="${o.price_delta || 0}" data-opt-delta>
      <button type="button" class="icon-btn" data-opt-remove aria-label="Remove">&times;</button>`;
    return div;
  }

  function openItem(item) {
    editingId = item ? item.id : null;
    $('#itemModalTitle').textContent = item ? 'Edit item' : 'New item';
    $('#itemError').hidden = true;
    $('#iCat').innerHTML = MENU.categories.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join('') + '<option value="">— no section —</option>';
    $('#iName').value = item ? item.name : '';
    $('#iCat').value = item && item.category_id ? item.category_id : (MENU.categories[0] ? MENU.categories[0].id : '');
    $('#iDesc').value = item ? item.description : '';
    $('#iPrice').value = item ? item.base_price : '';
    $('#iUnit').value = item ? item.unit : '';
    $('#iLead').value = item ? item.lead_time_days : 2;
    $('#iEmoji').value = item ? item.emoji : '🍰';
    $('#iImage').value = item ? item.image_url || '' : '';
    setPreview($('#iImage').value);
    $('#iOptLabel').value = item ? item.option_label : '';
    const box = $('#iOptions'); box.innerHTML = '';
    (item && item.options || []).forEach((o) => box.appendChild(optionRow(o)));
    $('#iAvailable').checked = item ? !!item.is_available : true;
    $('#iFeatured').checked = item ? !!item.is_featured : false;
    $('#deleteItem').hidden = !item;
    $('#itemModal').classList.add('open'); $('#adminOverlay').classList.add('open');
    document.body.style.overflow = 'hidden';
  }
  function closeItem() {
    $('#itemModal').classList.remove('open'); $('#adminOverlay').classList.remove('open');
    document.body.style.overflow = '';
  }
  $$('[data-close-item]').forEach((b) => (b.onclick = closeItem));
  $('#adminOverlay').onclick = closeItem;
  $('#addItem').onclick = () => openItem(null);
  $('#addOption').onclick = () => $('#iOptions').appendChild(optionRow());
  $('#iOptions').addEventListener('click', (e) => { const b = e.target.closest('[data-opt-remove]'); if (b) b.closest('.opt-row').remove(); });

  function setPreview(url) {
    const img = $('#iPreview');
    if (url) { img.src = url; img.hidden = false; } else { img.hidden = true; img.removeAttribute('src'); }
  }
  $('#iImage').addEventListener('input', (e) => setPreview(e.target.value.trim()));

  const drop = $('#iDrop');
  drop.onclick = () => $('#iFile').click();
  drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('over'));
  drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('over'); if (e.dataTransfer.files[0]) uploadPhoto(e.dataTransfer.files[0]); });
  $('#iFile').addEventListener('change', (e) => { if (e.target.files[0]) uploadPhoto(e.target.files[0]); });

  function uploadPhoto(file) {
    if (file.size > 6 * 1024 * 1024) { alert('That image is bigger than 6MB. Please shrink it first.'); return; }
    const reader = new FileReader();
    drop.textContent = 'Uploading…';
    reader.onload = async () => {
      try {
        const { url } = await api('/api/admin/upload', { method: 'POST', body: { data: reader.result, name: file.name.replace(/\.[^.]+$/, '') } });
        $('#iImage').value = url; setPreview(url); toast('Photo uploaded');
      } catch (ex) { alert(ex.message); }
      finally { drop.innerHTML = 'Click to choose a photo, or drag one here<br><span style="font-size:.78rem">JPG, PNG or WEBP · up to 6MB</span>'; }
    };
    reader.readAsDataURL(file);
  }

  $('#itemForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = {
      name: $('#iName').value.trim(),
      category_id: $('#iCat').value || null,
      description: $('#iDesc').value.trim(),
      base_price: Number($('#iPrice').value || 0),
      unit: $('#iUnit').value.trim(),
      emoji: $('#iEmoji').value.trim(),
      image_url: $('#iImage').value.trim(),
      option_label: $('#iOptLabel').value.trim(),
      lead_time_days: Number($('#iLead').value || 0),
      is_available: $('#iAvailable').checked,
      is_featured: $('#iFeatured').checked,
      options: $$('#iOptions .opt-row').map((r) => ({ label: $('[data-opt-label]', r).value.trim(), price_delta: Number($('[data-opt-delta]', r).value || 0) })).filter((o) => o.label)
    };
    try {
      if (editingId) await api(`/api/admin/items/${editingId}`, { method: 'PATCH', body });
      else await api('/api/admin/items', { method: 'POST', body });
      closeItem(); toast('Menu updated'); loadMenu();
    } catch (ex) { const b = $('#itemError'); b.textContent = ex.message; b.hidden = false; }
  });

  $('#deleteItem').onclick = async () => {
    if (!editingId || !confirm('Delete this item? Past orders keep their record of it.')) return;
    await api(`/api/admin/items/${editingId}`, { method: 'DELETE' });
    closeItem(); toast('Item deleted'); loadMenu();
  };

  /* ---------------------------------------------------------- settings */
  async function loadSettings() {
    const { settings } = await api('/api/admin/settings');
    SETTINGS = settings;
    $$('[data-set]').forEach((el) => { el.value = settings[el.dataset.set] ?? ''; });
    document.title = (settings.shop_name || 'The Little Whisk') + ' — kitchen desk';
  }

  $('#settingsForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {};
    $$('[data-set]').forEach((el) => (payload[el.dataset.set] = el.value));
    await api('/api/admin/settings', { method: 'PUT', body: { settings: payload } });
    await loadSettings();
    $('#settingsSaved').textContent = 'Saved ✓';
    setTimeout(() => ($('#settingsSaved').textContent = ''), 2500);
    toast('Settings saved');
  });

  $('#passwordForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = $('#pwError'); err.hidden = true;
    try {
      await api('/api/admin/password', { method: 'POST', body: { current: $('#pwCurrent').value, next: $('#pwNext').value } });
      alert('Password changed. Please sign in again.');
      showLogin();
    } catch (ex) { err.textContent = ex.message; err.hidden = false; }
  });

  /* -------------------------------------------------------------- boot */
  async function loadAll() {
    await loadSettings();
    await Promise.all([loadStats(), loadMenu(), loadOrders()]);
  }

  (async () => {
    const { signed_in } = await (await fetch('/api/admin/me')).json();
    if (signed_in) { showApp(); loadAll(); } else showLogin();
  })();
})();
