'use strict';

const express = require('express');

const { db } = require('../db');
const { requireAdmin, destroyUserSessions, audit } = require('../middleware');

const router = express.Router();

router.use(requireAdmin);

const LOGS_PER_PAGE = 50;
const USERS_PER_PAGE = 25;
const LOG_EVENTS = ['signup', 'login', 'login_failed', 'login_blocked', 'logout',
  'download', 'admin_action', 'captcha_failed', 'terms_accepted'];

/** Redirect back to the referring admin page (same-site path only). */
function backTo(req, fallback) {
  try {
    const url = new URL(req.get('referer') || '', 'http://local');
    if (url.pathname.startsWith('/admin')) return url.pathname + url.search;
  } catch { /* fall through */ }
  return fallback;
}

function adminAudit(req, detail) {
  audit(req, 'admin_action', { userId: req.user.id, username: req.user.username, detail });
}

router.get('/', (req, res) => {
  const one = (sql, ...args) => Number(db.prepare(sql).get(...args)?.n || 0);
  const stats = {
    users: one('SELECT COUNT(*) AS n FROM users'),
    banned: one('SELECT COUNT(*) AS n FROM users WHERE banned = 1'),
    threads: one('SELECT COUNT(*) AS n FROM threads'),
    posts: one('SELECT COUNT(*) AS n FROM posts'),
    downloads: one("SELECT COUNT(*) AS n FROM ip_logs WHERE event = 'download'"),
    sessions: one("SELECT COUNT(*) AS n FROM sessions WHERE expires_at > datetime('now')"),
    signups24h: one("SELECT COUNT(*) AS n FROM ip_logs WHERE event = 'signup' AND created_at > datetime('now', '-1 day')"),
    failedLogins24h: one("SELECT COUNT(*) AS n FROM ip_logs WHERE event = 'login_failed' AND created_at > datetime('now', '-1 day')"),
  };
  const recentLogs = db.prepare('SELECT * FROM ip_logs ORDER BY id DESC LIMIT 12').all();
  const recentUsers = db.prepare(
    'SELECT id, username, role, banned, signup_ip, created_at FROM users ORDER BY id DESC LIMIT 8'
  ).all();
  res.render('admin/dashboard', { title: 'Admin · Dashboard', stats, recentLogs, recentUsers });
});

router.get('/users', (req, res) => {
  const q = String(req.query.q || '').trim().slice(0, 100);
  const page = Math.max(1, Math.min(10000, parseInt(req.query.page, 10) || 1));

  const where = q ? 'WHERE username LIKE ? OR email LIKE ? OR signup_ip LIKE ? OR last_login_ip LIKE ?' : '';
  const params = q ? Array(4).fill(`%${q}%`) : [];

  const total = Number(db.prepare(`SELECT COUNT(*) AS n FROM users ${where}`).get(...params).n);
  const pages = Math.max(1, Math.ceil(total / USERS_PER_PAGE));
  const users = db.prepare(
    `SELECT id, username, email, role, banned, signup_ip, last_login_ip, last_login_at, created_at,
        (SELECT COUNT(*) FROM posts p WHERE p.user_id = users.id) AS post_count
     FROM users ${where} ORDER BY id DESC LIMIT ? OFFSET ?`
  ).all(...params, USERS_PER_PAGE, (page - 1) * USERS_PER_PAGE);

  res.render('admin/users', { title: 'Admin · Users', users, q, page, pages, total });
});

function findUser(req, res) {
  const id = parseInt(req.params.id, 10);
  const user = Number.isInteger(id) ? db.prepare('SELECT * FROM users WHERE id = ?').get(id) : null;
  if (!user) {
    res.status(404).render('error', { title: 'Not found', code: 404, message: 'No such user.' });
    return null;
  }
  return user;
}

