import * as views from "./views/site.js";
import * as legalViews from "./views/legal.js";
import * as contentViews from "./views/content.js";
import installer from "./installer-data.js";
import * as captcha from "./captcha.js";
import * as limits from "./limits.js";
import { DELETED_USERNAME } from "./bootstrap.js";
import { audit, clientIp, requireAuth, requireTier, acceptTerms, formBody, setFlash, TERMS_VERSION, } from "./middleware.js";
import { meetsTier } from "./tiers.js";
import { issueLicense } from "./license.js";
import { newToken } from "./crypto.js";
import { btcpayConfig } from "./btcpay.js";

/**
 * Per-download filename so the served attachment is never a predictable,
 * cacheable, shareable URL-to-name mapping. Keeps the real base name and
 * extension (installers must stay double-clickable) but injects a random,
 * per-request token: GoyHub-Setup-1.0.0.zip -> GoyHub-Setup-1.0.0-a1b2c3d4.zip
 */
function scrambledFilename(name) {
  const token = newToken(4); // 8 hex chars
  const dot = name.lastIndexOf('.');
  if (dot < 1) return `${name}-${token}`;
  return `${name.slice(0, dot)}-${token}${name.slice(dot)}`;
}

const DOWNLOAD_META = {
  sha256: installer.sha256,
  sizeKb: installer.sizeKb,
  name: installer.name,
};

/** Only allow same-site relative redirect targets. */
function safePath(raw) {
  if (typeof raw !== 'string' || !raw.startsWith('/') || raw.startsWith('//') || raw.includes('\\')) return '/';
  return raw;
}

async function siteStats(db) {
  const one = async (sql, ...args) => Number((await db.get(sql, ...args))?.n || 0);
  return {
    users: await one('SELECT COUNT(*) AS n FROM users WHERE username != ?', DELETED_USERNAME),
    threads: await one('SELECT COUNT(*) AS n FROM threads'),
    posts: await one('SELECT COUNT(*) AS n FROM posts'),
    downloads: await one("SELECT COUNT(*) AS n FROM ip_logs WHERE event = 'download'"),
  };
}

/**
 * Payment configuration for the /upgrade page, entirely env-driven.
 *
 * Preferred path is a self-hosted BTCPay Server (see btcpay.js): when it is
 * fully configured, the page shows a real one-click "Pay with crypto" button
 * that creates an invoice and upgrades the account automatically once the
 * payment confirms on-chain. The older fields stay as fallbacks so a site can
 * still run a hosted link or manual addresses without BTCPay:
 *   CRYPTO_PAY_URL       hosted checkout link (Coinbase Commerce, NOWPayments…)
 *   CRYPTO_PAY_ADDRESSES manual fallback, "BTC:bc1...,ETH:0x...,LTC:ltc1..."
 *   PAID_PRICE           display string, e.g. "$10 / month"
 * With none set, the upgrade page shows an honest "coming soon" + contact.
 */
function paymentConfig(env = {}) {
  const addresses = String(env.CRYPTO_PAY_ADDRESSES || '')
    .split(',')
    .map((pair) => {
      const i = pair.indexOf(':');
      if (i < 1) return null;
      const coin = pair.slice(0, i).trim().toUpperCase().slice(0, 12);
      const address = pair.slice(i + 1).trim().slice(0, 128);
      return coin && address ? { coin, address } : null;
    })
    .filter(Boolean);

  const btc = btcpayConfig(env);
  // Display price: the explicit PAID_PRICE string wins; otherwise compose one
  // from the BTCPay amount/currency when that path is configured.
  const price = String(env.PAID_PRICE || '').trim()
    || (btc.configured ? `${btc.amount} ${btc.currency}` : '');

  return {
    btcpay: {
      configured: btc.configured,
      currency: btc.currency,
      amount: btc.amount,
      periodDays: btc.periodDays,
    },
    url: String(env.CRYPTO_PAY_URL || '').trim(),
    addresses,
    price,
  };
}

function tooMany(c, retryAfterSec) {
  c.header('Retry-After', String(retryAfterSec));
  return c.html(views.errorPage(c.get('view'), {
    code: 429,
    title: 'Slow down',
    message: `Too many requests. Try again in about ${retryAfterSec} seconds.`,
  }), 429);
}

