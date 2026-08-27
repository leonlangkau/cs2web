import * as views from "./views/admin.js";
import * as site from "./views/site.js";
import { DELETED_USERNAME, deletedUserId, relocateUserId, RESERVED_UID_MAX } from "./bootstrap.js";
import { requireAdmin, requireStaff, destroyUserSessions, audit, formBody, setFlash, clientIp } from "./middleware.js";
import { TIERS, TIER_LABELS, STAFF_TIERS } from "./tiers.js";
import { hashPassword } from "./crypto.js";
import { setSetting, ANNOUNCEMENT_KEY } from "./settings.js";

const LOGS_PER_PAGE = 50;
const USERS_PER_PAGE = 25;
const LOG_EVENTS = ['signup', 'login', 'login_failed', 'login_blocked', 'logout', 'download',
  'admin_action', 'captcha_failed', 'terms_accepted', 'password_changed', 'loader_auth', 'loader_auth_failed',
  'ip_autoban', 'signup_surge_blocked', 'post_reported', 'email_changed', 'account_deleted',
  'password_reset_requested', 'password_reset', 'email_verified', 'shout_deleted'];

// High-volume, low-signal events — routine traffic rather than something an
// admin needs to review. Excluded by the "Important only" log filter so a
// spree of shout deletions (or ordinary logins) doesn't bury real
// moderation/security events. An allowlist would rot silently as new event
// types are added; this blacklist fails safe — anything new stays visible.
const NOISY_EVENTS = new Set(['login', 'logout', 'download', 'captcha_failed', 'terms_accepted',
  'loader_auth', 'shout_deleted']);

const IP_HIDDEN = '(hidden)';

/**
 * Staff IP addresses (developer/trial_admin/admin alike) are not shown to
 * OTHER panel viewers — each staff member sees only their own. This covers
 * every surface: users list, dashboard, and the IP log including
 * admin_action rows. Returns helpers that mask user and log rows in place.
 */
