import { getCookie, setCookie, deleteCookie } from "./cookies.js";
import { newToken, sha256hex, safeEqual } from "./crypto.js";
import { errorPage } from "./views/site.js";
import { TIER_LABELS, meetsTier, isStaff, isFullAdmin } from "./tiers.js";
import * as limits from "./limits.js";
import { getSetting, ANNOUNCEMENT_KEY } from "./settings.js";
import { isTurnstileConfigured } from "./turnstile.js";
import { isEmailConfigured } from "./email.js";

const SESSION_COOKIE = 'ghsession';
const CSRF_COOKIE = 'ghcsrf';
const FLASH_COOKIE = 'ghflash';
const TERMS_COOKIE = 'ghterms';
const SESSION_DAYS = 7;

/** Bump when the Terms change materially — everyone is asked to accept again. */
const TERMS_VERSION = '2026-08-24';
const TERMS_GATE_EXEMPT = new Set(['/terms', '/privacy', '/legal/accept']);

/** btoa()/atob() only accept Latin1, but flash messages carry arbitrary text
 *  (em dashes, usernames, category names) — so go through UTF-8 bytes first. */
function toBase64Url(str) {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  bytes.forEach((b) => { binary += String.fromCharCode(b); });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_');
}

function fromBase64Url(str) {
  const binary = atob(str.replace(/-/g, '+').replace(/_/g, '/'));
  const bytes = Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

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

/**
 * Canonical host redirect: send www.<domain> to the bare apex with a permanent
 * 301, preserving path and query. Runs first so every response — pages, forms,
 * the sitemap — is served from a single canonical host (better for SEO, cookies
 * and CSP). Hosts without a leading "www." (localhost, the apex itself, custom
 * subdomains like downloader.) pass straight through, so local dev is unaffected.
 * Set CANONICAL_WWW = "1" to invert it and make www the canonical host instead.
 */
const wwwRedirect = async (c, next) => {
  const host = String(c.req.header('host') || '');
  if (!host) return next();

  const cfg = c.get('cfg') || {};
  const preferWww = String(cfg.CANONICAL_WWW || '') === '1';
  const hasWww = /^www\./i.test(host);

  let targetHost = null;
  if (preferWww && !hasWww) {
    // Don't prepend www to a deeper subdomain (e.g. downloader.goyhub.st).
    if (host.split(':')[0].split('.').length <= 2) targetHost = 'www.' + host;
  } else if (!preferWww && hasWww) {
    targetHost = host.replace(/^www\./i, '');
  }

  if (!targetHost) return next();

  const url = new URL(c.req.url);
  const proto = c.req.header('x-forwarded-proto') || url.protocol.replace(':', '');
  const location = `${proto}://${targetHost}${url.pathname}${url.search}`;
  return c.redirect(location, 301);
};

const securityHeaders = async (c, next) => {
  await next();
  // The CSP stays fully self-contained unless Turnstile is enabled, in which
  // case exactly its Cloudflare origin is allowed for script/frame/connect.
  const ts = isTurnstileConfigured(c.get('cfg') || {});
  const cf = ts ? ' https://challenges.cloudflare.com' : '';
  c.header('Content-Security-Policy',
    `default-src 'self'; script-src 'self'${cf}; style-src 'self'; img-src 'self' data:; `
    + `font-src 'self'; connect-src 'self'${cf}; frame-src${ts ? cf : " 'none'"}; `
    + "frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
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
    announcement: '',
    turnstileSiteKey: isTurnstileConfigured(c.get('cfg') || {}) ? c.get('cfg').TURNSTILE_SITE_KEY : '',
  };
  c.set('view', view);

  // Site-wide announcement banner (admin-set). Only fetched for page GETs —
  // API calls and form posts never render it.
  if (c.req.method === 'GET' && !url.pathname.startsWith('/api/')) {
    view.announcement = await getSetting(db, ANNOUNCEMENT_KEY);
  }

  // --- flash (one-shot cookie) ---
  const rawFlash = getCookie(c, FLASH_COOKIE);
  if (rawFlash) {
    try {
      const parsed = JSON.parse(fromBase64Url(rawFlash));
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
        `SELECT u.id, u.username, u.email, u.role, u.tier, u.banned, u.created_at, u.email_verified_at, u.paid_until,
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

/**
 * Blocks every route for a banned IP address, regardless of which account
 * (or no account) is behind it — staff are exempt so nobody can lock
 * themselves, or a shared office/household IP with a staff member on it, out
 * by banning the wrong address.
 */
const ipBanGate = async (c, next) => {
  const user = c.get('user');
  if (isStaff(user)) { await next(); return; }

  const ip = clientIp(c);
  if (ip && ip !== 'unknown') {
    const db = c.get('db');
    const ban = await db.get('SELECT reason, expires_at FROM ip_bans WHERE ip = ?', ip);
    if (ban) {
      // Automatic flood bans carry an expiry; lift them lazily on the first
      // request after it passes. Admin bans (expires_at NULL) are permanent.
      if (ban.expires_at !== null && Number(ban.expires_at) <= Date.now()) {
        await db.run('DELETE FROM ip_bans WHERE ip = ?', ip);
      } else {
        return c.html(errorPage(c.get('view'), {
          code: 403, title: 'Access blocked',
          message: 'This network has been blocked from GoyHub.'
            + (ban.reason ? ` Reason: ${ban.reason}` : ''),
        }), 403);
      }
    }
  }
  await next();
};

/**
 * Application-layer flood control, applied to every dynamic route:
 *
 *  - a per-IP burst cap (RATE_LIMIT_BURST requests/minute, default 240 —
 *    far above human browsing, well below a scripted flood) answered with 429;
 *  - repeated breaches (RATE_LIMIT_FLOOD per 10 min) escalate to a temporary
 *    automatic IP ban (AUTO_IP_BAN_MINUTES, default 60) so the offender stops
 *    costing a database round-trip per request at the gate above.
 *
 * Staff are exempt, an existing permanent admin ban is never overwritten by
 * an auto-ban, and RATE_LIMIT_BURST="0" disables the whole layer. True
 * volumetric DDoS absorption belongs to the Cloudflare edge in front of this
 * (WAF, Bot Fight Mode, Under Attack mode) — this layer handles what leaks
 * through to the application: scripted scraping, signup floods, brute bursts.
 */
const floodProtection = async (c, next) => {
  const cfg = c.get('cfg') || {};
  if (String(cfg.RATE_LIMIT_BURST || '') === '0') { await next(); return; }
  if (isStaff(c.get('user'))) { await next(); return; }

  const ip = clientIp(c);
  if (!ip || ip === 'unknown') { await next(); return; }

  const db = c.get('db');
  const verdict = await limits.check(db, 'burst', ip, cfg);
  if (verdict.ok) { await next(); return; }

  const breaches = await limits.check(db, 'flood', ip, cfg);
  if (!breaches.ok) {
    const minutes = Number(cfg.AUTO_IP_BAN_MINUTES) > 0 ? Math.floor(Number(cfg.AUTO_IP_BAN_MINUTES)) : 60;
    // DO NOTHING on conflict: never downgrade an admin's permanent ban to a
    // temporary one.
    await db.run(
      `INSERT INTO ip_bans (ip, reason, banned_by, expires_at) VALUES (?, ?, 'system', ?)
       ON CONFLICT(ip) DO NOTHING`,
      ip, 'automatic: request flooding', Date.now() + minutes * 60_000
    );
    await audit(c, 'ip_autoban', { detail: `flood auto-ban for ${minutes}m` });
  }

  c.header('Retry-After', String(verdict.retryAfterSec));
  return c.html(errorPage(c.get('view'), {
    code: 429, title: 'Slow down',
    message: `Too many requests from your network. Try again in about ${verdict.retryAfterSec} seconds.`,
  }), 429);
};

/** Sets a one-shot flash message for the next request. */
function setFlash(c, type, message) {
  const encoded = toBase64Url(JSON.stringify({ type, message }));
  setCookie(c, FLASH_COOKIE, encoded, cookieOptions(c, { maxAge: 60 }));
}

/**
 * CSRF protection. Anonymous visitors get double-submit (cookie must match the
 * _csrf form field); logged-in sessions are additionally bound server-side, so
 * a cookie planted by a network attacker or sibling subdomain is rotated away
 * rather than trusted.
 */
const csrfProtection = async (c, next) => {
  const view = c.get('view');

  // The loader API authenticates with credentials in the request body, not
  // cookies, so CSRF (a cookie-authority attack) does not apply — and the
  // loader can't obtain a CSRF cookie/token pair anyway.
  if (view.path.startsWith('/api/')) { await next(); return; }

  const db = c.get('db');
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

/** Full-admin gate (tier changes, deleting accounts/categories): 404s, not 403 — the admin area is not discoverable. */
function requireAdmin(c) {
  if (isFullAdmin(c.get('user'))) return null;
  return c.html(errorPage(c.get('view'), {
    code: 404, title: 'Not found', message: 'This page does not exist.',
  }), 404);
}

/** Staff gate (admin panel + moderation): any of developer/trial_admin/admin. */
function requireStaff(c) {
  if (isStaff(c.get('user'))) return null;
  return c.html(errorPage(c.get('view'), {
    code: 404, title: 'Not found', message: 'This page does not exist.',
  }), 404);
}

/**
 * Anti-bot posting gate: once outbound email is configured, writing to the
 * forum/shoutbox requires a verified email address. Staff are exempt, and
 * with no email provider configured the gate is off (nobody could verify).
 * Returning null = allowed; otherwise a redirect back with an explanation.
 */
function requireVerifiedEmail(c) {
  const cfg = c.get('cfg') || {};
  if (!isEmailConfigured(cfg) || String(cfg.REQUIRE_VERIFIED_EMAIL || '') === '0') return null;
  const user = c.get('user');
  if (!user || user.email_verified_at || isStaff(user)) return null;
  setFlash(c, 'error', 'Verify your email address before posting — there\'s a resend button on your profile.');
  return c.redirect('/profile', 302);
}

/**
 * Content-tier gate (forum, download): requires sign-in and at least
 * `minTier`. Unlike requireAdmin/requireStaff this is meant to be
 * discoverable, so a logged-in user under the tier gets a real 403
 * explaining what to do, not a 404.
 */
function requireTier(c, minTier) {
  const user = c.get('user');
  if (!user) {
    setFlash(c, 'error', 'You need to sign in to do that.');
    const next = encodeURIComponent(new URL(c.req.url).pathname + new URL(c.req.url).search);
    return c.redirect(`/auth/login?next=${next}`, 302);
  }
  if (!meetsTier(user, minTier)) {
    return c.html(errorPage(c.get('view'), {
      code: 403, title: 'Members only',
      message: `This area requires ${TIER_LABELS[minTier]} access or higher.`,
      action: { href: '/upgrade', label: 'See upgrade options' },
    }), 403);
  }
  return null;
}

export {
  SESSION_COOKIE, CSRF_COOKIE, FLASH_COOKIE, TERMS_COOKIE, TERMS_VERSION,
  wwwRedirect, securityHeaders, loadContext, csrfProtection, termsGate, ipBanGate, floodProtection,
  createSession, destroySession, destroyUserSessions,
  acceptTerms, setFlash, formBody, requireAuth, requireAdmin, requireStaff, requireTier,
  requireVerifiedEmail, clientIp, userAgent, audit, cookieOptions,
};