function register(app) {
  app.get('/', async (c) => {
    const db = c.get('db');
    // The forum is members-only (Paid tier+), so its content isn't teased to
    // visitors who can't actually open it.
    const recentThreads = meetsTier(c.get('user'), 'paid')
      ? await db.all(
        `SELECT t.id, t.title, t.updated_at, c.name AS category, u.username
         FROM threads t JOIN categories c ON c.id = t.category_id JOIN users u ON u.id = t.user_id
         ORDER BY t.updated_at DESC LIMIT 4`
      )
      : [];
    return c.html(views.home(c.get('view'), {
      stats: await siteStats(db),
      recentThreads,
      downloadMeta: DOWNLOAD_META,
    }));
  });

  app.get('/terms', (c) => c.html(legalViews.terms(c.get('view'))));
  app.get('/privacy', (c) => c.html(legalViews.privacy(c.get('view'))));
  app.get('/faq', (c) => c.html(contentViews.faq(c.get('view'))));
  app.get('/changelog', (c) => c.html(contentViews.changelog(c.get('view'))));

  // SEO plumbing. Only genuinely public pages belong in the sitemap — the
  // forum is members-only and must not be advertised to crawlers.
  app.get('/robots.txt', (c) => {
    const origin = new URL(c.req.url).origin;
    return c.text(`User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /api/\n\nSitemap: ${origin}/sitemap.xml\n`);
  });

  app.get('/sitemap.xml', (c) => {
    const origin = new URL(c.req.url).origin;
    const urls = ['/', '/download', '/upgrade', '/faq', '/changelog', '/terms', '/privacy', '/auth/signup', '/auth/login'];
    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`
      + urls.map((u) => `  <url><loc>${origin}${u}</loc></url>`).join('\n')
      + `\n</urlset>\n`;
    return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=UTF-8' } });
  });

  app.post('/legal/accept', async (c) => {
    const body = await formBody(c);
    const user = c.get('user');
    acceptTerms(c);
    await audit(c, 'terms_accepted', {
      userId: user ? user.id : null,
      username: user ? user.username : null,
      detail: `version ${TERMS_VERSION}`,
    });
    return c.redirect(safePath(body.next), 302);
  });

  app.get('/captcha/challenge', async (c) => {
    c.header('Cache-Control', 'no-store');
    return c.json(await captcha.issue(clientIp(c), c.get('cfg')));
  });

  app.get('/download', (c) => c.html(views.downloadPage(c.get('view'), { downloadMeta: DOWNLOAD_META })));

  const buyPage = (c) => c.html(views.upgradePage(c.get('view'), {
    pay: paymentConfig(c.get('cfg')),
  }));
  app.get('/upgrade', buyPage);
  app.get('/buy', buyPage); // same page, friendlier URL

  // Paid members only: anonymous visitors are sent to log in, and a signed-in
  // Free account gets a clear "upgrade" message — the artifact is never
  // served below that tier even by direct URL.
  app.get('/download/file', async (c) => {
    const gate = requireTier(c, 'paid');
    if (gate) return gate;

    const verdict = await limits.check(c.get('db'), 'download', clientIp(c), c.get('cfg'));
    if (!verdict.ok) return tooMany(c, verdict.retryAfterSec);

    const user = c.get('user');
    const body = await loadInstaller(c);
    if (!body) {
      return c.html(views.errorPage(c.get('view'), {
        code: 503, title: 'Unavailable',
        message: 'The download is being updated. Check back in a few minutes.',
      }), 503);
    }

    const filename = scrambledFilename(installer.name);
    await audit(c, 'download', { userId: user.id, username: user.username, detail: filename });
    return new Response(body, {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  });

  // Signed entitlement token for the desktop loader: it can call this (with
  // the member's session cookie, or the member pastes the token into it) to
  // learn which tier the account is on without trusting the client alone.
  // Available to every signed-in account, not just Paid+ — the loader needs
  // a verifiable "this account is Free" just as much as "this is Paid".
  app.get('/account/license', async (c) => {
    const gate = requireAuth(c);
    if (gate) return gate;
    c.header('Cache-Control', 'no-store');
    return c.json(await issueLicense(c.get('user'), c.get('cfg')));
  });
}

/**
 * Resolves the installer bytes. Prefers an R2 binding (the right home for a
 * real, multi-megabyte build) and falls back to the copy embedded at build time.
 */
async function loadInstaller(c) {
  const bucket = c.get('cfg') && c.get('cfg').INSTALLER;
  if (bucket && typeof bucket.get === 'function') {
    const object = await bucket.get(installer.name);
    if (object) return object.body;
  }
  if (installer.base64) {
    const binary = atob(installer.base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }
  return null;
}

export { register, siteStats, tooMany, safePath, paymentConfig, scrambledFilename, DOWNLOAD_META };
