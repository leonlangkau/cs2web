'use strict';

const { Hono } = require('hono');
const { bodyLimit } = require('hono/body-limit');

const {
  securityHeaders, loadContext, csrfProtection, termsGate,
} = require('./middleware');
const { errorPage } = require('./views/site');
const { createCompany } = require('./config/company');

const mainRoutes = require('./routes/main');
const authRoutes = require('./routes/auth');
const forumRoutes = require('./routes/forum');
const adminRoutes = require('./routes/admin');

const APP_VERSION = '1.0.0';

/** Minimal context for error pages rendered before loadContext ran. */
function fallbackView() {
  return {
    user: null, path: '/', flash: null, csrfToken: '',
    needsTermsGate: false, termsVersion: '', company: createCompany({}),
    appName: 'GoyHub', appVersion: APP_VERSION,
  };
}

/**
 * Builds the Hono app. Runtime-specific pieces are injected:
 *   resolveDb(c)        -> the database adapter for this request
 *   staticMiddleware    -> optional; Workers serves assets before the Worker runs
 */
function createApp({ resolveDb, staticMiddleware, env = {} } = {}) {
  const app = new Hono();

  app.use('*', securityHeaders);

  if (staticMiddleware) app.use('*', staticMiddleware);

  // 256kb: a 10,000-character post is legitimate content but can URL-encode to
  // ~90kb+ for CJK or emoji.
  app.use('*', bodyLimit({
    maxSize: 256 * 1024,
    onError: (c) => c.html(errorPage(c.get('view') || fallbackView(), {
      code: 413, title: 'Request failed', message: 'Request too large. Trim it down and try again.',
    }), 413),
  }));

  app.use('*', async (c, next) => {
    c.set('appVersion', APP_VERSION);
    // One place to read config from: Workers bindings/vars, or process.env on Node.
    const cfg = typeof env === 'function' ? env(c) : env;
    c.set('cfg', cfg);
    c.set('company', createCompany(cfg));
    c.set('db', await resolveDb(c));
    await next();
  });

  app.use('*', loadContext);
  app.use('*', csrfProtection);
  app.use('*', termsGate);

  mainRoutes.register(app);
  authRoutes.register(app);
  forumRoutes.register(app);
  adminRoutes.register(app);

  app.notFound((c) => c.html(errorPage(c.get('view') || fallbackView(), {
    code: 404, title: 'Not found', message: 'This page does not exist.',
  }), 404));

  app.onError((err, c) => {
    const status = Number(err && (err.status || err.statusCode));
    const code = status >= 400 && status < 600 ? status : 500;
    if (code >= 500) console.error('Unhandled error:', err);
    const messages = {
      400: 'That request could not be understood. Go back and try again.',
      413: 'Request too large. Trim it down and try again.',
    };
    try {
      return c.html(errorPage(c.get('view') || fallbackView(), {
        code,
        title: code >= 500 ? 'Server error' : 'Request failed',
        message: messages[code] || (code >= 500
          ? 'Something went wrong on our side. Try again in a moment.'
          : 'The request could not be completed.'),
      }), code);
    } catch {
      // Never let the error page itself leak a stack trace.
      return c.text(`${code} — request failed`, code);
    }
  });

  return app;
}

module.exports = { createApp, APP_VERSION };
