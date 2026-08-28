/**
 * End-to-end smoke test. Drives the real app.fetch (router + middleware + views)
 * over an in-memory database, so it covers the same code Cloudflare runs.
 *
 * Run: npm test   (node --test)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { buildTestApp, createNodeAdapter } from "./harness.mjs";
import { leadingZeroBits } from "../functions/_lib/captcha.js";
import { seed } from "../functions/_lib/bootstrap.js";
import { verifyPassword, hashPassword } from "../functions/_lib/crypto.js";
import { verifyLicense } from "../functions/_lib/license.js";
import { verifyWebhookSignature, extendPaidUntil, btcpayConfig } from "../functions/_lib/btcpay.js";
import { verifyTurnstile } from "../functions/_lib/turnstile.js";
import { scrambledFilename, loadInstaller } from "../functions/_lib/routes-main.js";
import { DEFAULTS as RATE_LIMIT_DEFAULTS } from "../functions/_lib/limits.js";
import { smtpConversation, buildMessage } from "../functions/_lib/smtp.js";
import { isEmailConfigured } from "../functions/_lib/email.js";
import buildSchema from "../scripts/build-schema.cjs";
import buildInstaller from "../scripts/build-installer.cjs";
import buildAssets from "../scripts/build-assets.cjs";

const schemaInSync = buildSchema.isInSync;
const installerInSync = buildInstaller.isInSync;
const assetsInSync = buildAssets.isInSync;

const ENV = {
  ADMIN_USERNAME: "admin",
  ADMIN_PASSWORD: "admin-test-password-1",
  CAPTCHA_DIFFICULTY: "10",
  CAPTCHA_SECRET: "test-captcha-secret",
  PBKDF2_ITERATIONS: "10000",
  RATE_LIMIT_SIGNUP: "50",
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Cookie-jar client over app.fetch. */
function makeClient(app) {
  const jar = new Map();
  const store = (res) => {
    for (const line of res.headers.getSetCookie()) {
      const [pair] = line.split(";");
      const i = pair.indexOf("=");
      const k = pair.slice(0, i).trim();
      const v = pair.slice(i + 1).trim();
      if (v === "") jar.delete(k); else jar.set(k, v);
    }
  };
  const cookieHeader = () => [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
  const req = async (method, path, body, extraHeaders = {}) => {
    const headers = { cookie: cookieHeader(), ...extraHeaders };
    let payload;
    if (body) {
      headers["content-type"] = "application/x-www-form-urlencoded";
      payload = new URLSearchParams(body).toString();
      headers["content-length"] = String(Buffer.byteLength(payload));
    }
    const res = await app.fetch(new Request("http://local" + path, { method, headers, body: payload }), ENV);
    store(res);
    return res;
  };
  return {
    jar,
    get: (p, extraHeaders) => req("GET", p, undefined, extraHeaders),
    post: (p, b = {}, extraHeaders) => req("POST", p, { _csrf: jar.get("ghcsrf") || "", ...b }, extraHeaders),
    raw: (m, p, b, extraHeaders) => req(m, p, b, extraHeaders),
  };
}

async function solveCaptcha(client) {
  const challenge = await (await client.get("/captcha/challenge")).json();
  let counter = 0;
  for (;;) {
    const digest = crypto.createHash("sha256").update(`${challenge.nonce}:${counter}`).digest("hex");
    if (leadingZeroBits(digest) >= challenge.difficulty) break;
    counter += 1;
  }
  await sleep(850);
  return { captcha_token: challenge.token, captcha_solution: String(counter) };
}

test("build artifacts are in sync with their sources", () => {
  assert.ok(schemaInSync(), "functions/_lib/schema-sql.js is stale — run npm run build");
  assert.ok(installerInSync(), "functions/_lib/installer-data.js is stale — run npm run build");
  assert.ok(assetsInSync(), "functions/_lib/asset-manifest.js is stale — run npm run build");
});

test("admin password stays in sync with the ADMIN_PASSWORD secret across reboots", async () => {
  globalThis.PBKDF2_ITERATIONS_OVERRIDE = "10000";
  const db = createNodeAdapter(":memory:");

  // First boot: no admin yet, ADMIN_PASSWORD wasn't set (the operator's exact
  // mistake — the site got hit once before the secret was configured).
  await seed(db, {});
  let admin = await db.get("SELECT id, password_hash FROM users WHERE role = 'admin'");
  assert.ok(admin, "admin created on first boot even without ADMIN_PASSWORD");
  const generatedHash = admin.password_hash;

  // Operator sets ADMIN_PASSWORD afterward and a fresh isolate boots (or a
  // redeploy happens) — the secret must now win, not the old generated one.
  await seed(db, { ADMIN_PASSWORD: "first-real-password-1" });
  admin = await db.get("SELECT id, password_hash FROM users WHERE role = 'admin'");
  assert.notEqual(admin.password_hash, generatedHash, "generated password replaced by the secret");
  assert.ok(await verifyPassword("first-real-password-1", admin.password_hash), "logs in with the secret's password");

  // Operator rotates the secret; the next boot must pick it up too, and the
  // old password must stop working.
  await seed(db, { ADMIN_PASSWORD: "rotated-password-2" });
  admin = await db.get("SELECT id, password_hash FROM users WHERE role = 'admin'");
  assert.ok(await verifyPassword("rotated-password-2", admin.password_hash), "logs in with the rotated secret");
  assert.ok(!(await verifyPassword("first-real-password-1", admin.password_hash)), "old password no longer works");

  // Re-running seed with the same secret again (every request's boot check)
  // must be a no-op — no needless re-hash/write.
  const before = admin.password_hash;
  await seed(db, { ADMIN_PASSWORD: "rotated-password-2" });
  admin = await db.get("SELECT id, password_hash FROM users WHERE role = 'admin'");
  assert.equal(admin.password_hash, before, "unchanged password is not rewritten");

  // Break-glass: even if the seeded account's tier/role/banned flags drift
  // (bad manual SQL, a bug, a hostile co-admin), the next boot restores full
  // admin access for it while ADMIN_PASSWORD is set.
  await db.run("UPDATE users SET tier = 'user', banned = 1 WHERE id = ?", admin.id);
  await seed(db, { ADMIN_PASSWORD: "rotated-password-2" });
  const restored = await db.get("SELECT tier, role, banned FROM users WHERE id = ?", admin.id);
  assert.deepEqual({ tier: restored.tier, role: restored.role, banned: restored.banned },
    { tier: "admin", role: "admin", banned: 0 }, "seeded admin tier/ban state restored on boot");
});

test("public pages, forum, legal, gate, auth, captcha, admin, moderation, download", async () => {
  const { app, db } = await buildTestApp(ENV);
  const anon = makeClient(app);
  const user = makeClient(app);
  const admin = makeClient(app);

  let res = await anon.get("/");
  let html = await res.text();
  assert.equal(res.status, 200);
  assert.ok(html.includes("Dominate every match.") && html.includes("hero-canvas"), "landing renders");
  assert.ok(String(res.headers.get("content-security-policy")).includes("default-src 'self'"), "CSP header");

  // The forum is a Paid-tier benefit — anonymous visitors are gated out
  // entirely rather than being able to browse it read-only.
  res = await anon.get("/forum");
  assert.ok(res.status === 302 && res.headers.get("location").startsWith("/auth/login"), "anon forum access gated");
  assert.ok(await db.get("SELECT id FROM categories WHERE slug = 'announcements'")
    && await db.get("SELECT id FROM categories WHERE slug = 'general'"), "seeded categories exist");
  assert.ok(await db.get("SELECT id FROM threads WHERE title LIKE 'Welcome to the GoyHub%'"), "seeded welcome thread exists");

  assert.equal((await anon.get("/nope/nothing")).status, 404, "unknown route 404s");

  // Legal
  res = await anon.get("/terms");
  html = await res.text();
  assert.ok(html.includes("Autonomous Island of Anjouan") && html.includes("No tampering, cloning or copying")
    && html.includes("Binding arbitration"), "terms content");
  assert.ok(["s1", "s6", "s17", "s20"].every((id) => html.includes(`href="#${id}"`) && html.includes(`id="${id}"`)),
    "terms TOC matches anchors");
  assert.ok(!html.includes("&amp;amp;"), "no double-escaped entities");

  res = await anon.get("/privacy");
  html = await res.text();
  assert.ok(html.includes("ghsession") && html.includes("PBKDF2"), "privacy content");

  // Terms gate
  const visitor = makeClient(app);
  html = await (await visitor.get("/")).text();
  assert.ok(html.includes('class="terms-gate"') && html.includes("I accept"), "gate shows first visit");
  html = await (await visitor.get("/terms")).text();
  assert.ok(!html.includes('class="terms-gate"'), "terms page exempt from gate");
  res = await visitor.post("/legal/accept", { next: "/forum" });
  assert.equal(res.status, 302);
  assert.equal(res.headers.get("location"), "/forum");
  assert.ok(visitor.jar.get("ghterms"), "terms cookie set");
  assert.ok(await db.get("SELECT id FROM ip_logs WHERE event = 'terms_accepted'"), "acceptance logged");
  html = await (await visitor.get("/")).text();
  assert.ok(!html.includes('class="terms-gate"'), "gate gone after accepting");

  const redir = makeClient(app);
  await redir.get("/");
  res = await redir.post("/legal/accept", { next: "//evil.example" });
  assert.equal(res.headers.get("location"), "/", "accept redirect same-site only");

  // CSRF
  res = await anon.raw("POST", "/auth/signup", { username: "x", email: "c@x.com", password: "password123", confirm: "password123" });
  assert.equal(res.status, 403, "POST without CSRF token rejected");

  // Signup + CAPTCHA
  await user.get("/auth/signup");
  res = await user.post("/auth/signup", { username: "ab", email: "bad", password: "short", confirm: "no", ...(await solveCaptcha(user)) });
  assert.equal(res.status, 400, "invalid signup rejected");

  res = await user.post("/auth/signup", { username: "nocaptcha", email: "nc@example.com", password: "supersecret1", confirm: "supersecret1" });
  html = await res.text();
  assert.ok(res.status === 400 && html.includes("Human verification failed"), "signup needs captcha");
  assert.ok(await db.get("SELECT id FROM ip_logs WHERE event = 'captcha_failed'"), "captcha failure logged");

  const hp = await solveCaptcha(user);
  res = await user.post("/auth/signup", { username: "trapped", email: "t@example.com", password: "supersecret1", confirm: "supersecret1", website: "http://spam", ...hp });
  assert.equal(res.status, 400, "honeypot rejected");
  assert.ok(!(await db.get("SELECT id FROM users WHERE username = 'trapped'")), "honeypot made no account");

  const good = await solveCaptcha(user);
  res = await user.post("/auth/signup", { username: "player_one", email: "player1@example.com", password: "supersecret1", confirm: "supersecret1", ...good });
  assert.ok(res.status === 302 && user.jar.has("ghsession"), "valid signup");
  // The forum is Paid-tier+. There's no real payment flow yet, so upgrading
  // here simulates an admin having granted it — same as production requires
  // — letting the rest of this test exercise real forum logic rather than
  // being stopped by the tier gate at every turn.
  await db.run("UPDATE users SET tier = 'paid' WHERE username = 'player_one'");

  const replay = makeClient(app);
  await replay.get("/auth/signup");
  res = await replay.post("/auth/signup", { username: "replay", email: "r@example.com", password: "supersecret1", confirm: "supersecret1", ...good });
  assert.ok(res.status === 400 && !(await db.get("SELECT id FROM users WHERE username = 'replay'")), "replayed captcha rejected");

  const u = await db.get("SELECT * FROM users WHERE username = 'player_one'");
  assert.ok(u.password_hash.startsWith("pbkdf2$") && !u.password_hash.includes("supersecret1"), "PBKDF2 hash");
  assert.ok(u.signup_ip, "signup IP stored");

  // Now confirm the forum actually renders for a Paid member.
  html = await (await user.get("/forum")).text();
  assert.ok(html.includes("Announcements") && html.includes("General Discussion"), "forum renders for a paid member");
  html = await (await user.get("/forum/t/1")).text();
  assert.ok(html.includes("Welcome to the GoyHub community forum!"), "seeded welcome thread renders");

  // Forum posting with XSS escaping
  res = await user.post("/forum/new", { category: "general", title: "My first thread", body: "Hi <script>alert(1)</script>" });
  const loc = res.headers.get("location");
  assert.ok(res.status === 302 && /^\/forum\/t\/\d+$/.test(loc), "thread created");
  html = await (await user.get(loc)).text();
  assert.ok(html.includes("&lt;script&gt;") && !html.includes("<script>alert(1)"), "post body escaped");
  res = await user.post(`${loc}/reply`, { body: "Replying to myself" });
  assert.ok(res.status === 302 && res.headers.get("location").includes("#post-"), "reply posted");

  // Auth edge cases
  res = await anon.get("/forum/new");
  assert.ok(res.status === 302 && res.headers.get("location").startsWith("/auth/login"), "new-thread requires login");
  await anon.get("/auth/login");
  res = await anon.post("/auth/login", { identifier: "player_one", password: "wrong", next: "/" });
  assert.equal(res.status, 401, "wrong password 401");
  assert.ok(await db.get("SELECT id FROM ip_logs WHERE event = 'login_failed'"), "failed login logged");
  res = await anon.post("/auth/login", { identifier: "player_one", password: "supersecret1", next: "//evil" });
  assert.ok(res.status === 302 && res.headers.get("location") === "/", "open redirect neutralized");

  // Admin gating + moderation
  assert.equal((await user.get("/admin")).status, 404, "admin hidden from users");
  await admin.get("/auth/login");
  res = await admin.post("/auth/login", { identifier: "admin", password: "admin-test-password-1", next: "/admin" });
  assert.ok(res.status === 302 && res.headers.get("location") === "/admin", "admin login");
  html = await (await admin.get("/admin")).text();
  assert.ok(html.includes("Failed logins (24h)") && html.includes("Active sessions"), "admin dashboard");
  html = await (await admin.get("/admin/logs?event=signup")).text();
  assert.ok(html.includes("player_one"), "IP log viewer");

  const threadId = loc.split("/").pop();
  await admin.post(`/admin/threads/${threadId}/lock`);
  const before = Number((await db.get("SELECT COUNT(*) AS n FROM posts WHERE thread_id = ?", threadId)).n);
  await user.post(`${loc}/reply`, { body: "blocked" });
  const after = Number((await db.get("SELECT COUNT(*) AS n FROM posts WHERE thread_id = ?", threadId)).n);
  assert.equal(after, before, "locked thread rejects replies");
  await admin.post(`/admin/threads/${threadId}/lock`);

  const target = await db.get("SELECT id FROM users WHERE username = 'player_one'");
  await admin.post(`/admin/users/${target.id}/ban`);
  html = await (await user.get("/")).text();
  assert.ok(!html.includes("nav-user") && !user.jar.has("ghsession"), "banned user signed out");
  await user.get("/auth/login");
  assert.equal((await user.post("/auth/login", { identifier: "player_one", password: "supersecret1", next: "/" })).status, 403, "banned can't log in");
  await admin.post(`/admin/users/${target.id}/unban`);

  // Deleting a user preserves the conversation
  const doomed = makeClient(app);
  await doomed.get("/auth/signup");
  await doomed.post("/auth/signup", { username: "doomed_user", email: "d@example.com", password: "supersecret1", confirm: "supersecret1", ...(await solveCaptcha(doomed)) });
  await db.run("UPDATE users SET tier = 'paid' WHERE username = 'doomed_user'");
  res = await doomed.post("/forum/new", { category: "general", title: "By a doomed user", body: "Please survive me." });
  const dThread = res.headers.get("location").split("/").pop();
  const dId = (await db.get("SELECT id FROM users WHERE username = 'doomed_user'")).id;
  await admin.post(`/admin/users/${dId}/delete`);
  assert.ok(!(await db.get("SELECT id FROM users WHERE id = ?", dId)), "user deleted");
  await admin.get("/admin/users"); // consume the delete action's own flash ("doomed_user has been deleted…")
  html = await (await admin.get(`/forum/t/${dThread}`)).text();
  assert.ok(html.includes("Please survive me.") && html.includes("[deleted]") && !html.includes("doomed_user"), "thread reattributed to [deleted]");

  // Download gating
  res = await anon.get("/download/file");
  assert.ok(res.status === 302 && res.headers.get("location").startsWith("/auth/login"), "anon download redirected");
  assert.equal(Number((await db.get("SELECT COUNT(*) AS n FROM ip_logs WHERE event = 'download'")).n), 0, "anon download not logged");
  // No DOWNLOAD_URL configured in this test's env: a signed-in Paid member
  // clears the gate, but there is no fallback file to serve — a clean
  // "unavailable" response, not a silently-substituted placeholder, and
  // nothing is logged as a successful download. The success path (with
  // DOWNLOAD_URL configured) is covered end-to-end in its own test below.
  res = await admin.get("/download/file");
  assert.equal(res.status, 503, "member download with no DOWNLOAD_URL configured is a clean 'unavailable', not a fallback file");
  assert.ok(!(await db.get("SELECT id FROM ip_logs WHERE event = 'download' AND username = 'admin'")), "unavailable download is not logged as a download");

  html = await (await anon.get("/")).text();
  assert.ok(!html.includes("/download/file") && html.includes("Create a free account"), "download hidden when logged out");
  html = await (await admin.get("/")).text();
  assert.ok(html.includes("/download/file"), "download shown when logged in");
  // The click choreography in fx.js hangs off these hooks — losing them
  // silently turns the animated button back into a plain link.
  assert.ok(html.includes("data-download") && html.includes('class="dl-label"') && html.includes('class="dl-progress"'),
    "download button carries the animation hooks");

  // Oversized body -> styled 413, no stack trace
  res = await anon.raw("POST", "/auth/login", { identifier: "x", password: "y".repeat(300 * 1024) });
  html = await res.text();
  assert.ok(res.status === 413 && html.includes("Request too large") && !html.includes("/home/"), "413 without stack trace");

  // Session-bound CSRF
  await user.get("/auth/login");
  await user.post("/auth/login", { identifier: "player_one", password: "supersecret1", next: "/" });
  user.jar.set("ghcsrf", "a".repeat(32));
  res = await user.raw("POST", "/forum/new", { _csrf: "a".repeat(32), category: "general", title: "planted", body: "x" });
  assert.equal(res.status, 403, "planted CSRF cookie rejected");
  await user.get("/");
  assert.equal((await user.post("/forum/new", { category: "general", title: "Real token thread", body: "works" })).status, 302, "rotated token accepted");

  // Self-serve delete: the thread/post author (not just an admin) may remove their own content.
  const other = makeClient(app);
  await other.get("/auth/signup");
  await other.post("/auth/signup", { username: "second_user", email: "second@example.com", password: "supersecret1", confirm: "supersecret1", ...(await solveCaptcha(other)) });
  await db.run("UPDATE users SET tier = 'paid' WHERE username = 'second_user'");

  res = await user.post("/forum/new", { category: "general", title: "Deletable thread", body: "OP text" });
  const delThreadLoc = res.headers.get("location");
  const delThreadId = delThreadLoc.split("/").pop();
  res = await user.post(`${delThreadLoc}/reply`, { body: "a reply to delete" });
  const replyPostId = res.headers.get("location").split("#post-").pop();

  assert.equal((await other.post(`/forum/posts/${replyPostId}/delete`)).status, 404, "non-owner can't delete another user's post");
  assert.equal((await other.post(`/forum/t/${delThreadId}/delete`)).status, 404, "non-owner can't delete another user's thread");
  assert.ok(await db.get("SELECT id FROM posts WHERE id = ?", replyPostId), "post survives the non-owner's attempt");

  res = await user.post(`/forum/posts/${replyPostId}/delete`);
  assert.equal(res.status, 302, "owner deletes their own reply");
  assert.ok(!(await db.get("SELECT id FROM posts WHERE id = ?", replyPostId)), "reply gone");

  const opPost = await db.get("SELECT id FROM posts WHERE thread_id = ? ORDER BY id LIMIT 1", delThreadId);
  res = await user.post(`/forum/posts/${opPost.id}/delete`);
  assert.ok(res.status === 302 && res.headers.get("location") === `/forum/t/${delThreadId}`,
    "deleting the opening post redirects to the thread instead");
  assert.ok(await db.get("SELECT id FROM posts WHERE id = ?", opPost.id), "opening post not deleted directly");

  res = await user.post(`/forum/t/${delThreadId}/delete`);
  assert.equal(res.status, 302, "owner deletes their own thread");
  assert.ok(!(await db.get("SELECT id FROM threads WHERE id = ?", delThreadId)), "thread gone");

  res = await other.post("/forum/new", { category: "general", title: "Someone else's thread", body: "text" });
  const othersThreadId = res.headers.get("location").split("/").pop();
  res = await admin.post(`/forum/t/${othersThreadId}/delete`);
  assert.equal(res.status, 302, "admin can delete via the self-serve route too");
  assert.ok(!(await db.get("SELECT id FROM threads WHERE id = ?", othersThreadId)), "thread gone via admin");

  // Shoutbox
  res = await anon.post("/forum/shoutbox", { body: "anon shout" });
  assert.ok(res.status === 302 && res.headers.get("location").startsWith("/auth/login"), "shoutbox requires login");

  res = await user.post("/forum/shoutbox", { body: "hello from player_one" });
  assert.ok(res.status === 302 && res.headers.get("location") === "/forum", "shout posted (no-JS fallback redirects to /forum)");
  assert.ok(await db.get("SELECT id FROM shouts WHERE body = 'hello from player_one'"), "shout stored");

  html = await (await user.get("/forum")).text();
  assert.ok(html.includes("hello from player_one") && html.includes('id="shoutbox"'), "shoutbox renders on the forum index");

  res = await user.get("/forum/shoutbox?after=0");
  const shoutData = await res.json();
  assert.ok(Array.isArray(shoutData.shouts) && shoutData.shouts.some((s) => s.body === "hello from player_one"),
    "shoutbox JSON polling endpoint");

  const overlong = "x".repeat(300);
  res = await user.post("/forum/shoutbox", { body: overlong });
  assert.equal(res.status, 302, "overlong shout redirects with a flash instead of erroring");
  assert.ok(!(await db.get("SELECT id FROM shouts WHERE body = ?", overlong)), "overlong shout not stored");

  // Rate limiting
  const hammer = makeClient(app);
  await hammer.get("/auth/login");
  let got429 = false;
  for (let i = 0; i < RATE_LIMIT_DEFAULTS.login.limit + 4 && !got429; i += 1) {
    const r = await hammer.post("/auth/login", { identifier: "nobody", password: "nope", next: "/" });
    if (r.status === 429) got429 = true;
    await r.arrayBuffer();
  }
  assert.ok(got429, "login rate limit fires");
});

test("tiers: forum/download gating, admin-only tier changes, staff moderation boundary", async () => {
  const { app, db } = await buildTestApp(ENV);
  const admin = makeClient(app);
  const free = makeClient(app);
  const mod = makeClient(app);

  await admin.get("/auth/login");
  await admin.post("/auth/login", { identifier: "admin", password: "admin-test-password-1", next: "/" });

  await free.get("/auth/signup");
  await free.post("/auth/signup", { username: "free_user", email: "free@example.com", password: "supersecret1", confirm: "supersecret1", ...(await solveCaptcha(free)) });

  await mod.get("/auth/signup");
  await mod.post("/auth/signup", { username: "trial_mod", email: "mod@example.com", password: "supersecret1", confirm: "supersecret1", ...(await solveCaptcha(mod)) });

  // A Free account is gated out of both the forum and the download, but the
  // gate is a real 403 explaining why, not a 404 or a silent redirect.
  let res = await free.get("/forum");
  let html = await res.text();
  assert.ok(res.status === 403 && html.includes("Paid"), "free tier blocked from forum with an explanatory 403");
  res = await free.get("/download/file");
  html = await res.text();
  assert.ok(res.status === 403 && html.includes("Paid"), "free tier blocked from download");

  // Only full Admin can change tiers — not staff below it.
  const modId = (await db.get("SELECT id FROM users WHERE username = 'trial_mod'")).id;
  res = await admin.post(`/admin/users/${modId}/tier`, { tier: "trial_admin" });
  assert.equal(res.status, 302, "admin sets a user's tier");
  assert.equal((await db.get("SELECT tier FROM users WHERE id = ?", modId)).tier, "trial_admin", "tier persisted");

  // trial_mod must re-authenticate — destroyUserSessions logs them out on tier change.
  await mod.get("/auth/login");
  await mod.post("/auth/login", { identifier: "trial_mod", password: "supersecret1", next: "/" });

  // Staff (trial_admin) gets into the admin panel and can moderate, but the
  // full-admin-only actions (tier changes, delete user, delete category) 404.
  assert.equal((await free.get("/admin")).status, 404, "free tier still can't reach the admin panel");
  html = await (await mod.get("/admin")).text();
  assert.ok(html.includes("Dashboard"), "trial_admin can reach the admin panel");

  const otherId = (await db.get("SELECT id FROM users WHERE username = 'free_user'")).id;
  assert.equal((await mod.post(`/admin/users/${otherId}/tier`, { tier: "admin" })).status, 404,
    "trial_admin cannot change tiers (full admin only)");
  assert.equal((await db.get("SELECT tier FROM users WHERE id = ?", otherId)).tier, "user", "tier unchanged");
  assert.equal((await mod.post(`/admin/users/${otherId}/delete`)).status, 404, "trial_admin cannot delete accounts");
  assert.equal((await mod.post("/admin/categories", { name: "Should not exist", description: "" })).status, 404,
    "trial_admin cannot create categories");

  // But ordinary moderation — banning a user, forum thread moderation — is
  // within a trial_admin's reach.
  res = await mod.post(`/admin/users/${otherId}/ban`);
  assert.equal(res.status, 302, "trial_admin can ban a user");
  assert.equal((await db.get("SELECT banned FROM users WHERE id = ?", otherId)).banned, 1, "ban applied");
  await mod.post(`/admin/users/${otherId}/unban`);

  // Upgrade free_user to Paid (as an admin would) and confirm the forum opens up.
  await admin.post(`/admin/users/${otherId}/tier`, { tier: "paid" });
  await free.get("/auth/login");
  await free.post("/auth/login", { identifier: "free_user", password: "supersecret1", next: "/" });
  res = await free.get("/forum");
  assert.equal(res.status, 200, "paid tier can now browse the forum");

  // The signed license token: verifiable, tier-accurate, and rejects a tampered payload.
  res = await free.get("/account/license");
  const license = await res.json();
  assert.equal(license.tier, "paid", "license reports the account's real tier");
  assert.ok(await verifyLicense(license, ENV), "license verifies against the server secret");
  assert.ok(!(await verifyLicense({ ...license, tier: "admin" }, ENV)), "tampered license fails verification");
});

test("IP bans block every route except for staff, who are exempt", async () => {
  const { app, db } = await buildTestApp(ENV);
  const admin = makeClient(app);
  const victim = makeClient(app);

  await admin.get("/auth/login");
  await admin.post("/auth/login", { identifier: "admin", password: "admin-test-password-1", next: "/" });

  let res = await admin.post("/admin/ip-bans", { ip: "203.0.113.42", reason: "spam" });
  assert.equal(res.status, 302, "IP ban created");
  assert.ok(await db.get("SELECT * FROM ip_bans WHERE ip = '203.0.113.42'"), "ban row stored");

  // A visitor from that IP is blocked on every route, not just the ones it
  // was first seen on — the fetch call itself sets the "IP" via CF-Connecting-IP.
  const bannedReq = async (path) => app.fetch(
    new Request("http://local" + path, { headers: { "cf-connecting-ip": "203.0.113.42" } }), ENV
  );
  res = await bannedReq("/");
  const html = await res.text();
  assert.ok(res.status === 403 && html.includes("blocked"), "banned IP blocked on the homepage");
  res = await bannedReq("/terms");
  assert.equal(res.status, 403, "banned IP blocked on every route, not just where it was banned");

  // Admin themself is exempt from IP bans even if they share the banned address —
  // otherwise a fat-fingered self-ban would lock the whole panel out.
  const selfBanned = await admin.get("/admin", { "cf-connecting-ip": "203.0.113.42" });
  assert.equal(selfBanned.status, 200, "staff are exempt from IP bans");

  res = await admin.post(`/admin/ip-bans/${encodeURIComponent("203.0.113.42")}/unban`);
  assert.equal(res.status, 302, "IP unbanned");
  assert.ok(!(await db.get("SELECT * FROM ip_bans WHERE ip = '203.0.113.42'")), "ban row removed");
  res = await bannedReq("/");
  assert.equal(res.status, 200, "unbanned IP can browse again");
});

test("fingerprint beacon groups anonymous and signed-in sightings under one device log", async () => {
  const { app, db } = await buildTestApp(ENV);
  const admin = makeClient(app);
  const user = makeClient(app);
  const anon = makeClient(app);

  await admin.get("/auth/login");
  await admin.post("/auth/login", { identifier: "admin", password: "admin-test-password-1", next: "/" });

  await user.get("/auth/signup");
  await user.post("/auth/signup", {
    username: "fp_user", email: "fp@example.com", password: "supersecret1", confirm: "supersecret1",
    ...(await solveCaptcha(user)),
  });

  const fields = {
    device: "Desktop", browser: "Chrome 120", os: "Windows 10/11",
    screen: "1920x1080x24", language: "en-US", timezone: "Europe/Berlin", canvasHash: "abc123",
  };

  let res = await anon.post("/api/fingerprint", fields);
  assert.equal(res.status, 204, "anonymous fingerprint beacon accepted");
  res = await user.post("/api/fingerprint", fields);
  assert.equal(res.status, 204, "signed-in fingerprint beacon accepted");

  const rows = await db.all("SELECT * FROM fingerprints ORDER BY id");
  assert.equal(rows.length, 2, "two sightings recorded");
  assert.equal(rows[0].fp_hash, rows[1].fp_hash, "identical device data hashes to the same fingerprint");
  assert.equal(rows[0].user_id, null, "anonymous sighting has no user");
  assert.equal(rows[1].username, "fp_user", "signed-in sighting is attributed");
  assert.equal(rows[1].email, "fp@example.com", "signed-in sighting captures the account email");

  assert.equal((await user.get("/admin/fingerprints")).status, 404, "fingerprints panel hidden from non-staff");

  const listHtml = await (await admin.get("/admin/fingerprints")).text();
  assert.ok(listHtml.includes("1 distinct fingerprint") && listHtml.includes("2 sightings") && listHtml.includes("1 account"),
    "admin fingerprints list groups both sightings under one device");

  const hash = rows[0].fp_hash;
  const detailHtml = await (await admin.get(`/admin/fingerprints/${hash}`)).text();
  assert.ok(detailHtml.includes("fp_user") && detailHtml.includes("fp@example.com") && detailHtml.includes("anonymous")
    && detailHtml.includes("Chrome 120") && detailHtml.includes("Europe/Berlin"),
    "per-fingerprint log shows every sighting, signed-in and anonymous");

  assert.equal((await admin.get("/admin/fingerprints/doesnotexist")).status, 404, "unknown fingerprint hash 404s");
});

test("account switching: login stays reachable while signed in and swaps the session", async () => {
  const { app, db } = await buildTestApp(ENV);
  const browser = makeClient(app);

  await browser.get("/auth/signup");
  await browser.post("/auth/signup", { username: "first_acct", email: "first@example.com", password: "supersecret1", confirm: "supersecret1", ...(await solveCaptcha(browser)) });
  await db.run("UPDATE users SET tier = 'paid' WHERE username = 'first_acct'");
  await browser.get("/auth/signup"); // still signed in — signup redirects, that's fine

  // The login page must NOT bounce a signed-in visitor (that made a freshly
  // promoted second admin look like it couldn't log in at all) — it renders
  // with a "signed in as" switch notice instead.
  let res = await browser.get("/auth/login");
  let html = await res.text();
  assert.equal(res.status, 200, "login page reachable while signed in");
  assert.ok(html.includes("currently signed in as") && html.includes("first_acct"), "switch notice names the current account");

  // Logging in as the seeded admin from the same browser swaps the session.
  res = await browser.post("/auth/login", { identifier: "admin", password: "admin-test-password-1", next: "/admin" });
  assert.ok(res.status === 302 && res.headers.get("location") === "/admin", "switch login succeeds");
  html = await (await browser.get("/admin")).text();
  assert.ok(html.includes("Dashboard"), "browser is now the admin session");
  const firstId = (await db.get("SELECT id FROM users WHERE username = 'first_acct'")).id;
  assert.ok(!(await db.get("SELECT id FROM sessions WHERE user_id = ?", firstId)), "old account's session was retired");

  // A FAILED switch attempt must keep the current session intact.
  res = await browser.post("/auth/login", { identifier: "first_acct", password: "wrong-password", next: "/" });
  assert.equal(res.status, 401, "bad switch rejected");
  assert.equal((await browser.get("/admin")).status, 200, "still signed in as admin after the failed switch");
});

test("profile: view, password change, sign out everywhere", async () => {
  const { app, db } = await buildTestApp(ENV);
  const phone = makeClient(app);
  const laptop = makeClient(app);

  await phone.get("/auth/signup");
  await phone.post("/auth/signup", { username: "prof_user", email: "prof@example.com", password: "supersecret1", confirm: "supersecret1", ...(await solveCaptcha(phone)) });
  await laptop.get("/auth/login");
  await laptop.post("/auth/login", { identifier: "prof_user", password: "supersecret1", next: "/" });

  const anon = makeClient(app);
  const anonRes = await anon.get("/profile");
  assert.ok(anonRes.status === 302 && anonRes.headers.get("location").startsWith("/auth/login"), "profile requires sign-in");

  let html = await (await phone.get("/profile")).text();
  assert.ok(html.includes("prof_user") && html.includes("prof@example.com") && html.includes("Free"),
    "profile shows identity and tier");
  assert.ok(html.includes("Loader license") && /[a-f0-9]{64}/.test(html), "profile shows the signed license token");
  assert.ok(html.includes("/upgrade"), "free account sees the upgrade link");

  // Wrong current password → rejected, nothing changes.
  let res = await phone.post("/profile/password", { current: "nope", password: "newpassword12", confirm: "newpassword12" });
  assert.equal(res.status, 302);
  await phone.get("/profile"); // consume flash
  const before = (await db.get("SELECT password_hash FROM users WHERE username = 'prof_user'")).password_hash;

  // Correct change: this browser stays signed in, the other device is out.
  res = await phone.post("/profile/password", { current: "supersecret1", password: "newpassword12", confirm: "newpassword12" });
  assert.equal(res.status, 302);
  assert.notEqual((await db.get("SELECT password_hash FROM users WHERE username = 'prof_user'")).password_hash, before, "hash rotated");
  assert.equal((await phone.get("/profile")).status, 200, "changing browser keeps its session");
  res = await laptop.get("/profile");
  assert.ok(res.status === 302 && res.headers.get("location").startsWith("/auth/login"), "other device signed out by password change");
  await laptop.get("/auth/login");
  assert.equal((await laptop.post("/auth/login", { identifier: "prof_user", password: "newpassword12", next: "/" })).status, 302, "new password works");
  assert.equal((await laptop.post("/auth/login", { identifier: "prof_user", password: "supersecret1", next: "/" })).status, 401, "old password dead");

  // Sign out everywhere kills every session including the caller's.
  res = await laptop.post("/profile/logout-all");
  assert.ok(res.status === 302 && res.headers.get("location") === "/auth/login", "logout-all redirects to login");
  const uid = (await db.get("SELECT id FROM users WHERE username = 'prof_user'")).id;
  assert.ok(!(await db.get("SELECT id FROM sessions WHERE user_id = ?", uid)), "no sessions remain");
  assert.ok(await db.get("SELECT id FROM ip_logs WHERE event = 'password_changed' AND username = 'prof_user'"), "password change audited");
});

test("upgrade page: honest 'coming soon' by default, env-driven checkout when configured", async () => {
  // Default env: no payment config → coming-soon + contact, and no fake pay button.
  let { app } = await buildTestApp(ENV);
  let html = await (await makeClient(app).get("/upgrade")).text();
  assert.ok(html.includes("Upgrade to Paid") && html.includes("being set up") && !html.includes("Pay with crypto</a>"),
    "unconfigured upgrade page promises nothing it can't do");

  // Configured env: hosted checkout link + manual addresses + price all render.
  const payEnv = {
    ...ENV,
    CRYPTO_PAY_URL: "https://commerce.example/checkout/goyhub",
    CRYPTO_PAY_ADDRESSES: "BTC:bc1qtestaddress,ETH:0xtestaddress",
    PAID_PRICE: "$10 / month",
  };
  ({ app } = await buildTestApp(payEnv));
  html = await (await makeClient(app).get("/upgrade")).text();
  assert.ok(html.includes("https://commerce.example/checkout/goyhub"), "checkout link renders when configured");
  assert.ok(html.includes("$10 / month"), "price renders");

  // The tier-gate 403 sends people here.
  const free = makeClient(app);
  await free.get("/auth/signup");
  await free.post("/auth/signup", { username: "gated_user", email: "gated@example.com", password: "supersecret1", confirm: "supersecret1", ...(await solveCaptcha(free)) });
  const gateHtml = await (await free.get("/forum")).text();
  assert.ok(gateHtml.includes('href="/upgrade"'), "members-only 403 links to the upgrade page");
});

test("loader API: credential auth returns a verifiable license; verify endpoint reflects live tier", async () => {
  const { app, db } = await buildTestApp(ENV);
  const setup = makeClient(app);
  await setup.get("/auth/signup");
  await setup.post("/auth/signup", { username: "loader_user", email: "loader@example.com", password: "supersecret1", confirm: "supersecret1", ...(await solveCaptcha(setup)) });
  await db.run("UPDATE users SET tier = 'paid' WHERE username = 'loader_user'");

  // The loader has no cookies and no CSRF token — a bare JSON POST must work.
  const api = (path, body) => app.fetch(new Request("http://local" + path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }), ENV);

  let res = await api("/api/loader/auth", { username: "loader_user", password: "wrong" });
  assert.equal(res.status, 401, "bad credentials rejected");
  assert.equal((await res.json()).error, "invalid_credentials");

  res = await api("/api/loader/auth", { username: "loader_user", password: "supersecret1" });
  assert.equal(res.status, 200, "loader auth succeeds");
  const auth = await res.json();
  assert.ok(auth.ok && auth.paid && auth.tier === "paid", "auth reports tier and paid flag");
  assert.ok(await verifyLicense(auth.license, ENV), "returned license verifies against the secret");
  assert.ok(await db.get("SELECT id FROM ip_logs WHERE event = 'loader_auth' AND username = 'loader_user'"), "loader auth audited");

  // verify endpoint: genuine token → valid with LIVE tier; tampered → invalid.
  res = await api("/api/loader/verify", { license: auth.license });
  let verdict = await res.json();
  assert.ok(verdict.valid && verdict.tier === "paid", "verify confirms a genuine token");
  res = await api("/api/loader/verify", { license: { ...auth.license, tier: "admin" } });
  verdict = await res.json();
  assert.ok(!verdict.valid, "tampered token rejected");

  // Tier downgrade shows up immediately on verify, before the token expires.
  await db.run("UPDATE users SET tier = 'user' WHERE username = 'loader_user'");
  res = await api("/api/loader/verify", { license: auth.license });
  verdict = await res.json();
  assert.ok(verdict.valid && verdict.tier === "user" && verdict.paid === false, "verify reflects the live (downgraded) tier");

  // Banned account: auth refused even with the right password.
  await db.run("UPDATE users SET banned = 1 WHERE username = 'loader_user'");
  res = await api("/api/loader/auth", { username: "loader_user", password: "supersecret1" });
  assert.equal(res.status, 403, "banned account cannot loader-auth");
});

