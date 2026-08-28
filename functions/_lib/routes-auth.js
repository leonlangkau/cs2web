import * as views from "./views/auth.js";
import * as captcha from "./captcha.js";
import * as limits from "./limits.js";
import { hashPassword, verifyPassword } from "./crypto.js";
import {
  createSession, destroySession, destroyUserSessions,
  audit, clientIp, formBody, setFlash,
} from "./middleware.js";
import { sendEmail, isEmailConfigured } from "./email.js";
import { createAuthToken, peekAuthToken, consumeAuthToken } from "./tokens.js";
import { verifyTurnstile } from "./turnstile.js";
import { adoptGuestTickets } from "./support.js";
import { tooMany } from "./routes-main.js";

const USERNAME_RE = /^[A-Za-z0-9_]{3,20}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/; // also used by the profile email-change flow
const RESERVED_USERNAMES = new Set([
  'admin', 'administrator', 'moderator', 'system', 'goyhub', 'root', 'support', 'staff',
  'goy', 'goyim', // seeded brand accounts (UID 1 / UID 0)
]);

/**
 * Common throwaway-email domains, blocked at signup and email change so
 * mass-created accounts can't hide behind disposable inboxes. Extend via the
 * DISPOSABLE_EMAIL_DOMAINS env var (comma-separated).
 */
const DISPOSABLE_DOMAINS = new Set([
  'mailinator.com', 'guerrillamail.com', 'guerrillamail.net', 'sharklasers.com',
  '10minutemail.com', '10minutemail.net', 'temp-mail.org', 'tempmail.com', 'tempmail.dev',
  'yopmail.com', 'trashmail.com', 'dispostable.com', 'getnada.com', 'maildrop.cc',
  'mintemail.com', 'throwawaymail.com', 'fakeinbox.com', 'mailnesia.com', 'spamgourmet.com',
  'mytemp.email', 'burnermail.io', 'temp-mail.io', 'moakt.com', 'tmpmail.org', 'emailondeck.com',
]);

function isDisposableEmail(email, env = {}) {
  const domain = String(email).toLowerCase().split('@')[1] || '';
  if (DISPOSABLE_DOMAINS.has(domain)) return true;
  return String(env.DISPOSABLE_EMAIL_DOMAINS || '')
    .toLowerCase().split(',').map((d) => d.trim()).filter(Boolean)
    .includes(domain);
}

