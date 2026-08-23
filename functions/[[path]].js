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
    const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>GoyHub — setup</title>
<style>body{font-family:"Segoe UI",system-ui,sans-serif;background:#f4f7fc;color:#0a1226;
display:flex;min-height:100vh;margin:0;align-items:center;justify-content:center;padding:1.5rem}
.card{background:#fff;border:1px solid #dde5f2;border-radius:14px;padding:2.2rem;max-width:540px;
box-shadow:0 12px 32px rgba(10,18,38,.08)}h1{color:#0137b7;margin:0 0 .6rem}code{background:#eef3fb;
padding:.15rem .4rem;border-radius:5px;font-size:.9em}ol{line-height:1.7;color:#263149}</style></head>
<body><div class="card"><h1>Almost there</h1>
<p>GoyHub deployed successfully, but its database isn't connected yet.</p>
<ol>
<li>Create it: <code>npx wrangler d1 create goyhub</code></li>
<li>Load the schema: <code>npx wrangler d1 execute goyhub --remote --file=schema.sql</code></li>
<li>In Pages → Settings → Bindings, add a D1 binding named <code>DB</code> → the <code>goyhub</code> database, then redeploy.</li>
</ol>
<p>Also set the <code>CAPTCHA_SECRET</code> and <code>ADMIN_PASSWORD</code> secrets. Full guide in DEPLOY.md.</p>
</div></body></html>`;
    return new Response(html, { status: 503, headers: { "Content-Type": "text/html; charset=UTF-8" } });
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