test("forum extras: search, member profiles, post editing, reporting + admin queue", async () => {
  const { app, db } = await buildTestApp(ENV);
  const admin = makeClient(app);
  const author = makeClient(app);
  const other = makeClient(app);

  await admin.get("/auth/login");
  await admin.post("/auth/login", { identifier: "admin", password: "admin-test-password-1", next: "/" });
  for (const [client, name, mail] of [[author, "poster_a", "pa@example.com"], [other, "poster_b", "pb@example.com"]]) {
    await client.get("/auth/signup");
    await client.post("/auth/signup", { username: name, email: mail, password: "supersecret1", confirm: "supersecret1", ...(await solveCaptcha(client)) });
  }
  await db.run("UPDATE users SET tier = 'paid' WHERE username IN ('poster_a', 'poster_b')");
  // Tier change touches the row, not sessions — clients stay logged in; reload user rows.
  let res = await author.post("/forum/new", { category: "general", title: "Quantum crosshair settings", body: "The flux capacitor spread pattern is optimal." });
  const threadLoc = res.headers.get("location");
  const threadId = threadLoc.split("/").pop();
  res = await author.post(`${threadLoc}/reply`, { body: "Bump with extra flux details." });
  const replyId = res.headers.get("location").split("#post-").pop();

  // --- search: title match and body match, gated to paid+ ---
  let html = await (await other.get("/forum/search?q=quantum")).text();
  assert.ok(html.includes("Quantum crosshair settings"), "search finds thread by title");
  html = await (await other.get("/forum/search?q=capacitor")).text();
  assert.ok(html.includes("Quantum crosshair settings"), "search finds thread via post body");
  const anon = makeClient(app);
  res = await anon.get("/forum/search?q=quantum");
  assert.equal(res.status, 302, "search is members-only like the rest of the forum");

  // --- member profile ---
  html = await (await other.get("/u/poster_a")).text();
  assert.ok(html.includes("poster_a") && html.includes("Quantum crosshair settings"), "member profile shows identity and threads");
  assert.equal((await other.get("/u/no_such_member")).status, 404, "unknown member 404s");
  assert.equal((await other.get("/u/%5Bdeleted%5D")).status, 404, "the [deleted] placeholder has no profile");

  // --- post editing: author within the window; not others; staff anytime; edits marked ---
  res = await other.get(`/forum/posts/${replyId}/edit`);
  assert.equal(res.status, 404, "non-author cannot open the edit form");
  res = await author.post(`/forum/posts/${replyId}/edit`, { body: "Edited: corrected the flux details." });
  assert.equal(res.status, 302, "author edits own recent post");
  html = await (await author.get(`/forum/t/${threadId}`)).text();
  assert.ok(html.includes("Edited: corrected the flux details.") && html.includes("edited"), "edit saved and marked");
  await db.run("UPDATE posts SET created_at = datetime('now', '-2 hours') WHERE id = ?", replyId);
  res = await author.get(`/forum/posts/${replyId}/edit`);
  assert.equal(res.status, 404, "author's edit window closes after 30 minutes");
  res = await admin.post(`/forum/posts/${replyId}/edit`, { body: "Staff edit outside the window." });
  assert.equal(res.status, 302, "staff can edit at any time");
  const row = await db.get("SELECT edited_by FROM posts WHERE id = ?", replyId);
  assert.equal(row.edited_by, "admin", "edited_by records the staff editor");

  // --- reporting ---
  res = await other.post(`/forum/posts/${replyId}/report`, { reason: "Spam and misinformation about flux" });
  assert.equal(res.status, 302, "member files a report");
  const report = await db.get("SELECT * FROM reports WHERE post_id = ?", replyId);
  assert.ok(report && report.status === "open", "report stored open");
  await other.post(`/forum/posts/${replyId}/report`, { reason: "Duplicate attempt" });
  assert.equal(Number((await db.get("SELECT COUNT(*) AS n FROM reports WHERE post_id = ?", replyId)).n), 1,
    "duplicate open report by the same member is not stored twice");

  // Admin queue: staff see it, resolve it; the [deleted]-post case renders too.
  html = await (await admin.get("/admin/reports")).text();
  assert.ok(html.includes("Spam and misinformation") && html.includes("poster_b"), "report visible in the admin queue");
  res = await admin.post(`/admin/reports/${report.id}/resolve`);
  assert.equal(res.status, 302, "report resolved");
  assert.equal((await db.get("SELECT status, resolved_by FROM reports WHERE id = ?", report.id)).status, "resolved");
  assert.equal((await other.get("/admin/reports")).status, 404, "queue hidden from non-staff");
});

