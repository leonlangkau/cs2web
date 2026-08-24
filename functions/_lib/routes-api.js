/**
 * Loader-facing JSON API.
 *
 * The desktop loader has no browser cookies, so it authenticates with the
 * member's website username/email + password and gets back the account's
 * tier plus an HMAC-signed license token (see license.js). CSRF does not
 * apply here — nothing on these routes acts on cookie authority — and the
 * csrfProtection middleware exempts /api/* for exactly that reason.
 *
 * Endpoints:
 *   POST /api/loader/auth    {username, password}          -> tier + signed license
 *   POST /api/loader/verify  {license object from /auth}   -> {ok, valid, tier}
 */
import * as limits from "./limits.js";
import { verifyPassword } from "./crypto.js";
import { audit, clientIp, formBody } from "./middleware.js";
import { issueLicense, verifyLicense } from "./license.js";
import { tierOf, meetsTier } from "./tiers.js";

/** Reads the request body as form fields or JSON, whichever the client sent. */
async function apiBody(c) {
  const form = await formBody(c);
  if (form && Object.keys(form).length > 0) return form;
  const ct = c.req.header('content-type') || '';
  if (ct.includes('application/json')) {
    try { return await c.req.raw.json(); } catch { return {}; }
  }
  return {};
}

function register(app) {
  app.post('/api/loader/auth', async (c) => {
    const db = c.get('db');
    c.header('Cache-Control', 'no-store');

    // Same bucket as browser logins, so the API is not a cheaper way to
    // brute-force an account's password than the login form is.
    const verdict = await limits.check(db, 'login', clientIp(c), c.get('cfg'));
    if (!verdict.ok) {
      c.header('Retry-After', String(verdict.retryAfterSec));
      return c.json({ ok: false, error: 'rate_limited', retryAfterSec: verdict.retryAfterSec }, 429);
    }

    const body = await apiBody(c);
    const identifier = String(body.username || body.identifier || '').trim().slice(0, 254);
    const password = String(body.password || '');

    const user = identifier
      ? await db.get('SELECT * FROM users WHERE username = ? OR email = ?', identifier, identifier)
      : null;
    const valid = user ? await verifyPassword(password, user.password_hash) : false;

    if (!user || !valid) {
      await audit(c, 'loader_auth_failed', {
        userId: user ? user.id : null,
        username: identifier.slice(0, 60),
        detail: user ? 'wrong password' : 'unknown account',
      });
      return c.json({ ok: false, error: 'invalid_credentials' }, 401);
    }
    if (user.banned) {
      await audit(c, 'loader_auth_failed', { userId: user.id, username: user.username, detail: 'account banned' });
      return c.json({ ok: false, error: 'banned' }, 403);
    }

    await limits.forgive(db, 'login', clientIp(c));
    await audit(c, 'loader_auth', { userId: user.id, username: user.username });

    const license = await issueLicense(user, c.get('cfg'));
    return c.json({
      ok: true,
      userId: user.id,
      username: user.username,
      tier: tierOf(user),
      paid: meetsTier(user, 'paid'),
      license,
    });
  });

  // Server-side re-verification, so the loader never has to embed the HMAC
  // secret (which a cracked binary would leak). Pass back the license object
  // from /auth verbatim.
  app.post('/api/loader/verify', async (c) => {
    c.header('Cache-Control', 'no-store');
    const body = await apiBody(c);
    const license = body.license && typeof body.license === 'object' ? body.license : body;
    const valid = await verifyLicense(license, c.get('cfg'));
    if (!valid) return c.json({ ok: true, valid: false }, 200);

    // Signature is genuine — also report the account's CURRENT tier, so a
    // member who was upgraded/downgraded since the token was issued is
    // reflected immediately rather than after the token expires.
    const row = await c.get('db').get(
      'SELECT tier, banned FROM users WHERE id = ?', Number(license.userId)
    );
    const live = row && !row.banned;
    return c.json({
      ok: true,
      valid: live,
      tier: live ? tierOf(row) : null,
      paid: live ? meetsTier(row, 'paid') : false,
    });
  });
}

export { register };
