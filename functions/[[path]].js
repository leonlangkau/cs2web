/**
 * Cloudflare Pages Function: the whole GoyHub app behind one catch-all route.
 *
 * Pages serves everything in public/ as static assets first and only falls
 * through to this Function for paths that have no static file — so this handles
 * the dynamic routes (/, /forum, /auth, /admin, /download/file, …) while the
 * CSS, client JS and other static files come straight from the edge.
 *
 * No build step and no dependencies: this imports plain ES modules under
 * functions/_lib/, exactly as Five Star Repairs' Functions do, so the Pages Git
 * integration deploys it with default settings.
 */
import { createApp } from "./_lib/app.js";
import { createD1Adapter } from "./_lib/d1-adapter.js";
import { seed } from "./_lib/bootstrap.js";

let appInstance = null;
let bootstrapped = null;

export async function onRequest(context) {
  const { request, env } = context;

  // PBKDF2 cost is read from a global so the crypto module stays runtime-agnostic.
  globalThis.PBKDF2_ITERATIONS_OVERRIDE = env.PBKDF2_ITERATIONS;

  if (!env.DB) {
    return new Response(
      "GoyHub is not configured yet: bind a D1 database as DB (see DEPLOY.md).",
      { status: 503, headers: { "Content-Type": "text/plain" } }
    );
  }

  // Schema + first-run seed, once per isolate. On failure clear the latch so the
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

  return appInstance.fetch(request, env);
}