test("flood protection: burst cap 429s, repeat offenders get a temporary auto IP ban", async () => {
  const floodEnv = { ...ENV, RATE_LIMIT_BURST: "5", RATE_LIMIT_FLOOD: "2", AUTO_IP_BAN_MINUTES: "60" };
  const { app, db } = await buildTestApp(floodEnv);
  const hit = (ip) => app.fetch(new Request("http://local/", { headers: { "cf-connecting-ip": ip } }), floodEnv);

  for (let i = 0; i < 5; i += 1) {
    assert.equal((await hit("198.51.100.50")).status, 200, "requests under the burst cap pass");
  }
  const over = await hit("198.51.100.50");
  assert.equal(over.status, 429, "burst cap answered with 429");
  assert.ok(over.headers.get("retry-after"), "429 carries Retry-After");

  // Keep hammering: after RATE_LIMIT_FLOOD breaches the IP is auto-banned and
  // the ban gate takes over with a 403.
  let status = 429;
  for (let i = 0; i < 6 && status !== 403; i += 1) status = (await hit("198.51.100.50")).status;
  assert.equal(status, 403, "sustained flooding escalates to an automatic IP ban");
  const ban = await db.get("SELECT * FROM ip_bans WHERE ip = '198.51.100.50'");
  assert.ok(ban && ban.banned_by === "system" && Number(ban.expires_at) > Date.now(),
    "auto ban is temporary and attributed to system");
  assert.ok(await db.get("SELECT id FROM ip_logs WHERE event = 'ip_autoban'"), "auto ban audited");

  // An expired auto ban lifts lazily on the next request.
  await db.run("UPDATE ip_bans SET expires_at = ? WHERE ip = '198.51.100.50'", Date.now() - 1000);
  await db.run("DELETE FROM rate_limits");
  assert.equal((await hit("198.51.100.50")).status, 200, "expired auto ban lifts on the next request");
  assert.ok(!(await db.get("SELECT * FROM ip_bans WHERE ip = '198.51.100.50'")), "expired ban row removed");

  // A different IP is unaffected throughout, and RATE_LIMIT_BURST="0" disables the layer.
  assert.equal((await hit("198.51.100.51")).status, 200, "other IPs unaffected");
  const offEnv = { ...ENV, RATE_LIMIT_BURST: "0" };
  const { app: offApp } = await buildTestApp(offEnv);
  for (let i = 0; i < 8; i += 1) {
    const r = await offApp.fetch(new Request("http://local/", { headers: { "cf-connecting-ip": "198.51.100.60" } }), offEnv);
    assert.equal(r.status, 200, "burst layer disabled with RATE_LIMIT_BURST=0");
  }
});

