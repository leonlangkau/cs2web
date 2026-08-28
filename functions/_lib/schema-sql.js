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

-- ============================================================================
-- Support: help centre, tickets, live chat, staff notes, macros, attachments.
--
-- The help centre is the "try this first" layer: every route into support
-- funnels through it, so the ticket queue only receives what self-service
-- could not answer. Sections hold articles; articles count their own views
-- and yes/no helpfulness so the queue can be steered by what actually
-- deflects. Both are admin-editable — no redeploy to fix a help page.
-- ============================================================================

CREATE TABLE IF NOT EXISTS help_sections (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  slug        TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  icon        TEXT NOT NULL DEFAULT '',
  position    INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- \`body\` is stored as the site's small, safe markup dialect (blank-line
-- paragraphs, "## " headings, "- " bullets, "1. " steps, \`code\`, \`\`\` fences,
-- [text](/path) links) and rendered by renderArticle() in kb.js — never as
-- raw HTML, so an article can't smuggle script into a page.
CREATE TABLE IF NOT EXISTS help_articles (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  section_id   INTEGER NOT NULL REFERENCES help_sections(id) ON DELETE CASCADE,
  slug         TEXT NOT NULL UNIQUE,
  title        TEXT NOT NULL,
  summary      TEXT NOT NULL DEFAULT '',
  body         TEXT NOT NULL,
  keywords     TEXT NOT NULL DEFAULT '',
  position     INTEGER NOT NULL DEFAULT 0,
  pinned       INTEGER NOT NULL DEFAULT 0,
  published    INTEGER NOT NULL DEFAULT 1,
  views        INTEGER NOT NULL DEFAULT 0,
  helpful_yes  INTEGER NOT NULL DEFAULT 0,
  helpful_no   INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_help_articles_section ON help_articles(section_id, position);
CREATE INDEX IF NOT EXISTS idx_help_articles_published ON help_articles(published, pinned, views);

-- One support conversation. Openable by ANY tier including Free, and by
-- logged-out guests: a guest ticket carries no user_id, only guest_email plus
-- \`key_hash\` — the SHA-256 of a single-use-secret access key handed out once
-- at creation. Only the hash is stored, exactly like sessions and auth
-- tokens, so a database leak cannot be replayed into someone's ticket.
--
-- SLA columns are milliseconds since epoch (the same convention as
-- users.paid_until and payments.credited_at) because they are compared
-- against Date.now() on every queue render; the human-readable timestamps
-- stay in created_at/updated_at.
CREATE TABLE IF NOT EXISTS tickets (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  ref               TEXT NOT NULL UNIQUE,
  user_id           INTEGER REFERENCES users(id) ON DELETE SET NULL,
  guest_email       TEXT,
  guest_name        TEXT,
  key_hash          TEXT,
  subject           TEXT NOT NULL,
  category          TEXT NOT NULL DEFAULT 'other',
  status            TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','pending','answered','solved','closed')),
  priority          TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high','urgent')),
  assignee_id       INTEGER REFERENCES users(id) ON DELETE SET NULL,
  assignee_name     TEXT,
  tags              TEXT NOT NULL DEFAULT '',
  source            TEXT NOT NULL DEFAULT 'web',
  article_slug      TEXT,
  app_version       TEXT,
  locale            TEXT,
  spam              INTEGER NOT NULL DEFAULT 0,
  ai_summary        TEXT,
  ai_summary_at     INTEGER,
  ai_classified_at  INTEGER,
  merged_into       INTEGER REFERENCES tickets(id) ON DELETE SET NULL,
  first_response_at INTEGER,
  sla_due_at        INTEGER,
  sla_breached      INTEGER NOT NULL DEFAULT 0,
  last_user_at      INTEGER,
  last_staff_at     INTEGER,
  user_unread       INTEGER NOT NULL DEFAULT 0,
  staff_unread      INTEGER NOT NULL DEFAULT 0,
  closed_at         INTEGER,
  closed_by         TEXT,
  rating            INTEGER,
  rating_comment    TEXT,
  rating_at         INTEGER,
  ip                TEXT,
  user_agent        TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_tickets_user ON tickets(user_id, id);
CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status, priority, id);
CREATE INDEX IF NOT EXISTS idx_tickets_assignee ON tickets(assignee_id, status);
CREATE INDEX IF NOT EXISTS idx_tickets_sla ON tickets(sla_breached, sla_due_at);
CREATE INDEX IF NOT EXISTS idx_tickets_updated ON tickets(updated_at);
-- Guest tickets are claimed by matching this against a newly verified address.
CREATE INDEX IF NOT EXISTS idx_tickets_guest_email ON tickets(guest_email);

-- The conversation itself — this is what the live chat polls. It holds ONLY
-- what the requester is allowed to read: staff-private text lives in
-- ticket_notes and staff-private history in ticket_events, so no query bug in
-- this table can leak an internal note to a customer.
CREATE TABLE IF NOT EXISTS ticket_messages (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id   INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  author_id   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  author_name TEXT NOT NULL,
  author_role TEXT NOT NULL CHECK (author_role IN ('user','staff','system')),
  body        TEXT NOT NULL,
  via         TEXT NOT NULL DEFAULT 'web',
  ai_assisted INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_ticket_messages_ticket ON ticket_messages(ticket_id, id);

-- Internal notes on a ticket. Never joined into any user-facing query.
CREATE TABLE IF NOT EXISTS ticket_notes (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id   INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  author_id   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  author_name TEXT NOT NULL,
  body        TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_ticket_notes_ticket ON ticket_notes(ticket_id, id);

-- Staff notes that follow the MEMBER rather than one ticket: previous
-- refunds, warnings, "verified owner of the Steam account", and so on.
-- Surfaced in the ticket sidebar and on the admin Users tab.
CREATE TABLE IF NOT EXISTS user_notes (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  author_id   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  author_name TEXT NOT NULL,
  body        TEXT NOT NULL,
  pinned      INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_user_notes_user ON user_notes(user_id, pinned, id);

-- Structured, staff-only ticket history: status/priority/assignment changes,
-- merges, SLA breaches, AI actions. Kept apart from ticket_messages so the
-- customer's transcript stays a conversation, not an audit log.
CREATE TABLE IF NOT EXISTS ticket_events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id   INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  actor_name  TEXT NOT NULL,
  kind        TEXT NOT NULL,
  detail      TEXT NOT NULL DEFAULT '',
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_ticket_events_ticket ON ticket_events(ticket_id, id);

-- Screenshots and logs. Stored base64 in D1 (no R2 binding is required to
-- deploy this site) and therefore hard-capped well under D1's 1 MB per-value
-- ceiling. Served back only through /support/attachments/:id, which re-checks
-- ticket access, forces a content-type from a short allowlist and sends
-- everything that is not a verified image as a download.
CREATE TABLE IF NOT EXISTS ticket_attachments (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id     INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  message_id    INTEGER REFERENCES ticket_messages(id) ON DELETE CASCADE,
  uploader_id   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  uploader_name TEXT NOT NULL,
  uploader_role TEXT NOT NULL DEFAULT 'user',
  filename      TEXT NOT NULL,
  mime          TEXT NOT NULL,
  bytes         INTEGER NOT NULL,
  data          TEXT NOT NULL,
  -- Set when the bytes are dropped by the retention sweep. The row survives so
  -- the conversation still records that a screenshot existed and when, which is
  -- what a later dispute actually needs.
  purged_at     INTEGER,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_ticket_attachments_ticket ON ticket_attachments(ticket_id, id);
CREATE INDEX IF NOT EXISTS idx_ticket_attachments_message ON ticket_attachments(message_id);
CREATE INDEX IF NOT EXISTS idx_ticket_attachments_purge ON ticket_attachments(purged_at, created_at);

-- Canned replies. \`set_status\` / \`set_priority\` / \`set_tags\` let one click
-- both write the reply and move the ticket, which is what makes a macro worth
-- more than copy-paste.
CREATE TABLE IF NOT EXISTS support_macros (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  title        TEXT NOT NULL,
  body         TEXT NOT NULL,
  category     TEXT NOT NULL DEFAULT '',
  set_status   TEXT,
  set_priority TEXT,
  set_tags     TEXT,
  position     INTEGER NOT NULL DEFAULT 0,
  active       INTEGER NOT NULL DEFAULT 1,
  uses         INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_support_macros_active ON support_macros(active, position);

-- Saved queue filters. owner_id NULL = shared with the whole staff.
CREATE TABLE IF NOT EXISTS support_views (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  query      TEXT NOT NULL,
  owner_id   INTEGER REFERENCES users(id) ON DELETE CASCADE,
  position   INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_support_views_owner ON support_views(owner_id, position);

-- ============================================================================
-- Status page. Admin-editable service health, shown at /status and folded into
-- the help centre and the ticket form — a visitor about to report a known
-- outage should see it before they type, not after we reply.
-- ============================================================================

-- One row per thing that can be up or down. \`status\` is ordered by severity in
-- functions/_lib/status.js, which is what lets the page compute one overall
-- verdict without a second column to keep in sync.
CREATE TABLE IF NOT EXISTS status_components (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  slug        TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status      TEXT NOT NULL DEFAULT 'operational'
              CHECK (status IN ('operational','maintenance','degraded','partial','major')),
  position    INTEGER NOT NULL DEFAULT 0,
  visible     INTEGER NOT NULL DEFAULT 1,
  changed_at  INTEGER,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_status_components_visible ON status_components(visible, position);

-- An incident or a planned maintenance window. \`components\` is a comma-joined
-- list of component slugs — the same storage choice as ticket tags: a handful
-- of short values, always read with the row, never joined against.
--
-- Timestamps are ms epoch, the convention used everywhere the value is
-- compared against Date.now() in JS.
CREATE TABLE IF NOT EXISTS status_incidents (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  title           TEXT NOT NULL,
  kind            TEXT NOT NULL DEFAULT 'incident' CHECK (kind IN ('incident','maintenance')),
  impact          TEXT NOT NULL DEFAULT 'minor' CHECK (impact IN ('none','minor','major','critical')),
  state           TEXT NOT NULL DEFAULT 'investigating'
                  CHECK (state IN ('investigating','identified','monitoring','resolved','scheduled','in_progress','completed')),
  components      TEXT NOT NULL DEFAULT '',
  started_at      INTEGER NOT NULL,
  resolved_at     INTEGER,
  scheduled_for   INTEGER,
  scheduled_until INTEGER,
  created_by      TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_status_incidents_open ON status_incidents(resolved_at, started_at);
CREATE INDEX IF NOT EXISTS idx_status_incidents_started ON status_incidents(started_at);

-- The running commentary on an incident. Append-only by design: a status page
-- that quietly rewrites what it said an hour ago is worth nothing.
CREATE TABLE IF NOT EXISTS status_updates (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  incident_id INTEGER NOT NULL REFERENCES status_incidents(id) ON DELETE CASCADE,
  state       TEXT NOT NULL,
  body        TEXT NOT NULL,
  author_name TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_status_updates_incident ON status_updates(incident_id, id);
`;
