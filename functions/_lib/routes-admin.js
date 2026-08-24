import * as views from "./views/admin.js";
import * as site from "./views/site.js";
import { DELETED_USERNAME, deletedUserId } from "./bootstrap.js";
import { requireAdmin, requireStaff, destroyUserSessions, audit, formBody, setFlash, clientIp } from "./middleware.js";
import { TIERS, TIER_LABELS } from "./tiers.js";

const LOGS_PER_PAGE = 50;
const USERS_PER_PAGE = 25;
const LOG_EVENTS = ['signup', 'login', 'login_failed', 'login_blocked', 'logout',
  'download', 'admin_action', 'captcha_failed', 'terms_accepted'];

function intParam(value, fallback = 1) {
  const n = parseInt(value, 10);
  return Number.isInteger(n) ? n : fallback;
}

/** Redirect back to the referring admin page (same-site path only). */
function backTo(c, fallback) {
  try {
    const url = new URL(c.req.header('referer') || '', 'http://local');
    if (url.pathname.startsWith('/admin')) return url.pathname + url.search;
  } catch { /* fall through */ }
  return fallback;
}

const adminAudit = (c, detail) => audit(c, 'admin_action', {
  userId: c.get('user').id, username: c.get('user').username, detail,
});

function notFound(c, message = 'This page does not exist.') {
  return c.html(site.errorPage(c.get('view'), { code: 404, title: 'Not found', message }), 404);
}

async function findUser(c) {
  const id = intParam(c.req.param('id'), 0);
  if (id < 1) return null;
  return c.get('db').get('SELECT * FROM users WHERE id = ?', id);
}