test("signup surge breaker pauses registration when site-wide signups spike", async () => {
  const surgeEnv = { ...ENV, SIGNUP_SURGE_LIMIT: "2" };
  const { app, db } = await buildTestApp(surgeEnv);

  for (let i = 1; i <= 2; i += 1) {
    const c = makeClient(app);
    await c.get("/auth/signup");
    const res = await c.post("/auth/signup", {
      username: `surge_user_${i}`, email: `surge${i}@example.com`,
      password: "supersecret1", confirm: "supersecret1", ...(await solveCaptcha(c)),
    });
    assert.equal(res.status, 302, `signup ${i} under the surge limit succeeds`);
  }

  const blocked = makeClient(app);
  await blocked.get("/auth/signup");
  const res = await blocked.post("/auth/signup", {
    username: "surge_user_3", email: "surge3@example.com",
    password: "supersecret1", confirm: "supersecret1", ...(await solveCaptcha(blocked)),
  });
  const html = await res.text();
  assert.ok(res.status === 429 && html.includes("briefly paused"), "surge breaker pauses signups with an honest message");
  assert.ok(!(await db.get("SELECT id FROM users WHERE username = 'surge_user_3'")), "no account created during the pause");
  assert.ok(await db.get("SELECT id FROM ip_logs WHERE event = 'signup_surge_blocked'"), "surge block audited");
});

test("content & announcements: FAQ, changelog, robots/sitemap, admin banner", async () => {
  const { app, db } = await buildTestApp(ENV);
  const anon = makeClient(app);
  const admin = makeClient(app);

  let html = await (await anon.get("/faq")).text();
  assert.ok(html.includes("Frequently asked questions") && html.includes("VAC"), "FAQ renders");
  html = await (await anon.get("/changelog")).text();
  assert.ok(html.includes("Changelog") && html.includes("v1.0.0"), "changelog renders");

  let res = await anon.get("/robots.txt");
  const robots = await res.text();
  assert.ok(res.status === 200 && robots.includes("Disallow: /admin") && robots.includes("Sitemap: http://local/sitemap.xml"),
    "robots.txt disallows the admin area and points at the sitemap");
  res = await anon.get("/sitemap.xml");
  const sitemap = await res.text();
  assert.ok(res.status === 200 && sitemap.includes("<loc>http://local/download</loc>"), "sitemap lists public pages");
  assert.ok(!sitemap.includes("/forum"), "members-only forum is not advertised to crawlers");

  // Announcement: full-admin sets it, every page shows it, staff below admin cannot.
  await admin.get("/auth/login");
  await admin.post("/auth/login", { identifier: "admin", password: "admin-test-password-1", next: "/admin" });
  await admin.get("/admin");
  res = await admin.post("/admin/announcement", { announcement: "Maintenance window at midnight UTC" });
  assert.equal(res.status, 302, "announcement saved");
  html = await (await anon.get("/faq")).text();
  assert.ok(html.includes("Maintenance window at midnight UTC"), "banner shows on every page");

  const dev = makeClient(app);
  await dev.get("/auth/signup");
  await dev.post("/auth/signup", { username: "banner_dev", email: "bd@example.com", password: "supersecret1", confirm: "supersecret1", ...(await solveCaptcha(dev)) });
  await db.run("UPDATE users SET tier = 'developer' WHERE username = 'banner_dev'");
  await dev.get("/admin");
  assert.equal((await dev.post("/admin/announcement", { announcement: "hax" })).status, 404,
    "staff below full admin cannot set the announcement");

  await admin.get("/admin");
  await admin.post("/admin/announcement", { announcement: "" });
  html = await (await anon.get("/faq")).text();
  assert.ok(!html.includes("Maintenance window"), "empty save clears the banner");
});

test("account extras: email change, per-session revoke, self-serve deletion", async () => {
  const { app, db } = await buildTestApp(ENV);
  const phone = makeClient(app);
  const laptop = makeClient(app);

  await phone.get("/auth/signup");
  await phone.post("/auth/signup", { username: "extra_user", email: "extra@example.com", password: "supersecret1", confirm: "supersecret1", ...(await solveCaptcha(phone)) });
  await laptop.get("/auth/login");
  await laptop.post("/auth/login", { identifier: "extra_user", password: "supersecret1", next: "/" });

  // Email change: wrong password rejected; duplicate rejected; success audited.
  await phone.get("/profile");
  await phone.post("/profile/email", { email: "new@example.com", password: "wrong" });
  assert.equal((await db.get("SELECT email FROM users WHERE username = 'extra_user'")).email, "extra@example.com", "wrong password keeps old email");
  await phone.get("/profile");
  await phone.post("/profile/email", { email: "admin@goyhub.st", password: "supersecret1" });
  assert.equal((await db.get("SELECT email FROM users WHERE username = 'extra_user'")).email, "extra@example.com", "taken email rejected");
  await phone.get("/profile");
  await phone.post("/profile/email", { email: "new@example.com", password: "supersecret1" });
  assert.equal((await db.get("SELECT email FROM users WHERE username = 'extra_user'")).email, "new@example.com", "email updated");
  assert.ok(await db.get("SELECT id FROM ip_logs WHERE event = 'email_changed' AND username = 'extra_user'"), "email change audited");

  // Session management: the profile lists both devices; revoking the laptop's
  // session signs out only the laptop.
  const uid = (await db.get("SELECT id FROM users WHERE username = 'extra_user'")).id;
  const sessions = await db.all("SELECT id FROM sessions WHERE user_id = ? ORDER BY id", uid);
  assert.equal(sessions.length, 2, "two active sessions");
  const html = await (await phone.get("/profile")).text();
  assert.ok(html.includes("THIS DEVICE"), "profile marks the current session");
  // The phone signed up first, so sessions[1] (higher id) is the laptop's —
  // the phone revokes it and stays signed in itself.
  await phone.post(`/profile/sessions/${sessions[1].id}/revoke`);
  const left = await db.all("SELECT id FROM sessions WHERE user_id = ?", uid);
  assert.equal(left.length, 1, "one session revoked");
  assert.equal((await phone.get("/profile")).status, 200, "revoking another device keeps this one signed in");
  assert.equal((await laptop.get("/profile")).status, 302, "revoked device is signed out");
  const active = phone;

  // Self-serve deletion: wrong phrase refused, then full deletion reattributes content.
  let res = await active.post("/forum/new", { category: "general", title: "Doomed by self-delete", body: "Preserve me." });
  assert.equal(res.status, 403, "free tier can't post — upgrade first");
  await db.run("UPDATE users SET tier = 'paid' WHERE id = ?", uid);
  res = await active.post("/forum/new", { category: "general", title: "Doomed by self-delete", body: "Preserve me." });
  const threadId = res.headers.get("location").split("/").pop();

  await active.post("/profile/delete", { password: "supersecret1", confirm_phrase: "nope" });
  assert.ok(await db.get("SELECT id FROM users WHERE id = ?", uid), "wrong confirmation phrase keeps the account");
  res = await active.post("/profile/delete", { password: "supersecret1", confirm_phrase: "DELETE" });
  assert.ok(res.status === 302 && res.headers.get("location") === "/", "account deleted");
  assert.ok(!(await db.get("SELECT id FROM users WHERE id = ?", uid)), "user row gone");
  const adminC = makeClient(app);
  await adminC.get("/auth/login");
  await adminC.post("/auth/login", { identifier: "admin", password: "admin-test-password-1", next: "/" });
  const threadHtml = await (await adminC.get(`/forum/t/${threadId}`)).text();
  assert.ok(threadHtml.includes("Preserve me.") && threadHtml.includes("[deleted]"), "content survives, reattributed");
  assert.ok(await db.get("SELECT id FROM ip_logs WHERE event = 'account_deleted'"), "deletion audited");

  // The seeded admin cannot self-delete.
  await adminC.get("/profile");
  res = await adminC.post("/profile/delete", { password: "admin-test-password-1", confirm_phrase: "DELETE" });
  assert.equal(res.status, 302);
  assert.ok(await db.get("SELECT id FROM users WHERE username = 'admin'"), "seeded admin cannot self-delete");
});

test("admin IP privacy: admins' addresses are hidden from other staff in the panel", async () => {
  const { app, db } = await buildTestApp(ENV);
  const admin = makeClient(app);
  const dev = makeClient(app);

  await admin.get("/auth/login");
  await admin.post("/auth/login", { identifier: "admin", password: "admin-test-password-1", next: "/" });

  await dev.get("/auth/signup");
  await dev.post("/auth/signup", { username: "dev_staff", email: "dev@example.com", password: "supersecret1", confirm: "supersecret1", ...(await solveCaptcha(dev)) });
  const devId = (await db.get("SELECT id FROM users WHERE username = 'dev_staff'")).id;
  await admin.get("/admin/users");
  await admin.post(`/admin/users/${devId}/tier`, { tier: "developer" });
  await dev.get("/auth/login");
  await dev.post("/auth/login", { identifier: "dev_staff", password: "supersecret1", next: "/" });

  // Give the admin account a visible IP trail.
  await db.run("UPDATE users SET signup_ip = '198.51.100.7', last_login_ip = '198.51.100.7' WHERE username = 'admin'");

  // A developer-tier staffer sees (hidden) for the admin everywhere...
  for (const path of ["/admin/users", "/admin/logs", "/admin"]) {
    const html = await (await dev.get(path)).text();
    assert.ok(!html.includes("198.51.100.7"), `admin IP not exposed on ${path}`);
  }
  const usersHtml = await (await dev.get("/admin/users")).text();
  assert.ok(usersHtml.includes("(hidden)"), "masked cells say (hidden)");

  // ...while the admin still sees their own address.
  const ownHtml = await (await admin.get("/admin/users")).text();
  assert.ok(ownHtml.includes("198.51.100.7"), "admins still see their own IP");

  // ALL staff tiers are masked from other viewers — the admin can't read the
  // developer's IP either; the developer still sees their own.
  await db.run("UPDATE users SET signup_ip = '203.0.113.99' WHERE username = 'dev_staff'");
  const adminView = await (await admin.get("/admin/users")).text();
  assert.ok(!adminView.includes("203.0.113.99"), "staff IPs are hidden from other staff, admins included");
  const devOwnView = await (await dev.get("/admin/users")).text();
  assert.ok(devOwnView.includes("203.0.113.99"), "staff still see their own IP");
});

test("vanity UIDs: goyim=0 goy=1 omelette=2, reserved block, signups start at 1002", async () => {
  const { app, db } = await buildTestApp(ENV);

  for (const [name, uid] of [["goyim", 0], ["goy", 1], ["omelette", 2]]) {
    const row = await db.get("SELECT id, tier FROM users WHERE username = ?", name);
    assert.ok(row, `${name} account seeded`);
    assert.equal(Number(row.id), uid, `${name} holds UID ${uid}`);
  }
  const admin = await db.get("SELECT id FROM users WHERE username = 'admin'");
  assert.equal(Number(admin.id), 3, "seeded admin relocated to UID 3 (omelette took 2)");
  const deleted = await db.get("SELECT id FROM users WHERE username = '[deleted]'");
  assert.equal(Number(deleted.id), 1001, "[deleted] anchors the top of the reserved block");

  // Ordinary signups start above the reserved block.
  const c = makeClient(app);
  await c.get("/auth/signup");
  await c.post("/auth/signup", { username: "uid_fresh", email: "uidf@example.com", password: "supersecret1", confirm: "supersecret1", ...(await solveCaptcha(c)) });
  const fresh = await db.get("SELECT id FROM users WHERE username = 'uid_fresh'");
  assert.ok(Number(fresh.id) >= 1002, `fresh signup got UID ${fresh.id} (>= 1002)`);

  // Vanity names are reserved at signup.
  await c.get("/auth/signup"); // signed in -> redirected, use new client
  const c2 = makeClient(app);
  await c2.get("/auth/signup");
  const res = await c2.post("/auth/signup", { username: "goyim", email: "fake-goyim@example.com", password: "supersecret1", confirm: "supersecret1", ...(await solveCaptcha(c2)) });
  assert.equal(res.status, 400, "vanity usernames cannot be registered");

  // The welcome thread still belongs to the (relocated) admin and renders.
  const adminC = makeClient(app);
  await adminC.get("/auth/login");
  await adminC.post("/auth/login", { identifier: "admin", password: "admin-test-password-1", next: "/" });
  const html = await (await adminC.get("/forum/t/1")).text();
  assert.ok(html.includes("Welcome to the GoyHub") && html.includes("UID 3"), "welcome thread survived relocation with UID shown");
});

