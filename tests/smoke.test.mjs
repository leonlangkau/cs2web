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

  // Non-admin staff IPs stay visible to staff — only admin-tier rows are masked.
  await db.run("UPDATE users SET signup_ip = '203.0.113.99' WHERE username = 'dev_staff'");
  const adminView = await (await admin.get("/admin/users")).text();
  assert.ok(adminView.includes("203.0.113.99"), "staff (non-admin) IPs remain visible");
});
