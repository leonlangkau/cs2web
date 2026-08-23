import { getCookie, setCookie, deleteCookie } from "./cookies.js";
import { newToken, sha256hex, safeEqual } from "./crypto.js";
import { errorPage } from "./views/site.js";

const SESSION_COOKIE = 'ghsession';
const CSRF_COOKIE = 'ghcsrf';
const FLASH_COOKIE = 'ghflash';
const TERMS_COOKIE = 'ghterms';
const SESSION_DAYS = 7;

/** Bump when the Terms change materially — everyone is asked to accept again. */
const TERMS_VERSION = '2026-08-21';
const TERMS_GATE_EXEMPT = new Set(['/terms', '/privacy', '/legal/accept']);

function isSecure(c) {
  if (c.req.header('x-forwarded-proto') === 'https') return true;
  try { return new URL(c.req.url).protocol === 'https:'; } catch { return false; }
}

function cookieOptions(c, extra = {}) {
  return { httpOnly: true, sameSite: 'Lax', secure: isSecure(c), path: '/', ...extra };
}

/**
 * Best-effort client IP.
 *
 * On Cloudflare, CF-Connecting-IP is set by the edge and cannot be spoofed by
 * the client, so it is trusted. X-Forwarded-For is only honoured when
 * TRUST_PROXY is set, since anyone can send that header directly.
 */
function clientIp(c) {
  const cf = c.req.header('cf-connecting-ip');
  if (cf) return cf;

  const cfg = c.get('cfg') || {};
  if (cfg.TRUST_PROXY) {
    const xff = c.req.header('x-forwarded-for');
    if (xff) return xff.split(',')[0].trim();
  }

  // @hono/node-server exposes the raw socket here.
  const socket = c.env && c.env.incoming && c.env.incoming.socket;
  return (socket && socket.remoteAddress) || 'unknown';
}

function userAgent(c) {
  return String(c.req.header('user-agent') || '').slice(0, 300);
}