test("admin tools: set password, set UID (relocation keeps sessions/content), paid expiry", async () => {
  const { app, db } = await buildTestApp(ENV);
  const admin = makeClient(app);
  const member = makeClient(app);

  await admin.get("/auth/login");
  await admin.post("/auth/login", { identifier: "admin", password: "admin-test-password-1", next: "/" });

  await member.get("/auth/signup");
  await member.post("/auth/signup", { username: "uid_member", email: "uidm@example.com", password: "supersecret1", confirm: "supersecret1", ...(await solveCaptcha(member)) });
  const before = await db.get("SELECT id FROM users WHERE username = 'uid_member'");

  // Admin grants Paid with a 30-day expiry.
  await admin.get("/admin/users");
  let res = await admin.post(`/admin/users/${before.id}/tier`, { tier: "paid", paid_days: "30" });
  assert.equal(res.status, 302);
  let row = await db.get("SELECT tier, paid_until FROM users WHERE id = ?", before.id);
  assert.ok(row.tier === "paid" && Number(row.paid_until) > Date.now(), "paid_until set ~30 days out");

  // Member re-logs (tier change killed sessions), posts a thread.
  await member.get("/auth/login");
  await member.post("/auth/login", { identifier: "uid_member", password: "supersecret1", next: "/" });
  res = await member.post("/forum/new", { category: "general", title: "UID relocation survivor", body: "hold my posts" });
  assert.equal(res.status, 302, "paid member posts");

  // Admin moves them to vanity UID 5 — content and live session must follow.
  await admin.get("/admin/users");
  res = await admin.post(`/admin/users/${before.id}/uid`, { uid: "5" });
  assert.equal(res.status, 302);
  assert.ok(!(await db.get("SELECT id FROM users WHERE id = ?", before.id)), "old UID row gone");
  row = await db.get("SELECT id, tier FROM users WHERE username = 'uid_member'");
  assert.equal(Number(row.id), 5, "member now at UID 5");
  assert.ok(await db.get("SELECT id FROM threads WHERE user_id = 5 AND title = 'UID relocation survivor'"), "threads followed");
  assert.equal((await member.get("/profile")).status, 200, "member's session survived the UID move");

  // Taken UID and out-of-range UID are refused.
  res = await admin.post(`/admin/users/5/uid`, { uid: "0" });
  assert.equal((await db.get("SELECT id FROM users WHERE username = 'uid_member'")).id, 5, "taken UID refused");
  await admin.post(`/admin/users/5/uid`, { uid: "5000" });
  assert.equal((await db.get("SELECT id FROM users WHERE username = 'uid_member'")).id, 5, "out-of-range UID refused");

  // Admin sets goy's password; goy can now log in.
  const goy = await db.get("SELECT id FROM users WHERE username = 'goy'");
  await admin.post(`/admin/users/${goy.id}/password`, { password: "goy-password-123" });
  const goyClient = makeClient(app);
  await goyClient.get("/auth/login");
  res = await goyClient.post("/auth/login", { identifier: "goy", password: "goy-password-123", next: "/" });
  assert.equal(res.status, 302, "vanity account logs in with the admin-set password");

  // Paid expiry: back-date it and the account is Free everywhere, loader included.
  await db.run("UPDATE users SET paid_until = ? WHERE id = 5", Date.now() - 1000);
  await member.get("/auth/login");
  await member.post("/auth/login", { identifier: "uid_member", password: "supersecret1", next: "/" });
  res = await member.get("/forum");
  assert.equal(res.status, 403, "expired Paid is gated out of the forum");
  const api = (path, body) => app.fetch(new Request("http://local" + path, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  }), ENV);
  const auth = await (await api("/api/loader/auth", { username: "uid_member", password: "supersecret1" })).json();
  assert.ok(auth.ok && auth.tier === "user" && auth.paid === false && auth.subscription.expired === true,
    "loader API reports the expired subscription");
});

test("email: verification flow + posting gate, password reset, disposable domains, obfuscation", async () => {
  const EMAIL_ENV = { ...ENV, EMAIL_PROVIDER: "test", EMAIL_FROM: "no-reply@goyhub.test" };
  globalThis.__testEmails = [];
  const { app, db } = await buildTestApp(EMAIL_ENV);
  const emailClient = () => {
    const c = makeClient(app);
    const wrap = (fn) => async (...args) => {
      // makeClient closes over ENV; re-dispatch with EMAIL_ENV instead.
      const res = await fn(...args);
      return res;
    };
    return c;
  };

  // makeClient hardcodes ENV in fetch — build a local client bound to EMAIL_ENV.
  const jarClient = () => {
    const jar = new Map();
    const store = (res) => {
      for (const line of res.headers.getSetCookie()) {
        const [pair] = line.split(";");
        const i = pair.indexOf("=");
        if (pair.slice(i + 1).trim() === "") jar.delete(pair.slice(0, i).trim());
        else jar.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim());
      }
    };
    const req = async (method, path, body) => {
      const headers = { cookie: [...jar].map(([k, v]) => `${k}=${v}`).join("; ") };
      let payload;
      if (body) {
        headers["content-type"] = "application/x-www-form-urlencoded";
        payload = new URLSearchParams(body).toString();
      }
      const res = await app.fetch(new Request("http://local" + path, { method, headers, body: payload }), EMAIL_ENV);
      store(res);
      return res;
    };
    return {
      jar,
      get: (p) => req("GET", p),
      post: (p, b = {}) => req("POST", p, { _csrf: jar.get("ghcsrf") || "", ...b }),
    };
  };

  // Disposable domains are rejected outright.
  const spam = jarClient();
  await spam.get("/auth/signup");
  let res = await spam.post("/auth/signup", { username: "spammy", email: "x@mailinator.com", password: "supersecret1", confirm: "supersecret1", ...(await solveCaptcha(spam)) });
  assert.equal(res.status, 400, "disposable email rejected at signup");

  // Signup sends a verification email.
  const u = jarClient();
  await u.get("/auth/signup");
  res = await u.post("/auth/signup", { username: "mail_user", email: "mail@example.com", password: "supersecret1", confirm: "supersecret1", ...(await solveCaptcha(u)) });
  assert.equal(res.status, 302, "signup ok");
  const verifyMail = globalThis.__testEmails.find((m) => m.to === "mail@example.com" && /verify/i.test(m.subject));
  assert.ok(verifyMail, "verification email captured");

  // Unverified paid member cannot post; the gate points at the profile.
  await db.run("UPDATE users SET tier = 'paid' WHERE username = 'mail_user'");
  await u.get("/auth/login");
  await u.post("/auth/login", { identifier: "mail_user", password: "supersecret1", next: "/" });
  res = await u.post("/forum/new", { category: "general", title: "Should be blocked", body: "unverified" });
  assert.ok(res.status === 302 && res.headers.get("location") === "/profile", "unverified member redirected to profile");
  assert.ok(!(await db.get("SELECT id FROM threads WHERE title = 'Should be blocked'")), "no thread created");

  // Follow the emailed link -> verified -> posting works.
  const token = verifyMail.text.match(/\/auth\/verify\/([a-f0-9]{64})/)[1];
  res = await u.get(`/auth/verify/${token}`);
  assert.equal(res.status, 302, "verification link works");
  assert.ok((await db.get("SELECT email_verified_at FROM users WHERE username = 'mail_user'")).email_verified_at, "verified stamp set");
  res = await u.post("/forum/new", { category: "general", title: "Now allowed", body: "verified!" });
  assert.equal(res.status, 302, "verified member posts");
  assert.equal((await u.get(`/auth/verify/${token}`)).status, 302, "re-using the link is harmless");

  // Password reset end-to-end.
  globalThis.__testEmails = [];
  const anon = jarClient();
  await anon.get("/auth/forgot");
  res = await anon.post("/auth/forgot", { identifier: "mail_user" });
  assert.equal(res.status, 302, "forgot always succeeds outwardly");
  const resetMail = globalThis.__testEmails.find((m) => /reset/i.test(m.subject));
  assert.ok(resetMail, "reset email captured");
  const resetToken = resetMail.text.match(/\/auth\/reset\/([a-f0-9]{64})/)[1];
  assert.equal((await anon.get(`/auth/reset/${resetToken}`)).status, 200, "reset form renders");
  res = await anon.post(`/auth/reset/${resetToken}`, { password: "brand-new-pass-9", confirm: "brand-new-pass-9" });
  assert.equal(res.status, 302, "password reset");
  assert.ok(!(await db.get("SELECT id FROM sessions WHERE user_id = (SELECT id FROM users WHERE username = 'mail_user')")),
    "reset kills existing sessions");
  await anon.get("/auth/login");
  assert.equal((await anon.post("/auth/login", { identifier: "mail_user", password: "brand-new-pass-9", next: "/" })).status, 302, "new password works");
  res = await anon.get(`/auth/reset/${resetToken}`);
  assert.equal(res.status, 302, "used reset token is dead");

  // Unknown account: same outward response, no email.
  globalThis.__testEmails = [];
  const probe = jarClient();
  await probe.get("/auth/forgot");
  res = await probe.post("/auth/forgot", { identifier: "who_is_this" });
  assert.equal(res.status, 302, "no enumeration signal");
  assert.equal(globalThis.__testEmails.length, 0, "no email for unknown accounts");

  // Contact-email obfuscation: raw addresses never appear in HTML source.
  const faqHtml = await (await jarClient().get("/faq")).text();
  assert.ok(!faqHtml.includes("support@goyhub.st"), "raw contact email absent from source");
  assert.ok(faqHtml.includes('data-u="support"') && faqHtml.includes('data-d="goyhub.st"'), "obfuscated parts present");
});

test("forum: title rename, category edit, shout delete + 3/min limit, /buy alias", async () => {
  // A low RATE_LIMIT_SHOUT override keeps the throttle assertion short and
  // independent of whatever the shipped default is tuned to.
  const { app, db } = await buildTestApp({ ...ENV, RATE_LIMIT_SHOUT: "3" });
  const admin = makeClient(app);
  const author = makeClient(app);
  const other = makeClient(app);

  await admin.get("/auth/login");
  await admin.post("/auth/login", { identifier: "admin", password: "admin-test-password-1", next: "/" });
  for (const [c, name, mail] of [[author, "rename_author", "ra@example.com"], [other, "rename_other", "ro@example.com"]]) {
    await c.get("/auth/signup");
    await c.post("/auth/signup", { username: name, email: mail, password: "supersecret1", confirm: "supersecret1", ...(await solveCaptcha(c)) });
  }
  await db.run("UPDATE users SET tier = 'paid' WHERE username IN ('rename_author', 'rename_other')");

  let res = await author.post("/forum/new", { category: "general", title: "Original title", body: "text" });
  const threadId = res.headers.get("location").split("/").pop();

  // Author renames within the window; a stranger cannot.
  res = await other.post(`/forum/t/${threadId}/edit-title`, { title: "Hijacked" });
  assert.equal(res.status, 404, "non-author cannot rename");
  res = await author.post(`/forum/t/${threadId}/edit-title`, { title: "Renamed by author" });
  assert.equal(res.status, 302);
  assert.equal((await db.get("SELECT title FROM threads WHERE id = ?", threadId)).title, "Renamed by author");

  // Category edit: admin only; slug stays stable.
  const cat = await db.get("SELECT * FROM categories WHERE slug = 'general'");
  res = await admin.post(`/admin/categories/${cat.id}/edit`, { name: "General Chat", description: "All things GoyHub." });
  assert.equal(res.status, 302);
  const after = await db.get("SELECT * FROM categories WHERE id = ?", cat.id);
  assert.ok(after.name === "General Chat" && after.slug === "general", "name changed, slug stable");

  // Shoutbox: limit 3/min, staff delete, non-staff can't delete.
  for (let i = 1; i <= 3; i += 1) {
    res = await author.post("/forum/shoutbox", { body: `shout ${i}` });
    assert.equal(res.status, 302, `shout ${i} allowed`);
  }
  res = await author.post("/forum/shoutbox", { body: "shout 4" });
  assert.equal(res.status, 429, "4th shout in a minute is limited");

  const shout = await db.get("SELECT id FROM shouts ORDER BY id DESC LIMIT 1");
  res = await other.post(`/forum/shouts/${shout.id}/delete`);
  assert.equal(res.status, 404, "non-staff cannot delete shouts");
  res = await admin.post(`/forum/shouts/${shout.id}/delete`);
  assert.equal(res.status, 302, "staff deletes a shout");
  assert.ok(!(await db.get("SELECT id FROM shouts WHERE id = ?", shout.id)), "shout gone");
  assert.equal(
    (await db.get("SELECT event FROM ip_logs WHERE detail LIKE 'deleted shout%' ORDER BY id DESC LIMIT 1")).event,
    "shout_deleted", "shout delete logs under its own event, not admin_action"
  );

  // Purge: staff-only, clears every shout in one go, audited as shout_deleted.
  for (let i = 1; i <= 2; i += 1) {
    res = await other.post("/forum/shoutbox", { body: `purge fodder ${i}` });
    assert.equal(res.status, 302, `purge fodder ${i} posted`);
  }
  res = await other.post("/forum/shouts/purge");
  assert.equal(res.status, 404, "non-staff cannot purge the shoutbox");
  assert.ok((await db.get("SELECT COUNT(*) AS n FROM shouts")).n > 0, "shouts survive a non-staff purge attempt");
  res = await admin.post("/forum/shouts/purge");
  assert.equal(res.status, 302, "staff purges the shoutbox");
  assert.equal((await db.get("SELECT COUNT(*) AS n FROM shouts")).n, 0, "all shouts gone");
  assert.ok(
    await db.get("SELECT id FROM ip_logs WHERE event = 'shout_deleted' AND detail LIKE 'purged the shoutbox%' ORDER BY id DESC LIMIT 1"),
    "purge is audited"
  );

  // "Important only" IP-log filter hides shout-deletion noise but keeps real
  // moderation events (the category edit above logged as admin_action). The
  // event-type <select> always lists every event name as an <option>, so
  // check the per-row "tag-<event>" class rather than raw substring text.
  const importantHtml = await (await admin.get("/admin/logs?important=1")).text();
  assert.ok(!importantHtml.includes("tag-shout_deleted"), "important-only filter hides shout deletions");
  assert.ok(importantHtml.includes("tag-admin_action"), "important-only filter keeps real moderation events");

  // /buy is the upgrade page.
  const buyHtml = await (await other.get("/buy")).text();
  assert.ok(buyHtml.includes("Upgrade to Paid"), "/buy serves the upgrade page");
});

