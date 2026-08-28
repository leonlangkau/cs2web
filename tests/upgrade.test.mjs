/**
 * The upgrade path for a database that already exists.
 *
 * This is the trap schema.sql documents at the top of the file: CREATE TABLE
 * IF NOT EXISTS is a no-op against an existing table, so a change that works
 * perfectly on a fresh install can do nothing at all on the deployed one —
 * and every test passes while production 500s. ensureSchema() now skips the
 * DDL when a fingerprint of it matches what was last applied, which makes
 * that failure mode possible in a NEW way: a stale fingerprint would skip
 * work that genuinely needed doing.
 *
 * So this boots the real seed() against a database provisioned from an
 * older schema and checks that everything since then appears, that nothing
 * that was there is lost, and that booting twice changes nothing.
 *
 * Run: npm test
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { createApp } from "../functions/_lib/app.js";
import { seed } from "../functions/_lib/bootstrap.js";

/**
 * The schema as it stood before the support desk and the status page — just
 * enough of it to hold real content and to be recognisably "an install that
 * has been running for a while".
 */
const OLD_SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user','admin')),
  tier TEXT NOT NULL DEFAULT 'user',
  banned INTEGER NOT NULL DEFAULT 0,
  email_verified_at TEXT,
  paid_until INTEGER,
  signup_ip TEXT, last_login_ip TEXT, last_login_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT, token_hash TEXT NOT NULL UNIQUE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  csrf_hash TEXT, ip TEXT, user_agent TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')), expires_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS auth_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL CHECK (kind IN ('reset','verify')),
  token_hash TEXT NOT NULL UNIQUE, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  used INTEGER NOT NULL DEFAULT 0, expires_at INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS ip_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  username TEXT, event TEXT NOT NULL, ip TEXT NOT NULL, user_agent TEXT, detail TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, slug TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT '', position INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS threads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL, pinned INTEGER NOT NULL DEFAULT 0, locked INTEGER NOT NULL DEFAULT 0,
  views INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  thread_id INTEGER NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL, edited_at TEXT, edited_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS shouts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  reporter_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved')),
  resolved_by TEXT, resolved_at TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY, value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS rate_limits (
  key TEXT PRIMARY KEY, count INTEGER NOT NULL DEFAULT 0, reset_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS captcha_used (nonce TEXT PRIMARY KEY, expires_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS ip_bans (
  ip TEXT PRIMARY KEY, reason TEXT, banned_by TEXT, expires_at INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

const ENV = {
  ADMIN_USERNAME: "admin",
  ADMIN_PASSWORD: "admin-test-password-1",
  CAPTCHA_SECRET: "test-captcha-secret",
  PBKDF2_ITERATIONS: "1000",
};

/** node:sqlite adapter over a database provisioned from OLD_SCHEMA. */
function existingDeployment() {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec(OLD_SCHEMA);

  db.prepare("INSERT INTO users (username, email, password_hash, tier) VALUES (?,?,?,?)")
    .run("veteran", "vet@example.com", "not-a-real-hash", "paid");
  db.prepare("INSERT INTO categories (name, slug, description, position) VALUES (?,?,?,?)")
    .run("General", "general", "Talk about anything", 0);
  db.prepare(`INSERT INTO threads (category_id, user_id, title)
    VALUES (1, (SELECT id FROM users WHERE username = 'veteran'), 'A thread from before')`).run();
  db.prepare(`INSERT INTO posts (thread_id, user_id, body)
    VALUES (1, (SELECT id FROM users WHERE username = 'veteran'), 'Content that must survive')`).run();

  return {
    raw: db,
    adapter: {
      kind: "node",
      async all(sql, ...p) { return db.prepare(sql).all(...p); },
      async get(sql, ...p) { return db.prepare(sql).get(...p); },
      async run(sql, ...p) {
        const r = db.prepare(sql).run(...p);
        return { lastInsertRowid: Number(r.lastInsertRowid), changes: Number(r.changes) };
      },
      async exec(sql) { db.exec(sql); },
    },
  };
}

test("an already-deployed database gains every new table without losing anything", async () => {
  const { raw, adapter } = existingDeployment();
  const threadsBefore = raw.prepare("SELECT COUNT(*) AS n FROM threads").get().n;
  const postsBefore = raw.prepare("SELECT COUNT(*) AS n FROM posts").get().n;

  await seed(adapter, ENV);

  const tables = raw.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((r) => r.name);
  for (const table of [
    "tickets", "ticket_messages", "ticket_notes", "ticket_events", "ticket_attachments",
    "user_notes", "support_macros", "support_views", "help_sections", "help_articles",
    "status_components", "status_incidents", "status_updates", "fingerprints", "payments",
    "products", "chain_orders", "chain_transfers",
  ]) {
    assert.ok(tables.includes(table), `${table} should exist after the upgrade`);
  }

  assert.equal(raw.prepare("SELECT COUNT(*) AS n FROM threads").get().n, threadsBefore,
    "an upgrade must not touch the forum");
  assert.equal(raw.prepare("SELECT COUNT(*) AS n FROM posts").get().n, postsBefore);
  assert.ok(raw.prepare("SELECT id FROM users WHERE username = 'veteran'").get(), "and not the members");

  assert.ok(raw.prepare("SELECT COUNT(*) AS n FROM help_articles").get().n > 0, "the help centre seeds itself");
  assert.ok(raw.prepare("SELECT COUNT(*) AS n FROM support_macros").get().n > 0, "so do the canned replies");
  assert.ok(raw.prepare("SELECT COUNT(*) AS n FROM status_components").get().n > 0, "and the status components");
  assert.ok(raw.prepare("SELECT value FROM settings WHERE key = 'schema_fingerprint'").get(),
    "and the fingerprint is recorded so the next cold start can skip the DDL");
});

test("every page serves on a freshly upgraded database", async () => {
  const { adapter } = existingDeployment();
  await seed(adapter, ENV);
  const app = createApp({ env: ENV, resolveDb: () => adapter });

  for (const path of ["/", "/help", "/support", "/support/new", "/status", "/status.json", "/faq", "/privacy"]) {
    const res = await app.fetch(new Request(`http://local${path}`), ENV);
    const body = await res.text();
    assert.ok(res.status < 400, `${path} returned ${res.status}`);
    assert.ok(!/Server error|Something went wrong on our side/.test(body), `${path} rendered an error page`);
  }
});

test("the schema fingerprint skips the DDL without skipping a real change", async () => {
  const { raw, adapter } = existingDeployment();
  await seed(adapter, ENV);
  const fingerprint = raw.prepare("SELECT value FROM settings WHERE key = 'schema_fingerprint'").get().value;

  // Booting again is a no-op — that is the whole point of the fingerprint.
  const articlesBefore = raw.prepare("SELECT COUNT(*) AS n FROM help_articles").get().n;
  await seed(adapter, ENV);
  assert.equal(raw.prepare("SELECT COUNT(*) AS n FROM help_articles").get().n, articlesBefore,
    "seeding twice must not duplicate content");
  assert.equal(raw.prepare("SELECT value FROM settings WHERE key = 'schema_fingerprint'").get().value,
    fingerprint, "and the fingerprint is stable for an unchanged schema");

  // A schema that HAS changed must not be skipped. Simulate the next release
  // by dropping a table and stamping a stale fingerprint: the mismatch has to
  // bring it back, or the fingerprint would be the very trap it prevents.
  raw.exec("DROP TABLE status_updates");
  raw.prepare("UPDATE settings SET value = 'stale' WHERE key = 'schema_fingerprint'").run();

  // ensureSchema memoises per adapter object, so a new deployment reads fresh.
  const { adapter: reboot } = { adapter: { ...adapter } };
  await seed(reboot, ENV);

  const tables = raw.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((r) => r.name);
  assert.ok(tables.includes("status_updates"), "a changed fingerprint re-applies the whole DDL");
  assert.notEqual(raw.prepare("SELECT value FROM settings WHERE key = 'schema_fingerprint'").get().value,
    "stale", "and the marker is rewritten once it has been applied");
});