async function adminIpMask(c) {
  const viewer = c.get('user');
  const admins = await c.get('db').all(
    "SELECT id, username FROM users WHERE tier IN ('developer', 'trial_admin', 'admin')"
  );
  const adminIds = new Set(admins.map((a) => a.id));
  const adminNames = new Set(admins.map((a) => String(a.username).toLowerCase()));

  const maskUser = (u) => {
    if (STAFF_TIERS.has(u.tier) && u.id !== viewer.id) {
      return { ...u, signup_ip: IP_HIDDEN, last_login_ip: IP_HIDDEN, ipHidden: true };
    }
    return u;
  };
  const maskLog = (l) => {
    const isAdminRow = (l.user_id !== null && adminIds.has(l.user_id))
      || (l.username && adminNames.has(String(l.username).toLowerCase()));
    if (isAdminRow && l.user_id !== viewer.id) {
      return { ...l, ip: IP_HIDDEN, user_agent: IP_HIDDEN, ipHidden: true };
    }
    return l;
  };
  return { maskUser, maskLog };
}

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
  // UID 0 is a real account (a reserved vanity UID), so garbage must fall
  // back to -1 — falling back to 0 would make /admin/users/junk/... target it.
  const id = intParam(c.req.param('id'), -1);
  if (id < 0) return null;
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
      openReports: await one("SELECT COUNT(*) AS n FROM reports WHERE status = 'open'"),
    };
    const { maskUser, maskLog } = await adminIpMask(c);
    const recentLogs = (await db.all('SELECT * FROM ip_logs ORDER BY id DESC LIMIT 12')).map(maskLog);
    const recentUsers = (await db.all(
      'SELECT id, username, tier, banned, signup_ip, created_at FROM users WHERE username != ? ORDER BY id DESC LIMIT 8',
      DELETED_USERNAME
    )).map(maskUser);
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

    const { maskUser } = await adminIpMask(c);
    const users = (await db.all(
      `SELECT id, username, email, tier, banned, paid_until, email_verified_at,
          signup_ip, last_login_ip, last_login_at, created_at,
          (SELECT COUNT(*) FROM posts p WHERE p.user_id = users.id) AS post_count
       FROM users ${where} ORDER BY id DESC LIMIT ? OFFSET ?`,
      ...params, USERS_PER_PAGE, (page - 1) * USERS_PER_PAGE
    )).map(maskUser);

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
    // Paid can carry an expiry: paid_days > 0 sets one, empty means lifetime.
    // Any other tier clears it.
    let paidUntil = null;
    let expiryNote = '';
    if (requested === 'paid') {
      const days = Number(body.paid_days);
      if (Number.isFinite(days) && days > 0) {
        paidUntil = Date.now() + Math.floor(days) * 86_400_000;
        expiryNote = ` for ${Math.floor(days)} day${Math.floor(days) === 1 ? '' : 's'}`;
      }
    }
    // role stays in sync as a coarse legacy mirror of tier — nothing reads it
    // for access control anymore, but keeping it sane avoids a confusing drift.
    const legacyRole = requested === 'admin' ? 'admin' : 'user';
    await db.run('UPDATE users SET tier = ?, role = ?, paid_until = ? WHERE id = ?',
      requested, legacyRole, paidUntil, user.id);
    await destroyUserSessions(db, user.id); // force re-login so the new tier takes effect cleanly
    await adminAudit(c, `set tier of #${user.id} (${user.username}) to ${requested}${expiryNote}`);
    setFlash(c, 'success', `${user.username} is now ${TIER_LABELS[requested]}${expiryNote}.`);
    return c.redirect(backTo(c, '/admin/users'), 302);
  });

  // Adjust one Paid member's remaining days (full admin). Positive extends,
  // negative shortens; time is added on top of what's left (or from now if
  // already expired). Works on lifetime subs too — they become dated.
  app.post('/admin/users/:id/paid-days', async (c) => {
    const gate = requireAdmin(c);
    if (gate) return gate;
    const db = c.get('db');
    const user = await findUser(c);
    if (!user) return notFound(c, 'No such user.');
    if (user.tier !== 'paid') {
      setFlash(c, 'error', `${user.username} is not on the Paid tier; set their tier first.`);
      return c.redirect(backTo(c, '/admin/users'), 302);
    }
    const body = await formBody(c);
    const delta = Number(body.delta_days);
    if (!Number.isFinite(delta) || delta === 0 || Math.abs(delta) > 3650) {
      setFlash(c, 'error', 'Enter a non-zero number of days (±3650).');
      return c.redirect(backTo(c, '/admin/users'), 302);
    }
    const now = Date.now();
    const base = user.paid_until === null || user.paid_until === undefined
      ? now
      : Math.max(now, Number(user.paid_until));
    const next = Math.max(now, base + Math.round(delta) * 86_400_000);
    await db.run('UPDATE users SET paid_until = ? WHERE id = ?', next, user.id);
    const left = Math.max(0, Math.round((next - now) / 86_400_000));
    await adminAudit(c, `adjusted #${user.id} (${user.username}) subscription by ${delta}d; ${left}d left`);
    setFlash(c, 'success', `${user.username}: ${delta > 0 ? '+' : ''}${Math.round(delta)} days; ${left} day${left === 1 ? '' : 's'} remaining.`);
    return c.redirect(backTo(c, '/admin/users'), 302);
  });

  // Mass adjustment: every DATED Paid subscription shifts by N days (e.g.
  // "+3 to everyone" after downtime). Lifetime subscriptions are untouched.
  app.post('/admin/subscriptions/adjust', async (c) => {
    const gate = requireAdmin(c);
    if (gate) return gate;
    const db = c.get('db');
    const body = await formBody(c);
    const delta = Number(body.delta_days);
    if (!Number.isFinite(delta) || delta === 0 || Math.abs(delta) > 3650) {
      setFlash(c, 'error', 'Enter a non-zero number of days (±3650).');
      return c.redirect(backTo(c, '/admin/users'), 302);
    }
    const now = Date.now();
    const deltaMs = Math.round(delta) * 86_400_000;
    // Expired subs count from now, active ones from their current expiry.
    const result = await db.run(
      `UPDATE users
       SET paid_until = MAX(?, (CASE WHEN paid_until < ? THEN ? ELSE paid_until END) + ?)
       WHERE tier = 'paid' AND paid_until IS NOT NULL`,
      now, now, now, deltaMs
    );
    await adminAudit(c, `mass-adjusted ${result.changes} dated subscriptions by ${delta}d`);
    setFlash(c, 'success', `${delta > 0 ? 'Extended' : 'Shortened'} ${result.changes} dated subscription${result.changes === 1 ? '' : 's'} by ${Math.abs(Math.round(delta))} days (lifetime subs untouched).`);
    return c.redirect(backTo(c, '/admin/users'), 302);
  });

  // Set a member's password directly (full admin only) — how the owner gives
  // the seeded vanity accounts (goyim/goy/omelette) usable credentials, and
  // the recovery path for members without a working email.
  app.post('/admin/users/:id/password', async (c) => {
    const gate = requireAdmin(c);
    if (gate) return gate;
    const db = c.get('db');
    const user = await findUser(c);
    if (!user) return notFound(c, 'No such user.');
    if (user.id === c.get('user').id) {
      setFlash(c, 'error', 'Change your own password from your profile.');
      return c.redirect(backTo(c, '/admin/users'), 302);
    }
    if (user.username === DELETED_USERNAME) {
      setFlash(c, 'error', 'The placeholder account cannot be signed into.');
      return c.redirect(backTo(c, '/admin/users'), 302);
    }
    const body = await formBody(c);
    const password = String(body.password || '');
    if (password.length < 8 || password.length > 128) {
      setFlash(c, 'error', 'Password must be 8–128 characters.');
      return c.redirect(backTo(c, '/admin/users'), 302);
    }
    await db.run('UPDATE users SET password_hash = ? WHERE id = ?', await hashPassword(password), user.id);
    await destroyUserSessions(db, user.id);
    await adminAudit(c, `set password of #${user.id} (${user.username})`);
    setFlash(c, 'success', `${user.username}'s password has been set; their old sessions are signed out.`);
    return c.redirect(backTo(c, '/admin/users'), 302);
  });

  // Assign a reserved vanity UID (0–1001, full admin only). Uses the same
  // FK-safe relocation as the boot migration.
  app.post('/admin/users/:id/uid', async (c) => {
    const gate = requireAdmin(c);
    if (gate) return gate;
    const db = c.get('db');
    const user = await findUser(c);
    if (!user) return notFound(c, 'No such user.');
    if (user.id === c.get('user').id) {
      setFlash(c, 'error', 'You cannot change your own UID while signed in with it.');
      return c.redirect(backTo(c, '/admin/users'), 302);
    }
    const body = await formBody(c);
    const uid = intParam(String(body.uid ?? ''), -1);
    if (uid < 0 || uid > RESERVED_UID_MAX) {
      setFlash(c, 'error', `UID must be between 0 and ${RESERVED_UID_MAX}.`);
      return c.redirect(backTo(c, '/admin/users'), 302);
    }
    if (uid === user.id) {
      setFlash(c, 'error', `${user.username} already has UID ${uid}.`);
      return c.redirect(backTo(c, '/admin/users'), 302);
    }
    if (await db.get('SELECT id FROM users WHERE id = ?', uid)) {
      setFlash(c, 'error', `UID ${uid} is already taken.`);
      return c.redirect(backTo(c, '/admin/users'), 302);
    }
    const oldId = user.id;
    await relocateUserId(db, oldId, uid);
    await adminAudit(c, `moved ${user.username} from UID ${oldId} to UID ${uid}`);
    setFlash(c, 'success', `${user.username} is now UID ${uid}. They stay signed in.`);
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
    const important = url.searchParams.get('important') === '1';
    // A specific event already narrows the view — only apply the noise
    // exclusion when browsing everything, so picking e.g. "shout_deleted"
    // explicitly still works with "Important only" left checked.
    const applyImportant = important && !event;

    const clauses = [];
    const params = [];
    if (event) { clauses.push('event = ?'); params.push(event); }
    if (applyImportant) {
      const noisy = [...NOISY_EVENTS];
      clauses.push(`event NOT IN (${noisy.map(() => '?').join(', ')})`);
      params.push(...noisy);
    }
    if (q) { clauses.push('(ip LIKE ? OR username LIKE ? OR detail LIKE ?)'); params.push(`%${q}%`, `%${q}%`, `%${q}%`); }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';

    const total = Number((await db.get(`SELECT COUNT(*) AS n FROM ip_logs ${where}`, ...params)).n);
    const pages = Math.max(1, Math.ceil(total / LOGS_PER_PAGE));
    const page = Math.max(1, Math.min(pages, intParam(url.searchParams.get('page'))));

    const { maskLog } = await adminIpMask(c);
    const logs = (await db.all(
      `SELECT * FROM ip_logs ${where} ORDER BY id DESC LIMIT ? OFFSET ?`,
      ...params, LOGS_PER_PAGE, (page - 1) * LOGS_PER_PAGE
    )).map(maskLog);
    const ipBans = await db.all('SELECT * FROM ip_bans ORDER BY created_at DESC LIMIT 100');

    return c.html(views.logs(c.get('view'), { logs, q, event, events: LOG_EVENTS, important, page, pages, total, ipBans }));
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

  // Site-wide announcement banner. Full admin only — it speaks with the
  // site's voice on every page. Empty text clears it.
  app.post('/admin/announcement', async (c) => {
    const gate = requireAdmin(c);
    if (gate) return gate;
    const body = await formBody(c);
    const value = await setSetting(c.get('db'), ANNOUNCEMENT_KEY, body.announcement);
    await adminAudit(c, value ? `set announcement: "${value.slice(0, 80)}"` : 'cleared announcement');
    setFlash(c, 'success', value ? 'Announcement is live on every page.' : 'Announcement cleared.');
    return c.redirect('/admin', 302);
  });

  // Report queue: member reports on posts, open first. Staff-level like the
  // rest of moderation.
  app.get('/admin/reports', async (c) => {
    const db = c.get('db');
    const reports = await db.all(
      `SELECT r.*, u.username AS reporter,
          p.body AS post_body, p.thread_id, p.user_id AS author_id,
          a.username AS author, t.title AS thread_title
       FROM reports r
       JOIN users u ON u.id = r.reporter_id
       LEFT JOIN posts p ON p.id = r.post_id
       LEFT JOIN users a ON a.id = p.user_id
       LEFT JOIN threads t ON t.id = p.thread_id
       ORDER BY CASE r.status WHEN 'open' THEN 0 ELSE 1 END, r.id DESC
       LIMIT 100`
    );
    return c.html(views.reports(c.get('view'), { reports }));
  });

  app.post('/admin/reports/:id/resolve', async (c) => {
    const db = c.get('db');
    const id = intParam(c.req.param('id'), 0);
    const report = id > 0 ? await db.get('SELECT * FROM reports WHERE id = ?', id) : null;
    if (!report) return notFound(c, 'No such report.');
    await db.run(
      "UPDATE reports SET status = 'resolved', resolved_by = ?, resolved_at = datetime('now') WHERE id = ?",
      c.get('user').username, id
    );
    await adminAudit(c, `resolved report #${id}`);
    setFlash(c, 'success', 'Report resolved.');
    return c.redirect(backTo(c, '/admin/reports'), 302);
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

  // Edit a category's display name and description in place. The slug (and
  // therefore every existing link) deliberately stays stable.
  app.post('/admin/categories/:id/edit', async (c) => {
    const gate = requireAdmin(c);
    if (gate) return gate;
    const db = c.get('db');
    const id = intParam(c.req.param('id'), 0);
    const category = id > 0 ? await db.get('SELECT * FROM categories WHERE id = ?', id) : null;
    if (!category) {
      setFlash(c, 'error', 'No such category.');
      return c.redirect('/admin/forum', 302);
    }
    const body = await formBody(c);
    const name = String(body.name || '').trim().replace(/\s+/g, ' ');
    const description = String(body.description || '').trim().slice(0, 300);
    if (name.length < 2 || name.length > 50) {
      setFlash(c, 'error', 'Category name must be 2–50 characters.');
      return c.redirect('/admin/forum', 302);
    }
    await db.run('UPDATE categories SET name = ?, description = ? WHERE id = ?', name, description, id);
    await adminAudit(c, `edited category #${id} ("${category.name}" -> "${name}")`);
    setFlash(c, 'success', `Category "${name}" updated.`);
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
      setFlash(c, 'error', 'That is the opening post; delete the whole thread instead.');
      return c.redirect(backTo(c, `/forum/t/${post.thread_id}`), 302);
    }
    await db.run('DELETE FROM posts WHERE id = ?', id);
    await adminAudit(c, `deleted post #${id} in thread #${post.thread_id}`);
    setFlash(c, 'success', 'Post deleted.');
    return c.redirect(backTo(c, `/forum/t/${post.thread_id}`), 302);
  });
}

export { register, LOG_EVENTS };
