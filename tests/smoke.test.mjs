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
import { verifyPassword } from "../functions/_lib/crypto.js";
import { verifyLicense } from "../functions/_lib/license.js";
import buildSchema from "../scripts/build-schema.cjs";
import buildInstaller from "../scripts/build-installer.cjs";

const schemaInSync = buildSchema.isInSync;
const installerInSync = buildInstaller.isInSync;

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
});

test("public pages, forum, legal, gate, auth, captcha, admin, moderation, download", async () => {
  const { app, db } = await buildTestApp(ENV);
  const anon = makeClient(app);
  const user = makeClient(app);
  const admin = makeClient(app);

  let res = await anon.get("/");
  let html = await res.text();
  assert.equal(res.status, 200);
  assert.ok(html.includes("Play smarter.") && html.includes("hero-canvas"), "landing renders");
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
  assert.ok(html.includes("IP address logging") && html.includes("ghsession") && html.includes("PBKDF2"), "privacy content");

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
  res = await admin.get("/download/file");
  const buf = await res.arrayBuffer();
  assert.ok(res.status === 200 && buf.byteLength > 0 && String(res.headers.get("content-disposition")).includes(".zip"), "member download");
  assert.ok(await db.get("SELECT id FROM ip_logs WHERE event = 'download' AND username = 'admin'"), "download logged");

  html = await (await anon.get("/")).text();
  assert.ok(!html.includes("/download/file") && html.includes("Create a free account"), "download hidden when logged out");
  html = await (await admin.get("/")).text();
  assert.ok(html.includes("/download/file"), "download shown when logged in");

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
  for (let i = 0; i < 14 && !got429; i += 1) {
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
