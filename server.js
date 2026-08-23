'use strict';

/**
 * Node entry point — local development, the test suite, and self-hosting.
 *
 * The Cloudflare deployment uses worker/index.js instead; both mount the same
 * Hono app from src/app.js, so behaviour matches across runtimes.
 */

const path = require('node:path');
const { serve } = require('@hono/node-server');
const { serveStatic } = require('@hono/node-server/serve-static');

const { createApp } = require('./src/app');
const { createNodeAdapter } = require('./src/db/node-adapter');
const { seed, cleanup } = require('./src/db/bootstrap');

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';

/**
 * Builds the app against a local SQLite file. Exported so the test suite can
 * spin up an instance without starting a listener.
 */
async function buildServer({ dbPath = process.env.GOYHUB_DB, env = process.env } = {}) {
  globalThis.PBKDF2_ITERATIONS_OVERRIDE = env.PBKDF2_ITERATIONS;

  const db = createNodeAdapter(dbPath);
  const { generatedPassword } = await seed(db, env);

  const app = createApp({
    env,
    resolveDb: () => db,
    // On Cloudflare, Static Assets serves these before the Worker runs.
    staticMiddleware: serveStatic({ root: path.relative(process.cwd(), path.join(__dirname, 'public')) || './public' }),
  });

  return { app, db, generatedPassword };
}

async function main() {
  const { app, db, generatedPassword } = await buildServer();

  if (generatedPassword) {
    const line = '='.repeat(64);
    console.log(line);
    console.log('  First run: created admin account');
    console.log(`  Username: ${process.env.ADMIN_USERNAME || 'admin'}`);
    console.log(`  Password: ${generatedPassword}`);
    console.log('  (set ADMIN_USERNAME / ADMIN_PASSWORD to control this)');
    console.log('  Change the password after logging in. Shown only once.');
    console.log(line);
  }

  const timer = setInterval(() => {
    cleanup(db).catch((err) => console.error('housekeeping failed:', err));
  }, 15 * 60 * 1000);
  timer.unref();

  serve({ fetch: app.fetch, port: PORT, hostname: HOST }, (info) => {
    console.log(`GoyHub is live on http://${HOST}:${info.port}`);
  });
}

if (require.main === module) {
  main().catch((err) => {
    console.error('failed to start:', err);
    process.exit(1);
  });
}

module.exports = { buildServer };
