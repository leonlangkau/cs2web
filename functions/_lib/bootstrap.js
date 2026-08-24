import { hashPassword, verifyPassword, newToken } from "./crypto.js";

/**
 * Reserved account that inherits the threads and posts of a deleted user, so
 * deleting an account never destroys conversations other members took part in.
 * The bracketed name can't be registered (signup allows only [A-Za-z0-9_]) and
 * the row is banned, so it can never be signed into.
 */
const DELETED_USERNAME = '[deleted]';

import SCHEMA from "./schema-sql.js";

/**
 * `tier` was added after `users` already existed on deployed databases.
 * schema.sql's CREATE TABLE IF NOT EXISTS is a no-op against an existing
 * table, so an already-provisioned D1 database needs this ALTER TABLE run
 * once. Guarded by checking for the column first — ADD COLUMN isn't
 * idempotent on its own, and this runs on every fresh isolate's cold start.
 * Existing admins are backfilled from the legacy `role` column so nobody's
 * access silently changes.
 */
async function ensureTierColumn(db) {
  const columns = await db.all('PRAGMA table_info(users)');
  if (columns.some((c) => c.name === 'tier')) return;
  await db.run("ALTER TABLE users ADD COLUMN tier TEXT NOT NULL DEFAULT 'user'");
  await db.run("UPDATE users SET tier = 'admin' WHERE role = 'admin'");
}

/** Same guarded-ALTER pattern for ip_bans.expires_at (added for auto flood bans). */
async function ensureIpBanExpiryColumn(db) {
  const columns = await db.all('PRAGMA table_info(ip_bans)');
  if (columns.some((c) => c.name === 'expires_at')) return;
  await db.run('ALTER TABLE ip_bans ADD COLUMN expires_at INTEGER');
}

/** Runs the DDL once per process/isolate. */
const schemaReady = new WeakMap();

function ensureSchema(db) {
  if (!schemaReady.has(db)) {
    schemaReady.set(db, (async () => {
      await db.exec(SCHEMA);
      await ensureTierColumn(db);
      await ensureIpBanExpiryColumn(db);
    })());
  }
  return schemaReady.get(db);
}

async function deletedUserId(db) {
  const existing = await db.get('SELECT id FROM users WHERE username = ?', DELETED_USERNAME);
  if (existing) return existing.id;
  const created = await db.run(
    'INSERT INTO users (username, email, password_hash, banned) VALUES (?, ?, ?, 1)',
    DELETED_USERNAME, 'deleted@goyhub.invalid', await hashPassword(newToken(32))
  );
  return created.lastInsertRowid;
}

const CATEGORIES = [
  ['Announcements', 'announcements', 'Official news, changelogs and release notes from the GoyHub team.', 0],
  ['General Discussion', 'general', 'Talk about GoyHub, CS2 and everything in between.', 1],
  ['Support & Bug Reports', 'support', 'Something broken? Get help from the team and the community.', 2],
  ['Configs & Setups', 'configs', 'Share crosshairs, video settings, autoexecs and launch options.', 3],
  ['Off-Topic', 'off-topic', 'Anything that is not CS2. Keep it friendly.', 4],
];

const WELCOME_BODY = 'Welcome to the official GoyHub forum!\n\n'
  + 'This is the place to discuss the app, share your CS2 configs, report bugs and hang out with the community.\n\n'
  + 'House rules:\n'
  + '1. Be respectful. No harassment, hate speech or personal attacks.\n'
  + '2. No cheating software, exploits or account trading — instant ban.\n'
  + '3. Keep threads in the right category so people can find them.\n'
  + '4. Use Support & Bug Reports for issues — include your GoyHub version and logs.\n\n'
  + 'GL & HF!';

/**
 * First-run data. Safe to call repeatedly; every step is conditional.
 * Returns a note when it could not create the admin so the caller can warn.
 */
