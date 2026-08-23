/**
 * Cloudflare Workers entry point.
 *
 * Static files under public/ are served by the Workers Static Assets binding
 * before this Worker runs, so only dynamic routes reach the app.
 */
import { createApp } from '../src/app.js';
import { createD1Adapter } from '../src/db/d1-adapter.js';
import { seed, cleanup } from '../src/db/bootstrap.js';

let appInstance = null;
let bootstrapped = null;

function getApp(env) {
  if (!appInstance) {
    appInstance = createApp({
      env,
      resolveDb: (c) => createD1Adapter(c.env.DB),
    });
  }
  return appInstance;
}

/**
 * Runs the schema and first-run seed once per isolate. `wrangler d1 execute
 * --file=src/db/schema.sql` is the intended way to provision, but doing it here
 * too means a fresh deployment works without a manual step.
 */
function ensureReady(env) {
  if (!bootstrapped) {
    bootstrapped = seed(createD1Adapter(env.DB), env).catch((err) => {
      bootstrapped = null; // let the next request retry
      throw err;
    });
  }
  return bootstrapped;
}

export default {
  async fetch(request, env, ctx) {
    // PBKDF2 cost is read from a global so src/crypto.js stays runtime-agnostic.
    globalThis.PBKDF2_ITERATIONS_OVERRIDE = env.PBKDF2_ITERATIONS;

    await ensureReady(env);
    return getApp(env).fetch(request, env, ctx);
  },

  /** Scheduled housekeeping — wire a cron trigger in wrangler.toml to enable. */
  async scheduled(event, env, ctx) {
    ctx.waitUntil(cleanup(createD1Adapter(env.DB)));
  },
};
