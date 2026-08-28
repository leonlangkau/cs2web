// GENERATED FROM schema.sql by scripts/build-schema.js — do not edit by hand.

export default `-- GoyHub schema. Shared by the node:sqlite adapter and Cloudflare D1.
-- D1 applies this through \`wrangler d1 execute --file\`; the Node adapter runs it at boot.

-- \`role\` ('user'/'admin') is legacy and kept only so an already-deployed
-- database never needs its CHECK constraint migrated in place; \`tier\` is the
-- single source of truth for access control everywhere in the app now (see
-- functions/_lib/tiers.js). Fresh installs get the columns here; an existing
-- database gets tier/email_verified_at via the guarded ALTER TABLEs in
-- bootstrap.js.
CREATE TABLE IF NOT EXISTS users (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  username          TEXT NOT NULL UNIQUE COLLATE NOCASE,
  email             TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash     TEXT NOT NULL,
  role              TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user','admin')),
  tier              TEXT NOT NULL DEFAULT 'user',
  banned            INTEGER NOT NULL DEFAULT 0,
  email_verified_at TEXT,
  paid_until        INTEGER,
  signup_ip         TEXT,
  last_login_ip     TEXT,
  last_login_at     TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Single-use, expiring tokens for password resets and email verification.
-- Only a hash of the token is stored, like sessions.
CREATE TABLE IF NOT EXISTS auth_tokens (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  kind       TEXT NOT NULL CHECK (kind IN ('reset','verify')),
  token_hash TEXT NOT NULL UNIQUE,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  used       INTEGER NOT NULL DEFAULT 0,
  expires_at INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_auth_tokens_user ON auth_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_auth_tokens_expires ON auth_tokens(expires_at);

CREATE TABLE IF NOT EXISTS sessions (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  token_hash TEXT NOT NULL UNIQUE,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  csrf_hash  TEXT,
  ip         TEXT,
  user_agent TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS ip_logs (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  username   TEXT,
  event      TEXT NOT NULL,
  ip         TEXT NOT NULL,
  user_agent TEXT,
  detail     TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_ip_logs_event ON ip_logs(event);
CREATE INDEX IF NOT EXISTS idx_ip_logs_ip ON ip_logs(ip);
CREATE INDEX IF NOT EXISTS idx_ip_logs_created ON ip_logs(created_at);

CREATE TABLE IF NOT EXISTS categories (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  slug        TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT '',
  position    INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS threads (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  pinned      INTEGER NOT NULL DEFAULT 0,
  locked      INTEGER NOT NULL DEFAULT 0,
  views       INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_threads_category ON threads(category_id);
CREATE INDEX IF NOT EXISTS idx_threads_updated ON threads(updated_at);

-- edited_at/edited_by were added after launch; existing databases get them
-- via the guarded ALTER TABLE in bootstrap.js.
CREATE TABLE IF NOT EXISTS posts (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  thread_id  INTEGER NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body       TEXT NOT NULL,
  edited_at  TEXT,
  edited_by  TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_posts_thread ON posts(thread_id);

-- Small key/value store for admin-editable site settings (announcement
-- banner, etc.) — avoids a redeploy for content-level changes.
CREATE TABLE IF NOT EXISTS settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Member reports on posts, feeding the admin panel's moderation queue.
CREATE TABLE IF NOT EXISTS reports (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id     INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  reporter_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason      TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved')),
  resolved_by TEXT,
  resolved_at TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status);

-- Lightweight live chat strip shown on the forum index page.
CREATE TABLE IF NOT EXISTS shouts (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body       TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_shouts_created ON shouts(id);

-- Workers isolates share no memory, so the rate limiter and the CAPTCHA
-- single-use check are backed by the database rather than in-process Maps.
CREATE TABLE IF NOT EXISTS rate_limits (
  key        TEXT PRIMARY KEY,
  count      INTEGER NOT NULL DEFAULT 0,
  reset_at   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_rate_limits_reset ON rate_limits(reset_at);

CREATE TABLE IF NOT EXISTS captcha_used (
  nonce      TEXT PRIMARY KEY,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_captcha_used_expires ON captcha_used(expires_at);

-- IP-level bans: blocks every route (except for staff, so nobody can lock
-- themselves out) regardless of which account, or no account, is behind it.
-- expires_at (ms since epoch) is set on automatic flood bans so a shared/NAT
-- address recovers on its own; NULL = permanent (admin-issued). Existing
-- databases get the column via the guarded ALTER TABLE in bootstrap.js.
CREATE TABLE IF NOT EXISTS ip_bans (
  ip         TEXT PRIMARY KEY,
  reason     TEXT,
  banned_by  TEXT,
  expires_at INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Client-reported device/browser fingerprints, captured once per browser
-- session (see public/js/fingerprint.js) and linked to the signed-in user, if
-- any. fp_hash groups sightings of the same device together so each device
-- accumulates its own history here — useful for spotting a banned user or
-- multi-accounter returning behind a new IP or account.
CREATE TABLE IF NOT EXISTS fingerprints (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  fp_hash     TEXT NOT NULL,
  user_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  username    TEXT,
  email       TEXT,
  ip          TEXT NOT NULL,
  user_agent  TEXT,
  device      TEXT,
  browser     TEXT,
  os          TEXT,
  screen      TEXT,
  language    TEXT,
  timezone    TEXT,
  canvas_hash TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_fingerprints_hash ON fingerprints(fp_hash);
CREATE INDEX IF NOT EXISTS idx_fingerprints_user ON fingerprints(user_id);
CREATE INDEX IF NOT EXISTS idx_fingerprints_created ON fingerprints(created_at);

-- Crypto membership payments via a self-hosted BTCPay Server (see
-- functions/_lib/btcpay.js). One row per checkout: created when the member
-- starts a purchase, then advanced by BTCPay's signed webhook. \`order_id\` is
-- our own random id, embedded in the invoice metadata and used to bind an
-- incoming webhook back to the member who started it. \`credited_at\` (ms epoch)
-- is the idempotency guard — set exactly once, so a replayed or duplicate
-- "settled" webhook can never grant a second membership period. Amounts are
-- stored as TEXT to preserve the exact decimal the invoice was priced at.
CREATE TABLE IF NOT EXISTS payments (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id    TEXT NOT NULL UNIQUE,
  invoice_id  TEXT UNIQUE,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  username    TEXT,
  amount      TEXT NOT NULL,
  currency    TEXT NOT NULL,
  period_days INTEGER,
  plan_id     TEXT,
  plan_name   TEXT,
  status      TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','processing','settled','expired','invalid')),
  credited_at INTEGER,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_payments_user ON payments(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);

-- Shop products, managed from the admin backend (Admin -> Shop). Each row is a
-- membership length for sale: \`period_days\` NULL means lifetime, and \`amount\`
-- is the price in the store's currency. Prices are ALWAYS read from here (or
-- from STORE_PLANS when this table is empty) at checkout — never from the
-- buyer's form, which carries only a slug — and each order snapshots what it
-- was sold at, so editing a product never rewrites a purchase already made.
-- Deactivating instead of deleting keeps a product out of the shop while its
-- past orders still make sense.
CREATE TABLE IF NOT EXISTS products (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  slug        TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  amount      TEXT NOT NULL,
  period_days INTEGER,
  position    INTEGER NOT NULL DEFAULT 0,
  active      INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_products_active ON products(active, position);

-- Direct-to-wallet crypto payments: ETH, SOL and USDT paid straight to the
-- operator's own addresses, with no processor in the middle (see
-- functions/_lib/chains.js and functions/_lib/onchain.js).
--
-- Every buyer pays the SAME address, so an order is bound to its payment by
-- \`expected_units\`: each live order is quoted a unique amount, differing from
-- its neighbours in the last few decimals by an amount worth about a cent. That
-- is what lets an anonymous incoming transfer be attributed to one account.
-- Amounts are integer base units (wei/lamports/token units) held as TEXT, since
-- they routinely exceed what a JS number can represent exactly.
--
-- \`credited_at\` (ms epoch) is the idempotency guard, set exactly once, so a
-- transaction seen by two overlapping scans can never grant two memberships.
CREATE TABLE IF NOT EXISTS chain_orders (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id       TEXT NOT NULL UNIQUE,
  user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  username       TEXT,
  asset          TEXT NOT NULL,
  chain          TEXT NOT NULL,
  address        TEXT NOT NULL,
  decimals       INTEGER NOT NULL,
  expected_units TEXT NOT NULL,
  min_units      TEXT NOT NULL,
  received_units TEXT,
  fiat_amount    TEXT NOT NULL,
  fiat_currency  TEXT NOT NULL,
  rate           TEXT NOT NULL,
  period_days    INTEGER,
  plan_id        TEXT,
  plan_name      TEXT,
  status         TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','seen','underpaid','settled','expired','cancelled')),
  tx_hash        TEXT,
  confirmations  INTEGER NOT NULL DEFAULT 0,
  credited_at    INTEGER,
  expires_at     INTEGER NOT NULL,
  match_until    INTEGER NOT NULL,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_chain_orders_user ON chain_orders(user_id);
CREATE INDEX IF NOT EXISTS idx_chain_orders_open ON chain_orders(asset, credited_at, match_until);
CREATE INDEX IF NOT EXISTS idx_chain_orders_status ON chain_orders(status);

-- Every incoming transfer the chain scanner has ever seen, matched or not.
--
-- UNIQUE(asset, tx_hash) is the other half of the idempotency guard: one
-- transaction can be claimed by at most one order, however many times it is
-- re-scanned, and a deposit that matches nothing is kept here as \`unmatched\`
-- rather than dropped, so an admin can see money that arrived and decide what
-- it was for. One row per transaction, holding the TOTAL it paid us — explorers
-- disagree about log and trace indices, so those are never used as identity.
CREATE TABLE IF NOT EXISTS chain_transfers (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  asset         TEXT NOT NULL,
  tx_hash       TEXT NOT NULL,
  address       TEXT NOT NULL,
  units         TEXT NOT NULL,
  block         INTEGER NOT NULL DEFAULT 0,
  block_time    INTEGER NOT NULL DEFAULT 0,
  confirmations INTEGER NOT NULL DEFAULT 0,
  order_id      TEXT,
  status        TEXT NOT NULL DEFAULT 'seen' CHECK (status IN ('seen','credited','unmatched','ambiguous','ignored')),
  note          TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (asset, tx_hash)
);
CREATE INDEX IF NOT EXISTS idx_chain_transfers_status ON chain_transfers(status);
CREATE INDEX IF NOT EXISTS idx_chain_transfers_order ON chain_transfers(order_id);
`;
