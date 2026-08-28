import * as views from "./views/site.js";
import * as legalViews from "./views/legal.js";
import * as contentViews from "./views/content.js";
import installer from "./installer-data.js";
import * as captcha from "./captcha.js";
import * as limits from "./limits.js";
import { DELETED_USERNAME } from "./bootstrap.js";
import { audit, clientIp, requireAuth, requireTier, acceptTerms, formBody, setFlash, TERMS_VERSION, } from "./middleware.js";
import { meetsTier, isStaff } from "./tiers.js";
import { issueLicense } from "./license.js";
import { newToken } from "./crypto.js";
import { btcpayConfig } from "./btcpay.js";
import { onchainConfig, reconcileForUser as reconcileChainForUser } from "./onchain.js";
import { reconcileForUser } from "./fulfil.js";
import { resolvePlans } from "./plans.js";

/**
 * Per-download filename so the served attachment is never a predictable,
 * cacheable, shareable URL-to-name mapping. Keeps the real base name and
 * extension (installers must stay double-clickable) but injects a random,
 * per-request token: GoyHub-Setup-1.0.0.exe -> GoyHub-Setup-1.0.0-a1b2c3d4.exe
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
 *
 * Running alongside all of the above is the direct-to-wallet path (ETH_ADDRESS /
 * SOL_ADDRESS — see onchain.js), which needs no server and no processor at all.
 * The two are deliberately not exclusive: a deployment can offer BTCPay's
 * Bitcoin checkout and direct ETH/SOL/USDT side by side, and the store page
 * shows whichever are actually configured.
 */
function paymentConfig(env = {}, plans = null) {
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
  // The live catalogue (admin-managed products, else the env fallback) when the
  // caller resolved one; otherwise just what env describes.
  const catalogue = plans || btc.plans;
  // Display price: the explicit PAID_PRICE string wins; otherwise compose one
  // from the cheapest thing actually on sale.
  const cheapest = catalogue.length > 0
    ? catalogue.reduce((a, b) => (Number(b.amount) < Number(a.amount) ? b : a))
    : null;
  const price = String(env.PAID_PRICE || '').trim()
    || (btc.configured && cheapest ? `from ${cheapest.amount} ${btc.currency}` : '');

  const chain = onchainConfig(env);

  return {
    btcpay: {
      configured: btc.configured,
      currency: btc.currency,
      amount: btc.amount,
      periodDays: btc.periodDays,
      plans: catalogue,
    },
    // Direct-to-wallet coins. Only what is actually payable right now: an
    // address that failed validation is not offered (see chainConfig).
    chain: {
      configured: chain.configured,
      currency: chain.currency,
      assets: chain.assets.map((a) => ({
        key: a.key, symbol: a.symbol, label: a.label, network: a.network,
      })),
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

  app.get('/sitemap.xml', async (c) => {
    const origin = new URL(c.req.url).origin;
    const urls = ['/', '/download', '/upgrade', '/faq', '/changelog', '/help', '/support/new',
      '/terms', '/privacy', '/auth/signup', '/auth/login'];

    // Published help articles are the pages people actually search for, so
    // they belong in the sitemap. Bounded, and a failure here (a database
    // hiccup) must not take the sitemap down with it.
    try {
      const sections = await c.get('db').all(
        'SELECT slug FROM help_sections ORDER BY position, id LIMIT 30'
      );
      urls.push(...sections.map((s) => `/help/s/${encodeURIComponent(s.slug)}`));
      const articles = await c.get('db').all(
        'SELECT slug FROM help_articles WHERE published = 1 ORDER BY pinned DESC, views DESC LIMIT 200'
      );
      urls.push(...articles.map((a) => `/help/a/${encodeURIComponent(a.slug)}`));
    } catch { /* fall back to the static list */ }

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

  // The store. Before rendering, a signed-in member's own unfinished payments
  // are re-checked against BTCPay and credited if they settled — so someone who
  // paid and simply came back to the site is upgraded here, without waiting on
  // a webhook that may be unconfigured, delayed or lost.
  const buyPage = async (c) => {
    const user = c.get('user');
    if (user) {
      await reconcileForUser(c, btcpayConfig(c.get('cfg')), user.id);
      // Same idea for direct-wallet orders: somebody who paid and simply came
      // back to the site is credited here, without waiting on anything else.
      await reconcileChainForUser(c, onchainConfig(c.get('cfg')), user.id)
        .catch((err) => console.error('chain reconcile failed on store page:', err));
    }
    return c.html(views.upgradePage(c.get('view'), {
      pay: paymentConfig(c.get('cfg'), await resolvePlans(c.get('db'), c.get('cfg'))),
    }));
  };
  app.get('/buy', buyPage);
  app.get('/upgrade', buyPage); // older links and the tier gates point here

  // Paid members only: anonymous visitors are sent to log in, and a signed-in
  // Free account gets a clear "upgrade" message — the artifact is never
  // served below that tier even by direct URL.
  app.get('/download/file', async (c) => {
    const gate = requireTier(c, 'paid');
    if (gate) return gate;

    const user = c.get('user');
    if (!isStaff(user)) {
      const verdict = await limits.check(c.get('db'), 'download', clientIp(c), c.get('cfg'));
      if (!verdict.ok) return tooMany(c, verdict.retryAfterSec);
    }

    const body = await loadInstaller(c.get('cfg'));
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
        // Generic binary type rather than hardcoding to one extension — the
        // actual file (and its extension) is whatever DOWNLOAD_URL serves,
        // named per installer.name below.
        'Content-Type': 'application/octet-stream',
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
 * Resolves the installer bytes from DOWNLOAD_URL — fetched here, server-side,
 * with its response body streamed straight back out through this Function.
 * The real URL is never put in front of the browser: not in the page HTML,
 * not in a client-side redirect's Location header, not in any script. The
 * client only ever sees the same-site, login-gated /download/file — that's
 * the whole obfuscation, and it's stronger than any client-side encoding of
 * the URL would be, since the value never leaves the server at all.
 *
 * No fallback: an unset DOWNLOAD_URL or a failed fetch returns null rather
 * than silently substituting a different file, so the route serves a clear
 * "unavailable" response instead of the wrong download.
 */
async function loadInstaller(cfg, fetcher = fetch) {
  const downloadUrl = String((cfg && cfg.DOWNLOAD_URL) || '').trim();
  if (!downloadUrl) return null;
  try {
    const upstream = await fetcher(downloadUrl);
    if (upstream.ok && upstream.body) return upstream.body;
    console.error('DOWNLOAD_URL fetch failed with status', upstream.status);
  } catch (err) {
    console.error('DOWNLOAD_URL fetch threw:', err);
  }
  return null;
}

export { register, siteStats, tooMany, safePath, paymentConfig, scrambledFilename, loadInstaller, DOWNLOAD_META };
