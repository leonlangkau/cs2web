/**
 * A populated site for exercising the UI skins: one app over an in-memory
 * database with an admin, a Paid member, a forum thread with a reply, a support
 * ticket and the seeded help centre — plus the list of pages worth rendering
 * for each of those visitors.
 *
 * Shared by tests/skins.test.mjs (class coverage, CSP, route parity), the
 * inventory CLI (tests/skin-inventory.mjs) and the dev server (tests/serve.mjs).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildTestApp } from "./harness.mjs";
import { makeClient, signUp } from "./client.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

export const SCENARIO_ENV = {
  ADMIN_USERNAME: "admin",
  ADMIN_PASSWORD: "admin-test-password-1",
  CAPTCHA_DIFFICULTY: "10",
  CAPTCHA_SECRET: "test-captcha-secret",
  PBKDF2_ITERATIONS: "10000",
  RATE_LIMIT_SIGNUP: "50",
  RATE_LIMIT_POST: "50",
  UI_SWITCHER: "1",
};

export const CREDENTIALS = {
  admin: { identifier: "admin", password: SCENARIO_ENV.ADMIN_PASSWORD },
  user: { identifier: "player_one", password: "supersecret1" },
};

/**
 * Builds the app and populates it. `env` overrides are merged over
 * SCENARIO_ENV (e.g. { UI_THEME: 'neon' }).
 */
export async function buildScenario(envOverrides = {}) {
  const env = { ...SCENARIO_ENV, ...envOverrides };
  const { app, db } = await buildTestApp(env);

  const anon = makeClient(app, env);
  const admin = makeClient(app, env);
  await admin.get("/auth/login");
  await admin.post("/auth/login", { ...CREDENTIALS.admin, next: "/" });

  const { client: user } = await signUp(app, env, "player_one");
  await db.run("UPDATE users SET tier = 'paid', email_verified_at = datetime('now') WHERE username = 'player_one'");
  await user.get("/"); // refresh the CSRF token after the tier change

  // Forum content: a thread by the member, a reply by the admin.
  await user.post("/forum/new", { category: "general", title: "Best crosshair settings for 2026?", body: "Sharing my current config — what are you all running?" });
  const thread = await db.get("SELECT id FROM threads ORDER BY id DESC LIMIT 1");
  const threadId = thread ? thread.id : 1;
  await admin.get(`/forum/t/${threadId}`);
  await admin.post(`/forum/t/${threadId}/reply`, { body: "Classic static green, gap -3, size 2. Try it." });
  const post = await db.get("SELECT id FROM posts WHERE user_id = (SELECT id FROM users WHERE username = 'player_one') ORDER BY id DESC LIMIT 1");
  const postId = post ? post.id : 1;
  await user.post("/forum/shoutbox", { body: "gg wp" }, { "X-Requested-With": "fetch" });

  // A support ticket from the member, answered by staff.
  await user.get("/support/new");
  const ticketRes = await user.post("/support/new", {
    subject: "Loader closes right after sign-in",
    body: "The loader window disappears a second after I sign in. Windows 11, latest build.",
    category: "app",
  });
  const ticketLocation = ticketRes.headers.get("location") || "";
  const ticket = await db.get("SELECT id, ref FROM tickets ORDER BY id DESC LIMIT 1");
  const ticketRef = ticket ? ticket.ref : (ticketLocation.split("/").pop() || "GH-0000");
  const ticketId = ticket ? ticket.id : 1;
  const article = await db.get("SELECT id, slug FROM help_articles ORDER BY id LIMIT 1");
  const section = await db.get("SELECT slug FROM help_sections ORDER BY position LIMIT 1");

  const pages = [
    // Visitor
    { as: "anon", path: "/" },
    { as: "anon", path: "/auth/login" },
    { as: "anon", path: "/auth/signup" },
    { as: "anon", path: "/auth/forgot" },
    { as: "anon", path: "/faq" },
    { as: "anon", path: "/changelog" },
    { as: "anon", path: "/terms" },
    { as: "anon", path: "/privacy" },
    { as: "anon", path: "/help" },
    { as: "anon", path: `/help/s/${section ? section.slug : "getting-started"}` },
    { as: "anon", path: `/help/a/${article ? article.slug : "install-goyhub"}` },
    { as: "anon", path: "/help?q=install" },
    { as: "anon", path: "/support/new" },
    { as: "anon", path: "/support/lookup" },
    { as: "anon", path: "/status" },
    { as: "anon", path: "/upgrade" },
    { as: "anon", path: "/buy" },
    { as: "anon", path: "/download" },
    { as: "anon", path: "/forum" },
    { as: "anon", path: "/this-page-does-not-exist" },
    // Paid member
    { as: "user", path: "/" },
    { as: "user", path: "/profile" },
    { as: "user", path: "/forum" },
    { as: "user", path: "/forum/c/general" },
    { as: "user", path: `/forum/t/${threadId}` },
    { as: "user", path: "/forum/new" },
    { as: "user", path: "/forum/search?q=crosshair" },
    { as: "user", path: `/forum/posts/${postId}/edit` },
    { as: "user", path: "/u/player_one" },
    { as: "user", path: "/support" },
    { as: "user", path: "/support/mine" },
    { as: "user", path: `/support/t/${ticketRef}` },
    { as: "user", path: "/download" },
    { as: "user", path: "/upgrade" },
    { as: "user", path: "/status" },
    // Staff
    { as: "admin", path: "/admin" },
    { as: "admin", path: "/admin/users" },
    { as: "admin", path: "/admin/logs" },
    { as: "admin", path: "/admin/forum" },
    { as: "admin", path: "/admin/reports" },
    { as: "admin", path: "/admin/shop" },
    { as: "admin", path: "/admin/payments" },
    { as: "admin", path: "/admin/crypto" },
    { as: "admin", path: "/admin/fingerprints" },
    { as: "admin", path: "/admin/status" },
    { as: "admin", path: "/admin/support" },
    { as: "admin", path: `/admin/support/${ticketId}` },
    { as: "admin", path: "/admin/support/articles" },
    { as: "admin", path: "/admin/support/articles/new" },
    { as: "admin", path: `/admin/support/articles/${article ? article.id : 1}` },
    { as: "admin", path: "/admin/support/macros" },
    { as: "admin", path: "/profile" },
  ];

  return { app, db, env, clients: { anon, user, admin }, pages, ids: { threadId, postId, ticketRef, ticketId } };
}

