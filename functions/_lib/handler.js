/**
 * Shared Pages Function handler.
 *
 * functions/index.js (the homepage) and functions/[[path]].js (everything else)
 * both delegate here, so the whole app has one implementation. A dedicated
 * index.js is used for "/" because a specific route file is guaranteed to run;
 * relying on the catch-all alone left the bare root unserved in production.
 */
import { createApp } from "./app.js";
import { createD1Adapter } from "./d1-adapter.js";
import { seed } from "./bootstrap.js";

let appInstance = null;
let bootstrapped = null;

function setupPage() {
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
<li>Create a D1 database named <code>goyhub</code>.</li>
<li>Bind it to this Pages project as <code>DB</code> (Settings → Bindings), or paste its id into <code>wrangler.toml</code>.</li>
<li>Set the <code>CAPTCHA_SECRET</code> and <code>ADMIN_PASSWORD</code> secrets, then redeploy.</li>
</ol>
<p>Full guide in DEPLOY.md. Tables and starter content are created automatically once the database is connected.</p>
</div></body></html>`;
  return new Response(html, { status: 503, headers: { "Content-Type": "text/html; charset=UTF-8" } });
}

export async function handle(context) {
  const { request, env } = context;

  // PBKDF2 cost is read from a global so the crypto module stays runtime-agnostic.
  globalThis.PBKDF2_ITERATIONS_OVERRIDE = env.PBKDF2_ITERATIONS;

  if (!env.DB) return setupPage();

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
    appInstance = createApp({ env, resolveDb: (c) => createD1Adapter(c.env.DB) });
  }

  return appInstance.fetch(request, env);
}
