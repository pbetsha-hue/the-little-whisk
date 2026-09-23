/* The Little Whisk — storefront */
(() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  let SHOP = { settings: {}, categories: [], uncategorised: [] };
  let CART = [];
  const CART_KEY = 'lw_cart_v1';

  const money = (n) => `${SHOP.settings.currency_symbol || '$'}${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: Number.isInteger(Number(n)) ? 0 : 2, maximumFractionDigits: 2 })}`;

  function loadCart() {
    try { CART = JSON.parse(localStorage.getItem(CART_KEY)) || []; } catch { CART = []; }
    if (!Array.isArray(CART)) CART = [];
  }
  function saveCart() { try { localStorage.setItem(CART_KEY, JSON.stringify(CART)); } catch {} }

  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg; t.classList.add('show');
    clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), 2200);
  }

  /* ------------------------------------------------------------- rendering */
  function allItems() {
    return SHOP.categories.flatMap((c) => c.items).concat(SHOP.uncategorised || []);
  }

  function itemPrice(item, optionId) {
    const opt = (item.options || []).find((o) => String(o.id) === String(optionId));
    return Math.max(0, item.base_price + (opt ? opt.price_delta : 0));
  }

  function media(item, big) {
    if (item.image_url) return `<img src="${esc(item.image_url)}" alt="${esc(item.name)}" loading="lazy">`;
    return `<div class="placeholder">${esc(item.emoji || '🍰')}</div>`;
  }

  function cardHtml(item) {
    const opts = item.options || [];
    const lead = item.lead_time_days > 0 ? `${item.lead_time_days} day${item.lead_time_days === 1 ? '' : 's'} notice` : 'Next day';
    return `
    <article class="card" data-item="${item.id}">
      <div class="card-media">
        ${media(item)}
        ${item.is_featured ? '<span class="badge">Favourite</span>' : ''}
        <span class="badge lead">${lead}</span>
      </div>
      <div class="card-body">
        <h4>${esc(item.name)}</h4>
        <p class="desc">${esc(item.description)}</p>
        <div class="price-row"><span class="price" data-price>${money(itemPrice(item, opts[0] && opts[0].id))}</span>${opts.length ? '' : `<span class="unit">${esc(item.unit || '')}</span>`}</div>
        ${opts.length ? `<label class="sr-only" for="opt-${item.id}">${esc(item.option_label || 'Option')}</label>
          <select data-opt id="opt-${item.id}">${opts.map((o) => `<option value="${o.id}">${esc(o.label)}${o.price_delta ? ' — ' + money(item.base_price + o.price_delta) : ''}</option>`).join('')}</select>` : ''}
        <div class="card-actions">
          <input type="number" min="1" max="99" value="1" data-qty aria-label="Quantity of ${esc(item.name)}">
          <button class="btn small" data-add>Add</button>
        </div>
      </div>
    </article>`;
  }

  function renderMenu() {
    const nav = $('#menuNav');
    const root = $('#menuRoot');
    const cats = SHOP.categories.filter((c) => c.items.length);
    nav.innerHTML = cats.map((c, i) => `<button data-jump="cat-${c.id}"${i === 0 ? ' aria-current="true"' : ''}>${esc(c.name)}</button>`).join('');
    root.innerHTML = cats.map((c) => `
      <section id="cat-${c.id}" class="cat">
        <div class="cat-head"><h3>${esc(c.name)}</h3><p>${esc(c.blurb || '')}</p></div>
        <div class="grid">${c.items.map(cardHtml).join('')}</div>
      </section>`).join('') +
      ((SHOP.uncategorised || []).length ? `<section class="cat"><div class="cat-head"><h3>More</h3></div><div class="grid">${SHOP.uncategorised.map(cardHtml).join('')}</div></section>` : '');

    nav.onclick = (e) => {
      const b = e.target.closest('[data-jump]'); if (!b) return;
      const el = document.getElementById(b.dataset.jump);
      if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 130, behavior: 'smooth' });
    };

    const obs = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (!en.isIntersecting) return;
        $$('#menuNav button').forEach((b) => b.setAttribute('aria-current', b.dataset.jump === en.target.id ? 'true' : 'false'));
      });
    }, { rootMargin: '-140px 0px -70% 0px' });
    $$('.cat[id]').forEach((s) => obs.observe(s));

    root.addEventListener('change', (e) => {
      const sel = e.target.closest('[data-opt]'); if (!sel) return;
      const card = sel.closest('.card');
      const item = allItems().find((i) => String(i.id) === card.dataset.item);
      $('[data-price]', card).textContent = money(itemPrice(item, sel.value));
    });

    root.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-add]'); if (!btn) return;
      const card = btn.closest('.card');
      const item = allItems().find((i) => String(i.id) === card.dataset.item);
      const sel = $('[data-opt]', card);
      const qty = Math.max(1, Math.min(99, parseInt($('[data-qty]', card).value, 10) || 1));
      addToCart(item, sel ? sel.value : null, qty);
      btn.textContent = 'Added ✓';
      setTimeout(() => (btn.textContent = 'Add'), 1200);
    });
  }

  function renderHero() {
    const s = SHOP.settings;
    if (s.shop_name) {
      document.title = `${s.shop_name} — ${s.tagline || 'made to order'}`;
      $('#brandName').alt = s.shop_name;
      const fl = $('#footLogo'); if (fl) fl.alt = s.shop_name;
    }
    $('#brandTag').textContent = s.tagline || '';
    $('#heroIntro').textContent = s.intro || '';
    $('#footTag').textContent = s.tagline || '';
    const lead = Number(s.min_lead_days || 2);
    $('#factLead').textContent = `${lead} day${lead === 1 ? '' : 's'}`;
    const delivery = s.delivery_enabled === '1';
    $('#factPickup').textContent = delivery ? 'Pickup + delivery' : 'Pickup';
    $('#factPickupSub').textContent = delivery ? (s.delivery_note || '') : (s.address || '');
    $('#footContact').innerHTML = [s.address, s.phone ? `<a href="tel:${esc(s.phone.replace(/[^\d+]/g, ''))}">${esc(s.phone)}</a>` : '', s.email ? `<a href="mailto:${esc(s.email)}">${esc(s.email)}</a>` : '', s.instagram ? esc(s.instagram) : ''].filter(Boolean).join('<br>');
    $('#footHours').innerHTML = [esc(s.pickup_hours || ''), delivery ? esc(s.delivery_note || '') : '', `Please order at least ${lead} day${lead === 1 ? '' : 's'} ahead.`].filter(Boolean).join('<br>');
    $('#year').textContent = new Date().getFullYear();
    if (s.announcement) { const a = $('#announce'); a.textContent = s.announcement; a.hidden = false; }
    $('#pickupHint').textContent = s.pickup_hours || 'Collect from us';
    if (!delivery) { $('#deliveryChoice').style.display = 'none'; }
    else $('#deliveryHint').textContent = `${s.delivery_note || 'Delivered to you'}${Number(s.delivery_fee) ? ' · ' + money(s.delivery_fee) : ''}`;

    const withPics = allItems().filter((i) => i.image_url);
    const picks = [];
    const wanted = ['pavlova', 'cinnamon', 'macaron', 'brownie'];
    wanted.forEach((w) => { const f = withPics.find((i) => i.image_url.includes(w) && !picks.includes(i)); if (f) picks.push(f); });
    withPics.forEach((i) => { if (picks.length < 4 && !picks.includes(i)) picks.push(i); });
    $('#heroCollage').innerHTML = picks.slice(0, 4).map((i) => `<img src="${esc(i.image_url)}" alt="${esc(i.name)}">`).join('');
  }

  /* ------------------------------------------------------------------ cart */
  function addToCart(item, optionId, qty) {
    const key = `${item.id}:${optionId || ''}`;
    const found = CART.find((l) => l.key === key);
    if (found) found.quantity = Math.min(99, found.quantity + qty);
    else {
      const opt = (item.options || []).find((o) => String(o.id) === String(optionId));
      CART.push({ key, item_id: item.id, option_id: optionId ? Number(optionId) : null, name: item.name, option_label: opt ? opt.label : '', unit_price: itemPrice(item, optionId), quantity: qty, image_url: item.image_url, emoji: item.emoji });
    }
    saveCart(); renderCart(); toast(`${item.name} added to your basket`);
  }

  function cartSubtotal() { return CART.reduce((s, l) => s + l.unit_price * l.quantity, 0); }
  function cartCount() { return CART.reduce((s, l) => s + l.quantity, 0); }

  function renderCart() {
    $('#cartCount').textContent = cartCount();
    const body = $('#cartBody');
    if (!CART.length) {
      body.innerHTML = `<div class="empty-cart"><div class="big">🧺</div><p>Your basket is empty.<br>Have a look at the menu — everything is baked fresh for your date.</p></div>`;
      $('#cartFoot').hidden = true;
      return;
    }
    body.innerHTML = CART.map((l) => `
      <div class="line-item" data-key="${esc(l.key)}">
        ${l.image_url ? `<img src="${esc(l.image_url)}" alt="">` : `<div class="ph">${esc(l.emoji || '🍰')}</div>`}
        <div>
          <h5>${esc(l.name)}</h5>
          ${l.option_label ? `<div class="meta">${esc(l.option_label)}</div>` : ''}
          <div class="meta">${money(l.unit_price)} each</div>
          <div class="qty">
            <button data-dec aria-label="One fewer">−</button><span>${l.quantity}</span><button data-inc aria-label="One more">+</button>
            <button class="btn link small" data-remove>Remove</button>
          </div>
        </div>
        <div class="lt">${money(l.unit_price * l.quantity)}</div>
      </div>`).join('');
    $('#cartFoot').hidden = false;
    $('#cartSubtotal').textContent = money(cartSubtotal());
    $('#cartTotal').textContent = money(cartSubtotal());
  }

  $('#cartBody').addEventListener('click', (e) => {
    const row = e.target.closest('[data-key]'); if (!row) return;
    const line = CART.find((l) => l.key === row.dataset.key); if (!line) return;
    if (e.target.closest('[data-inc]')) line.quantity = Math.min(99, line.quantity + 1);
    else if (e.target.closest('[data-dec]')) line.quantity -= 1;
    else if (e.target.closest('[data-remove]')) line.quantity = 0;
    else return;
    if (line.quantity < 1) CART = CART.filter((l) => l.key !== line.key);
    saveCart(); renderCart();
  });

  /* --------------------------------------------------------------- drawers */
  const openCart = () => { $('#cartDrawer').classList.add('open'); $('#overlay').classList.add('open'); };
  const closeCart = () => { $('#cartDrawer').classList.remove('open'); $('#overlay').classList.remove('open'); };
  $('#openCart').onclick = openCart;
  $('#closeCart').onclick = closeCart;
  $('#overlay').onclick = () => { closeCart(); closeModal('#checkoutModal'); };

  const openModal = (sel) => { $(sel).classList.add('open'); $('#overlay').classList.add('open'); document.body.style.overflow = 'hidden'; };
  const closeModal = (sel) => { $(sel).classList.remove('open'); if (!$('#cartDrawer').classList.contains('open')) $('#overlay').classList.remove('open'); document.body.style.overflow = ''; };
  $('#closeCheckout').onclick = () => closeModal('#checkoutModal');
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeCart(); closeModal('#checkoutModal'); } });

  /* -------------------------------------------------------------- checkout */
  function minDate() {
    const lead = Math.max(0, Number(SHOP.settings.min_lead_days || 2));
    const itemLead = Math.max(0, ...CART.map((l) => {
      const it = allItems().find((i) => i.id === l.item_id);
      return it ? it.lead_time_days : 0;
    }));
    const d = new Date(); d.setHours(12, 0, 0, 0);
    d.setDate(d.getDate() + Math.max(lead, itemLead));
    return d.toISOString().slice(0, 10);
  }

  function renderSummary() {
    const delivery = $('input[name="fulfillment"]:checked').value === 'delivery';
    const fee = delivery ? Number(SHOP.settings.delivery_fee || 0) : 0;
    $('#checkoutSummary').innerHTML =
      CART.map((l) => `<div class="row"><span>${l.quantity} × ${esc(l.name)}${l.option_label ? ` <span style="color:var(--ink-faint)">(${esc(l.option_label)})</span>` : ''}</span><span>${money(l.unit_price * l.quantity)}</span></div>`).join('') +
      `<div class="row"><span>Subtotal</span><span>${money(cartSubtotal())}</span></div>` +
      (fee ? `<div class="row"><span>Delivery</span><span>${money(fee)}</span></div>` : '') +
      `<div class="row" style="font-weight:700;border-top:1px solid var(--line);margin-top:.4rem;padding-top:.5rem"><span>Total</span><span>${money(cartSubtotal() + fee)}</span></div>`;
  }

  $('#goCheckout').onclick = () => {
    if (!CART.length) return;
    closeCart();
    const d = $('#cDate');
    d.min = minDate();
    if (!d.value || d.value < d.min) d.value = d.min;
    $('#checkoutError').hidden = true;
    renderSummary();
    openModal('#checkoutModal');
  };

  $('#orderForm').addEventListener('change', (e) => {
    if (e.target.name === 'fulfillment') {
      $('#addressField').hidden = e.target.value !== 'delivery';
      renderSummary();
    }
  });

  $('#orderForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('#placeOrder');
    const fd = new FormData(e.target);
    const payload = {
      customer_name: fd.get('customer_name'), email: fd.get('email'), phone: fd.get('phone'),
      fulfillment: fd.get('fulfillment'), address: fd.get('address') || '',
      wanted_date: fd.get('wanted_date'), wanted_time: fd.get('wanted_time') || '',
      payment_method: fd.get('payment_method'), notes: fd.get('notes') || '',
      items: CART.map((l) => ({ item_id: l.item_id, option_id: l.option_id, quantity: l.quantity }))
    };
    btn.disabled = true; btn.textContent = 'Placing your order…';
    try {
      const res = await fetch('/api/orders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Something went wrong.');
      CART = []; saveCart(); renderCart();
      closeModal('#checkoutModal');
      showConfirmation(data);
    } catch (err) {
      const box = $('#checkoutError');
      box.textContent = err.message; box.hidden = false;
      box.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } finally {
      btn.disabled = false; btn.textContent = 'Place order';
    }
  });

  function showConfirmation(data) {
    const o = data.order;
    const when = new Date(o.wanted_date + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    $('#doneBody').innerHTML = `
      <div class="success-mark">✓</div>
      <h3 style="text-align:center">Order placed</h3>
      <p style="text-align:center;color:var(--ink-soft)">${esc(data.note || '')}</p>
      <div class="summary-box">
        <div class="row"><span>Order number</span><strong>${esc(o.order_number)}</strong></div>
        <div class="row"><span>${o.fulfillment === 'delivery' ? 'Delivery' : 'Pickup'} date</span><span>${esc(when)}${o.wanted_time ? ' · ' + esc(o.wanted_time) : ''}</span></div>
        <div class="row"><span>Total</span><strong>${money(o.total)}</strong></div>
        <div class="row"><span>Payment</span><span>${o.payment_method === 'bank_transfer' ? 'Bank transfer' : 'Before ' + (o.fulfillment === 'delivery' ? 'delivery' : 'pickup')}</span></div>
      </div>
      ${data.bank_details ? `<p style="font-weight:600;margin-bottom:.4rem">Transfer details</p><div class="bank-details">${esc(data.bank_details)}</div>` : ''}
      <p style="font-size:.85rem;color:var(--ink-faint);margin-top:1rem">Keep your order number — you can check the status any time on the <a href="/order-status">order status page</a>.</p>
      <button class="btn block" id="doneClose" style="margin-top:1rem">Done</button>`;
    openModal('#doneModal');
    $('#doneClose').onclick = () => { closeModal('#doneModal'); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  }

  /* ------------------------------------------------------------------ boot */
  async function boot() {
    loadCart();
    try {
      const res = await fetch('/api/shop');
      SHOP = await res.json();
    } catch {
      $('#menuRoot').innerHTML = '<div class="alert error">We could not load the menu. Please refresh the page.</div>';
      return;
    }
    // drop cart lines for items that no longer exist
    const ids = new Set(allItems().map((i) => i.id));
    const before = CART.length;
    CART = CART.filter((l) => ids.has(l.item_id));
    if (CART.length !== before) saveCart();
    renderHero();
    renderMenu();
    renderCart();
  }
  boot();
})();