const securityHeaders = async (c, next) => {
  await next();
  c.header('Content-Security-Policy',
    "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; "
    + "font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('X-Frame-Options', 'DENY');
  c.header('Referrer-Policy', 'no-referrer');
  c.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  c.header('Cross-Origin-Opener-Policy', 'same-origin');
};

/** Appends a row to the IP audit log. */
async function audit(c, event, { userId = null, username = null, detail = null } = {}) {
  const db = c.get('db');
  await db.run(
    'INSERT INTO ip_logs (user_id, username, event, ip, user_agent, detail) VALUES (?, ?, ?, ?, ?, ?)',
    userId, username, event, clientIp(c) || 'unknown', userAgent(c), detail
  );
}

/** Creates a session row and sets the cookie. */
async function createSession(c, userId) {
  const db = c.get('db');
  const token = newToken(32);
  // Rotate the CSRF token alongside the session (fixation hygiene) and bind it
  // to the session server-side so a planted cookie can't satisfy double-submit.
  const csrf = newToken(16);
  const expiresUnix = Math.floor((Date.now() + SESSION_DAYS * 86400_000) / 1000);

  await db.run(
    `INSERT INTO sessions (token_hash, user_id, csrf_hash, ip, user_agent, expires_at)
     VALUES (?, ?, ?, ?, ?, datetime(?, 'unixepoch'))`,
    await sha256hex(token), userId, await sha256hex(csrf), clientIp(c), userAgent(c), expiresUnix
  );

  setCookie(c, SESSION_COOKIE, token, cookieOptions(c, { maxAge: SESSION_DAYS * 86400 }));
  setCookie(c, CSRF_COOKIE, csrf, cookieOptions(c));
  const view = c.get('view');
  view.csrfToken = csrf;
  return token;
}

async function destroySession(c) {
  const token = getCookie(c, SESSION_COOKIE);
  if (token) {
    await c.get('db').run('DELETE FROM sessions WHERE token_hash = ?', await sha256hex(token));
  }
  deleteCookie(c, SESSION_COOKIE, cookieOptions(c));
}

async function destroyUserSessions(db, userId) {
  await db.run('DELETE FROM sessions WHERE user_id = ?', userId);
}

/** Builds the render context and loads the signed-in user. */
const loadContext = async (c, next) => {
  const db = c.get('db');
  const url = new URL(c.req.url);

  const view = {
    user: null,
    path: url.pathname,
    flash: null,
    csrfToken: '',
    needsTermsGate: false,
    termsVersion: TERMS_VERSION,
    company: c.get('company'),
    appName: 'GoyHub',
    appVersion: c.get('appVersion'),
  };
  c.set('view', view);

  // --- flash (one-shot cookie) ---
  const rawFlash = getCookie(c, FLASH_COOKIE);
  if (rawFlash) {
    try {
      const parsed = JSON.parse(atob(rawFlash.replace(/-/g, '+').replace(/_/g, '/')));
      if (parsed && typeof parsed.message === 'string') {
        view.flash = {
          type: parsed.type === 'error' ? 'error' : 'success',
          message: parsed.message.slice(0, 500),
        };
      }
    } catch { /* ignore malformed cookie */ }
    deleteCookie(c, FLASH_COOKIE, cookieOptions(c));
  }

  // --- session ---
  const token = getCookie(c, SESSION_COOKIE);
  if (token) {
    const row = /^[a-f0-9]{64}$/.test(token)
      ? await db.get(
        `SELECT u.id, u.username, u.email, u.role, u.banned, u.created_at,
                s.id AS session_id, s.csrf_hash
         FROM sessions s JOIN users u ON u.id = s.user_id
         WHERE s.token_hash = ? AND s.expires_at > datetime('now')`,
        await sha256hex(token)
      )
      : null;

    if (row && !row.banned) {
      c.set('user', row);
      view.user = row;
      c.set('sessionId', row.session_id);
      c.set('sessionCsrfHash', row.csrf_hash);
    } else {
      if (row && row.banned) await destroyUserSessions(db, row.id);
      deleteCookie(c, SESSION_COOKIE, cookieOptions(c));
    }
  }

  await next();
};

/** Sets a one-shot flash message for the next request. */
function setFlash(c, type, message) {
  const encoded = btoa(JSON.stringify({ type, message })).replace(/\+/g, '-').replace(/\//g, '_');
  setCookie(c, FLASH_COOKIE, encoded, cookieOptions(c, { maxAge: 60 }));
}

/**
 * CSRF protection. Anonymous visitors get double-submit (cookie must match the
 * _csrf form field); logged-in sessions are additionally bound server-side, so
 * a cookie planted by a network attacker or sibling subdomain is rotated away
 * rather than trusted.
 */
const csrfProtection = async (c, next) => {
  const db = c.get('db');
  const view = c.get('view');
  const user = c.get('user');
  const sessionCsrfHash = c.get('sessionCsrfHash');

  let csrf = getCookie(c, CSRF_COOKIE);
  const bound = user && sessionCsrfHash
    ? Boolean(csrf) && (await sha256hex(csrf)) === sessionCsrfHash
    : true;

  if (!csrf || !/^[a-f0-9]{32}$/.test(csrf) || !bound) {
    csrf = newToken(16);
    setCookie(c, CSRF_COOKIE, csrf, cookieOptions(c));
    if (user && c.get('sessionId')) {
      const hash = await sha256hex(csrf);
      await db.run('UPDATE sessions SET csrf_hash = ? WHERE id = ?', hash, c.get('sessionId'));
      c.set('sessionCsrfHash', hash);
    }
  }
  view.csrfToken = csrf;

  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(c.req.method)) {
    const body = await c.req.parseBody();
    c.set('body', body);
    const submitted = body._csrf;
    const currentHash = c.get('sessionCsrfHash');
    const sessionOk = user && currentHash ? (await sha256hex(csrf)) === currentHash : true;

    if (!submitted || !safeEqual(submitted, csrf) || !sessionOk) {
      return c.html(errorPage(view, {
        code: 403,
        title: 'Request blocked',
        message: 'Invalid or missing security token. Go back, refresh the page and try again.',
      }), 403);
    }
  }

  await next();
};

/**
 * Decides whether the accept-the-terms dialog should be shown. Purely
 * presentational: it never blocks a request, so the legal documents and the
 * accept endpoint always remain reachable.
 */
const termsGate = async (c, next) => {
  const view = c.get('view');
  view.needsTermsGate = c.req.method === 'GET'
    && !TERMS_GATE_EXEMPT.has(view.path)
    && getCookie(c, TERMS_COOKIE) !== TERMS_VERSION;
  await next();
};

function acceptTerms(c) {
  setCookie(c, TERMS_COOKIE, TERMS_VERSION, cookieOptions(c, {
    maxAge: 365 * 86400,
    httpOnly: false, // readable by the page so the dialog can stay dismissed
  }));
}

/** Retrieves the parsed form body (csrfProtection already parsed it on writes). */
async function formBody(c) {
  const cached = c.get('body');
  if (cached) return cached;
  const body = await c.req.parseBody();
  c.set('body', body);
  return body;
}

function requireAuth(c) {
  if (c.get('user')) return null;
  setFlash(c, 'error', 'You need to sign in to do that.');
  const next = encodeURIComponent(new URL(c.req.url).pathname + new URL(c.req.url).search);
  return c.redirect(`/auth/login?next=${next}`, 302);
}

/** Admin gate: renders a 404 (not 403) so the admin area is not discoverable. */
function requireAdmin(c) {
  const user = c.get('user');
  if (user && user.role === 'admin') return null;
  return c.html(errorPage(c.get('view'), {
    code: 404, title: 'Not found', message: 'This page does not exist.',
  }), 404);
}

export {
  SESSION_COOKIE, CSRF_COOKIE, FLASH_COOKIE, TERMS_COOKIE, TERMS_VERSION,
  securityHeaders, loadContext, csrfProtection, termsGate,
  createSession, destroySession, destroyUserSessions,
  acceptTerms, setFlash, formBody, requireAuth, requireAdmin,
  clientIp, userAgent, audit, cookieOptions,
};
