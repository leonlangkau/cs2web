/**
 * Cloudflare Pages Functions entry — SOURCE.
 *
 * This file is not deployed directly. scripts/build-functions.js bundles it
 * (with Hono and every src/ module inlined) into functions/[[path]].js, which
 * IS committed. That makes the Pages Git integration work even when no build
 * command is configured on the project: Pages skips npm install in that case,
 * so the deployed Function must not contain any bare imports to resolve.
 */
import { createApp } from './app.js';
import { createD1Adapter } from './db/d1-adapter.js';
import { seed } from './db/bootstrap.js';

let appInstance = null;
let bootstrapped = null;

export async function onRequest(context) {
  const { request, env } = context;

  // PBKDF2 cost is read from a global so src/crypto.js stays runtime-agnostic.
  globalThis.PBKDF2_ITERATIONS_OVERRIDE = env.PBKDF2_ITERATIONS;

  // Schema + first-run seed, once per isolate. Failures clear the latch so the
  // next request retries instead of caching a broken state.
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
