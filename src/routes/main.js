'use strict';

const views = require('../views/site');
const legalViews = require('../views/legal');
const installer = require('../installer-data');
const captcha = require('../captcha');
const limits = require('../limits');
const { DELETED_USERNAME } = require('../db/bootstrap');
const {
  audit, clientIp, requireAuth, acceptTerms, formBody, setFlash, TERMS_VERSION,
} = require('../middleware');

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
    const recentThreads = await db.all(
      `SELECT t.id, t.title, t.updated_at, c.name AS category, u.username
       FROM threads t JOIN categories c ON c.id = t.category_id JOIN users u ON u.id = t.user_id
       ORDER BY t.updated_at DESC LIMIT 4`
    );
    return c.html(views.home(c.get('view'), {
      stats: await siteStats(db),
      recentThreads,
      downloadMeta: DOWNLOAD_META,
    }));
  });

  app.get('/terms', (c) => c.html(legalViews.terms(c.get('view'))));
  app.get('/privacy', (c) => c.html(legalViews.privacy(c.get('view'))));

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

  // Members only: anonymous visitors are redirected to login, so the artifact is
  // never served without an account even by direct URL.
  app.get('/download/file', async (c) => {
    const gate = requireAuth(c);
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

    await audit(c, 'download', { userId: user.id, username: user.username, detail: installer.name });
    return new Response(body, {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${installer.name}"`,
        'Cache-Control': 'no-store',
      },
    });
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

module.exports = { register, siteStats, tooMany, safePath, DOWNLOAD_META };
