'use strict';

const { hashPassword, newToken } = require('../crypto');

/**
 * Reserved account that inherits the threads and posts of a deleted user, so
 * deleting an account never destroys conversations other members took part in.
 * The bracketed name can't be registered (signup allows only [A-Za-z0-9_]) and
 * the row is banned, so it can never be signed into.
 */
const DELETED_USERNAME = '[deleted]';

const SCHEMA = require('./schema-sql');

/** Runs the DDL once per process/isolate. */
const schemaReady = new WeakMap();

function ensureSchema(db) {
  if (!schemaReady.has(db)) {
    schemaReady.set(db, db.exec(SCHEMA));
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

  let generatedPassword = null;
  const admin = await db.get("SELECT id FROM users WHERE role = 'admin' LIMIT 1");
  if (!admin) {
    const username = env.ADMIN_USERNAME || 'admin';
    let password = env.ADMIN_PASSWORD;
    if (!password) {
      // Workers has no interactive console, so a generated password is only
      // useful locally. Deployments should set the ADMIN_PASSWORD secret.
      password = newToken(9);
      generatedPassword = password;
    }
    await db.run(
      "INSERT INTO users (username, email, password_hash, role) VALUES (?, ?, ?, 'admin')",
      username, env.ADMIN_EMAIL || 'admin@goyhub.local', await hashPassword(password)
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

/** Housekeeping: expired sessions, rate-limit windows and used CAPTCHA nonces. */
async function cleanup(db) {
  const now = Date.now();
  await db.run("DELETE FROM sessions WHERE expires_at <= datetime('now')");
  await db.run('DELETE FROM rate_limits WHERE reset_at <= ?', now);
  await db.run('DELETE FROM captcha_used WHERE expires_at <= ?', now);
}

module.exports = { ensureSchema, seed, cleanup, deletedUserId, DELETED_USERNAME };
