'use strict';
/* The Little Whisk — order site + admin dashboard. Node 22+, no dependencies. */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { db, getSetting, setSetting, allSettings, hashPassword, verifyPassword } = require('./db');

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';
const ADMIN_PATH = '/' + String(process.env.LW_ADMIN_PATH || 'admin').replace(/^\/+|\/+$/g, '');
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const SESSION_DAYS = 7;

/* ------------------------------------------------------------------ utils */
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff2': 'font/woff2' };

function send(res, status, body, headers = {}) {
  res.writeHead(status, { 'X-Content-Type-Options': 'nosniff', ...headers });
  res.end(body);
}
function json(res, status, data, headers = {}) {
  send(res, status, JSON.stringify(data), { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
}
function readBody(req, limit = 512 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(new Error('Payload too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); } catch { reject(new Error('Invalid JSON')); }
    });
    req.on('error', reject);
  });
}
function parseCookies(req) {
  const out = {};
  for (const part of (req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}
const str = (v, max = 500) => String(v ?? '').trim().slice(0, max);
const num = (v, d = 0) => { const n = Number(v); return Number.isFinite(n) ? n : d; };
const money = (n) => Math.round(num(n) * 100) / 100;
const isEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
const isDate = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));

/* ------------------------------------------------------- admin sessions */
function cleanSessions() {
  db.prepare("DELETE FROM admin_sessions WHERE expires_at < datetime('now')").run();
}
function createSession() {
  cleanSessions();
  const token = crypto.randomBytes(32).toString('hex');
  db.prepare(`INSERT INTO admin_sessions (token, expires_at) VALUES (?, datetime('now', '+${SESSION_DAYS} days'))`).run(token);
  return token;
}
function isAdmin(req) {
  const token = parseCookies(req).lw_session;
  if (!token) return false;
  const row = db.prepare("SELECT token FROM admin_sessions WHERE token = ? AND expires_at > datetime('now')").get(token);
  return !!row;
}
function requireAdmin(req, res) {
  if (isAdmin(req)) return true;
  json(res, 401, { error: 'Not signed in.' });
  return false;
}

/* login throttling (in memory, resets on restart) */
const attempts = new Map();
function throttled(ip) {
  const a = attempts.get(ip);
  if (!a) return false;
  if (Date.now() - a.first > 15 * 60 * 1000) { attempts.delete(ip); return false; }
  return a.count >= 8;
}
function noteFailure(ip) {
  const a = attempts.get(ip) || { count: 0, first: Date.now() };
  a.count++; attempts.set(ip, a);
}

/* ------------------------------------------------------------ menu reads */
function getMenu({ includeHidden = false } = {}) {
  const cats = db.prepare('SELECT * FROM categories ORDER BY sort_order, id').all();
  const items = db.prepare(
    `SELECT * FROM items ${includeHidden ? '' : 'WHERE is_available = 1'} ORDER BY sort_order, id`
  ).all();
  const opts = db.prepare('SELECT * FROM item_options ORDER BY sort_order, id').all();
  const byItem = new Map();
  for (const o of opts) {
    if (!byItem.has(o.item_id)) byItem.set(o.item_id, []);
    byItem.get(o.item_id).push({ id: o.id, label: o.label, price_delta: o.price_delta });
  }
  const withOpts = items.map((it) => ({ ...it, options: byItem.get(it.id) || [] }));
  return {
    categories: cats.map((c) => ({ ...c, items: withOpts.filter((i) => i.category_id === c.id) })),
    uncategorised: withOpts.filter((i) => !i.category_id)
  };
}

const PUBLIC_SETTING_KEYS = ['shop_name', 'tagline', 'intro', 'phone', 'email', 'address', 'instagram', 'currency_symbol', 'min_lead_days', 'pickup_hours', 'delivery_enabled', 'delivery_fee', 'delivery_note', 'announcement', 'order_confirmation_note', 'bank_details'];
function publicSettings() {
  const all = allSettings();
  const out = {};
  for (const k of PUBLIC_SETTING_KEYS) out[k] = all[k] ?? '';
  return out;
}