router.post('/users/:id/ban', (req, res) => {
  const user = findUser(req, res);
  if (!user) return;
  if (user.id === req.user.id) {
    res.setFlash('error', 'You cannot ban yourself.');
    return res.redirect(backTo(req, '/admin/users'));
  }
  db.prepare('UPDATE users SET banned = 1 WHERE id = ?').run(user.id);
  destroyUserSessions(user.id);
  adminAudit(req, `banned user #${user.id} (${user.username})`);
  res.setFlash('success', `${user.username} has been banned and signed out everywhere.`);
  res.redirect(backTo(req, '/admin/users'));
});

router.post('/users/:id/unban', (req, res) => {
  const user = findUser(req, res);
  if (!user) return;
  db.prepare('UPDATE users SET banned = 0 WHERE id = ?').run(user.id);
  adminAudit(req, `unbanned user #${user.id} (${user.username})`);
  res.setFlash('success', `${user.username} has been unbanned.`);
  res.redirect(backTo(req, '/admin/users'));
});

router.post('/users/:id/role', (req, res) => {
  const user = findUser(req, res);
  if (!user) return;
  if (user.id === req.user.id) {
    res.setFlash('error', 'You cannot change your own role.');
    return res.redirect(backTo(req, '/admin/users'));
  }
  const newRole = user.role === 'admin' ? 'user' : 'admin';
  db.prepare('UPDATE users SET role = ? WHERE id = ?').run(newRole, user.id);
  destroyUserSessions(user.id); // force re-login so the new role takes effect cleanly
  adminAudit(req, `set role of #${user.id} (${user.username}) to ${newRole}`);
  res.setFlash('success', `${user.username} is now ${newRole === 'admin' ? 'an admin' : 'a regular user'}.`);
  res.redirect(backTo(req, '/admin/users'));
});

router.post('/users/:id/delete', (req, res) => {
  const user = findUser(req, res);
  if (!user) return;
  if (user.id === req.user.id) {
    res.setFlash('error', 'You cannot delete yourself.');
    return res.redirect(backTo(req, '/admin/users'));
  }
  db.prepare('DELETE FROM users WHERE id = ?').run(user.id);
  adminAudit(req, `deleted user #${user.id} (${user.username})`);
  res.setFlash('success', `${user.username} and all their content have been deleted.`);
  res.redirect(backTo(req, '/admin/users'));
});

router.get('/logs', (req, res) => {
  const event = LOG_EVENTS.includes(req.query.event) ? req.query.event : '';
  const q = String(req.query.q || '').trim().slice(0, 100);
  const page = Math.max(1, Math.min(10000, parseInt(req.query.page, 10) || 1));

  const clauses = [];
  const params = [];
  if (event) { clauses.push('event = ?'); params.push(event); }
  if (q) { clauses.push('(ip LIKE ? OR username LIKE ? OR detail LIKE ?)'); params.push(`%${q}%`, `%${q}%`, `%${q}%`); }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';

  const total = Number(db.prepare(`SELECT COUNT(*) AS n FROM ip_logs ${where}`).get(...params).n);
  const pages = Math.max(1, Math.ceil(total / LOGS_PER_PAGE));
  const logs = db.prepare(
    `SELECT * FROM ip_logs ${where} ORDER BY id DESC LIMIT ? OFFSET ?`
  ).all(...params, LOGS_PER_PAGE, (page - 1) * LOGS_PER_PAGE);

  res.render('admin/logs', { title: 'Admin · IP logs', logs, q, event, events: LOG_EVENTS, page, pages, total });
});

router.get('/forum', (req, res) => {
  const categories = db.prepare(
    `SELECT c.*, (SELECT COUNT(*) FROM threads t WHERE t.category_id = c.id) AS thread_count
     FROM categories c ORDER BY c.position, c.id`
  ).all();
  const threads = db.prepare(
    `SELECT t.*, u.username, c.name AS category_name,
        (SELECT COUNT(*) FROM posts p WHERE p.thread_id = t.id) AS post_count
     FROM threads t JOIN users u ON u.id = t.user_id JOIN categories c ON c.id = t.category_id
     ORDER BY t.updated_at DESC LIMIT 50`
  ).all();
  res.render('admin/forum', { title: 'Admin · Forum', categories, threads, errors: [] });
});

