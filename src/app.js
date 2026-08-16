'use strict';

const path = require('node:path');
const express = require('express');
const cookieParser = require('cookie-parser');

const { db, cleanupSessions } = require('./db');
const { securityHeaders, loadSession, csrfProtection, flash } = require('./middleware');
const mainRoutes = require('./routes/main');
const authRoutes = require('./routes/auth');
const forumRoutes = require('./routes/forum');
const adminRoutes = require('./routes/admin');

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
  app.locals.appName = 'GoyHub';
  app.locals.appVersion = require('../package.json').version;

  app.use(securityHeaders);
  app.use(express.static(path.join(__dirname, '..', 'public'), { maxAge: '1h' }));
  app.use(express.urlencoded({ extended: false, limit: '64kb' }));
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

  // 500
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    if (res.headersSent) return;
    res.status(500).render('error', {
      title: 'Server error', code: 500, message: 'Something went wrong on our side. Try again in a moment.',
    });
  });

  // Periodic housekeeping.
  const timer = setInterval(() => {
    try { cleanupSessions(); } catch (err) { console.error('session cleanup failed:', err); }
  }, 15 * 60 * 1000);
  timer.unref();

  return app;
}

module.exports = { createApp, db };