/* --------------------------------------------------------- order numbers */
function nextOrderNumber() {
  const d = new Date();
  const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  for (let i = 0; i < 20; i++) {
    const candidate = `LW-${stamp}-${crypto.randomInt(1000, 9999)}`;
    if (!db.prepare('SELECT 1 FROM orders WHERE order_number = ?').get(candidate)) return candidate;
  }
  return `LW-${stamp}-${Date.now().toString().slice(-6)}`;
}

/* ------------------------------------------------------------ create order */
function createOrder(payload) {
  const name = str(payload.customer_name, 120);
  const email = str(payload.email, 160);
  const phone = str(payload.phone, 40);
  const fulfillment = payload.fulfillment === 'delivery' ? 'delivery' : 'pickup';
  const address = str(payload.address, 400);
  const wantedDate = str(payload.wanted_date, 10);
  const wantedTime = str(payload.wanted_time, 20);
  const paymentMethod = payload.payment_method === 'bank_transfer' ? 'bank_transfer' : 'pay_on_pickup';
  const notes = str(payload.notes, 1000);
  const cart = Array.isArray(payload.items) ? payload.items.slice(0, 60) : [];

  const errors = [];
  if (name.length < 2) errors.push('Please give us a name for the order.');
  if (!isEmail(email)) errors.push('Please give a valid email address.');
  if (phone.replace(/\D/g, '').length < 7) errors.push('Please give a phone number we can reach you on.');
  if (!isDate(wantedDate)) errors.push('Please choose a date.');
  if (fulfillment === 'delivery' && getSetting('delivery_enabled', '1') !== '1') errors.push('Delivery is not available right now.');
  if (fulfillment === 'delivery' && address.length < 6) errors.push('Please give a delivery address.');
  if (!cart.length) errors.push('Your basket is empty.');
  if (errors.length) return { error: errors.join(' ') };

  // Prices always come from the database, never from the browser.
  const lines = [];
  let subtotal = 0;
  let maxLead = 0;
  for (const raw of cart) {
    const item = db.prepare('SELECT * FROM items WHERE id = ? AND is_available = 1').get(num(raw.item_id));
    if (!item) return { error: 'One of the items in your basket is no longer available. Please refresh and try again.' };
    const qty = Math.max(1, Math.min(200, Math.round(num(raw.quantity, 1))));
    let unit = item.base_price;
    let optionLabel = '';
    if (raw.option_id) {
      const opt = db.prepare('SELECT * FROM item_options WHERE id = ? AND item_id = ?').get(num(raw.option_id), item.id);
      if (!opt) return { error: `Please choose a valid option for ${item.name}.` };
      unit += opt.price_delta;
      optionLabel = opt.label;
    } else {
      const anyOpt = db.prepare('SELECT COUNT(*) AS n FROM item_options WHERE item_id = ?').get(item.id).n;
      if (anyOpt > 0) return { error: `Please choose an option for ${item.name}.` };
    }
    unit = money(Math.max(0, unit));
    const lineTotal = money(unit * qty);
    subtotal = money(subtotal + lineTotal);
    maxLead = Math.max(maxLead, item.lead_time_days || 0);
    lines.push({ item_id: item.id, item_name: item.name, option_label: optionLabel, unit_price: unit, quantity: qty, line_total: lineTotal, notes: str(raw.notes, 300) });
  }

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const wanted = new Date(wantedDate + 'T00:00:00');
  const daysAway = Math.round((wanted - today) / 86400000);
  const minLead = Math.max(num(getSetting('min_lead_days', '2'), 2), maxLead);
  if (daysAway < minLead) {
    return { error: `We need at least ${minLead} day${minLead === 1 ? '' : 's'} notice for this order. Please choose a later date.` };
  }

  const deliveryFee = fulfillment === 'delivery' ? money(getSetting('delivery_fee', '0')) : 0;
  const total = money(subtotal + deliveryFee);
  const orderNumber = nextOrderNumber();

  const insOrder = db.prepare(`INSERT INTO orders
    (order_number, customer_name, email, phone, fulfillment, address, wanted_date, wanted_time,
     payment_method, payment_status, status, subtotal, delivery_fee, total, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'unpaid', 'new', ?, ?, ?, ?)`);
  const insLine = db.prepare(`INSERT INTO order_items
    (order_id, item_id, item_name, option_label, unit_price, quantity, line_total, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);

  db.exec('BEGIN');
  try {
    const orderId = insOrder.run(orderNumber, name, email, phone, fulfillment, address, wantedDate, wantedTime, paymentMethod, subtotal, deliveryFee, total, notes).lastInsertRowid;
    for (const l of lines) insLine.run(orderId, l.item_id, l.item_name, l.option_label, l.unit_price, l.quantity, l.line_total, l.notes);
    db.exec('COMMIT');
    return { order: fullOrder(orderId) };
  } catch (err) {
    db.exec('ROLLBACK');
    return { error: 'We could not save that order. Please try again.' };
  }
}

function fullOrder(id) {
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
  if (!order) return null;
  order.items = db.prepare('SELECT * FROM order_items WHERE order_id = ? ORDER BY id').all(id);
  return order;
}

/* ------------------------------------------------------------ admin stats */
function stats(days = 30) {
  const since = `-${Math.max(1, Math.min(365, days))} days`;
  const q = (sql, ...a) => db.prepare(sql).get(...a);
  const active = "status NOT IN ('cancelled')";
  return {
    range_days: days,
    orders_total: q('SELECT COUNT(*) AS n FROM orders').n,
    orders_in_range: q(`SELECT COUNT(*) AS n FROM orders WHERE created_at >= datetime('now', ?)`, since).n,
    revenue_in_range: q(`SELECT COALESCE(SUM(total),0) AS n FROM orders WHERE ${active} AND created_at >= datetime('now', ?)`, since).n,
    revenue_collected: q(`SELECT COALESCE(SUM(total),0) AS n FROM orders WHERE payment_status = 'paid'`).n,
    revenue_outstanding: q(`SELECT COALESCE(SUM(total),0) AS n FROM orders WHERE payment_status = 'unpaid' AND ${active}`).n,
    new_orders: q("SELECT COUNT(*) AS n FROM orders WHERE status = 'new'").n,
    upcoming: q(`SELECT COUNT(*) AS n FROM orders WHERE ${active} AND wanted_date >= date('now')`).n,
    average_order: q(`SELECT COALESCE(AVG(total),0) AS n FROM orders WHERE ${active} AND created_at >= datetime('now', ?)`, since).n,
    by_status: db.prepare('SELECT status, COUNT(*) AS n FROM orders GROUP BY status').all(),
    by_day: db.prepare(`SELECT date(created_at) AS day, COUNT(*) AS orders, COALESCE(SUM(total),0) AS revenue
                        FROM orders WHERE ${active} AND created_at >= datetime('now', ?)
                        GROUP BY day ORDER BY day`).all(since),
    top_items: db.prepare(`SELECT oi.item_name AS name, SUM(oi.quantity) AS qty, SUM(oi.line_total) AS revenue
                           FROM order_items oi JOIN orders o ON o.id = oi.order_id
                           WHERE o.status NOT IN ('cancelled') AND o.created_at >= datetime('now', ?)
                           GROUP BY oi.item_name ORDER BY revenue DESC LIMIT 10`).all(since),
    by_payment: db.prepare(`SELECT payment_method, COUNT(*) AS n, COALESCE(SUM(total),0) AS revenue
                            FROM orders WHERE ${active} GROUP BY payment_method`).all(),
    upcoming_orders: db.prepare(`SELECT id, order_number, customer_name, wanted_date, wanted_time, status, total, fulfillment
                                 FROM orders WHERE ${active} AND wanted_date >= date('now')
                                 ORDER BY wanted_date, wanted_time LIMIT 8`).all()
  };
}

function csvEscape(v) {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function ordersCsv() {
  const rows = db.prepare('SELECT * FROM orders ORDER BY created_at DESC').all();
  const head = ['Order', 'Placed', 'Customer', 'Email', 'Phone', 'Wanted date', 'Time', 'Fulfilment', 'Address', 'Payment method', 'Payment status', 'Status', 'Subtotal', 'Delivery', 'Total', 'Items', 'Customer notes', 'Internal note'];
  const lines = [head.join(',')];
  for (const o of rows) {
    const its = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(o.id)
      .map((i) => `${i.quantity} x ${i.item_name}${i.option_label ? ' (' + i.option_label + ')' : ''}`).join('; ');
    const payLabel = o.payment_method === 'bank_transfer' ? 'Bank transfer' : 'Before collection';
    lines.push([o.order_number, o.created_at, o.customer_name, o.email, o.phone, o.wanted_date, o.wanted_time, o.fulfillment, o.address, payLabel, o.payment_status, o.status, o.subtotal, o.delivery_fee, o.total, its, o.notes, o.internal_note].map(csvEscape).join(','));
  }
  return lines.join('\n');
}

/* --------------------------------------------------------------- routing */
const ORDER_STATUSES = ['new', 'confirmed', 'baking', 'ready', 'completed', 'cancelled'];
const PAYMENT_STATUSES = ['unpaid', 'paid', 'refunded'];

async function api(req, res, url) {
  const p = url.pathname;
  const m = req.method;

  /* ---------- public ---------- */
  if (p === '/api/shop' && m === 'GET') {
    return json(res, 200, { settings: publicSettings(), ...getMenu() });
  }

  if (p === '/api/orders' && m === 'POST') {
    const body = await readBody(req);
    const result = createOrder(body);
    if (result.error) return json(res, 400, { error: result.error });
    return json(res, 201, { order: result.order, bank_details: result.order.payment_method === 'bank_transfer' ? getSetting('bank_details') : '', note: getSetting('order_confirmation_note') });
  }

  if (p === '/api/orders/lookup' && m === 'GET') {
    const number = str(url.searchParams.get('number'), 40);
    const email = str(url.searchParams.get('email'), 160).toLowerCase();
    const o = db.prepare('SELECT * FROM orders WHERE order_number = ? AND lower(email) = ?').get(number, email);
    if (!o) return json(res, 404, { error: 'No order found with that number and email.' });
    o.items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(o.id);
    delete o.internal_note;
    return json(res, 200, { order: o });
  }

  /* ---------- admin auth ---------- */
  if (p === '/api/admin/login' && m === 'POST') {
    const ip = req.socket.remoteAddress || 'unknown';
    if (throttled(ip)) return json(res, 429, { error: 'Too many attempts. Wait 15 minutes and try again.' });
    const { password } = await readBody(req);
    if (!verifyPassword(password || '', getSetting('admin_password'))) {
      noteFailure(ip);
      return json(res, 401, { error: 'That password is not right.' });
    }
    attempts.delete(ip);
    const token = createSession();
    const secure = process.env.LW_SECURE_COOKIE === '1' ? ' Secure;' : '';
    return json(res, 200, { ok: true }, {
      'Set-Cookie': `lw_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_DAYS * 86400};${secure}`
    });
  }

  if (p === '/api/admin/logout' && m === 'POST') {
    const token = parseCookies(req).lw_session;
    if (token) db.prepare('DELETE FROM admin_sessions WHERE token = ?').run(token);
    return json(res, 200, { ok: true }, { 'Set-Cookie': 'lw_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0' });
  }

  if (p === '/api/admin/me' && m === 'GET') {
    return json(res, 200, { signed_in: isAdmin(req) });
  }

  /* ---------- everything below needs a session ---------- */
  if (p.startsWith('/api/admin/')) {
    if (!requireAdmin(req, res)) return;
  } else {
    return json(res, 404, { error: 'Not found' });
  }

  if (p === '/api/admin/stats' && m === 'GET') {
    return json(res, 200, stats(num(url.searchParams.get('days'), 30)));
  }

  if (p === '/api/admin/orders' && m === 'GET') {
    const status = str(url.searchParams.get('status'), 20);
    const payment = str(url.searchParams.get('payment'), 20);
    const q = str(url.searchParams.get('q'), 80);
    const from = str(url.searchParams.get('from'), 10);
    const to = str(url.searchParams.get('to'), 10);
    const where = []; const args = [];
    if (ORDER_STATUSES.includes(status)) { where.push('status = ?'); args.push(status); }
    if (PAYMENT_STATUSES.includes(payment)) { where.push('payment_status = ?'); args.push(payment); }
    if (q) { where.push('(order_number LIKE ? OR customer_name LIKE ? OR email LIKE ? OR phone LIKE ?)'); args.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`); }
    if (isDate(from)) { where.push('wanted_date >= ?'); args.push(from); }
    if (isDate(to)) { where.push('wanted_date <= ?'); args.push(to); }
    const sql = `SELECT * FROM orders ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY created_at DESC LIMIT 300`;
    const orders = db.prepare(sql).all(...args);
    const lines = db.prepare('SELECT * FROM order_items').all();
    for (const o of orders) o.items = lines.filter((l) => l.order_id === o.id);
    return json(res, 200, { orders });
  }

  let mm;
  if ((mm = p.match(/^\/api\/admin\/orders\/(\d+)$/))) {
    const id = Number(mm[1]);
    if (m === 'GET') {
      const o = fullOrder(id);
      return o ? json(res, 200, { order: o }) : json(res, 404, { error: 'Order not found.' });
    }
    if (m === 'PATCH') {
      const b = await readBody(req);
      const sets = []; const args = [];
      if (b.status !== undefined) {
        if (!ORDER_STATUSES.includes(b.status)) return json(res, 400, { error: 'Unknown status.' });
        sets.push('status = ?'); args.push(b.status);
      }
      if (b.payment_status !== undefined) {
        if (!PAYMENT_STATUSES.includes(b.payment_status)) return json(res, 400, { error: 'Unknown payment status.' });
        sets.push('payment_status = ?'); args.push(b.payment_status);
      }
      if (b.internal_note !== undefined) { sets.push('internal_note = ?'); args.push(str(b.internal_note, 2000)); }
      if (b.wanted_date !== undefined && isDate(b.wanted_date)) { sets.push('wanted_date = ?'); args.push(b.wanted_date); }
      if (!sets.length) return json(res, 400, { error: 'Nothing to update.' });
      sets.push("updated_at = datetime('now')");
      db.prepare(`UPDATE orders SET ${sets.join(', ')} WHERE id = ?`).run(...args, id);
      return json(res, 200, { order: fullOrder(id) });
    }
    if (m === 'DELETE') {
      db.prepare('DELETE FROM orders WHERE id = ?').run(id);
      return json(res, 200, { ok: true });
    }
  }

  if (p === '/api/admin/orders.csv' && m === 'GET') {
    return send(res, 200, ordersCsv(), {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="little-whisk-orders-${new Date().toISOString().slice(0, 10)}.csv"`
    });
  }

  if (p === '/api/admin/menu' && m === 'GET') {
    return json(res, 200, getMenu({ includeHidden: true }));
  }

  /* ---- categories ---- */
  if (p === '/api/admin/categories' && m === 'POST') {
    const b = await readBody(req);
    const name = str(b.name, 80);
    if (!name) return json(res, 400, { error: 'A category needs a name.' });
    const max = db.prepare('SELECT COALESCE(MAX(sort_order), -1) AS n FROM categories').get().n;
    const id = db.prepare('INSERT INTO categories (name, blurb, sort_order) VALUES (?, ?, ?)').run(name, str(b.blurb, 300), max + 1).lastInsertRowid;
    return json(res, 201, { id });
  }
  if ((mm = p.match(/^\/api\/admin\/categories\/(\d+)$/))) {
    const id = Number(mm[1]);
    if (m === 'PATCH') {
      const b = await readBody(req);
      const sets = []; const args = [];
      if (b.name !== undefined) { sets.push('name = ?'); args.push(str(b.name, 80)); }
      if (b.blurb !== undefined) { sets.push('blurb = ?'); args.push(str(b.blurb, 300)); }
      if (b.sort_order !== undefined) { sets.push('sort_order = ?'); args.push(Math.round(num(b.sort_order))); }
      if (!sets.length) return json(res, 400, { error: 'Nothing to update.' });
      db.prepare(`UPDATE categories SET ${sets.join(', ')} WHERE id = ?`).run(...args, id);
      return json(res, 200, { ok: true });
    }
    if (m === 'DELETE') {
      const n = db.prepare('SELECT COUNT(*) AS n FROM items WHERE category_id = ?').get(id).n;
      if (n > 0) return json(res, 400, { error: `Move or delete the ${n} item(s) in this section first.` });
      db.prepare('DELETE FROM categories WHERE id = ?').run(id);
      return json(res, 200, { ok: true });
    }
  }

  /* ---- items ---- */
  function writeOptions(itemId, options) {
    db.prepare('DELETE FROM item_options WHERE item_id = ?').run(itemId);
    const ins = db.prepare('INSERT INTO item_options (item_id, label, price_delta, sort_order) VALUES (?, ?, ?, ?)');
    (Array.isArray(options) ? options : []).slice(0, 20).forEach((o, i) => {
      const label = str(o.label, 80);
      if (label) ins.run(itemId, label, money(o.price_delta), i);
    });
  }

  if (p === '/api/admin/items' && m === 'POST') {
    const b = await readBody(req);
    const name = str(b.name, 120);
    if (!name) return json(res, 400, { error: 'An item needs a name.' });
    if (b.category_id && !db.prepare('SELECT 1 FROM categories WHERE id = ?').get(Number(b.category_id))) {
      return json(res, 400, { error: 'That section no longer exists — pick another one.' });
    }
    const max = db.prepare('SELECT COALESCE(MAX(sort_order), -1) AS n FROM items WHERE category_id IS ?').get(b.category_id ? Number(b.category_id) : null).n;
    const id = db.prepare(`INSERT INTO items
      (category_id, name, description, base_price, unit, emoji, image_url, option_label, lead_time_days, is_available, is_featured, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      b.category_id ? Number(b.category_id) : null, name, str(b.description, 600), money(b.base_price),
      str(b.unit, 60), str(b.emoji, 8), str(b.image_url, 300), str(b.option_label, 40), Math.max(0, Math.round(num(b.lead_time_days, 2))),
      b.is_available === false ? 0 : 1, b.is_featured ? 1 : 0, max + 1
    ).lastInsertRowid;
    writeOptions(id, b.options);
    return json(res, 201, { id });
  }

  if ((mm = p.match(/^\/api\/admin\/items\/(\d+)$/))) {
    const id = Number(mm[1]);
    if (m === 'PATCH') {
      const b = await readBody(req);
      const map = {
        name: (v) => str(v, 120), description: (v) => str(v, 600), base_price: money,
        unit: (v) => str(v, 60), emoji: (v) => str(v, 8), image_url: (v) => str(v, 300),
        option_label: (v) => str(v, 40),
        lead_time_days: (v) => Math.max(0, Math.round(num(v, 2))),
        is_available: (v) => (v ? 1 : 0), is_featured: (v) => (v ? 1 : 0),
        sort_order: (v) => Math.round(num(v)),
        category_id: (v) => (v ? Number(v) : null)
      };
      if (b.category_id && !db.prepare('SELECT 1 FROM categories WHERE id = ?').get(Number(b.category_id))) {
        return json(res, 400, { error: 'That section no longer exists — pick another one.' });
      }
      const sets = []; const args = [];
      for (const [k, fn] of Object.entries(map)) {
        if (b[k] !== undefined) { sets.push(`${k} = ?`); args.push(fn(b[k])); }
      }
      if (sets.length) db.prepare(`UPDATE items SET ${sets.join(', ')} WHERE id = ?`).run(...args, id);
      if (b.options !== undefined) writeOptions(id, b.options);
      if (!sets.length && b.options === undefined) return json(res, 400, { error: 'Nothing to update.' });
      return json(res, 200, { ok: true });
    }
    if (m === 'DELETE') {
      db.prepare('DELETE FROM items WHERE id = ?').run(id);
      return json(res, 200, { ok: true });
    }
  }

  /* ---- photo upload ---- */
  if (p === '/api/admin/upload' && m === 'POST') {
    const b = await readBody(req, 8 * 1024 * 1024);
    const match = /^data:image\/(jpeg|jpg|png|webp|gif);base64,([\s\S]+)$/.exec(String(b.data || ''));
    if (!match) return json(res, 400, { error: 'Please choose a JPG, PNG, WEBP or GIF image.' });
    const ext = match[1] === 'jpeg' ? 'jpg' : match[1];
    const buf = Buffer.from(match[2], 'base64');
    if (buf.length > 6 * 1024 * 1024) return json(res, 400, { error: 'That image is larger than 6MB. Please shrink it first.' });
    const dir = path.join(PUBLIC_DIR, 'images', 'uploads');
    fs.mkdirSync(dir, { recursive: true });
    const base = str(b.name, 60).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'photo';
    const filename = `${base}-${crypto.randomBytes(4).toString('hex')}.${ext}`;
    fs.writeFileSync(path.join(dir, filename), buf);
    return json(res, 201, { url: `/images/uploads/${filename}` });
  }

  /* ---- settings & password ---- */
  if (p === '/api/admin/settings' && m === 'GET') {
    const all = allSettings();
    delete all.admin_password;
    return json(res, 200, { settings: all });
  }
  if (p === '/api/admin/settings' && m === 'PUT') {
    const b = await readBody(req);
    for (const [k, v] of Object.entries(b.settings || {})) {
      if (k === 'admin_password') continue;
      if (!/^[a-z0-9_]{1,40}$/.test(k)) continue;
      setSetting(k, str(v, 4000));
    }
    return json(res, 200, { ok: true });
  }
  if (p === '/api/admin/password' && m === 'POST') {
    const b = await readBody(req);
    if (!verifyPassword(b.current || '', getSetting('admin_password'))) return json(res, 401, { error: 'Current password is not right.' });
    const next = String(b.next || '');
    if (next.length < 8) return json(res, 400, { error: 'Use at least 8 characters.' });
    setSetting('admin_password', hashPassword(next));
    db.prepare('DELETE FROM admin_sessions').run();
    return json(res, 200, { ok: true, signed_out: true });
  }

  return json(res, 404, { error: 'Not found' });
}

/* ------------------------------------------------------- static handling */
function serveStatic(res, relPath) {
  const safe = path.normalize(relPath).replace(/^(\.\.[\/\\])+/, '');
  const file = path.join(PUBLIC_DIR, safe);
  if (!file.startsWith(PUBLIC_DIR)) return send(res, 403, 'Forbidden');
  fs.readFile(file, (err, data) => {
    if (err) return send(res, 404, 'Not found', { 'Content-Type': 'text/plain' });
    const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
    const cache = /\.(css|js|png|jpg|jpeg|svg|webp|woff2)$/i.test(file) ? 'public, max-age=300' : 'no-cache';
    send(res, 200, data, { 'Content-Type': type, 'Cache-Control': cache });
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  try {
    if (url.pathname.startsWith('/api/')) return await api(req, res, url);
    if (url.pathname === ADMIN_PATH || url.pathname === ADMIN_PATH + '/') return serveStatic(res, 'admin.html');
    if (url.pathname === '/' ) return serveStatic(res, 'index.html');
    if (url.pathname === '/order-status') return serveStatic(res, 'status.html');
    if (url.pathname === '/admin.html') return send(res, 404, 'Not found', { 'Content-Type': 'text/plain' });
    return serveStatic(res, url.pathname.slice(1));
  } catch (err) {
    const message = err && err.message === 'Invalid JSON' ? 'That request was malformed.' : 'Something went wrong on our side.';
    if (!res.headersSent) json(res, 400, { error: message });
    else res.end();
  }
});

server.listen(PORT, HOST, () => {
  console.log(`\n  ${getSetting('shop_name', 'The Little Whisk')} is running`);
  console.log(`  Shop        http://localhost:${PORT}/`);
  console.log(`  Admin       http://localhost:${PORT}${ADMIN_PATH}`);
  console.log(`  Order check http://localhost:${PORT}/order-status\n`);
});