/** Fire-and-forget verification email; failures are logged, never fatal. */
async function sendVerificationEmail(c, user) {
  const cfg = c.get('cfg');
  if (!isEmailConfigured(cfg)) return;
  const raw = await createAuthToken(c.get('db'), 'verify', user.id);
  const origin = new URL(c.req.url).origin;
  await sendEmail(cfg, {
    to: user.email,
    subject: 'Verify your GoyHub email',
    text: `Hi ${user.username},\n\n`
      + `Confirm this email address for your GoyHub account by opening:\n\n`
      + `${origin}/auth/verify/${raw}\n\n`
      + `The link is valid for 24 hours. If you didn't create this account, ignore this email.\n\n— GoyHub`,
  });
}

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

    // Site-wide surge breaker against DISTRIBUTED mass-account attacks that
    // stay under the per-IP limit: if signups across all IPs spike far above
    // organic volume, pause registration briefly instead of eating the flood.
    const surgeLimit = Number(c.get('cfg').SIGNUP_SURGE_LIMIT ?? 100);
    if (surgeLimit > 0) {
      const recent = await db.get(
        "SELECT COUNT(*) AS n FROM ip_logs WHERE event = 'signup' AND created_at > datetime('now', '-10 minutes')"
      );
      if (Number(recent.n) >= surgeLimit) {
        await audit(c, 'signup_surge_blocked', { detail: `${recent.n} signups in 10m >= ${surgeLimit}` });
        return c.html(views.signup(c.get('view'), {
          errors: ['Sign-ups are briefly paused because of unusually high traffic. Please try again in a few minutes.'],
          values: {},
        }), 429);
      }
    }

    const body = await formBody(c);
    const username = String(body.username || '').trim();
    const email = String(body.email || '').trim();
    const password = String(body.password || '');
    const confirm = String(body.confirm || '');

    const errors = [];
    if (!USERNAME_RE.test(username)) errors.push('Username must be 3-20 characters: letters, numbers and underscores only.');
    else if (RESERVED_USERNAMES.has(username.toLowerCase())) errors.push('That username is reserved.');
    if (!EMAIL_RE.test(email) || email.length > 254) errors.push('Enter a valid email address.');
    else if (isDisposableEmail(email, c.get('cfg'))) errors.push('Disposable email addresses cannot be used; use a real inbox.');
    if (password.length < 8 || password.length > 128) errors.push('Password must be 8-128 characters.');
    if (password !== confirm) errors.push('Passwords do not match.');

    // Bot gates before the uniqueness query, so a scripted signup can't probe
    // which names are already taken. Proof-of-work is always on; Turnstile is
    // an optional second layer when its env keys are configured.
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
    const tsCheck = await verifyTurnstile(c.get('cfg'), body['cf-turnstile-response'], clientIp(c));
    if (!tsCheck.ok) {
      await audit(c, 'captcha_failed', { username: username.slice(0, 60), detail: `turnstile: ${tsCheck.error}` });
      errors.push('The Cloudflare check did not pass. Reload the page and try again.');
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
    await sendVerificationEmail(c, { id: userId, username, email });
    setFlash(c, 'success', isEmailConfigured(c.get('cfg'))
      ? `Welcome to GoyHub, ${username}! We've emailed you a verification link.`
      : `Welcome to GoyHub, ${username}! Your account is ready.`);
    return c.redirect('/', 302);
  });

  // ----- Password reset (email link) -----

  app.get('/auth/forgot', (c) => c.html(views.forgot(c.get('view'), {
    emailConfigured: isEmailConfigured(c.get('cfg')),
  })));

  app.post('/auth/forgot', async (c) => {
    const db = c.get('db');
    const cfg = c.get('cfg');

    const verdict = await limits.check(db, 'reset', clientIp(c), cfg);
    if (!verdict.ok) return tooMany(c, verdict.retryAfterSec);

    const body = await formBody(c);
    const identifier = String(body.identifier || '').trim().slice(0, 254);
    const user = identifier
      ? await db.get('SELECT id, username, email, banned FROM users WHERE username = ? OR email = ?', identifier, identifier)
      : null;

    // Same response whether or not the account exists — no enumeration oracle.
    if (user && !user.banned && isEmailConfigured(cfg)) {
      const raw = await createAuthToken(db, 'reset', user.id);
      const origin = new URL(c.req.url).origin;
      await audit(c, 'password_reset_requested', { userId: user.id, username: user.username });
      await sendEmail(cfg, {
        to: user.email,
        subject: 'Reset your GoyHub password',
        text: `Hi ${user.username},\n\n`
          + `Someone (hopefully you) asked to reset the password for this GoyHub account. Open:\n\n`
          + `${origin}/auth/reset/${raw}\n\n`
          + `The link works once and expires in 1 hour. If you didn't ask for this, ignore this email — `
          + `your password is unchanged.\n\n— GoyHub`,
      });
    }
    setFlash(c, 'success', 'If that account exists, a reset link is on its way to its email address.');
    return c.redirect('/auth/login', 302);
  });

  app.get('/auth/reset/:token', async (c) => {
    const token = c.req.param('token');
    const row = await peekAuthToken(c.get('db'), 'reset', token);
    if (!row) {
      setFlash(c, 'error', 'That reset link is invalid or has expired. Request a new one.');
      return c.redirect('/auth/forgot', 302);
    }
    return c.html(views.resetPassword(c.get('view'), { token, errors: [] }));
  });

  app.post('/auth/reset/:token', async (c) => {
    const db = c.get('db');
    const token = c.req.param('token');
    const body = await formBody(c);
    const password = String(body.password || '');
    const confirm = String(body.confirm || '');

    const errors = [];
    if (password.length < 8 || password.length > 128) errors.push('Password must be 8-128 characters.');
    if (password !== confirm) errors.push('Passwords do not match.');
    if (errors.length > 0) {
      // Only validation failed — the token stays live for the retry.
      if (!(await peekAuthToken(db, 'reset', token))) {
        setFlash(c, 'error', 'That reset link is invalid or has expired. Request a new one.');
        return c.redirect('/auth/forgot', 302);
      }
      return c.html(views.resetPassword(c.get('view'), { token, errors }), 400);
    }

    const row = await consumeAuthToken(db, 'reset', token);
    if (!row) {
      setFlash(c, 'error', 'That reset link is invalid or has expired. Request a new one.');
      return c.redirect('/auth/forgot', 302);
    }

    const user = await db.get('SELECT id, username FROM users WHERE id = ?', row.user_id);
    await db.run('UPDATE users SET password_hash = ? WHERE id = ?', await hashPassword(password), row.user_id);
    await destroyUserSessions(db, row.user_id); // a reset means the old credentials can't be trusted
    await audit(c, 'password_reset', { userId: row.user_id, username: user ? user.username : null });
    setFlash(c, 'success', 'Password updated. Log in with your new password.');
    return c.redirect('/auth/login', 302);
  });

  // ----- Email verification -----

  app.get('/auth/verify/:token', async (c) => {
    const db = c.get('db');
    const row = await consumeAuthToken(db, 'verify', c.req.param('token'));
    if (!row) {
      setFlash(c, 'error', 'That verification link is invalid or has expired. Request a new one from your profile.');
      return c.redirect(c.get('user') ? '/profile' : '/auth/login', 302);
    }
    await db.run("UPDATE users SET email_verified_at = datetime('now') WHERE id = ?", row.user_id);
    // Verifying the address is what makes it safe to hand over the tickets
    // opened at it before there was an account.
    const verified = await db.get('SELECT id, username, email, email_verified_at FROM users WHERE id = ?', row.user_id);
    const adopted = await adoptGuestTickets(db, verified);
    if (adopted > 0) {
      await audit(c, 'ticket_adopted', {
        userId: verified.id, username: verified.username,
        detail: `${adopted} guest ticket${adopted === 1 ? '' : 's'} claimed on verification`,
      });
    }
    const user = await db.get('SELECT username FROM users WHERE id = ?', row.user_id);
    await audit(c, 'email_verified', { userId: row.user_id, username: user ? user.username : null });
    setFlash(c, 'success', 'Email verified. Thanks!');
    return c.redirect(c.get('user') ? '/profile' : '/auth/login', 302);
  });

  // Unlike signup, login stays reachable while signed in: it acts as an
  // account switcher. Silently bouncing to "/" here made a second admin
  // account look like it couldn't log in at all when tested from a browser
  // that still held the first admin's session.
  app.get('/auth/login', (c) => {
    const next = safeNext(new URL(c.req.url).searchParams.get('next'));
    return c.html(views.login(c.get('view'), { errors: [], values: {}, next }));
  });

  app.post('/auth/login', async (c) => {
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
    // Account switch: retire the previous account's session before minting
    // the new one, so no browser ever holds two live sessions.
    if (c.get('user')) await destroySession(c);
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

export { register, EMAIL_RE, sendVerificationEmail, isDisposableEmail };
