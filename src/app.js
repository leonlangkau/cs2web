'use strict';

const path = require('node:path');
const express = require('express');
const cookieParser = require('cookie-parser');

const { db, cleanupSessions } = require('./db');
const { pruneAll } = require('./limits');
const { securityHeaders, loadSession, csrfProtection, flash } = require('./middleware');
const mainRoutes = require('./routes/main');
const authRoutes = require('./routes/auth');
const forumRoutes = require('./routes/forum');
const adminRoutes = require('./routes/admin');

/** Windowed page list for pagination: [1, '…', 5, 6, 7, '…', 42]. */
function pageWindow(page, pages) {
  if (pages <= 9) return Array.from({ length: pages }, (_, i) => i + 1);
  const keep = [...new Set([1, 2, page - 1, page, page + 1, pages - 1, pages])]
    .filter((p) => p >= 1 && p <= pages)
    .sort((a, b) => a - b);
  const out = [];
  let prev = 0;
  for (const p of keep) {
    if (p - prev > 1) out.push('…');
    out.push(p);
    prev = p;
  }
  return out;
}

/** Formats an SQLite UTC timestamp as a short relative-time string. */
function timeAgo(sqliteUtc) {
  if (!sqliteUtc) return 'never';
  const then = new Date(String(sqliteUtc).replace(' ', 'T') + 'Z').getTime();
  if (Number.isNaN(then)) return String(sqliteUtc);
  const s = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.floor(mo / 12)}y ago`;
}

function createApp() {
  const app = express();

  app.disable('x-powered-by');
  // Only trust proxy-supplied client IPs when explicitly configured for a reverse proxy.
  if (process.env.TRUST_PROXY) {
    app.set('trust proxy', process.env.TRUST_PROXY === 'true' ? 1 : process.env.TRUST_PROXY);
  }

  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, '..', 'views'));

  app.locals.timeAgo = timeAgo;
  app.locals.pageWindow = pageWindow;
  app.locals.appName = 'GoyHub';
  app.locals.appVersion = require('../package.json').version;
  app.locals.company = require('./config/company');
  // Defaults so views (incl. the error page) render even when an error occurs
  // before the session/flash/CSRF middleware populated res.locals.
  app.locals.user = null;
  app.locals.flash = null;
  app.locals.csrfToken = '';
  app.locals.path = '';

  app.use(securityHeaders);
  app.use(express.static(path.join(__dirname, '..', 'public'), { maxAge: '1h' }));
  // 256kb: a 10,000-char post is legitimate content but can URL-encode to ~90kb+ for CJK/emoji.
  app.use(express.urlencoded({ extended: false, limit: '256kb' }));
  app.use(cookieParser());
  app.use(flash);
  app.use(loadSession);
  app.use(csrfProtection);

  app.use('/', mainRoutes);
  app.use('/auth', authRoutes);
  app.use('/forum', forumRoutes);
  app.use('/admin', adminRoutes);

  // 404
  app.use((req, res) => {
    res.status(404).render('error', { title: 'Not found', code: 404, message: 'This page does not exist.' });
  });

  // Error handler: preserve client-error statuses (413 payload too large, 400 bad
  // body, …) and never leak a stack trace, even if the error page itself fails.
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    const status = Number(err && (err.status || err.statusCode));
    const code = status >= 400 && status < 600 ? status : 500;
    if (code >= 500) console.error('Unhandled error:', err);
    if (res.headersSent) return;
    const messages = {
      400: 'That request could not be understood. Go back and try again.',
      413: 'Request too large. Trim it down and try again.',
    };
    const payload = {
      title: code >= 500 ? 'Server error' : 'Request failed',
      code,
      message: messages[code] || (code >= 500
        ? 'Something went wrong on our side. Try again in a moment.'
        : 'The request could not be completed.'),
    };
    res.status(code).render('error', payload, (renderErr, html) => {
      if (renderErr) {
        console.error('Error page failed to render:', renderErr.message);
        res.type('text/plain').send(`${payload.code} — ${payload.message}`);
      } else {
        res.send(html);
      }
    });
  });

  // Periodic housekeeping.
  const timer = setInterval(() => {
    try { cleanupSessions(); } catch (err) { console.error('session cleanup failed:', err); }
    try { pruneAll(); } catch (err) { console.error('limiter prune failed:', err); }
  }, 15 * 60 * 1000);
  timer.unref();

  return app;
}

module.exports = { createApp, db };