/** Renders every scenario page under one skin: [{ as, path, status, html }]. */
export async function renderPages(scenario, skin) {
  const out = [];
  for (const { as, path: p } of scenario.pages) {
    const client = scenario.clients[as];
    const sep = p.includes("?") ? "&" : "?";
    const res = await client.get(`${p}${sep}ui=${skin}`);
    const type = res.headers.get("content-type") || "";
    const html = type.includes("text/html") ? await res.text() : "";
    out.push({ as, path: p, status: res.status, html });
  }
  return out;
}

const CLASS_ATTR = /class="([^"]*)"/g;
/** A real class token — filters the fragments string concatenation leaves behind. */
const VALID_CLASS = /^-?[_a-zA-Z][\w-]*[\w]$|^[_a-zA-Z]$/;

/** Every class name used in a blob of HTML. */
export function classesInHtml(html) {
  const found = new Set();
  for (const m of html.matchAll(CLASS_ATTR)) {
    for (const cls of m[1].split(/\s+/)) if (cls && VALID_CLASS.test(cls)) found.add(cls);
  }
  return found;
}

/**
 * Class names the behaviour scripts create at runtime (live chat rows, status
 * widgets, CAPTCHA state, download toast…). These never appear in server HTML
 * but every skin has to style them.
 */
export function classesInScripts(files = ["main.js", "captcha.js", "status.js", "support.js", "crypto-pay.js", "fingerprint.js"]) {
  const found = new Set();
  const patterns = [
    /class="([^"]*)"/g,
    /class='([^']*)'/g,
    /className\s*=\s*'([^']*)'/g,
    /className\s*=\s*"([^"]*)"/g,
    /classList\.(?:add|toggle|remove)\('([^']*)'/g,
    /classList\.(?:add|toggle|remove)\("([^"]*)"/g,
  ];
  for (const name of files) {
    const file = path.join(ROOT, "public", "js", name);
    if (!fs.existsSync(file)) continue;
    const src = fs.readFileSync(file, "utf8");
    for (const rx of patterns) {
      for (const m of src.matchAll(rx)) {
        for (const cls of m[1].split(/\s+/)) if (cls && VALID_CLASS.test(cls)) found.add(cls);
      }
    }
  }
  // Runtime state classes toggled by string concatenation in those files.
  for (const cls of ["visible", "flash-out", "is-busy", "is-done", "is-swapping", "out", "open", "active", "hidden"]) found.add(cls);
  return found;
}

/** Every `.class` selector token in a stylesheet (comments and strings stripped). */
export function classesInCss(css) {
  const stripped = css
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/url\([^)]*\)/g, "url()")
    .replace(/"(?:[^"\\]|\\.)*"/g, '""')
    .replace(/'(?:[^'\\]|\\.)*'/g, "''");
  const found = new Set();
  for (const m of stripped.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)) found.add(m[1]);
  return found;
}

/** The stylesheets a skin serves site-wide, concatenated (missing files -> ""). */
export function skinCss(skin) {
  const files = [`skin-${skin}.css`, `ui-${skin}.css`].map((n) => path.join(ROOT, "public", "css", n));
  return files.map((f) => (fs.existsSync(f) ? fs.readFileSync(f, "utf8") : "")).join("\n");
}

/**
 * Coverage report for one skin: which classes the rendered pages and the
 * behaviour scripts use that neither of the skin's stylesheets mentions.
 */
export function coverage(rendered, skin) {
  const required = classesInScripts();
  for (const page of rendered) for (const cls of classesInHtml(page.html)) required.add(cls);
  const styled = classesInCss(skinCss(skin));
  const missing = [...required].filter((cls) => !styled.has(cls)).sort();
  return { required: [...required].sort(), styled, missing };
}
