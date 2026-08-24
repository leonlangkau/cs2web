-- GoyHub schema. Shared by the node:sqlite adapter and Cloudflare D1.
-- D1 applies this through `wrangler d1 execute --file`; the Node adapter runs it at boot.

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT NOT NULL UNIQUE COLLATE NOCASE,
  email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user','admin')),
  banned        INTEGER NOT NULL DEFAULT 0,
  signup_ip     TEXT,
  last_login_ip TEXT,
  last_login_at TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

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

CREATE TABLE IF NOT EXISTS posts (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  thread_id  INTEGER NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body       TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_posts_thread ON posts(thread_id);

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
