/**
 * Cloudflare Pages Functions entry point.
 *
 * Only needed if you deploy this as a Pages project instead of a Worker — it is
 * the same Hono app with the same D1 binding, so both deployment styles run
 * identical code. Workers with Static Assets (see wrangler.toml) is the path
 * Cloudflare now recommends; this exists so you are not locked into that choice.
 */
import { createApp } from '../src/app.js';
import { createD1Adapter } from '../src/db/d1-adapter.js';
import { seed } from '../src/db/bootstrap.js';

let appInstance = null;
let bootstrapped = null;

export async function onRequest(context) {
  const { request, env } = context;

  globalThis.PBKDF2_ITERATIONS_OVERRIDE = env.PBKDF2_ITERATIONS;

  if (!bootstrapped) {
    bootstrapped = seed(createD1Adapter(env.DB), env).catch((err) => {
      bootstrapped = null;
      throw err;
    });
  }
  await bootstrapped;

  if (!appInstance) {
    appInstance = createApp({
      env,
      resolveDb: (c) => createD1Adapter(c.env.DB),
    });
  }

  return appInstance.fetch(request, env, context);
}
