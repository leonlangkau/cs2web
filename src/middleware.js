'use strict';

const { db, logEvent } = require('./db');
const { newToken, sha256hex, safeEqual } = require('./security');

const SESSION_COOKIE = 'ghsession';
const CSRF_COOKIE = 'ghcsrf';
const FLASH_COOKIE = 'ghflash';
const SESSION_DAYS = 7;

function cookieOptions(req, extra = {}) {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: req.secure,
    path: '/',
    ...extra,
  };
}

/** Best-effort client IP; honors X-Forwarded-For only when TRUST_PROXY is set (see app.js). */
function clientIp(req) {
  return req.ip || req.socket?.remoteAddress || 'unknown';
}

function securityHeaders(req, res, next) {
  res.set({
    'Content-Security-Policy':
      "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; " +
      "font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    'Cross-Origin-Opener-Policy': 'same-origin',
  });
  next();
}

/** Creates a session row for a user and sets the cookie. Returns the raw token. */
function createSession(req, res, userId) {
  const token = newToken(32);
  const expires = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  db.prepare(
    "INSERT INTO sessions (token_hash, user_id, ip, user_agent, expires_at) VALUES (?, ?, ?, ?, datetime(?, 'unixepoch'))"
  ).run(sha256hex(token), userId, clientIp(req), String(req.get('user-agent') || '').slice(0, 300), Math.floor(expires.getTime() / 1000));
  res.cookie(SESSION_COOKIE, token, cookieOptions(req, { maxAge: SESSION_DAYS * 24 * 60 * 60 * 1000 }));
  // Rotate the CSRF token alongside the session (fixation hygiene).
  res.cookie(CSRF_COOKIE, newToken(16), cookieOptions(req));
  return token;
}

function destroySession(req, res) {
  const token = req.cookies[SESSION_COOKIE];
  if (token) {
    db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha256hex(token));
  }
  res.clearCookie(SESSION_COOKIE, cookieOptions(req));
}

/** Destroys every session belonging to a user (ban, password change). */
function destroyUserSessions(userId) {
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
}

/** Loads the current user from the session cookie into req.user / res.locals.user. */
function loadSession(req, res, next) {
  req.user = null;
  const token = req.cookies[SESSION_COOKIE];
  if (token) {
    const row = /^[a-f0-9]{64}$/.test(token)
      ? db.prepare(
          `SELECT u.id, u.username, u.email, u.role, u.banned, u.created_at, s.id AS session_id
           FROM sessions s JOIN users u ON u.id = s.user_id
           WHERE s.token_hash = ? AND s.expires_at > datetime('now')`
        ).get(sha256hex(token))
      : null;
    if (row && !row.banned) {
      req.user = row;
    } else {
      // Dead, malformed or banned session — drop it server- and client-side.
      if (row && row.banned) destroyUserSessions(row.id);
      res.clearCookie(SESSION_COOKIE, cookieOptions(req));
    }
  }
  res.locals.user = req.user;
  res.locals.path = req.path;
  next();
}

/** Double-submit CSRF: cookie value must match the _csrf form field on writes. */
function csrfProtection(req, res, next) {
  let csrf = req.cookies[CSRF_COOKIE];
  if (!csrf || !/^[a-f0-9]{32}$/.test(csrf)) {
    csrf = newToken(16);
    res.cookie(CSRF_COOKIE, csrf, cookieOptions(req));
  }
  res.locals.csrfToken = csrf;

  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    const submitted = req.body ? req.body._csrf : undefined;
    if (!submitted || !safeEqual(submitted, csrf)) {
      res.status(403);
      return res.render('error', {
        title: 'Request blocked',
        code: 403,
        message: 'Invalid or missing security token. Go back, refresh the page and try again.',
      });
    }
  }
  next();
}

/** One-shot flash messages carried in a short-lived cookie. */
function flash(req, res, next) {
  res.locals.flash = null;
  const raw = req.cookies[FLASH_COOKIE];
  if (raw) {
    try {
      const parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
      if (parsed && typeof parsed.message === 'string') {
        res.locals.flash = { type: parsed.type === 'error' ? 'error' : 'success', message: parsed.message.slice(0, 500) };
      }
    } catch { /* ignore malformed cookie */ }
    res.clearCookie(FLASH_COOKIE, cookieOptions(req));
  }
  res.setFlash = (type, message) => {
    res.cookie(FLASH_COOKIE, Buffer.from(JSON.stringify({ type, message })).toString('base64url'),
      cookieOptions(req, { maxAge: 60 * 1000 }));
  };
  next();
}

function requireAuth(req, res, next) {
  if (!req.user) {
    res.setFlash('error', 'You need to sign in to do that.');
    const next_ = encodeURIComponent(req.originalUrl || '/');
    return res.redirect(`/auth/login?next=${next_}`);
  }
  next();
}

/** Admin gate: renders a 404 (not 403) so the admin area is not discoverable. */
function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    res.status(404);
    return res.render('error', { title: 'Not found', code: 404, message: 'This page does not exist.' });
  }
  next();
}

/** Records an audit event with request context. */
function audit(req, event, { userId = null, username = null, detail = null } = {}) {
  logEvent({
    userId,
    username,
    event,
    ip: clientIp(req),
    userAgent: String(req.get('user-agent') || '').slice(0, 300),
    detail,
  });
}

module.exports = {
  SESSION_COOKIE, CSRF_COOKIE,
  securityHeaders, loadSession, csrfProtection, flash,
  createSession, destroySession, destroyUserSessions,
  requireAuth, requireAdmin, clientIp, audit, cookieOptions,
};