async function seed(db, env = {}) {
  await ensureSchema(db);
  await deletedUserId(db);

  const username = env.ADMIN_USERNAME || 'admin';
  let generatedPassword = null;
  // The lookup accepts tier OR legacy role so the break-glass below still
  // finds the account even if one of the two columns drifted. It does NOT
  // match an ordinary user row with that name: the default 'admin' is a
  // reserved signup name, so the row can only have been created here.
  const seededAdmin = await db.get(
    "SELECT id, password_hash FROM users WHERE username = ? AND (role = 'admin' OR tier = 'admin')",
    username
  );

  if (!seededAdmin) {
    // Someone may have already promoted a different account to admin (or
    // renamed/deleted the seed one) — only create a new one if no admin
    // exists at all, so this never produces two seeded admins.
    const anyAdmin = await db.get("SELECT id FROM users WHERE tier = 'admin' OR role = 'admin' LIMIT 1");
    if (!anyAdmin) {
      let password = env.ADMIN_PASSWORD;
      if (!password) {
        // Workers has no interactive console, so a generated password is only
        // useful locally. Deployments should set the ADMIN_PASSWORD secret.
        password = newToken(9);
        generatedPassword = password;
      }
      await db.run(
        "INSERT INTO users (username, email, password_hash, role, tier) VALUES (?, ?, ?, 'admin', 'admin')",
        username, env.ADMIN_EMAIL || 'admin@goyhub.local', await hashPassword(password)
      );
    }
  } else if (env.ADMIN_PASSWORD) {
    // Break-glass guarantee: while the ADMIN_PASSWORD secret is set, the
    // account named ADMIN_USERNAME is kept signed-in-able with exactly that
    // password and full admin tier, re-checked on every cold start. Rotating
    // the secret (or setting it late, after the account was first created
    // with a generated password) takes effect on the next request — no
    // database surgery, no redeploy-ordering traps.
    const matches = await verifyPassword(env.ADMIN_PASSWORD, seededAdmin.password_hash);
    if (!matches) {
      await db.run(
        'UPDATE users SET password_hash = ? WHERE id = ?',
        await hashPassword(env.ADMIN_PASSWORD), seededAdmin.id
      );
    }
    await db.run(
      "UPDATE users SET tier = 'admin', role = 'admin', banned = 0 WHERE id = ? AND (tier != 'admin' OR role != 'admin' OR banned != 0)",
      seededAdmin.id
    );
  }

  const hasCategories = await db.get('SELECT id FROM categories LIMIT 1');
  if (!hasCategories) {
    for (const [name, slug, description, position] of CATEGORIES) {
      await db.run(
        'INSERT INTO categories (name, slug, description, position) VALUES (?, ?, ?, ?)',
        name, slug, description, position
      );
    }

    const firstAdmin = await db.get("SELECT id FROM users WHERE role = 'admin' ORDER BY id LIMIT 1");
    const announcements = await db.get("SELECT id FROM categories WHERE slug = 'announcements'");
    if (firstAdmin && announcements) {
      const thread = await db.run(
        'INSERT INTO threads (category_id, user_id, title, pinned) VALUES (?, ?, ?, 1)',
        announcements.id, firstAdmin.id, 'Welcome to the GoyHub community forum!'
      );
      await db.run(
        'INSERT INTO posts (thread_id, user_id, body) VALUES (?, ?, ?)',
        thread.lastInsertRowid, firstAdmin.id, WELCOME_BODY
      );
    }
  }

  return { generatedPassword };
}

/** Housekeeping: expired sessions, rate-limit windows, CAPTCHA nonces and auto IP bans. */
async function cleanup(db) {
  const now = Date.now();
  await db.run("DELETE FROM sessions WHERE expires_at <= datetime('now')");
  await db.run('DELETE FROM rate_limits WHERE reset_at <= ?', now);
  await db.run('DELETE FROM captcha_used WHERE expires_at <= ?', now);
  await db.run('DELETE FROM ip_bans WHERE expires_at IS NOT NULL AND expires_at <= ?', now);
}

export { ensureSchema, seed, cleanup, deletedUserId, DELETED_USERNAME };