test("turnstile: optional layer verifies server-side and fails closed", async () => {
  const cfgOn = { TURNSTILE_SITE_KEY: "sk", TURNSTILE_SECRET_KEY: "secret" };
  const pass = await verifyTurnstile(cfgOn, "tok", "1.2.3.4",
    async () => ({ json: async () => ({ success: true }) }));
  assert.ok(pass.ok, "valid token accepted");
  const fail = await verifyTurnstile(cfgOn, "tok", "1.2.3.4",
    async () => ({ json: async () => ({ success: false, "error-codes": ["invalid-input-response"] }) }));
  assert.ok(!fail.ok, "rejected token fails");
  const missing = await verifyTurnstile(cfgOn, "", "1.2.3.4", async () => { throw new Error("never called"); });
  assert.ok(!missing.ok, "missing token fails without a network call");
  const down = await verifyTurnstile(cfgOn, "tok", "1.2.3.4", async () => { throw new Error("network down"); });
  assert.ok(!down.ok, "verification outage fails closed");
  const off = await verifyTurnstile({}, undefined, "1.2.3.4", async () => { throw new Error("never called"); });
  assert.ok(off.ok && off.skipped, "unconfigured Turnstile is a no-op");
});

test("download filename scrambler keeps base+ext, injects a unique token", () => {
  const a = scrambledFilename("GoyHub-Setup-1.0.0.exe");
  const b = scrambledFilename("GoyHub-Setup-1.0.0.exe");
  assert.ok(/^GoyHub-Setup-1\.0\.0-[a-f0-9]{8}\.exe$/.test(a), "shape preserved with token");
  assert.notEqual(a, b, "two calls differ");
  assert.equal(scrambledFilename("noext").slice(0, 6), "noext-", "extensionless names still get a token");
});

test("loadInstaller: DOWNLOAD_URL is fetched server-side and streamed, with NO fallback", async () => {
  const upstreamBody = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode("fake-installer-bytes"));
      controller.close();
    },
  });

  // Configured and reachable: the fetch goes to exactly DOWNLOAD_URL, and its
  // response body is handed back untouched for streaming — never buffered,
  // never inspected, so the route can pipe it straight to the client.
  let calledWith = null;
  const served = await loadInstaller(
    { DOWNLOAD_URL: "https://cdn.example.com/builds/GoyHub-Setup-1.0.0.exe" },
    async (url) => { calledWith = url; return { ok: true, body: upstreamBody }; }
  );
  assert.equal(calledWith, "https://cdn.example.com/builds/GoyHub-Setup-1.0.0.exe", "fetch targets DOWNLOAD_URL");
  assert.equal(served, upstreamBody, "upstream response body is returned as-is for streaming");

  // Network failure (DNS, timeout, connection refused, ...) is a hard failure
  // — null, not a silent substitute file.
  const onNetworkError = await loadInstaller(
    { DOWNLOAD_URL: "https://cdn.example.com/unreachable.zip" },
    async () => { throw new Error("network down"); }
  );
  assert.equal(onNetworkError, null, "no fallback on fetch failure — null, so the route reports 'unavailable'");

  // A non-OK upstream (404, 5xx, ...) is also a hard failure, not a fallback.
  const onNotOk = await loadInstaller(
    { DOWNLOAD_URL: "https://cdn.example.com/missing.zip" },
    async () => ({ ok: false, status: 404 })
  );
  assert.equal(onNotOk, null, "no fallback on a non-OK upstream response");

  // DOWNLOAD_URL unset: no network call is made, and there is nothing to fall
  // back to — null.
  const unset = await loadInstaller({}, async () => { throw new Error("must not be called"); });
  assert.equal(unset, null, "unset DOWNLOAD_URL skips the fetch and returns null — no fallback file");
});