router.post('/categories', (req, res) => {
  const name = String(req.body.name || '').trim().replace(/\s+/g, ' ');
  const description = String(req.body.description || '').trim().slice(0, 300);
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50);

  if (name.length < 2 || name.length > 50 || !slug) {
    res.setFlash('error', 'Category name must be 2–50 characters.');
    return res.redirect('/admin/forum');
  }
  if (db.prepare('SELECT id FROM categories WHERE slug = ?').get(slug)) {
    res.setFlash('error', 'A category with that name already exists.');
    return res.redirect('/admin/forum');
  }
  const max = db.prepare('SELECT COALESCE(MAX(position), -1) AS m FROM categories').get().m;
  db.prepare('INSERT INTO categories (name, slug, description, position) VALUES (?, ?, ?, ?)')
    .run(name, slug, description, Number(max) + 1);
  adminAudit(req, `created category "${name}"`);
  res.setFlash('success', `Category "${name}" created.`);
  res.redirect('/admin/forum');
});

router.post('/categories/:id/delete', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const category = Number.isInteger(id) ? db.prepare('SELECT * FROM categories WHERE id = ?').get(id) : null;
  if (!category) {
    res.setFlash('error', 'No such category.');
    return res.redirect('/admin/forum');
  }
  db.prepare('DELETE FROM categories WHERE id = ?').run(id);
  adminAudit(req, `deleted category "${category.name}" and its threads`);
  res.setFlash('success', `Category "${category.name}" deleted.`);
  res.redirect('/admin/forum');
});

function findThread(req, res) {
  const id = parseInt(req.params.id, 10);
  const thread = Number.isInteger(id) ? db.prepare('SELECT * FROM threads WHERE id = ?').get(id) : null;
  if (!thread) {
    res.status(404).render('error', { title: 'Not found', code: 404, message: 'No such thread.' });
    return null;
  }
  return thread;
}

router.post('/threads/:id/pin', (req, res) => {
  const thread = findThread(req, res);
  if (!thread) return;
  db.prepare('UPDATE threads SET pinned = 1 - pinned WHERE id = ?').run(thread.id);
  adminAudit(req, `${thread.pinned ? 'unpinned' : 'pinned'} thread #${thread.id}`);
  res.redirect(backTo(req, `/forum/t/${thread.id}`));
});

router.post('/threads/:id/lock', (req, res) => {
  const thread = findThread(req, res);
  if (!thread) return;
  db.prepare('UPDATE threads SET locked = 1 - locked WHERE id = ?').run(thread.id);
  adminAudit(req, `${thread.locked ? 'unlocked' : 'locked'} thread #${thread.id}`);
  res.redirect(backTo(req, `/forum/t/${thread.id}`));
});

router.post('/threads/:id/delete', (req, res) => {
  const thread = findThread(req, res);
  if (!thread) return;
  db.prepare('DELETE FROM threads WHERE id = ?').run(thread.id);
  adminAudit(req, `deleted thread #${thread.id} ("${String(thread.title).slice(0, 60)}")`);
  res.setFlash('success', 'Thread deleted.');
  res.redirect('/admin/forum');
});

router.post('/posts/:id/delete', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const post = Number.isInteger(id) ? db.prepare('SELECT * FROM posts WHERE id = ?').get(id) : null;
  if (!post) {
    res.setFlash('error', 'No such post.');
    return res.redirect(backTo(req, '/admin/forum'));
  }
  const first = db.prepare('SELECT MIN(id) AS m FROM posts WHERE thread_id = ?').get(post.thread_id);
  if (Number(first.m) === post.id) {
    res.setFlash('error', 'That is the opening post — delete the whole thread instead.');
    return res.redirect(backTo(req, `/forum/t/${post.thread_id}`));
  }
  db.prepare('DELETE FROM posts WHERE id = ?').run(id);
  adminAudit(req, `deleted post #${id} in thread #${post.thread_id}`);
  res.setFlash('success', 'Post deleted.');
  res.redirect(backTo(req, `/forum/t/${post.thread_id}`));
});

module.exports = router;
