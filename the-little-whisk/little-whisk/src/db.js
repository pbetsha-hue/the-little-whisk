'use strict';
const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');

const DATA_DIR = process.env.LW_DATA_DIR || path.join(__dirname, '..', 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });
const DB_PATH = path.join(DATA_DIR, 'little-whisk.db');

const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

db.exec(`
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS categories (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  blurb      TEXT DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS items (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  category_id    INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  name           TEXT NOT NULL,
  description    TEXT DEFAULT '',
  base_price     REAL NOT NULL DEFAULT 0,
  unit           TEXT DEFAULT '',
  emoji          TEXT DEFAULT '',
  option_label   TEXT DEFAULT '',
  image_url      TEXT DEFAULT '',
  lead_time_days INTEGER NOT NULL DEFAULT 2,
  is_available   INTEGER NOT NULL DEFAULT 1,
  is_featured    INTEGER NOT NULL DEFAULT 0,
  sort_order     INTEGER NOT NULL DEFAULT 0,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS item_options (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id     INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  label       TEXT NOT NULL,
  price_delta REAL NOT NULL DEFAULT 0,
  sort_order  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS orders (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  order_number   TEXT NOT NULL UNIQUE,
  customer_name  TEXT NOT NULL,
  email          TEXT NOT NULL,
  phone          TEXT NOT NULL,
  fulfillment    TEXT NOT NULL DEFAULT 'pickup',
  address        TEXT DEFAULT '',
  wanted_date    TEXT NOT NULL,
  wanted_time    TEXT DEFAULT '',
  payment_method TEXT NOT NULL DEFAULT 'pay_on_pickup',
  payment_status TEXT NOT NULL DEFAULT 'unpaid',
  status         TEXT NOT NULL DEFAULT 'new',
  subtotal       REAL NOT NULL DEFAULT 0,
  delivery_fee   REAL NOT NULL DEFAULT 0,
  total          REAL NOT NULL DEFAULT 0,
  notes          TEXT DEFAULT '',
  internal_note  TEXT DEFAULT '',
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS order_items (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id    INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  item_id     INTEGER,
  item_name   TEXT NOT NULL,
  option_label TEXT DEFAULT '',
  unit_price  REAL NOT NULL DEFAULT 0,
  quantity    INTEGER NOT NULL DEFAULT 1,
  line_total  REAL NOT NULL DEFAULT 0,
  notes       TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS admin_sessions (
  token      TEXT PRIMARY KEY,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_items_cat ON items(category_id);
CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
`);

/* ---------- lightweight migrations ---------- */
function ensureColumn(table, column, definition) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
  if (!cols.includes(column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}
ensureColumn('items', 'image_url', "TEXT DEFAULT ''");

/* ---------- settings helpers ---------- */
function getSetting(key, fallback = '') {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : fallback;
}
function setSetting(key, value) {
  db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  ).run(key, String(value ?? ''));
}
function allSettings() {
  const out = {};
  for (const r of db.prepare('SELECT key, value FROM settings').all()) out[r.key] = r.value;
  return out;
}

/* ---------- password helpers (scrypt, no external deps) ---------- */
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return `${salt}:${hash}`;
}
function verifyPassword(password, stored) {
  if (!stored || !stored.includes(':')) return false;
  const [salt, hash] = stored.split(':');
  const attempt = crypto.scryptSync(String(password), salt, 64);
  const known = Buffer.from(hash, 'hex');
  if (known.length !== attempt.length) return false;
  return crypto.timingSafeEqual(known, attempt);
}

module.exports = { db, DB_PATH, DATA_DIR, getSetting, setSetting, allSettings, hashPassword, verifyPassword };