function register(app) {
  // Staff (developer/trial_admin/admin) may enter the admin area at all;
  // the most sensitive actions further down additionally require full admin.
  app.use('/admin/*', async (c, next) => {
    const gate = requireStaff(c);
    if (gate) return gate;
    await next();
  });

  app.get('/admin', async (c) => {
    const db = c.get('db');
    const one = async (sql, ...args) => Number((await db.get(sql, ...args))?.n || 0);
    const stats = {
      users: await one('SELECT COUNT(*) AS n FROM users WHERE username != ?', DELETED_USERNAME),
      banned: await one('SELECT COUNT(*) AS n FROM users WHERE banned = 1 AND username != ?', DELETED_USERNAME),
      threads: await one('SELECT COUNT(*) AS n FROM threads'),
      posts: await one('SELECT COUNT(*) AS n FROM posts'),
      downloads: await one("SELECT COUNT(*) AS n FROM ip_logs WHERE event = 'download'"),
      sessions: await one("SELECT COUNT(*) AS n FROM sessions WHERE expires_at > datetime('now')"),
      signups24h: await one("SELECT COUNT(*) AS n FROM ip_logs WHERE event = 'signup' AND created_at > datetime('now', '-1 day')"),
      failedLogins24h: await one("SELECT COUNT(*) AS n FROM ip_logs WHERE event = 'login_failed' AND created_at > datetime('now', '-1 day')"),
      ipBans: await one('SELECT COUNT(*) AS n FROM ip_bans'),
    };
    const recentLogs = await db.all('SELECT * FROM ip_logs ORDER BY id DESC LIMIT 12');
    const recentUsers = await db.all(
      'SELECT id, username, tier, banned, signup_ip, created_at FROM users WHERE username != ? ORDER BY id DESC LIMIT 8',
      DELETED_USERNAME
    );
    return c.html(views.dashboard(c.get('view'), { stats, recentLogs, recentUsers }));
  });

  app.get('/admin/users', async (c) => {
    const db = c.get('db');
    const url = new URL(c.req.url);
    const q = String(url.searchParams.get('q') || '').trim().slice(0, 100);

    // The [deleted] placeholder is infrastructure, not a member.
    const clauses = ['username != ?'];
    const params = [DELETED_USERNAME];
    if (q) {
      clauses.push('(username LIKE ? OR email LIKE ? OR signup_ip LIKE ? OR last_login_ip LIKE ?)');
      params.push(...Array(4).fill(`%${q}%`));
    }
    const where = `WHERE ${clauses.join(' AND ')}`;

    const total = Number((await db.get(`SELECT COUNT(*) AS n FROM users ${where}`, ...params)).n);
    const pages = Math.max(1, Math.ceil(total / USERS_PER_PAGE));
    const page = Math.max(1, Math.min(pages, intParam(url.searchParams.get('page'))));

    const users = await db.all(
      `SELECT id, username, email, tier, banned, signup_ip, last_login_ip, last_login_at, created_at,
          (SELECT COUNT(*) FROM posts p WHERE p.user_id = users.id) AS post_count
       FROM users ${where} ORDER BY id DESC LIMIT ? OFFSET ?`,
      ...params, USERS_PER_PAGE, (page - 1) * USERS_PER_PAGE
    );

    return c.html(views.users(c.get('view'), { users, q, page, pages, total, tiers: TIERS, tierLabels: TIER_LABELS }));
  });

  app.post('/admin/users/:id/ban', async (c) => {
    const db = c.get('db');
    const user = await findUser(c);
    if (!user) return notFound(c, 'No such user.');
    if (user.id === c.get('user').id) {
      setFlash(c, 'error', 'You cannot ban yourself.');
      return c.redirect(backTo(c, '/admin/users'), 302);
    }
    await db.run('UPDATE users SET banned = 1 WHERE id = ?', user.id);
    await destroyUserSessions(db, user.id);
    await adminAudit(c, `banned user #${user.id} (${user.username})`);
    setFlash(c, 'success', `${user.username} has been banned and signed out everywhere.`);
    return c.redirect(backTo(c, '/admin/users'), 302);
  });

  app.post('/admin/users/:id/unban', async (c) => {
    const user = await findUser(c);
    if (!user) return notFound(c, 'No such user.');
    await c.get('db').run('UPDATE users SET banned = 0 WHERE id = ?', user.id);
    await adminAudit(c, `unbanned user #${user.id} (${user.username})`);
    setFlash(c, 'success', `${user.username} has been unbanned.`);
    return c.redirect(backTo(c, '/admin/users'), 302);
  });

  // Tier changes are the most sensitive user action (they grant/revoke admin
  // panel access) — full admin only, unlike ban/unban which any staff can do.
  app.post('/admin/users/:id/tier', async (c) => {
    const gate = requireAdmin(c);
    if (gate) return gate;
    const db = c.get('db');
    const user = await findUser(c);
    if (!user) return notFound(c, 'No such user.');
    if (user.id === c.get('user').id) {
      setFlash(c, 'error', 'You cannot change your own tier.');
      return c.redirect(backTo(c, '/admin/users'), 302);
    }
    const body = await formBody(c);
    const requested = String(body.tier || '');
    if (!TIERS.includes(requested)) {
      setFlash(c, 'error', 'Not a valid tier.');
      return c.redirect(backTo(c, '/admin/users'), 302);
    }
    // role stays in sync as a coarse legacy mirror of tier — nothing reads it
    // for access control anymore, but keeping it sane avoids a confusing drift.
    const legacyRole = requested === 'admin' ? 'admin' : 'user';
    await db.run('UPDATE users SET tier = ?, role = ? WHERE id = ?', requested, legacyRole, user.id);
    await destroyUserSessions(db, user.id); // force re-login so the new tier takes effect cleanly
    await adminAudit(c, `set tier of #${user.id} (${user.username}) to ${requested}`);
    setFlash(c, 'success', `${user.username} is now ${TIER_LABELS[requested]}.`);
    return c.redirect(backTo(c, '/admin/users'), 302);
  });

  app.post('/admin/users/:id/delete', async (c) => {
    const gate = requireAdmin(c);
    if (gate) return gate;
    const db = c.get('db');
    const user = await findUser(c);
    if (!user) return notFound(c, 'No such user.');
    if (user.id === c.get('user').id) {
      setFlash(c, 'error', 'You cannot delete yourself.');
      return c.redirect(backTo(c, '/admin/users'), 302);
    }
    if (user.username === DELETED_USERNAME) {
      setFlash(c, 'error', 'That is the reserved placeholder account and cannot be deleted.');
      return c.redirect(backTo(c, '/admin/users'), 302);
    }
    // Reassign rather than cascade: destroying the account must not destroy
    // conversations other members took part in (see the Privacy Policy, s9).
    const placeholder = await deletedUserId(db);
    const threads = await db.run('UPDATE threads SET user_id = ? WHERE user_id = ?', placeholder, user.id);
    const posts = await db.run('UPDATE posts SET user_id = ? WHERE user_id = ?', placeholder, user.id);
    await db.run('DELETE FROM users WHERE id = ?', user.id);
    await adminAudit(c, `deleted user #${user.id} (${user.username}); reassigned ${threads.changes} threads and ${posts.changes} posts to ${DELETED_USERNAME}`);
    setFlash(c, 'success', `${user.username} has been deleted. Their posts remain, attributed to ${DELETED_USERNAME}.`);
    return c.redirect(backTo(c, '/admin/users'), 302);
  });

  app.get('/admin/logs', async (c) => {
    const db = c.get('db');
    const url = new URL(c.req.url);
    const rawEvent = url.searchParams.get('event') || '';
    const event = LOG_EVENTS.includes(rawEvent) ? rawEvent : '';
    const q = String(url.searchParams.get('q') || '').trim().slice(0, 100);

    const clauses = [];
    const params = [];
    if (event) { clauses.push('event = ?'); params.push(event); }
    if (q) { clauses.push('(ip LIKE ? OR username LIKE ? OR detail LIKE ?)'); params.push(`%${q}%`, `%${q}%`, `%${q}%`); }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';

    const total = Number((await db.get(`SELECT COUNT(*) AS n FROM ip_logs ${where}`, ...params)).n);
    const pages = Math.max(1, Math.ceil(total / LOGS_PER_PAGE));
    const page = Math.max(1, Math.min(pages, intParam(url.searchParams.get('page'))));

    const logs = await db.all(
      `SELECT * FROM ip_logs ${where} ORDER BY id DESC LIMIT ? OFFSET ?`,
      ...params, LOGS_PER_PAGE, (page - 1) * LOGS_PER_PAGE
    );
    const ipBans = await db.all('SELECT * FROM ip_bans ORDER BY created_at DESC LIMIT 100');

    return c.html(views.logs(c.get('view'), { logs, q, event, events: LOG_EVENTS, page, pages, total, ipBans }));
  });

  app.post('/admin/ip-bans', async (c) => {
    const db = c.get('db');
    const body = await formBody(c);
    const ip = String(body.ip || '').trim().slice(0, 64);
    const reason = String(body.reason || '').trim().slice(0, 300) || null;
    if (!ip) {
      setFlash(c, 'error', 'Enter an IP address to ban.');
      return c.redirect(backTo(c, '/admin/logs'), 302);
    }
    if (ip === clientIp(c)) {
      setFlash(c, 'error', 'You cannot ban your own IP address.');
      return c.redirect(backTo(c, '/admin/logs'), 302);
    }
    await db.run(
      `INSERT INTO ip_bans (ip, reason, banned_by) VALUES (?, ?, ?)
       ON CONFLICT(ip) DO UPDATE SET reason = excluded.reason, banned_by = excluded.banned_by`,
      ip, reason, c.get('user').username
    );
    await adminAudit(c, `banned IP ${ip}${reason ? ` (${reason})` : ''}`);
    setFlash(c, 'success', `${ip} has been banned.`);
    return c.redirect(backTo(c, '/admin/logs'), 302);
  });

  app.post('/admin/ip-bans/:ip/unban', async (c) => {
    const db = c.get('db');
    const ip = c.req.param('ip'); // already decoded by the router
    await db.run('DELETE FROM ip_bans WHERE ip = ?', ip);
    await adminAudit(c, `unbanned IP ${ip}`);
    setFlash(c, 'success', `${ip} has been unbanned.`);
    return c.redirect(backTo(c, '/admin/logs'), 302);
  });

  app.get('/admin/forum', async (c) => {
    const db = c.get('db');
    const categories = await db.all(
      `SELECT c.*, (SELECT COUNT(*) FROM threads t WHERE t.category_id = c.id) AS thread_count
       FROM categories c ORDER BY c.position, c.id`
    );
    const threads = await db.all(
      `SELECT t.*, u.username, c.name AS category_name,
          (SELECT COUNT(*) FROM posts p WHERE p.thread_id = t.id) AS post_count
       FROM threads t JOIN users u ON u.id = t.user_id JOIN categories c ON c.id = t.category_id
       ORDER BY t.updated_at DESC LIMIT 50`
    );
    return c.html(views.forumAdmin(c.get('view'), { categories, threads }));
  });

  app.post('/admin/categories', async (c) => {
    const gate = requireAdmin(c);
    if (gate) return gate;
    const db = c.get('db');
    const body = await formBody(c);
    const name = String(body.name || '').trim().replace(/\s+/g, ' ');
    const description = String(body.description || '').trim().slice(0, 300);
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50);

    if (name.length < 2 || name.length > 50 || !slug) {
      setFlash(c, 'error', 'Category name must be 2–50 characters.');
      return c.redirect('/admin/forum', 302);
    }
    if (await db.get('SELECT id FROM categories WHERE slug = ?', slug)) {
      setFlash(c, 'error', 'A category with that name already exists.');
      return c.redirect('/admin/forum', 302);
    }
    const max = (await db.get('SELECT COALESCE(MAX(position), -1) AS m FROM categories')).m;
    await db.run(
      'INSERT INTO categories (name, slug, description, position) VALUES (?, ?, ?, ?)',
      name, slug, description, Number(max) + 1
    );
    await adminAudit(c, `created category "${name}"`);
    setFlash(c, 'success', `Category "${name}" created.`);
    return c.redirect('/admin/forum', 302);
  });

  app.post('/admin/categories/:id/delete', async (c) => {
    const gate = requireAdmin(c);
    if (gate) return gate;
    const db = c.get('db');
    const id = intParam(c.req.param('id'), 0);
    const category = id > 0 ? await db.get('SELECT * FROM categories WHERE id = ?', id) : null;
    if (!category) {
      setFlash(c, 'error', 'No such category.');
      return c.redirect('/admin/forum', 302);
    }
    await db.run('DELETE FROM categories WHERE id = ?', id);
    await adminAudit(c, `deleted category "${category.name}" and its threads`);
    setFlash(c, 'success', `Category "${category.name}" deleted.`);
    return c.redirect('/admin/forum', 302);
  });

  const findThread = async (c) => {
    const id = intParam(c.req.param('id'), 0);
    return id > 0 ? c.get('db').get('SELECT * FROM threads WHERE id = ?', id) : null;
  };

  app.post('/admin/threads/:id/pin', async (c) => {
    const thread = await findThread(c);
    if (!thread) return notFound(c, 'No such thread.');
    await c.get('db').run('UPDATE threads SET pinned = 1 - pinned WHERE id = ?', thread.id);
    await adminAudit(c, `${thread.pinned ? 'unpinned' : 'pinned'} thread #${thread.id}`);
    return c.redirect(backTo(c, `/forum/t/${thread.id}`), 302);
  });

  app.post('/admin/threads/:id/lock', async (c) => {
    const thread = await findThread(c);
    if (!thread) return notFound(c, 'No such thread.');
    await c.get('db').run('UPDATE threads SET locked = 1 - locked WHERE id = ?', thread.id);
    await adminAudit(c, `${thread.locked ? 'unlocked' : 'locked'} thread #${thread.id}`);
    return c.redirect(backTo(c, `/forum/t/${thread.id}`), 302);
  });

  app.post('/admin/threads/:id/delete', async (c) => {
    const thread = await findThread(c);
    if (!thread) return notFound(c, 'No such thread.');
    await c.get('db').run('DELETE FROM threads WHERE id = ?', thread.id);
    await adminAudit(c, `deleted thread #${thread.id} ("${String(thread.title).slice(0, 60)}")`);
    setFlash(c, 'success', 'Thread deleted.');
    return c.redirect('/admin/forum', 302);
  });

  app.post('/admin/posts/:id/delete', async (c) => {
    const db = c.get('db');
    const id = intParam(c.req.param('id'), 0);
    const post = id > 0 ? await db.get('SELECT * FROM posts WHERE id = ?', id) : null;
    if (!post) {
      setFlash(c, 'error', 'No such post.');
      return c.redirect(backTo(c, '/admin/forum'), 302);
    }
    const first = await db.get('SELECT MIN(id) AS m FROM posts WHERE thread_id = ?', post.thread_id);
    if (Number(first.m) === post.id) {
      setFlash(c, 'error', 'That is the opening post — delete the whole thread instead.');
      return c.redirect(backTo(c, `/forum/t/${post.thread_id}`), 302);
    }
    await db.run('DELETE FROM posts WHERE id = ?', id);
    await adminAudit(c, `deleted post #${id} in thread #${post.thread_id}`);
    setFlash(c, 'success', 'Post deleted.');
    return c.redirect(backTo(c, `/forum/t/${post.thread_id}`), 302);
  });
}

export { register, LOG_EVENTS };
