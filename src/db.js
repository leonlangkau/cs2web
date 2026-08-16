'use strict';

const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
const fs = require('node:fs');
const { hashPassword, newToken } = require('./security');

const DB_PATH = process.env.GOYHUB_DB || path.join(__dirname, '..', 'data', 'goyhub.db');

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new DatabaseSync(DB_PATH);

db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

db.exec(`
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
`);

/** Append a row to the IP audit log. */
function logEvent({ userId = null, username = null, event, ip, userAgent = null, detail = null }) {
  db.prepare(
    'INSERT INTO ip_logs (user_id, username, event, ip, user_agent, detail) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(userId, username, event, ip || 'unknown', userAgent, detail);
}

/** Seed the first admin account and the forum structure on first run. */
function seed() {
  const adminExists = db.prepare("SELECT id FROM users WHERE role = 'admin' LIMIT 1").get();
  if (!adminExists) {
    const username = process.env.ADMIN_USERNAME || 'admin';
    let password = process.env.ADMIN_PASSWORD;
    let generated = false;
    if (!password) {
      password = newToken(9); // 18 hex chars
      generated = true;
    }
    db.prepare(
      "INSERT INTO users (username, email, password_hash, role) VALUES (?, ?, ?, 'admin')"
    ).run(username, process.env.ADMIN_EMAIL || 'admin@goyhub.local', hashPassword(password));
    if (generated) {
      console.log('='.repeat(64));
      console.log('  First run: created admin account');
      console.log(`  Username: ${username}`);
      console.log(`  Password: ${password}`);
      console.log('  (set ADMIN_USERNAME / ADMIN_PASSWORD env vars to control this)');
      console.log('  Change the password after logging in. Shown only once.');
      console.log('='.repeat(64));
    }
  }

  const hasCategories = db.prepare('SELECT id FROM categories LIMIT 1').get();
  if (!hasCategories) {
    const insert = db.prepare(
      'INSERT INTO categories (name, slug, description, position) VALUES (?, ?, ?, ?)'
    );
    insert.run('Announcements', 'announcements', 'Official news, changelogs and release notes from the GoyHub team.', 0);
    insert.run('General Discussion', 'general', 'Talk about GoyHub, CS2 and everything in between.', 1);
    insert.run('Support & Bug Reports', 'support', 'Something broken? Get help from the team and the community.', 2);
    insert.run('Configs & Setups', 'configs', 'Share crosshairs, video settings, autoexecs and launch options.', 3);
    insert.run('Off-Topic', 'off-topic', 'Anything that is not CS2. Keep it friendly.', 4);

    const admin = db.prepare("SELECT id FROM users WHERE role = 'admin' ORDER BY id LIMIT 1").get();
    const announcements = db.prepare("SELECT id FROM categories WHERE slug = 'announcements'").get();
    if (admin && announcements) {
      const thread = db.prepare(
        'INSERT INTO threads (category_id, user_id, title, pinned) VALUES (?, ?, ?, 1)'
      ).run(announcements.id, admin.id, 'Welcome to the GoyHub community forum!');
      db.prepare('INSERT INTO posts (thread_id, user_id, body) VALUES (?, ?, ?)').run(
        thread.lastInsertRowid,
        admin.id,
        'Welcome to the official GoyHub forum!\n\n' +
          'This is the place to discuss the app, share your CS2 configs, report bugs and hang out with the community.\n\n' +
          'House rules:\n' +
          '1. Be respectful. No harassment, hate speech or personal attacks.\n' +
          '2. No cheating software, exploits or account trading — instant ban.\n' +
          '3. Keep threads in the right category so people can find them.\n' +
          '4. Use Support & Bug Reports for issues — include your GoyHub version and logs.\n\n' +
          'GL & HF!'
      );
    }
  }
}

seed();

/** Remove expired sessions; called at boot and periodically from app.js. */
function cleanupSessions() {
  db.prepare("DELETE FROM sessions WHERE expires_at <= datetime('now')").run();
}

cleanupSessions();

module.exports = { db, logEvent, cleanupSessions, DB_PATH };
