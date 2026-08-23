'use strict';

const views = require('../views/auth');
const captcha = require('../captcha');
const limits = require('../limits');
const { hashPassword, verifyPassword } = require('../crypto');
const {
  createSession, destroySession, audit, clientIp, formBody, setFlash,
} = require('../middleware');
const { tooMany } = require('./main');

const USERNAME_RE = /^[A-Za-z0-9_]{3,20}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const RESERVED_USERNAMES = new Set([
  'admin', 'administrator', 'moderator', 'system', 'goyhub', 'root', 'support', 'staff',
]);

/** Only allow same-site relative redirect targets. */
function safeNext(raw) {
  if (typeof raw !== 'string' || !raw.startsWith('/') || raw.startsWith('//') || raw.includes('\\')) return '/';
  return raw;
}

/**
 * Constant-cost comparison target for unknown accounts, so a login against a
 * non-existent user takes the same time as one against a real user.
 */
let dummyHashPromise = null;
function dummyHash() {
  if (!dummyHashPromise) dummyHashPromise = hashPassword('dummy-password-for-timing');
  return dummyHashPromise;
}

function register(app) {
  app.get('/auth/signup', (c) => {
    if (c.get('user')) return c.redirect('/', 302);
    return c.html(views.signup(c.get('view'), { errors: [], values: {} }));
  });

  app.post('/auth/signup', async (c) => {
    if (c.get('user')) return c.redirect('/', 302);
    const db = c.get('db');

    const verdict = await limits.check(db, 'signup', clientIp(c), c.get('cfg'));
    if (!verdict.ok) return tooMany(c, verdict.retryAfterSec);

    const body = await formBody(c);
    const username = String(body.username || '').trim();
    const email = String(body.email || '').trim();
    const password = String(body.password || '');
    const confirm = String(body.confirm || '');

    const errors = [];
    if (!USERNAME_RE.test(username)) errors.push('Username must be 3–20 characters: letters, numbers and underscores only.');
    else if (RESERVED_USERNAMES.has(username.toLowerCase())) errors.push('That username is reserved.');
    if (!EMAIL_RE.test(email) || email.length > 254) errors.push('Enter a valid email address.');
    if (password.length < 8 || password.length > 128) errors.push('Password must be 8–128 characters.');
    if (password !== confirm) errors.push('Passwords do not match.');

    // Bot gate before the uniqueness query, so a scripted signup can't probe
    // which names are already taken.
    const botCheck = await captcha.verify(db, {
      token: body.captcha_token,
      solution: body.captcha_solution,
      honeypot: body.website,
      ip: clientIp(c),
    }, c.get('cfg'));
    if (!botCheck.ok) {
      await audit(c, 'captcha_failed', { username: username.slice(0, 60), detail: botCheck.reason });
      errors.push('Human verification failed. Complete the "I\'m not a bot" check and try again.');
    }

    if (errors.length === 0) {
      const taken = await db.get('SELECT id FROM users WHERE username = ? OR email = ?', username, email);
      if (taken) errors.push('That username or email is already registered.');
    }

    if (errors.length > 0) {
      return c.html(views.signup(c.get('view'), { errors, values: { username, email } }), 400);
    }

    const created = await db.run(
      'INSERT INTO users (username, email, password_hash, signup_ip) VALUES (?, ?, ?, ?)',
      username, email, await hashPassword(password), clientIp(c)
    );
    const userId = created.lastInsertRowid;

    await audit(c, 'signup', { userId, username });
    await db.run(
      "UPDATE users SET last_login_ip = ?, last_login_at = datetime('now') WHERE id = ?",
      clientIp(c), userId
    );
    await createSession(c, userId);
    setFlash(c, 'success', `Welcome to GoyHub, ${username}! Your account is ready.`);
    return c.redirect('/', 302);
  });

  app.get('/auth/login', (c) => {
    if (c.get('user')) return c.redirect('/', 302);
    const next = safeNext(new URL(c.req.url).searchParams.get('next'));
    return c.html(views.login(c.get('view'), { errors: [], values: {}, next }));
  });

  app.post('/auth/login', async (c) => {
    if (c.get('user')) return c.redirect('/', 302);
    const db = c.get('db');

    const verdict = await limits.check(db, 'login', clientIp(c), c.get('cfg'));
    if (!verdict.ok) return tooMany(c, verdict.retryAfterSec);

    const body = await formBody(c);
    const identifier = String(body.identifier || '').trim().slice(0, 254);
    const password = String(body.password || '');
    const next = safeNext(body.next);

    const user = identifier
      ? await db.get('SELECT * FROM users WHERE username = ? OR email = ?', identifier, identifier)
      : null;

    const valid = await verifyPassword(password, user ? user.password_hash : await dummyHash());

    if (!user || !valid) {
      await audit(c, 'login_failed', {
        userId: user ? user.id : null,
        username: identifier.slice(0, 60),
        detail: user ? 'wrong password' : 'unknown account',
      });
      return c.html(views.login(c.get('view'), {
        errors: ['Invalid username/email or password.'],
        values: { identifier },
        next,
      }), 401);
    }

    if (user.banned) {
      await audit(c, 'login_blocked', { userId: user.id, username: user.username, detail: 'account banned' });
      return c.html(views.login(c.get('view'), {
        errors: ['This account has been banned. Contact support if you believe this is a mistake.'],
        values: { identifier },
        next,
      }), 403);
    }

    await limits.forgive(db, 'login', clientIp(c));
    await db.run(
      "UPDATE users SET last_login_ip = ?, last_login_at = datetime('now') WHERE id = ?",
      clientIp(c), user.id
    );
    await audit(c, 'login', { userId: user.id, username: user.username });
    await createSession(c, user.id);
    setFlash(c, 'success', `Welcome back, ${user.username}!`);
    return c.redirect(next, 302);
  });

  app.post('/auth/logout', async (c) => {
    const user = c.get('user');
    if (user) await audit(c, 'logout', { userId: user.id, username: user.username });
    await destroySession(c);
    setFlash(c, 'success', 'You have been signed out.');
    return c.redirect('/', 302);
  });
}

module.exports = { register };