test("download: DOWNLOAD_URL end-to-end — served when reachable, a clean 503 (never a fallback file) when it isn't", async () => {
  const downloadEnv = { ...ENV, DOWNLOAD_URL: "https://cdn.example.com/builds/GoyHub-Setup-1.0.0.exe" };
  const { app, db } = await buildTestApp(downloadEnv);
  const admin = makeClient(app);
  await admin.get("/auth/login");
  await admin.post("/auth/login", { identifier: "admin", password: "admin-test-password-1", next: "/" });

  const originalFetch = globalThis.fetch;
  try {
    // Reachable: the route streams the upstream bytes straight through, with
    // the usual per-download scrambled filename and audit log — the URL
    // itself never appears anywhere in the response.
    globalThis.fetch = async (url) => {
      assert.equal(url, downloadEnv.DOWNLOAD_URL, "route fetches exactly DOWNLOAD_URL");
      return new Response(new TextEncoder().encode("fake-installer-bytes"), { status: 200 });
    };
    let res = await admin.get("/download/file");
    const buf = await res.arrayBuffer();
    const disp = String(res.headers.get("content-disposition"));
    assert.ok(res.status === 200 && buf.byteLength > 0 && disp.includes(".exe"), "member download served from DOWNLOAD_URL");
    assert.ok(/filename="GoyHub-Setup-1\.0\.0-[a-f0-9]{8}\.exe"/.test(disp), "download filename is scrambled");
    assert.ok(!JSON.stringify([...res.headers.entries()]).includes("cdn.example.com"), "DOWNLOAD_URL is never sent to the client");

    const res2 = await admin.get("/download/file");
    await res2.arrayBuffer();
    assert.notEqual(res.headers.get("content-disposition"), res2.headers.get("content-disposition"),
      "each download gets a different filename");
    assert.equal(Number((await db.get("SELECT COUNT(*) AS n FROM ip_logs WHERE event = 'download' AND username = 'admin'")).n), 2,
      "each successful download is logged");

    // Now DOWNLOAD_URL is broken (host down, 404, whatever) — this must be a
    // clean failure, NOT a silent fallback to the embedded placeholder.
    globalThis.fetch = async () => { throw new Error("simulated network outage"); };
    res = await admin.get("/download/file");
    assert.equal(res.status, 503, "broken DOWNLOAD_URL is a clean 'unavailable', never a fallback file");
    assert.equal(Number((await db.get("SELECT COUNT(*) AS n FROM ip_logs WHERE event = 'download' AND username = 'admin'")).n), 2,
      "the failed attempt is not logged as a successful download");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("download rate limit: high default threshold, staff/admin fully exempt", async () => {
  assert.equal(RATE_LIMIT_DEFAULTS.download.limit, 60, "download rate limit default is 60, not the old strict 3");

  // A low override keeps this test fast while proving the mechanics: a
  // regular Paid member is throttled past the configured limit, but an
  // admin sails past that same limit untouched.
  const downloadEnv = {
    ...ENV,
    DOWNLOAD_URL: "https://cdn.example.com/builds/GoyHub-Setup-1.0.0.exe",
    RATE_LIMIT_DOWNLOAD: "3",
  };
  const { app, db } = await buildTestApp(downloadEnv);
  const admin = makeClient(app);
  const member = makeClient(app);

  await admin.get("/auth/login");
  await admin.post("/auth/login", { identifier: "admin", password: "admin-test-password-1", next: "/" });

  await member.get("/auth/signup");
  await member.post("/auth/signup", {
    username: "download_member", email: "dlm@example.com",
    password: "supersecret1", confirm: "supersecret1", ...(await solveCaptcha(member)),
  });
  await db.run("UPDATE users SET tier = 'paid' WHERE username = 'download_member'");

  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response(new TextEncoder().encode("fake-installer-bytes"), { status: 200 });

    for (let i = 0; i < 3; i += 1) {
      const res = await member.get("/download/file");
      await res.arrayBuffer();
      assert.equal(res.status, 200, `member download ${i + 1}/3 within RATE_LIMIT_DOWNLOAD succeeds`);
    }
    const throttled = await member.get("/download/file");
    assert.equal(throttled.status, 429, "member is throttled past RATE_LIMIT_DOWNLOAD");

    // Same low limit, but admin never gets the 429 — the gate is skipped for
    // staff entirely, not just given a bigger allowance.
    for (let i = 0; i < 5; i += 1) {
      const res = await admin.get("/download/file");
      await res.arrayBuffer();
      assert.equal(res.status, 200, `admin download ${i + 1}/5 is never rate-limited`);
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("smtp client: correct SMTPS conversation for Cloudflare's Email Service relay", async () => {
  const wire = [];
  const replies = ["220 smtp.mx.cloudflare.net ESMTP", "250-smtp.mx.cloudflare.net", "250 8BITMIME",
    "235 2.7.0 accepted", "250 2.1.0 ok", "250 2.1.5 ok", "354 go ahead", "250 2.0.0 queued", "221 bye"];
  const transport = {
    readLine: async () => replies.shift(),
    write: async (data) => { wire.push(data); },
    close: async () => {},
  };
  await smtpConversation(transport, {
    username: "api_token", password: "cf_secret_token",
    from: "no-reply@goyhub.st", fromName: "GoyHub",
    to: "member@example.com", subject: "Verify your GoyHub email",
    text: "Hello — verify here.\n.starts with a dot\n",
  });
  const all = wire.join("");
  assert.ok(wire[0].startsWith("EHLO "), "EHLO first");
  const authB64 = wire[1].match(/^AUTH PLAIN (\S+)/)[1];
  assert.equal(Buffer.from(authB64, "base64").toString("utf8"), "\u0000api_token\u0000cf_secret_token",
    "SASL PLAIN is NUL-separated user/token");
  assert.ok(all.includes("MAIL FROM:<no-reply@goyhub.st>\r\n"), "MAIL FROM");
  assert.ok(all.includes("RCPT TO:<member@example.com>\r\n"), "RCPT TO");
  assert.ok(all.includes("Subject: Verify your GoyHub email"), "subject header");
  assert.ok(all.includes("Content-Transfer-Encoding: base64"), "UTF-8-safe body encoding");
  assert.ok(/\r\n\.\r\nQUIT/.test(all), "terminating dot then QUIT");

  // The multiline EHLO reply above (250- then 250 space) was consumed as ONE
  // reply — otherwise AUTH would have been matched against the wrong line.
  assert.equal(replies.length, 0, "every scripted reply consumed exactly once");

  // Message building: dot-stuffing applies to the encoded payload lines.
  const msg = buildMessage({ from: "a@b.c", fromName: 'Bad"Name', to: "x@y.z", subject: "Line\nbreak", text: "hi" });
  assert.ok(msg.includes("From: \"Bad'Name\" <a@b.c>"), "quote-safe display name");
  assert.ok(msg.includes("Subject: Line break"), "header injection neutralised");

  // Provider wiring: cloudflare counts as configured only with key + sender.
  assert.ok(isEmailConfigured({ EMAIL_PROVIDER: "cloudflare", EMAIL_API_KEY: "k", EMAIL_FROM: "a@b.c" }));
  assert.ok(!isEmailConfigured({ EMAIL_PROVIDER: "cloudflare", EMAIL_FROM: "a@b.c" }), "no key = not configured");
});

test("subscriptions: per-user day adjustment, mass adjustment, unambiguous API fields", async () => {
  const { app, db } = await buildTestApp(ENV);
  const admin = makeClient(app);
  await admin.get("/auth/login");
  await admin.post("/auth/login", { identifier: "admin", password: "admin-test-password-1", next: "/" });

  // Three paid members: dated-active, dated-expired, lifetime.
  for (const [name, mail] of [["sub_active", "sa2@example.com"], ["sub_expired", "se2@example.com"], ["sub_life", "sl2@example.com"]]) {
    const c = makeClient(app);
    await c.get("/auth/signup");
    await c.post("/auth/signup", { username: name, email: mail, password: "supersecret1", confirm: "supersecret1", ...(await solveCaptcha(c)) });
  }
  const DAY = 86_400_000;
  const now = Date.now();
  await db.run("UPDATE users SET tier='paid', role='user', paid_until=? WHERE username='sub_active'", now + 10 * DAY);
  await db.run("UPDATE users SET tier='paid', role='user', paid_until=? WHERE username='sub_expired'", now - 5 * DAY);
  await db.run("UPDATE users SET tier='paid', role='user', paid_until=NULL WHERE username='sub_life'");
  const id = async (n) => (await db.get("SELECT id FROM users WHERE username = ?", n)).id;

  // Individual: +5 days on an active sub extends from its current end.
  await admin.get("/admin/users");
  let res = await admin.post(`/admin/users/${await id("sub_active")}/paid-days`, { delta_days: "5" });
  assert.equal(res.status, 302);
  let row = await db.get("SELECT paid_until FROM users WHERE username='sub_active'");
  assert.ok(Math.abs(Number(row.paid_until) - (now + 15 * DAY)) < 60_000, "active sub extended from its end date");

  // Individual: +7 on an EXPIRED sub counts from now, not from the past.
  res = await admin.post(`/admin/users/${await id("sub_expired")}/paid-days`, { delta_days: "7" });
  row = await db.get("SELECT paid_until FROM users WHERE username='sub_expired'");
  assert.ok(Math.abs(Number(row.paid_until) - (now + 7 * DAY)) < 60_000, "expired sub restarts from now");

  // Individual: negative below zero clamps to expired-now, never negative time.
  res = await admin.post(`/admin/users/${await id("sub_expired")}/paid-days`, { delta_days: "-500" });
  row = await db.get("SELECT paid_until FROM users WHERE username='sub_expired'");
  assert.ok(Number(row.paid_until) <= Date.now() + 1000, "clamped to now (expired)");

  // Non-paid target refused.
  const freeC = makeClient(app);
  await freeC.get("/auth/signup");
  await freeC.post("/auth/signup", { username: "sub_free", email: "sf2@example.com", password: "supersecret1", confirm: "supersecret1", ...(await solveCaptcha(freeC)) });
  res = await admin.post(`/admin/users/${await id("sub_free")}/paid-days`, { delta_days: "5" });
  row = await db.get("SELECT paid_until FROM users WHERE username='sub_free'");
  assert.equal(row.paid_until, null, "non-paid accounts untouched");

  // Mass: +3 days to every DATED sub; lifetime stays NULL.
  const before = Number((await db.get("SELECT paid_until FROM users WHERE username='sub_active'")).paid_until);
  res = await admin.post("/admin/subscriptions/adjust", { delta_days: "3" });
  assert.equal(res.status, 302);
  row = await db.get("SELECT paid_until FROM users WHERE username='sub_active'");
  assert.ok(Math.abs(Number(row.paid_until) - (before + 3 * DAY)) < 60_000, "mass adjust extended the dated sub");
  assert.equal((await db.get("SELECT paid_until FROM users WHERE username='sub_life'")).paid_until, null, "lifetime untouched by mass adjust");
  // The expired-then-clamped one restarts from ~now + 3d.
  row = await db.get("SELECT paid_until FROM users WHERE username='sub_expired'");
  assert.ok(Number(row.paid_until) > Date.now() + 2 * DAY, "expired sub included, counted from now");

  // Staff below admin cannot use either control.
  const dev = makeClient(app);
  await dev.get("/auth/signup");
  await dev.post("/auth/signup", { username: "sub_dev", email: "sd2@example.com", password: "supersecret1", confirm: "supersecret1", ...(await solveCaptcha(dev)) });
  await db.run("UPDATE users SET tier='developer' WHERE username='sub_dev'");
  await dev.get("/auth/login");
  await dev.post("/auth/login", { identifier: "sub_dev", password: "supersecret1", next: "/" });
  await dev.get("/admin/users");
  assert.equal((await dev.post("/admin/subscriptions/adjust", { delta_days: "9" })).status, 404, "mass adjust is full-admin only");
  assert.equal((await dev.post(`/admin/users/${await id("sub_active")}/paid-days`, { delta_days: "9" })).status, 404, "per-user adjust is full-admin only");

  // API: both expiries clearly distinguishable; daysLeft/ISO provided.
  const api = (path, body) => app.fetch(new Request("http://local" + path, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  }), ENV);
  const auth = await (await api("/api/loader/auth", { username: "sub_active", password: "supersecret1" })).json();
  assert.ok(auth.subscription.daysLeft >= 17 && auth.subscription.daysLeft <= 19, `daysLeft ≈ 18 (got ${auth.subscription.daysLeft})`);
  assert.ok(/^\d{4}-\d{2}-\d{2}T/.test(auth.subscription.paidUntilIso), "ISO expiry provided");
  assert.equal(auth.subscription.lifetime, false);
  assert.ok(auth.license.expiresAt - auth.license.issuedAt === 24 * 3600 * 1000, "token TTL is 24h — distinct from the subscription");
  const life = await (await api("/api/loader/auth", { username: "sub_life", password: "supersecret1" })).json();
  assert.ok(life.subscription.lifetime === true && life.subscription.daysLeft === null && life.paid === true,
    "lifetime is explicit: paid=true, daysLeft=null, lifetime=true");
});

test("btcpay: signature verification and paid-until math", async () => {
  const secret = "webhook-signing-secret";
  const raw = JSON.stringify({ type: "InvoiceSettled", invoiceId: "X", storeId: "S" });
  const good = crypto.createHmac("sha256", secret).update(raw).digest("hex");

  assert.equal(await verifyWebhookSignature(secret, raw, `sha256=${good}`), true, "correct signature accepted");
  assert.equal(await verifyWebhookSignature(secret, raw, good), true, "accepts a bare hex signature too");
  assert.equal(await verifyWebhookSignature(secret, raw, `sha256=${"0".repeat(64)}`), false, "wrong signature rejected");
  assert.equal(await verifyWebhookSignature(secret, raw + " ", `sha256=${good}`), false, "tampered body rejected");
  assert.equal(await verifyWebhookSignature(secret, raw, ""), false, "missing signature rejected");
  assert.equal(await verifyWebhookSignature("", raw, `sha256=${good}`), false, "no secret configured rejects");

  const now = 1_000_000_000_000;
  const DAY = 86_400_000;
  assert.equal(extendPaidUntil(null, null, now), null, "lifetime purchase => null expiry");
  assert.equal(extendPaidUntil(null, 30, now), now + 30 * DAY, "new member counts from now");
  assert.equal(extendPaidUntil(now - DAY, 30, now), now + 30 * DAY, "expired member counts from now");
  assert.equal(extendPaidUntil(now + 10 * DAY, 30, now), now + 40 * DAY, "active member extends from current expiry");

  // configured is all-or-nothing on the required pieces.
  assert.equal(btcpayConfig({}).configured, false, "empty env is not configured");
  assert.equal(btcpayConfig({
    BTCPAY_URL: "https://b.test/", BTCPAY_STORE_ID: "s", BTCPAY_API_KEY: "k",
    BTCPAY_WEBHOOK_SECRET: "w", PAID_PRICE_AMOUNT: "10",
  }).configured, true, "all required pieces => configured");
  assert.equal(btcpayConfig({
    BTCPAY_URL: "https://b.test", BTCPAY_STORE_ID: "s", BTCPAY_API_KEY: "k", PAID_PRICE_AMOUNT: "10",
  }).configured, false, "missing webhook secret => not configured");
  assert.equal(btcpayConfig({ BTCPAY_URL: "https://b.test/" }).url, "https://b.test", "trailing slash trimmed");
});

test("btcpay: checkout creates an invoice and a settled webhook grants Paid (idempotently)", async () => {
  const BTCPAY_ENV = {
    ...ENV,
    BTCPAY_URL: "https://btcpay.test",
    BTCPAY_STORE_ID: "STORE1",
    BTCPAY_API_KEY: "greenfield-key",
    BTCPAY_WEBHOOK_SECRET: "hook-secret-123",
    PAID_PRICE_AMOUNT: "10.00",
    PAID_PRICE_CURRENCY: "USD",
    PAID_PERIOD_DAYS: "30",
  };
  const { app, db } = await buildTestApp(BTCPAY_ENV);

  // A real BTCPay server would be reached over fetch(); stub it so the test is
  // hermetic. POST /invoices returns a new invoice; GET /invoices/:id returns
  // whatever `settledInvoice` currently holds.
  const realFetch = globalThis.fetch;
  let settledInvoice = null;
  globalThis.fetch = async (url, opts = {}) => {
    const u = String(url);
    const jsonRes = (status, obj) => new Response(JSON.stringify(obj), {
      status, headers: { "content-type": "application/json" },
    });
    if (opts.method === "POST" && /\/api\/v1\/stores\/STORE1\/invoices$/.test(u)) {
      // Echo the caller's Authorization to prove the key is sent.
      assert.equal(opts.headers.Authorization, "token greenfield-key", "store API key sent");
      return jsonRes(200, { id: "INV123", checkoutLink: "https://btcpay.test/i/INV123", status: "New" });
    }
    if (u.endsWith("/api/v1/stores/STORE1/invoices/INV123")) {
      return jsonRes(200, settledInvoice);
    }
    return jsonRes(404, {});
  };

  try {
    globalThis.PBKDF2_ITERATIONS_OVERRIDE = "10000";
    const memberPw = "buyer-pass-123";
    await db.run(
      "INSERT INTO users (username, email, password_hash, tier) VALUES (?, ?, ?, 'user')",
      "buyer", "buyer@example.com", await hashPassword(memberPw)
    );

    const member = makeClient(app);
    await member.get("/auth/login");
    let res = await member.post("/auth/login", { identifier: "buyer", password: memberPw, next: "/" });
    assert.ok(res.status === 302 && member.jar.has("ghsession"), "member logged in");

    // The upgrade page shows the automated pay button now that BTCPay is set.
    let html = await (await member.get("/upgrade")).text();
    assert.ok(html.includes('action="/upgrade/checkout"') && html.includes("Pay with crypto"), "checkout form shown");

    // Start checkout -> a pending payment row + redirect to the BTCPay invoice.
    res = await member.raw("POST", "/upgrade/checkout", { _csrf: member.jar.get("ghcsrf") });
    assert.equal(res.status, 302, "checkout redirects");
    assert.equal(res.headers.get("location"), "https://btcpay.test/i/INV123", "redirects to the BTCPay invoice");

    const buyer = await db.get("SELECT id FROM users WHERE username = 'buyer'");
    const payment = await db.get("SELECT * FROM payments WHERE user_id = ?", buyer.id);
    assert.ok(payment && payment.invoice_id === "INV123" && payment.status === "new", "pending payment row created");
    assert.equal(payment.amount, "10.00");
    assert.equal(payment.period_days, 30);
    assert.ok(await db.get("SELECT id FROM ip_logs WHERE event = 'checkout_created'"), "checkout audited");

    // Helper to POST a signed webhook exactly as BTCPay would.
    const sendWebhook = (bodyObj, { sig } = {}) => {
      const body = JSON.stringify(bodyObj);
      const signature = sig ?? "sha256=" + crypto.createHmac("sha256", "hook-secret-123").update(body).digest("hex");
      return app.fetch(new Request("http://local/api/btcpay/webhook", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "btcpay-sig": signature,
          "content-length": String(Buffer.byteLength(body)),
        },
        body,
      }), BTCPAY_ENV);
    };

    const settledBody = { type: "InvoiceSettled", invoiceId: "INV123", storeId: "STORE1" };

    // A forged (bad-signature) webhook must be rejected and grant nothing.
    res = await sendWebhook(settledBody, { sig: "sha256=" + "0".repeat(64) });
    assert.equal(res.status, 400, "bad signature rejected");
    assert.equal((await db.get("SELECT tier FROM users WHERE id = ?", buyer.id)).tier, "user", "no grant on bad signature");
    assert.ok(await db.get("SELECT id FROM ip_logs WHERE event = 'btcpay_webhook_rejected'"), "rejection audited");

    // A validly-signed webhook whose invoice the store reports as Settled grants Paid.
    settledInvoice = { id: "INV123", status: "Settled", amount: "10.00", currency: "USD", metadata: { orderId: payment.order_id } };
    res = await sendWebhook(settledBody);
    assert.equal(res.status, 200, "signed settled webhook accepted");
    assert.deepEqual(await res.json(), { ok: true, granted: true }, "reports granted");

    let row = await db.get("SELECT tier, paid_until FROM users WHERE id = ?", buyer.id);
    assert.equal(row.tier, "paid", "member upgraded to paid");
    assert.ok(Math.abs(Number(row.paid_until) - (Date.now() + 30 * 86_400_000)) < 5 * 60_000, "paid_until ~30 days out");
    const credited = await db.get("SELECT status, credited_at FROM payments WHERE invoice_id = 'INV123'");
    assert.ok(credited.status === "settled" && credited.credited_at, "payment marked settled + credited");
    assert.ok(await db.get("SELECT id FROM ip_logs WHERE event = 'membership_granted'"), "grant audited");

    // Idempotency: replaying the same settled webhook must NOT extend again.
    const paidBefore = Number(row.paid_until);
    res = await sendWebhook(settledBody);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { ok: true, already: true }, "replay is a no-op");
    row = await db.get("SELECT paid_until FROM users WHERE id = ?", buyer.id);
    assert.equal(Number(row.paid_until), paidBefore, "replayed webhook did not extend the membership");

    // An amount that doesn't match the priced invoice must not grant.
    await db.run(
      "INSERT INTO payments (order_id, invoice_id, user_id, username, amount, currency, period_days, status) VALUES ('ord2','INV999',?,?,'10.00','USD',30,'new')",
      buyer.id, "buyer"
    );
    settledInvoice = { id: "INV999", status: "Settled", amount: "0.01", currency: "USD", metadata: { orderId: "ord2" } };
    globalThis.fetch = (async (url, opts = {}) => {
      const u = String(url);
      if (u.endsWith("/invoices/INV999")) return new Response(JSON.stringify(settledInvoice), { status: 200, headers: { "content-type": "application/json" } });
      return new Response("{}", { status: 404 });
    });
    res = await sendWebhook({ type: "InvoiceSettled", invoiceId: "INV999", storeId: "STORE1" });
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { ok: false, error: "mismatch" }, "amount mismatch is not credited");
    const notCredited = await db.get("SELECT credited_at FROM payments WHERE invoice_id = 'INV999'");
    assert.equal(notCredited.credited_at, null, "mismatched invoice left uncredited");

    // Staff have nothing to buy — checkout must not take their money or create
    // an invoice. (Guards for lifetime members work the same way.)
    await db.run("UPDATE users SET tier = 'developer', paid_until = NULL WHERE id = ?", buyer.id);
    const countBefore = Number((await db.get("SELECT COUNT(*) AS n FROM payments WHERE user_id = ?", buyer.id)).n);
    res = await member.post("/upgrade/checkout", {});
    assert.ok(res.status === 302 && res.headers.get("location") === "/upgrade", "staff redirected away from checkout");
    const countAfter = Number((await db.get("SELECT COUNT(*) AS n FROM payments WHERE user_id = ?", buyer.id)).n);
    assert.equal(countAfter, countBefore, "no invoice created for a staff member");
  } finally {
    globalThis.fetch = realFetch;
  }
});

/* ---------------------------------------------------------------------------
 * Multi-plan catalogue + fulfilment that does not depend on the webhook.
 * ------------------------------------------------------------------------- */

test("plans: STORE_PLANS parses, junk is dropped, single-price config still works", async () => {
  const { storePlans, findPlan, parsePlans, planDuration } = await import("../functions/_lib/plans.js");

  const parsed = parsePlans("m1:1 Month:9.99:30,bad:Nope:free:30,life:Lifetime:99:0,short:Missing:5");
  assert.deepEqual(parsed.map((p) => p.id), ["m1", "life"], "only well-formed entries survive");
  assert.equal(parsed[1].periodDays, null, "0 days means lifetime");

  // Back-compat: the original single-price vars still produce exactly one plan.
  const single = storePlans({ PAID_PRICE_AMOUNT: "10.00", PAID_PERIOD_DAYS: "30" });
  assert.equal(single.length, 1);
  assert.equal(single[0].amount, "10.00");
  assert.equal(single[0].periodDays, 30);

  // Nothing configured must never invent a price.
  assert.deepEqual(storePlans({}), [], "no config, nothing for sale");
  assert.equal(findPlan({ STORE_PLANS: "m1:1 Month:9.99:30" }, "nope"), null, "unknown id resolves to nothing");
  assert.equal(planDuration(365), "1 year");
  assert.equal(planDuration(null), "Never expires");
});

test("buy: /buy offers every plan and prices the invoice from the catalogue, not the request", async () => {
  const BTCPAY_ENV = {
    ...ENV,
    BTCPAY_URL: "https://btcpay.test",
    BTCPAY_STORE_ID: "STORE1",
    BTCPAY_API_KEY: "greenfield-key",
    BTCPAY_WEBHOOK_SECRET: "hook-secret-123",
    STORE_PLANS: "m1:1 Month:9.99:30,life:Lifetime:149.99:0",
    PAID_PRICE_CURRENCY: "USD",
  };
  const { app, db } = await buildTestApp(BTCPAY_ENV);

  let created = null;
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, opts = {}) => {
    const u = String(url);
    if (opts.method === "POST" && u.endsWith("/invoices")) {
      created = JSON.parse(opts.body);
      return Response.json({ id: "INV_P", checkoutLink: "https://btcpay.test/i/INV_P", status: "New" });
    }
    return Response.json({}, { status: 404 });
  };

  try {
    globalThis.PBKDF2_ITERATIONS_OVERRIDE = "10000";
    const { hashPassword } = await import("../functions/_lib/crypto.js");
    await db.run("INSERT INTO users (username, email, password_hash, tier) VALUES ('planbuyer','pb@e.com',?, 'user')",
      await hashPassword("buyer-pass-123"));
    const member = makeClient(app);
    await member.get("/auth/login");
    await member.post("/auth/login", { identifier: "planbuyer", password: "buyer-pass-123", next: "/" });

    const html = await (await member.get("/buy")).text();
    assert.ok(html.includes("1 Month") && html.includes("9.99"), "monthly plan offered at /buy");
    assert.ok(html.includes("Lifetime") && html.includes("149.99"), "lifetime plan offered at /buy");
    assert.ok(html.includes('name="plan" value="life"'), "each card carries only its plan id");

    // Buying the lifetime plan must price the invoice at the lifetime price.
    const res = await member.post("/upgrade/checkout", { plan: "life" });
    assert.equal(res.status, 302);
    assert.equal(created.amount, "149.99", "invoice priced from the catalogue entry");
    const payment = await db.get("SELECT * FROM payments ORDER BY id DESC LIMIT 1");
    assert.equal(payment.amount, "149.99");
    assert.equal(payment.period_days, null, "lifetime stored as no period");
    assert.equal(payment.plan_id, "life");

    // A plan id that isn't in the catalogue is refused, not charged at a default.
    const bogus = await member.post("/upgrade/checkout", { plan: "free-forever" });
    assert.equal(bogus.headers.get("location"), "/buy");
    assert.equal(Number((await db.get("SELECT COUNT(*) AS n FROM payments")).n), 1, "no row for an unknown plan");
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("fulfilment: a settled invoice is credited without any webhook ever arriving", async () => {
  const BTCPAY_ENV = {
    ...ENV,
    BTCPAY_URL: "https://btcpay.test",
    BTCPAY_STORE_ID: "STORE1",
    BTCPAY_API_KEY: "greenfield-key",
    BTCPAY_WEBHOOK_SECRET: "hook-secret-123",
    PAID_PRICE_AMOUNT: "10.00",
    PAID_PRICE_CURRENCY: "USD",
    PAID_PERIOD_DAYS: "30",
  };
  const { app, db } = await buildTestApp(BTCPAY_ENV);

  let invoiceState = { id: "INV_R", status: "New", amount: "10.00", currency: "USD" };
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, opts = {}) => {
    const u = String(url);
    if (opts.method === "POST" && u.endsWith("/invoices")) {
      return Response.json({ id: "INV_R", checkoutLink: "https://btcpay.test/i/INV_R", status: "New" });
    }
    if (u.endsWith("/invoices/INV_R")) return Response.json(invoiceState);
    return Response.json({}, { status: 404 });
  };

  try {
    globalThis.PBKDF2_ITERATIONS_OVERRIDE = "10000";
    const { hashPassword } = await import("../functions/_lib/crypto.js");
    await db.run("INSERT INTO users (username, email, password_hash, tier) VALUES ('lonebuyer','lb@e.com',?, 'user')",
      await hashPassword("buyer-pass-123"));
    const member = makeClient(app);
    await member.get("/auth/login");
    await member.post("/auth/login", { identifier: "lonebuyer", password: "buyer-pass-123", next: "/" });
    await member.post("/upgrade/checkout", {});
    const order = (await db.get("SELECT order_id FROM payments ORDER BY id DESC LIMIT 1")).order_id;

    // Still unpaid: nothing is granted just because a page was loaded.
    await member.get("/profile");
    assert.equal((await db.get("SELECT tier FROM users WHERE username='lonebuyer'")).tier, "user");

    // The buyer pays. No webhook is ever delivered — they just come back.
    invoiceState = { ...invoiceState, status: "Settled" };
    await member.get(`/upgrade/thanks?order=${order}`);

    let user = await db.get("SELECT tier, paid_until FROM users WHERE username='lonebuyer'");
    assert.equal(user.tier, "paid", "returning from checkout credits the payment");
    assert.ok(Math.abs(Number(user.paid_until) - (Date.now() + 30 * 86_400_000)) < 60_000, "30 days granted");
    const paid = await db.get("SELECT status, credited_at FROM payments WHERE order_id = ?", order);
    assert.equal(paid.status, "settled");
    assert.ok(paid.credited_at, "credit claimed exactly once");

    // Loading more pages must not stack a second period on top.
    const expiry = Number(user.paid_until);
    await member.get("/profile");
    await member.get("/buy");
    user = await db.get("SELECT paid_until FROM users WHERE username='lonebuyer'");
    assert.equal(Number(user.paid_until), expiry, "re-checks are idempotent");

    // And a late webhook for the same invoice still can't double-credit.
    const raw = JSON.stringify({ type: "InvoiceSettled", invoiceId: "INV_R", storeId: "STORE1" });
    const sig = "sha256=" + crypto.createHmac("sha256", "hook-secret-123").update(raw).digest("hex");
    const hookRes = await app.fetch(new Request("http://local/api/btcpay/webhook", {
      method: "POST", headers: { "content-type": "application/json", "btcpay-sig": sig }, body: raw,
    }), BTCPAY_ENV);
    assert.equal(hookRes.status, 200);
    assert.equal((await hookRes.json()).already, true, "late webhook sees the credit already claimed");
    assert.equal(Number((await db.get("SELECT paid_until FROM users WHERE username='lonebuyer'")).paid_until), expiry);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("fulfilment: the admin sweep catches a buyer who paid and never came back", async () => {
  const BTCPAY_ENV = {
    ...ENV,
    BTCPAY_URL: "https://btcpay.test",
    BTCPAY_STORE_ID: "STORE1",
    BTCPAY_API_KEY: "greenfield-key",
    BTCPAY_WEBHOOK_SECRET: "hook-secret-123",
    PAID_PRICE_AMOUNT: "10.00",
    PAID_PRICE_CURRENCY: "USD",
    PAID_PERIOD_DAYS: "30",
  };
  const { app, db } = await buildTestApp(BTCPAY_ENV);
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url) => String(url).endsWith("/invoices/INV_S")
    ? Response.json({ id: "INV_S", status: "Settled", amount: "10.00", currency: "USD" })
    : Response.json({}, { status: 404 });

  try {
    globalThis.PBKDF2_ITERATIONS_OVERRIDE = "10000";
    const { hashPassword } = await import("../functions/_lib/crypto.js");
    await db.run("INSERT INTO users (username, email, password_hash, tier) VALUES ('ghostbuyer','gb@e.com',?, 'user')",
      await hashPassword("x"));
    const uid = (await db.get("SELECT id FROM users WHERE username='ghostbuyer'")).id;
    // An invoice paid an hour ago whose buyer never returned and whose webhook
    // never arrived.
    await db.run(
      `INSERT INTO payments (order_id, invoice_id, user_id, username, amount, currency, period_days, status, created_at, updated_at)
       VALUES ('ORD_S', 'INV_S', ?, 'ghostbuyer', '10.00', 'USD', 30, 'new', datetime('now','-1 hour'), datetime('now','-1 hour'))`,
      uid
    );

    const admin = makeClient(app);
    await admin.get("/auth/login");
    await admin.post("/auth/login", { identifier: "admin", password: "admin-test-password-1", next: "/admin" });

    const html = await (await admin.get("/admin/payments")).text();
    assert.ok(html.includes("ghostbuyer"), "the payment is listed in the queue");

    const user = await db.get("SELECT tier, paid_until FROM users WHERE username='ghostbuyer'");
    assert.equal(user.tier, "paid", "the sweep credited the abandoned payment");
    assert.ok(Math.abs(Number(user.paid_until) - (Date.now() + 30 * 86_400_000)) < 60_000);
    assert.ok(await db.get("SELECT id FROM ip_logs WHERE event = 'membership_granted'"), "grant audited");

    // Members must not be able to reach the queue or its actions.
    const member = makeClient(app);
    assert.equal((await member.get("/admin/payments")).status, 404);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("admin shop: products added in the panel are what /buy sells and what checkout charges", async () => {
  const BTCPAY_ENV = {
    ...ENV,
    BTCPAY_URL: "https://btcpay.test",
    BTCPAY_STORE_ID: "STORE1",
    BTCPAY_API_KEY: "greenfield-key",
    BTCPAY_WEBHOOK_SECRET: "hook-secret-123",
    PAID_PRICE_CURRENCY: "USD",
  };
  const { app, db } = await buildTestApp(BTCPAY_ENV);

  let created = null;
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, opts = {}) => {
    if (opts.method === "POST" && String(url).endsWith("/invoices")) {
      created = JSON.parse(opts.body);
      return Response.json({ id: "INV_SHOP", checkoutLink: "https://btcpay.test/i/INV_SHOP", status: "New" });
    }
    return Response.json({}, { status: 404 });
  };

  try {
    globalThis.PBKDF2_ITERATIONS_OVERRIDE = "10000";
    const admin = makeClient(app);
    await admin.get("/auth/login");
    await admin.post("/auth/login", { identifier: "admin", password: "admin-test-password-1", next: "/admin" });

    // Nothing for sale yet: the shop is empty and /buy says so rather than
    // rendering an empty grid.
    let html = await (await admin.get("/admin/shop")).text();
    assert.ok(html.includes("No products yet"), "empty shop states it plainly");
    assert.ok((await (await admin.get("/buy")).text()).includes("being set up"),
      "a connected BTCPay with no products is not a checkout");

    // Add the lengths the shop should offer, including a custom one.
    await admin.post("/admin/shop/new", { name: "1 day", amount: "1.50", period_days: "1" });
    await admin.post("/admin/shop/new", { name: "7 days", amount: "5.00", period_days: "7" });
    await admin.post("/admin/shop/new", { name: "30 days", amount: "9.99", period_days: "30",
      description: "Full access for a month." });
    await admin.post("/admin/shop/new", { name: "90 days", amount: "24.99", period_days: "90" });
    await admin.post("/admin/shop/new", { name: "365 days", amount: "79.99", period_days: "365" });
    await admin.post("/admin/shop/new", { name: "Lifetime", amount: "149.99", period_days: "0" });
    await admin.post("/admin/shop/new", { name: "Fortnight", amount: "3.00", period_days: "30", custom_days: "14" });

    const products = await db.all("SELECT * FROM products ORDER BY position");
    assert.equal(products.length, 7);
    assert.equal(products.find((p) => p.name === "Lifetime").period_days, null, "0 days stored as lifetime");
    assert.equal(products.find((p) => p.name === "Fortnight").period_days, 14, "custom days beats the preset");
    assert.deepEqual(products.map((p) => p.slug).slice(0, 3), ["1-day", "7-days", "30-days"], "slugs derived from names");

    // Bad input is refused rather than stored as a broken price.
    await admin.post("/admin/shop/new", { name: "Free stuff", amount: "free", period_days: "30" });
    await admin.post("/admin/shop/new", { name: "", amount: "5.00", period_days: "30" });
    await admin.post("/admin/shop/new", { name: "Forever", amount: "5.00", custom_days: "99999" });
    assert.equal(Number((await db.get("SELECT COUNT(*) AS n FROM products")).n), 7, "invalid products rejected");

    // /buy now offers exactly those products.
    html = await (await admin.get("/buy")).text();
    for (const label of ["1 day", "7 days", "30 days", "90 days", "365 days", "Lifetime"]) {
      assert.ok(html.includes(label), `${label} offered at /buy`);
    }
    assert.ok(html.includes("Full access for a month."), "the blurb shows on the card");

    // Buying one charges that product's price and length.
    const member = makeClient(app);
    const { hashPassword } = await import("../functions/_lib/crypto.js");
    await db.run("INSERT INTO users (username, email, password_hash, tier) VALUES ('shopper','s@e.com',?, 'user')",
      await hashPassword("buyer-pass-123"));
    await member.get("/auth/login");
    await member.post("/auth/login", { identifier: "shopper", password: "buyer-pass-123", next: "/" });
    await member.post("/upgrade/checkout", { plan: "90-days" });
    assert.equal(created.amount, "24.99", "invoice priced from the product row");
    const payment = await db.get("SELECT * FROM payments ORDER BY id DESC LIMIT 1");
    assert.equal(payment.period_days, 90);
    assert.equal(payment.plan_id, "90-days");

    // Editing a price must not rewrite an order already placed.
    const ninety = products.find((p) => p.slug === "90-days");
    await admin.post(`/admin/shop/${ninety.id}/edit`,
      { name: "90 days", amount: "29.99", period_days: "90" });
    assert.equal((await db.get("SELECT amount FROM payments WHERE id = ?", payment.id)).amount, "24.99",
      "the placed order keeps its original price");
    assert.equal((await db.get("SELECT amount FROM products WHERE id = ?", ninety.id)).amount, "29.99");

    // Hiding takes it off /buy without touching history; deleting is permanent.
    await admin.post(`/admin/shop/${ninety.id}/toggle`);
    assert.ok(!(await (await admin.get("/buy")).text()).includes('value="90-days"'), "hidden product leaves the shop");
    assert.equal((await member.post("/upgrade/checkout", { plan: "90-days" })).headers.get("location"), "/buy",
      "and can no longer be bought");
    await admin.post(`/admin/shop/${ninety.id}/delete`);
    assert.ok(!(await db.get("SELECT id FROM products WHERE id = ?", ninety.id)));
    assert.ok(await db.get("SELECT id FROM payments WHERE id = ?", payment.id), "its past order survives");

    // Staff below full admin can't manage products at all.
    await db.run("INSERT INTO users (username, email, password_hash, tier) VALUES ('devguy','d@e.com',?, 'developer')",
      await hashPassword("dev-pass-123"));
    const dev = makeClient(app);
    await dev.get("/auth/login");
    await dev.post("/auth/login", { identifier: "devguy", password: "dev-pass-123", next: "/" });
    assert.equal((await dev.get("/admin/shop")).status, 404, "shop is full-admin only");
    await dev.post("/admin/shop/new", { name: "Sneaky", amount: "0.01", period_days: "365" });
    assert.equal(Number((await db.get("SELECT COUNT(*) AS n FROM products")).n), 6, "and its actions are too");
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("www host is 301-redirected to the bare apex, preserving path and query", async () => {
  const { app } = await buildTestApp(ENV);

  const res = await app.fetch(
    new Request("https://www.goyhub.st/forum?page=2", {
      headers: { host: "www.goyhub.st", "x-forwarded-proto": "https" },
    }),
    ENV,
  );
  assert.equal(res.status, 301);
  assert.equal(res.headers.get("location"), "https://goyhub.st/forum?page=2");

  // The apex itself is served normally, not redirected.
  const apex = await app.fetch(
    new Request("https://goyhub.st/", { headers: { host: "goyhub.st" } }),
    ENV,
  );
  assert.notEqual(apex.status, 301);

  // A deeper subdomain (e.g. downloader.) is left alone.
  const sub = await app.fetch(
    new Request("https://downloader.goyhub.st/", { headers: { host: "downloader.goyhub.st" } }),
    ENV,
  );
  assert.notEqual(sub.status, 301);
});

test("CANONICAL_WWW=1 inverts the redirect: apex is sent to www", async () => {
  const env = { ...ENV, CANONICAL_WWW: "1" };
  const { app } = await buildTestApp(env);

  const res = await app.fetch(
    new Request("https://goyhub.st/upgrade", {
      headers: { host: "goyhub.st", "x-forwarded-proto": "https" },
    }),
    env,
  );
  assert.equal(res.status, 301);
  assert.equal(res.headers.get("location"), "https://www.goyhub.st/upgrade");

  // www is already canonical here — served normally.
  const www = await app.fetch(
    new Request("https://www.goyhub.st/", { headers: { host: "www.goyhub.st" } }),
    env,
  );
  assert.notEqual(www.status, 301);
});
