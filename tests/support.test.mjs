/**
 * Support desk end-to-end tests: help centre, guest and member ticketing, the
 * live chat, the staff backend, attachments, SLA, CSAT and the AI/webhook
 * integrations.
 *
 * Drives the real app.fetch over an in-memory database, exactly like
 * smoke.test.mjs, so these cover the code Cloudflare runs.
 *
 * Run: npm test
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildTestApp } from "./harness.mjs";
import { makeClient, solveCaptcha, signUp } from "./client.mjs";
import { renderArticle, searchArticles, terms } from "../functions/_lib/kb.js";
import { redactSecrets, aiConfig } from "../functions/_lib/ai.js";
import { notifySupport } from "../functions/_lib/webhooks.js";
import { safeFilename, sniff, toBase64, fromBase64 } from "../functions/_lib/attachments.js";
import {
  normalizeTags, normalizeRef, cleanBody, slaDueAt, supportConfig, sweepSla, sweepAutoClose,
} from "../functions/_lib/support.js";

const ENV = {
  ADMIN_USERNAME: "admin",
  ADMIN_PASSWORD: "admin-test-password-1",
  CAPTCHA_DIFFICULTY: "10",
  CAPTCHA_SECRET: "test-captcha-secret",
  PBKDF2_ITERATIONS: "10000",
  // Every client in a test shares the 'unknown' IP bucket, so the per-IP
  // limits have to be loosened or the second guest ticket in a file 429s.
  RATE_LIMIT_SIGNUP: "200",
  RATE_LIMIT_TICKET: "200",
  RATE_LIMIT_HELP_VOTE: "200",
  RATE_LIMIT_TICKET_LOOKUP: "200",
  RATE_LIMIT_AI_DEFLECT: "200",
};

/** Signs the seeded admin in. */
async function adminClient(app, env = ENV) {
  const client = makeClient(app, env);
  await client.get("/auth/login");
  const res = await client.post("/auth/login", {
    identifier: env.ADMIN_USERNAME, password: env.ADMIN_PASSWORD,
  });
  assert.equal(res.status, 302, "admin login should redirect");
  return client;
}

/** Opens a guest ticket and returns { ref, key, html }. */
async function openGuestTicket(app, env, overrides = {}) {
  const client = makeClient(app, env);
  await client.get("/support/new");
  const res = await client.post("/support/new", {
    email: "guest@example.com",
    name: "Guest Tester",
    subject: "GoyHub closes as soon as I open it",
    category: "app",
    body: "It opens for half a second and then the window disappears. Windows 11, RTX 3060. "
      + "I already tried restarting.",
    ...(await solveCaptcha(client)),
    ...overrides,
  });
  const html = await res.text();
  const ref = (html.match(/GH-[0-9A-F]{8}/) || [])[0];
  const key = (html.match(/\?k=([a-f0-9]{64})/) || [])[1];
  return { client, res, html, ref, key };
}

const PNG_1x1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

/* ================================================================== *
 * Pure units
 * ================================================================== */

test("help articles render as safe HTML, never as raw markup", () => {
  const html = renderArticle([
    "## Try this <script>alert(1)</script> first",
    "",
    "1. Do the thing with `--flag`",
    "2. Then **this**",
    "",
    "> A callout with <b>tags</b> in it",
    "",
    "[Good link](/download) and [bad link](javascript:alert(1))",
    "",
    "```",
    "<not-a-tag>",
    "```",
  ].join("\n"));

  assert.match(html, /<h2>Try this &lt;script&gt;/, "headings escape their content");
  assert.ok(!html.includes("<script>"), "no script tag survives");
  assert.match(html, /<ol>\s*<li>Do the thing with <code>--flag<\/code><\/li>/);
  assert.match(html, /<strong>this<\/strong>/);
  assert.match(html, /<p class="kb-note">A callout with &lt;b&gt;tags&lt;\/b&gt;/);
  assert.match(html, /<a href="\/download">Good link<\/a>/, "internal links are linked");
  assert.ok(!/href="javascript:/i.test(html), "a javascript: URL never becomes an href");
  assert.ok(!/<a[^>]*javascript/i.test(html), "…nor reaches an anchor at all");
  assert.match(html, /\[bad link\]/, "it is left as literal text instead");
  assert.match(html, /<pre class="code-block"><code>&lt;not-a-tag&gt;<\/code><\/pre>/);
});

test("a protocol-relative link is not treated as internal", () => {
  const html = renderArticle("[evil](//evil.example/steal)");
  assert.ok(!html.includes('href="//evil.example'), "//host is not an internal path");
});

test("secret-shaped strings are redacted before anything reaches the AI", () => {
  const redacted = redactSecrets(
    "my key is 0123456789abcdef0123456789abcdef and password: hunter2 "
    + "wallet 0x52908400098527886E0F7030069857D2E4169EE7"
  );
  assert.ok(!redacted.includes("0123456789abcdef0123456789abcdef"));
  assert.ok(!redacted.includes("hunter2"));
  assert.ok(!redacted.includes("0x52908400098527886E0F7030069857D2E4169EE7"));
  assert.match(redacted, /\[redacted-token\]/);
});

test("tag, ref and body normalisation", () => {
  assert.equal(normalizeTags("Crash , Windows 11 ,, crash, <script>"), "crash,windows-11,script");
  assert.equal(normalizeRef(" gh-1a2b3c4d "), "GH-1A2B3C4D");
  assert.equal(normalizeRef("GH-XYZ"), null);
  assert.equal(normalizeRef("../../etc/passwd"), null);
  assert.equal(cleanBody("a\r\n\r\n\r\n\r\n\r\nb  \n"), "a\n\n\nb");
});

test("attachment filenames and sniffing", () => {
  assert.equal(safeFilename("../../etc/passwd"), "_.._etc_passwd");
  assert.equal(safeFilename(""), "file");
  assert.equal(sniff(new Uint8Array(PNG_1x1)), "image/png");
  assert.equal(sniff(new Uint8Array([0x3c, 0x73, 0x76, 0x67])), null, "an SVG is not a known image");
  const round = fromBase64(toBase64(new Uint8Array(PNG_1x1)));
  assert.deepEqual(Buffer.from(round), PNG_1x1, "base64 round-trips exactly");
});

test("SLA deadlines follow priority", () => {
  const cfg = supportConfig({});
  const from = 1_000_000;
  assert.equal(slaDueAt("urgent", cfg, from), from + 2 * 3_600_000);
  assert.equal(slaDueAt("normal", cfg, from), from + 24 * 3_600_000);
  assert.equal(slaDueAt("nonsense", cfg, from), from + 24 * 3_600_000, "unknown priority falls back to normal");
});

test("aiConfig is off entirely without a key", () => {
  const off = aiConfig({});
  assert.equal(off.enabled, false);
  assert.equal(off.assist, false);
  assert.equal(off.deflect, false);
  assert.equal(off.classify, false);
  const on = aiConfig({ GEMINI_API_KEY: "k", SUPPORT_AI_CLASSIFY: "0" });
  assert.equal(on.assist, true);
  assert.equal(on.classify, false, "an explicit 0 wins over the default");
});

test("the webhook refuses a non-https destination without calling out", async () => {
  let called = false;
  const res = await notifySupport(
    { SUPPORT_WEBHOOK_URL: "http://localhost:9/hook" }, "ticket_new", { ref: "GH-1" },
    async () => { called = true; return new Response("", { status: 200 }); }
  );
  assert.equal(res.ok, false);
  assert.equal(res.error, "insecure_url");
  assert.equal(called, false, "no request is made at all");
});

/* ================================================================== *
 * Help centre
 * ================================================================== */

test("the help centre ships with browsable articles and finds them by symptom", async () => {
  const { app, db } = await buildTestApp(ENV);
  const client = makeClient(app, ENV);

  const index = await (await client.get("/help")).text();
  assert.match(index, /Help centre/);
  assert.match(index, /Getting started/, "seeded sections are listed");
  assert.match(index, /Contact support/, "the way to a human is always on the page");

  const hits = await searchArticles(db, "GoyHub crashes on launch");
  assert.ok(hits.length > 0, "the crash runbook is findable");
  assert.equal(hits[0].slug, "app-wont-start");

  const search = await (await client.get("/help?q=crash+on+launch")).text();
  assert.match(search, /app-wont-start/, "search results link the article");

  const article = await (await client.get("/help/a/app-wont-start")).text();
  assert.match(article, /Try this first/);
  assert.match(article, /Did this solve it\?/, "every article ends in a decision");

  const row = await db.get("SELECT views FROM help_articles WHERE slug = 'app-wont-start'");
  assert.equal(Number(row.views), 1, "reads are counted");
});

test("'this did not help' routes straight into a pre-filled ticket", async () => {
  const { app, db } = await buildTestApp(ENV);
  const client = makeClient(app, ENV);
  await client.get("/help/a/app-wont-start");

  const res = await client.post("/help/a/app-wont-start/feedback", { helpful: "no" });
  assert.equal(res.status, 302);
  assert.equal(res.headers.get("location"), "/support/new?article=app-wont-start");

  const yes = await client.post("/help/a/app-wont-start/feedback", { helpful: "yes" });
  assert.equal(yes.headers.get("location"), "/help/a/app-wont-start?voted=yes");

  const counts = await db.get("SELECT helpful_yes, helpful_no FROM help_articles WHERE slug = 'app-wont-start'");
  assert.equal(Number(counts.helpful_yes), 1);
  assert.equal(Number(counts.helpful_no), 1);

  const form = await (await client.get("/support/new?article=app-wont-start")).text();
  assert.match(form, /You came from/, "the ticket form knows which article failed");
});

/* ================================================================== *
 * Guest ticketing
 * ================================================================== */

test("a visitor with no account can open a ticket and come back to it", async () => {
  const { app, db } = await buildTestApp(ENV);
  const { res, html, ref, key } = await openGuestTicket(app, ENV);

  assert.equal(res.status, 200);
  assert.ok(ref, "a public reference is shown");
  assert.ok(key, "the private ticket link is shown exactly once");
  assert.match(html, /Save your ticket link/);

  const row = await db.get("SELECT * FROM tickets WHERE ref = ?", ref);
  assert.equal(row.guest_email, "guest@example.com");
  assert.equal(row.user_id, null);
  assert.ok(row.key_hash, "only the hash of the key is stored");
  assert.ok(!row.key_hash.includes(key), "the key itself is never stored");
  assert.equal(row.status, "open");
  assert.equal(Number(row.staff_unread), 1);

  // A brand-new browser holding the link can read the thread…
  const other = makeClient(app, ENV);
  const view = await other.get(`/support/t/${ref}?k=${key}`);
  assert.equal(view.status, 200);
  assert.match(await view.text(), /window disappears/);

  // …and a browser without it cannot, whatever it guesses.
  const stranger = makeClient(app, ENV);
  const denied = await stranger.get(`/support/t/${ref}`);
  assert.equal(denied.status, 404);
  const wrongKey = await stranger.get(`/support/t/${ref}?k=${"0".repeat(64)}`);
  assert.equal(wrongKey.status, 404);
});

test("an unknown reference and a wrong key are indistinguishable", async () => {
  const { app } = await buildTestApp(ENV);
  const { ref, key } = await openGuestTicket(app, ENV);
  const stranger = makeClient(app, ENV);

  const real = await stranger.get(`/support/t/${ref}?k=${"1".repeat(64)}`);
  const fake = await stranger.get(`/support/t/GH-DEADBEEF?k=${key}`);
  assert.equal(real.status, fake.status, "same status");

  // The only thing that legitimately differs is the path the client itself
  // asked for, echoed back by the terms gate. Normalise that away and the two
  // responses must be identical, so a real reference cannot be told from an
  // invented one.
  const normalise = (html) => html.replace(/GH-[0-9A-F]{8}/g, "GH-XXXXXXXX");
  assert.equal(normalise(await real.text()), normalise(await fake.text()),
    "identical body — a real reference cannot be distinguished from an invented one");
});

test("guest ticketing can be switched off entirely", async () => {
  const env = { ...ENV, SUPPORT_GUEST_TICKETS: "0" };
  const { app } = await buildTestApp(env);
  const client = makeClient(app, env);
  const res = await client.get("/support/new");
  assert.equal(res.status, 302);
  assert.match(res.headers.get("location"), /\/auth\/login/);
});

test("a guest ticket needs the proof-of-work, and says so when it is missing", async () => {
  const { app, db } = await buildTestApp(ENV);
  const client = makeClient(app, ENV);
  await client.get("/support/new");
  const res = await client.post("/support/new", {
    email: "nobot@example.com",
    subject: "Please read my exciting offer",
    body: "Buy cheap followers at example.com, the best prices anywhere on the internet.",
  });
  assert.equal(res.status, 400);
  assert.match(await res.text(), /Human verification failed/);
  assert.equal(Number((await db.get("SELECT COUNT(*) AS n FROM tickets")).n), 0);
});

test("the honeypot rejects a form-filling bot", async () => {
  const { app, db } = await buildTestApp(ENV);
  const client = makeClient(app, ENV);
  await client.get("/support/new");
  const res = await client.post("/support/new", {
    email: "bot@example.com",
    subject: "Totally genuine support request",
    body: "This message is long enough to pass the length check on its own.",
    website: "http://spam.example",
    ...(await solveCaptcha(client)),
  });
  assert.equal(res.status, 400);
  assert.equal(Number((await db.get("SELECT COUNT(*) AS n FROM tickets")).n), 0);
});

/* ================================================================== *
 * Free members
 * ================================================================== */

test("a FREE member gets the same support desk as anyone else", async () => {
  const { app, db } = await buildTestApp(ENV);
  const { client } = await signUp(app, ENV, "freeuser");

  const member = await db.get("SELECT tier FROM users WHERE username = 'freeuser'");
  assert.equal(member.tier, "user", "still on the free tier");

  // The forum is Paid-only; support must not be.
  assert.equal((await client.get("/forum")).status, 403);

  await client.get("/support/new");
  const res = await client.post("/support/new", {
    subject: "My stats stopped updating after the last patch",
    category: "app",
    body: "Matches finish and nothing appears in the app. My Steam profile is public.",
  });
  assert.equal(res.status, 302, "no CAPTCHA needed once signed in");
  const ref = res.headers.get("location").split("/").pop();

  const row = await db.get("SELECT * FROM tickets WHERE ref = ?", ref);
  assert.ok(row.user_id, "bound to the account");
  assert.equal(row.key_hash, null, "a member ticket has no guest key at all");

  const inbox = await (await client.get("/support")).text();
  assert.match(inbox, new RegExp(ref));
  assert.match(inbox, /stats stopped updating/);
});

test("a member ticket cannot be reached with a key, and another member cannot read it", async () => {
  const { app, db } = await buildTestApp(ENV);
  const { client } = await signUp(app, ENV, "owner1");
  await client.get("/support/new");
  const res = await client.post("/support/new", {
    subject: "Something private about my payment",
    category: "billing",
    body: "This message should only ever be visible to me and to support staff.",
  });
  const ref = res.headers.get("location").split("/").pop();
  await db.run("UPDATE tickets SET key_hash = ? WHERE ref = ?", "a".repeat(64), ref);

  const nosy = (await signUp(app, ENV, "nosy1")).client;
  assert.equal((await nosy.get(`/support/t/${ref}`)).status, 404);
  assert.equal((await nosy.get(`/support/t/${ref}?k=${"a".repeat(64)}`)).status, 404,
    "a member ticket is never reachable through the guest key path");
});

/* ================================================================== *
 * The live chat
 * ================================================================== */

test("the chat polls, and a staff reply reaches the requester", async () => {
  const { app, db } = await buildTestApp(ENV);
  const { client } = await signUp(app, ENV, "chatter");
  await client.get("/support/new");
  const created = await client.post("/support/new", {
    subject: "Overlay flickers in game", category: "ingame",
    body: "The overlay flickers every few seconds when I am in a match. It started today.",
  });
  const ref = created.headers.get("location").split("/").pop();
  const ticket = await db.get("SELECT id FROM tickets WHERE ref = ?", ref);

  const first = await (await client.get(`/support/t/${ref}/messages?after=0`)).json();
  assert.equal(first.ok, true);
  assert.equal(first.messages.length, 1);
  assert.equal(first.messages[0].role, "user");
  const lastId = first.messages[0].id;

  // Nothing new yet.
  const idle = await (await client.get(`/support/t/${ref}/messages?after=${lastId}`)).json();
  assert.equal(idle.messages.length, 0);

  // Staff answer from the backend.
  const staff = await adminClient(app);
  await staff.get(`/admin/support/${ticket.id}`);
  const replied = await staff.post(`/admin/support/${ticket.id}/reply`, {
    body: "Turn the overlay off in Settings → In-game and tell me if the flicker stops.",
  });
  assert.equal(replied.status, 302);

  const polled = await (await client.get(`/support/t/${ref}/messages?after=${lastId}`)).json();
  assert.equal(polled.messages.length, 1);
  assert.equal(polled.messages[0].role, "staff");
  assert.match(polled.messages[0].body, /Settings/);

  const after = await db.get("SELECT * FROM tickets WHERE ref = ?", ref);
  assert.equal(after.status, "answered", "the ball is back with the customer");
  assert.ok(after.first_response_at, "the first-response clock stops");
  assert.ok(after.assignee_id, "replying claims an unassigned ticket");

  // Reading the thread clears the customer's unread badge.
  await client.get(`/support/t/${ref}`);
  const read = await db.get("SELECT user_unread FROM tickets WHERE ref = ?", ref);
  assert.equal(Number(read.user_unread), 0);

  // The customer replying reopens it.
  await client.post(`/support/t/${ref}/reply`, { body: "Still flickering with the overlay off." });
  const reopened = await db.get("SELECT status, staff_unread FROM tickets WHERE ref = ?", ref);
  assert.equal(reopened.status, "open");
  assert.equal(Number(reopened.staff_unread), 1);
});

test("internal notes never reach the customer, on the page or the poll", async () => {
  const { app, db } = await buildTestApp(ENV);
  const { client } = await signUp(app, ENV, "watcher");
  await client.get("/support/new");
  const created = await client.post("/support/new", {
    subject: "Refund request", category: "billing",
    body: "I would like a refund for the membership I bought last week, please.",
  });
  const ref = created.headers.get("location").split("/").pop();
  const ticket = await db.get("SELECT id FROM tickets WHERE ref = ?", ref);

  const staff = await adminClient(app);
  await staff.get(`/admin/support/${ticket.id}`);
  const SECRET = "PREVIOUSLY REFUNDED TWICE DO NOT APPROVE";
  await staff.post(`/admin/support/${ticket.id}/note`, { body: SECRET });

  const page = await (await client.get(`/support/t/${ref}`)).text();
  assert.ok(!page.includes(SECRET), "the note is not on the customer's page");

  const poll = await (await client.get(`/support/t/${ref}/messages?after=0`)).text();
  assert.ok(!poll.includes("PREVIOUSLY REFUNDED"), "nor in the chat JSON");

  const staffPage = await (await staff.get(`/admin/support/${ticket.id}`)).text();
  assert.ok(staffPage.includes(SECRET), "but staff do see it");
  assert.match(staffPage, /INTERNAL NOTE/);
});

test("staff notes on a member follow the account, not the ticket", async () => {
  const { app, db } = await buildTestApp(ENV);
  const { client } = await signUp(app, ENV, "repeatcustomer");
  await client.get("/support/new");
  const first = await client.post("/support/new", {
    subject: "First problem", category: "other",
    body: "The first thing that went wrong for me this month.",
  });
  const firstRef = first.headers.get("location").split("/").pop();
  const firstTicket = await db.get("SELECT id FROM tickets WHERE ref = ?", firstRef);

  const staff = await adminClient(app);
  await staff.get(`/admin/support/${firstTicket.id}`);
  await staff.post(`/admin/support/${firstTicket.id}/user-note`, {
    body: "Verified Steam ownership over email in March.",
  });

  // A different ticket from the same member shows the same note.
  await client.get("/support/new");
  const second = await client.post("/support/new", {
    subject: "Second problem", category: "other",
    body: "A completely different thing has now also gone wrong.",
  });
  const secondRef = second.headers.get("location").split("/").pop();
  const secondTicket = await db.get("SELECT id FROM tickets WHERE ref = ?", secondRef);

  const page = await (await staff.get(`/admin/support/${secondTicket.id}`)).text();
  assert.match(page, /Verified Steam ownership over email in March/);
  assert.match(page, /Notes on this member/);

  const customerPage = await (await client.get(`/support/t/${secondRef}`)).text();
  assert.ok(!customerPage.includes("Verified Steam ownership"), "never shown to the member");
});

/* ================================================================== *
 * Staff backend
 * ================================================================== */

test("the support backend is invisible to everyone but staff", async () => {
  const { app } = await buildTestApp(ENV);
  const anon = makeClient(app, ENV);
  assert.equal((await anon.get("/admin/support")).status, 404);

  const { client } = await signUp(app, ENV, "notstaff");
  assert.equal((await client.get("/admin/support")).status, 404, "404, never 403 — the panel is not discoverable");
  assert.equal((await client.get("/admin/support/macros")).status, 404);

  const staff = await adminClient(app);
  assert.equal((await staff.get("/admin/support")).status, 200);
});

test("literal admin routes are not swallowed by /admin/support/:id", async () => {
  // The router is first-match-wins and :id compiles to ([^/]+), so a literal
  // registered after the parameterised route becomes unreachable — and the
  // symptom is a bewildering "no such ticket" 404, not an error. Assert the
  // registration order directly rather than trusting it.
  const { app } = await buildTestApp(ENV);
  const staff = await adminClient(app);

  for (const [path, marker] of [
    ["/admin/support/macros", /Canned replies/],
    ["/admin/support/articles", /Help centre/],
    ["/admin/support/articles/new", /New help article/],
  ]) {
    const res = await staff.get(path);
    assert.equal(res.status, 200, `${path} should render its own page`);
    assert.match(await res.text(), marker, `${path} reached the ticket handler instead`);
  }
});

test("a canned reply sends the message and moves the ticket in one click", async () => {
  const { app, db } = await buildTestApp(ENV);
  const { ref } = await openGuestTicket(app, ENV);
  const ticket = await db.get("SELECT id FROM tickets WHERE ref = ?", ref);

  const staff = await adminClient(app);
  await staff.get(`/admin/support/${ticket.id}`);
  const macro = await db.get("SELECT * FROM support_macros WHERE title = 'Ask for the app log'");
  assert.ok(macro, "the desk ships with canned replies");

  const res = await staff.post(`/admin/support/${ticket.id}/macro`, { macro_id: String(macro.id) });
  assert.equal(res.status, 302);

  const after = await db.get("SELECT * FROM tickets WHERE id = ?", ticket.id);
  assert.equal(after.status, "pending", "the macro's status was applied");
  assert.match(after.tags, /needs-info/, "and its tags");
  assert.ok(after.first_response_at, "it counts as the first response");

  const messages = await db.all("SELECT * FROM ticket_messages WHERE ticket_id = ? ORDER BY id", ticket.id);
  assert.equal(messages.length, 2);
  assert.equal(messages[1].author_role, "staff");
  assert.match(messages[1].body, /%APPDATA%/);

  const used = await db.get("SELECT uses FROM support_macros WHERE id = ?", macro.id);
  assert.equal(Number(used.uses), 1);
});

/** Opens a ticket as a signed-in member and returns its ref. */
async function openMemberTicket(client, subject) {
  await client.get("/support/new");
  const res = await client.post("/support/new", {
    subject, category: "other",
    body: `Details for "${subject}" — long enough to clear the minimum length check.`,
  });
  assert.equal(res.status, 302);
  return res.headers.get("location").split("/").pop();
}

test("merging moves the conversation between one member's own tickets", async () => {
  const { app, db } = await buildTestApp(ENV);
  const { client } = await signUp(app, ENV, "duplicator");
  const aRef = await openMemberTicket(client, "Cannot log in");
  const bRef = await openMemberTicket(client, "Cannot log in (again)");
  const a = { ref: aRef };
  const b = { ref: bRef };
  const source = await db.get("SELECT id FROM tickets WHERE ref = ?", b.ref);
  const target = await db.get("SELECT id FROM tickets WHERE ref = ?", a.ref);

  const staff = await adminClient(app);
  await staff.get(`/admin/support/${source.id}`);
  const res = await staff.post(`/admin/support/${source.id}/merge`, { into: a.ref });
  assert.equal(res.status, 302);
  assert.equal(res.headers.get("location"), `/admin/support/${target.id}`);

  const moved = await db.all("SELECT * FROM ticket_messages WHERE ticket_id = ?", target.id);
  assert.equal(moved.length, 2, "both opening messages now live on the survivor");
  const left = await db.all("SELECT * FROM ticket_messages WHERE ticket_id = ?", source.id);
  assert.equal(left.length, 1, "only the marker explaining where the conversation went");
  assert.equal(left[0].author_role, "system");
  assert.match(left[0].body, new RegExp(`merged into ${a.ref}`));

  const merged = await db.get("SELECT * FROM tickets WHERE id = ?", source.id);
  assert.equal(Number(merged.merged_into), Number(target.id));
  assert.equal(merged.status, "closed");

  // The member holds both tickets through one session, so following the merge
  // lands them on the survivor rather than a dead end.
  const followed = await client.get(`/support/t/${b.ref}`);
  assert.equal(followed.status, 302);
  assert.equal(followed.headers.get("location"), `/support/t/${a.ref}`);
});

test("two guest tickets are LINKED, never merged, however identical they look", async () => {
  // A guest is identified by an email address they typed and nobody verified.
  // Moving content on the strength of it would let anyone open a ticket
  // claiming a stranger's address and have staff hand them that stranger's
  // conversation and every file on it.
  const { app, db } = await buildTestApp(ENV);
  const victim = await openGuestTicket(app, ENV, {
    email: "victim@example.com", subject: "My card was charged twice",
  });
  const attacker = await openGuestTicket(app, ENV, {
    email: "victim@example.com", subject: "My card was charged twice (again)",
  });
  const victimTicket = await db.get("SELECT id FROM tickets WHERE ref = ?", victim.ref);
  const attackerTicket = await db.get("SELECT id FROM tickets WHERE ref = ?", attacker.ref);

  const staff = await adminClient(app);
  await staff.get(`/admin/support/${victimTicket.id}`);
  const res = await staff.post(`/admin/support/${victimTicket.id}/merge`, { into: attacker.ref });
  assert.equal(res.status, 302);

  const after = await db.get("SELECT * FROM tickets WHERE id = ?", victimTicket.id);
  assert.equal(after.merged_into, null, "nothing was merged");
  assert.equal(after.status, "open", "and the victim's ticket is still theirs to use");

  const victimMessages = await db.all("SELECT * FROM ticket_messages WHERE ticket_id = ?", victimTicket.id);
  const attackerMessages = await db.all("SELECT * FROM ticket_messages WHERE ticket_id = ?", attackerTicket.id);
  assert.equal(victimMessages.length, 1, "the victim's message stayed put");
  assert.equal(attackerMessages.length, 1, "and did not appear under the other key");

  // The decisive check: the second key must not read the first ticket.
  const impostor = makeClient(app, ENV);
  const stolen = await impostor.get(`/support/t/${victim.ref}?k=${attacker.key}`);
  assert.equal(stolen.status, 404, "one guest key never opens another guest's ticket");

  // Staff still get the association they actually wanted.
  const events = await db.all("SELECT * FROM ticket_events WHERE ticket_id = ? AND kind = 'linked'", victimTicket.id);
  assert.equal(events.length, 1);
  assert.match(events[0].detail, new RegExp(attacker.ref));
});

test("the queue filters, and spam is hidden without being destroyed", async () => {
  const { app, db } = await buildTestApp(ENV);
  const { ref } = await openGuestTicket(app, ENV);
  const ticket = await db.get("SELECT id FROM tickets WHERE ref = ?", ref);
  const staff = await adminClient(app);

  await staff.get(`/admin/support/${ticket.id}`);
  await staff.post(`/admin/support/${ticket.id}/spam`, {});

  const normal = await (await staff.get("/admin/support")).text();
  assert.ok(!normal.includes(ref), "spam is out of the default queue");

  const flagged = await (await staff.get("/admin/support?spam=1")).text();
  assert.match(flagged, new RegExp(ref), "…and one checkbox away from being seen");

  const row = await db.get("SELECT spam FROM tickets WHERE id = ?", ticket.id);
  assert.equal(Number(row.spam), 1, "the ticket still exists");

  await staff.post(`/admin/support/${ticket.id}/spam`, {});
  const restored = await (await staff.get("/admin/support")).text();
  assert.match(restored, new RegExp(ref), "un-flagging puts it back");
});

test("a saved view only stores filters the queue itself accepts", async () => {
  const { app, db } = await buildTestApp(ENV);
  const staff = await adminClient(app);
  await staff.get("/admin/support");
  await staff.post("/admin/support/views", {
    name: "Urgent unassigned",
    query: "status=active&priority=urgent&assignee=none&evil=DROP+TABLE&page=9",
    shared: "1",
  });
  const view = await db.get("SELECT * FROM support_views WHERE name = 'Urgent unassigned'");
  assert.ok(view);
  assert.equal(view.owner_id, null, "shared with the whole team");
  assert.ok(!view.query.includes("evil"), "unknown keys are dropped");
  assert.ok(!view.query.includes("page"), "and so is pagination state");
  assert.match(view.query, /priority=urgent/);
});

/* ================================================================== *
 * SLA, CSAT, attachments
 * ================================================================== */

test("a missed first response breaches, once, and only while unanswered", async () => {
  const { app, db } = await buildTestApp(ENV);
  const cfg = supportConfig({});
  const { ref } = await openGuestTicket(app, ENV);
  const ticket = await db.get("SELECT id FROM tickets WHERE ref = ?", ref);

  await db.run("UPDATE tickets SET sla_due_at = ? WHERE id = ?", Date.now() - 60_000, ticket.id);

  const first = await sweepSla(db, cfg);
  assert.equal(first.length, 1, "one breach stamped");
  const again = await sweepSla(db, cfg);
  assert.equal(again.length, 0, "the sweep is idempotent");

  const events = await db.all("SELECT * FROM ticket_events WHERE ticket_id = ? AND kind = 'sla_breach'", ticket.id);
  assert.equal(events.length, 1);

  // An answered ticket can no longer breach, however old its deadline is.
  const staff = await adminClient(app);
  await staff.get(`/admin/support/${ticket.id}`);
  await staff.post(`/admin/support/${ticket.id}/reply`, { body: "Sorry for the wait — looking now." });
  await db.run("UPDATE tickets SET sla_breached = 0, sla_due_at = ? WHERE id = ?", Date.now() - 60_000, ticket.id);
  assert.equal((await sweepSla(db, cfg)).length, 0);
});

test("the sweep endpoint is closed unless a secret is configured", async () => {
  const open = await buildTestApp(ENV);
  assert.equal((await makeClient(open.app, ENV).get("/api/support/sweep?key=x")).status, 404);

  const env = { ...ENV, SUPPORT_SWEEP_SECRET: "sweep-me-please" };
  const { app } = await buildTestApp(env);
  const client = makeClient(app, env);
  assert.equal((await client.get("/api/support/sweep?key=wrong")).status, 404);
  const ok = await client.get("/api/support/sweep?key=sweep-me-please");
  assert.equal(ok.status, 200);
  const body = await ok.json();
  assert.equal(body.ok, true);
});

test("only the requester rates a ticket, and only once", async () => {
  const { app, db } = await buildTestApp(ENV);
  const { client } = await signUp(app, ENV, "rater");
  await client.get("/support/new");
  const created = await client.post("/support/new", {
    subject: "Question about crosshair sharing", category: "ingame",
    body: "How do I share a crosshair with a friend who does not have GoyHub?",
  });
  const ref = created.headers.get("location").split("/").pop();
  const ticket = await db.get("SELECT id FROM tickets WHERE ref = ?", ref);

  const staff = await adminClient(app);
  await staff.get(`/admin/support/${ticket.id}`);
  await staff.post(`/admin/support/${ticket.id}/reply`, { body: "Use the share code.", solve: "1" });

  await client.get(`/support/t/${ref}`);
  await client.post(`/support/t/${ref}/rate`, { rating: "5", comment: "Fast and clear, thanks." });
  const rated = await db.get("SELECT * FROM tickets WHERE id = ?", ticket.id);
  assert.equal(Number(rated.rating), 5);
  assert.match(rated.rating_comment, /Fast and clear/);

  await client.post(`/support/t/${ref}/rate`, { rating: "1" });
  const unchanged = await db.get("SELECT rating FROM tickets WHERE id = ?", ticket.id);
  assert.equal(Number(unchanged.rating), 5, "a second rating cannot overwrite the first");

  // Staff can read the ticket but cannot rate their own work.
  await staff.post(`/support/t/${ref}/rate`, { rating: "1" });
  const stillFive = await db.get("SELECT rating FROM tickets WHERE id = ?", ticket.id);
  assert.equal(Number(stillFive.rating), 5);
});

test("the rating form cannot be filed by pressing Enter in the comment box", async () => {
  const { app, db } = await buildTestApp(ENV);
  const { client } = await signUp(app, ENV, "keyboarder");
  await client.get("/support/new");
  const created = await client.post("/support/new", {
    subject: "A question about configs", category: "ingame",
    body: "Where does GoyHub keep the config files it writes for me?",
  });
  const ref = created.headers.get("location").split("/").pop();
  const ticket = await db.get("SELECT id FROM tickets WHERE ref = ?", ref);

  const staff = await adminClient(app);
  await staff.get(`/admin/support/${ticket.id}`);
  await staff.post(`/admin/support/${ticket.id}/reply`, { body: "In your AppData folder.", solve: "1" });

  const page = await (await client.get(`/support/t/${ref}`)).text();
  const form = page.slice(page.indexOf('<form class="csat"'));
  const csat = form.slice(0, form.indexOf("</form>"));

  // Five submit buttons would mean implicit submission files a permanent 1.
  assert.ok(!/type="submit"[^>]*name="rating"/.test(csat), "stars are not submit buttons");
  assert.match(csat, /type="radio" name="rating"/, "they are a radio group");
  assert.equal((csat.match(/type="submit"/g) || []).length, 1,
    "and the form has exactly one submit control");
});

test("guest tickets move onto an account only once the address is verified", async () => {
  const env = { ...ENV, EMAIL_PROVIDER: "test", EMAIL_FROM: "support@goyhub.test", REQUIRE_VERIFIED_EMAIL: "0" };
  const { app, db } = await buildTestApp(env);
  globalThis.__testEmails = [];

  const { ref } = await openGuestTicket(app, env, { email: "adopter@example.com" });
  const before = await db.get("SELECT user_id FROM tickets WHERE ref = ?", ref);
  assert.equal(before.user_id, null);

  // Signing up alone proves nothing — anyone can type someone else's address.
  const { client } = await signUp(app, env, "adopter", "adopter@example.com");
  const afterSignup = await db.get("SELECT user_id FROM tickets WHERE ref = ?", ref);
  assert.equal(afterSignup.user_id, null, "not adopted on signup — that would be a takeover");

  // Verifying it does.
  const verify = globalThis.__testEmails.find((m) => /verify/i.test(m.text));
  assert.ok(verify, "a verification email went out");
  const token = verify.text.match(/\/auth\/verify\/([a-f0-9]{64})/)[1];
  const res = await client.get(`/auth/verify/${token}`);
  assert.equal(res.status, 302);

  const adopted = await db.get("SELECT user_id FROM tickets WHERE ref = ?", ref);
  const user = await db.get("SELECT id FROM users WHERE username = 'adopter'");
  assert.equal(Number(adopted.user_id), Number(user.id), "now it is theirs");

  const inbox = await (await client.get("/support")).text();
  assert.match(inbox, new RegExp(ref), "and it shows in their account's ticket list");
  globalThis.__testEmails = [];
});

test("the lost-link page does not offer a form that cannot work", async () => {
  const { app } = await buildTestApp(ENV);
  const noMail = await (await makeClient(app, ENV).get("/support/lookup")).text();
  assert.ok(!/Email me the link/.test(noMail), "no dead-end form without a mail provider");
  assert.match(noMail, /cannot send email/);
  assert.match(noMail, /open a new ticket/i, "and it says what to do instead");

  const env = { ...ENV, EMAIL_PROVIDER: "test", EMAIL_FROM: "s@goyhub.test" };
  const withMail = await buildTestApp(env);
  const html = await (await makeClient(withMail.app, env).get("/support/lookup")).text();
  assert.match(html, /Email me the link/);
});

test("the guest's ticket link is something you can actually paste somewhere", async () => {
  const { app } = await buildTestApp(ENV);
  const { html } = await openGuestTicket(app, ENV);
  assert.match(html, /http:\/\/local\/support\/t\/GH-[0-9A-F]{8}\?k=[a-f0-9]{64}/,
    "absolute, because the page tells them to copy it somewhere safe");
});

test("screenshots attach and come back; dangerous types do not", async () => {
  const { app, db } = await buildTestApp(ENV);
  const { client } = await signUp(app, ENV, "uploader");

  // An executable format is refused outright, and the typed message survives.
  await client.get("/support/new");
  const refused = await client.postForm("/support/new", {
    subject: "Here is what the error looks like",
    category: "app",
    body: "Screenshot attached — this is the dialog I get every time I launch the app.",
  }, [{ name: "payload.svg", bytes: Buffer.from('<svg onload="alert(1)"></svg>'), type: "image/svg+xml" }]);
  assert.equal(refused.status, 400, "an SVG never reaches the database");
  const refusedHtml = await refused.text();
  assert.match(refusedHtml, /not an accepted file type/);
  assert.match(refusedHtml, /Here is what the error looks like/, "nothing typed is lost");
  assert.equal(Number((await db.get("SELECT COUNT(*) AS n FROM tickets")).n), 0);

  const res = await client.postForm("/support/new", {
    subject: "Here is what the error looks like",
    category: "app",
    body: "Screenshot attached — this is the dialog I get every time I launch the app.",
  }, [{ name: "error.png", bytes: PNG_1x1, type: "image/png" }]);
  assert.equal(res.status, 302);
  const ref = res.headers.get("location").split("/").pop();
  const ticket = await db.get("SELECT id FROM tickets WHERE ref = ?", ref);

  const files = await db.all("SELECT * FROM ticket_attachments WHERE ticket_id = ?", ticket.id);
  assert.equal(files.length, 1);
  assert.equal(files[0].mime, "image/png");
  assert.equal(files[0].filename, "error.png");

  const served = await client.get(`/support/attachments/${files[0].id}`);
  assert.equal(served.status, 200);
  assert.equal(served.headers.get("content-type"), "image/png");
  assert.match(served.headers.get("content-disposition"), /^inline/);
  assert.equal(served.headers.get("content-security-policy"), "default-src 'none'; sandbox");
  assert.deepEqual(Buffer.from(await served.arrayBuffer()), PNG_1x1, "the bytes survive the round trip");

  // Someone else's attachment is not theirs to read.
  const stranger = makeClient(app, ENV);
  assert.equal((await stranger.get(`/support/attachments/${files[0].id}`)).status, 404);
});

test("a file lying about its type is served as an inert download", async () => {
  const { app, db } = await buildTestApp(ENV);
  const { client } = await signUp(app, ENV, "liar");
  await client.get("/support/new");
  const res = await client.postForm("/support/new", {
    subject: "Log file attached", category: "app",
    body: "Attaching the log file that the help article asked me to send over.",
  }, [
    { name: "sneaky.txt", bytes: Buffer.from("<html><script>alert(1)</script></html>"), type: "text/html" },
  ]);
  const ref = res.headers.get("location").split("/").pop();
  const ticket = await db.get("SELECT id FROM tickets WHERE ref = ?", ref);
  const file = await db.get("SELECT * FROM ticket_attachments WHERE ticket_id = ?", ticket.id);

  assert.equal(file.mime, "text/plain", "the extension decides, never the browser's content-type");
  const served = await client.get(`/support/attachments/${file.id}`);
  assert.equal(served.headers.get("content-type"), "application/octet-stream");
  assert.match(served.headers.get("content-disposition"), /^attachment/);
  await served.arrayBuffer();
});

test("an oversized attachment is refused without losing the message", async () => {
  const env = { ...ENV, SUPPORT_ATTACH_MAX_KB: "16" };
  const { app, db } = await buildTestApp(env);
  const { client } = await signUp(app, env, "bigfile");
  await client.get("/support/new");
  const res = await client.postForm("/support/new", {
    subject: "Big log attached", category: "app",
    body: "The log is quite large because the app has been running for two days.",
  }, [{ name: "huge.log", bytes: Buffer.alloc(40 * 1024, 0x41), type: "text/plain" }]);

  assert.equal(res.status, 400, "the form comes back so nothing typed is lost");
  const html = await res.text();
  assert.match(html, /the limit is 16 KB/);
  assert.match(html, /Big log attached/, "the subject is preserved");
  assert.equal(Number((await db.get("SELECT COUNT(*) AS n FROM tickets")).n), 0);
});

test("attachment storage is budgeted per address and per ticket", async () => {
  // Without a budget the reply bucket is keyed per TICKET, so one address can
  // open ticket after ticket and fill the database from each.
  const env = { ...ENV, SUPPORT_ATTACH_MAX_KB: "16", RATE_LIMIT_ATTACH: "2" };
  const { app, db } = await buildTestApp(env);
  const { client } = await signUp(app, env, "hoarder");
  const png = { name: "shot.png", bytes: PNG_1x1, type: "image/png" };

  await client.get("/support/new");
  const created = await client.postForm("/support/new", {
    subject: "Screenshot one", category: "app",
    body: "Here is the first screenshot of the problem I am seeing.",
  }, [png]);
  assert.equal(created.status, 302);
  const ref = created.headers.get("location").split("/").pop();

  // Second file is within budget, third is not — and the MESSAGE still lands.
  await client.postForm(`/support/t/${ref}/reply`, { body: "And another." }, [png]);
  const overBudget = await client.postForm(`/support/t/${ref}/reply`, { body: "And one more." }, [png]);
  assert.equal(overBudget.status, 302, "the reply is never lost over its attachment");

  const ticket = await db.get("SELECT id FROM tickets WHERE ref = ?", ref);
  const files = await db.all("SELECT * FROM ticket_attachments WHERE ticket_id = ?", ticket.id);
  assert.equal(files.length, 2, "the third file was refused by the per-address budget");
  const messages = await db.all("SELECT * FROM ticket_messages WHERE ticket_id = ?", ticket.id);
  assert.equal(messages.length, 3, "all three messages went through");
});

test("a ticket has a total attachment ceiling, not just a per-message one", async () => {
  const env = { ...ENV, SUPPORT_ATTACH_MAX_KB: "16", SUPPORT_ATTACH_TICKET_MAX_KB: "512" };
  const { app, db } = await buildTestApp(env);
  const { client } = await signUp(app, env, "ceiling");
  await client.get("/support/new");
  const created = await client.postForm("/support/new", {
    subject: "Lots of screenshots", category: "app",
    body: "I will be sending quite a few screenshots of this problem over time.",
  }, [{ name: "a.png", bytes: PNG_1x1, type: "image/png" }]);
  const ref = created.headers.get("location").split("/").pop();
  const ticket = await db.get("SELECT id FROM tickets WHERE ref = ?", ref);

  // Pretend the thread is already at its ceiling.
  await db.run("UPDATE ticket_attachments SET bytes = ? WHERE ticket_id = ?", 512 * 1024, ticket.id);
  const refused = await client.postForm(`/support/t/${ref}/reply`, { body: "One more." },
    [{ name: "b.png", bytes: PNG_1x1, type: "image/png" }]);
  assert.equal(refused.status, 302);
  const files = await db.all("SELECT * FROM ticket_attachments WHERE ticket_id = ?", ticket.id);
  assert.equal(files.length, 1, "the ticket is full, so the file is refused");
});

test("an article read is counted once per address per hour", async () => {
  const { app, db } = await buildTestApp(ENV);
  const client = makeClient(app, ENV);
  for (let i = 0; i < 5; i += 1) await (await client.get("/help/a/app-wont-start")).text();
  const row = await db.get("SELECT views FROM help_articles WHERE slug = 'app-wont-start'");
  assert.equal(Number(row.views), 1,
    "a refresh loop must not decide which articles staff invest in");
});

/* ================================================================== *
 * Integrations: email, webhook, AI
 * ================================================================== */

test("the requester is emailed when a ticket opens and when staff reply", async () => {
  const env = { ...ENV, EMAIL_PROVIDER: "test", EMAIL_FROM: "support@goyhub.test", SITE_URL: "https://goyhub.test" };
  const { app, db } = await buildTestApp(env);
  globalThis.__testEmails = [];

  const { ref, key } = await openGuestTicket(app, env);
  const opened = globalThis.__testEmails.find((m) => m.subject.includes(ref));
  assert.ok(opened, "an opening confirmation goes out");
  assert.equal(opened.to, "guest@example.com");
  assert.match(opened.text, new RegExp(`https://goyhub.test/support/t/${ref}\\?k=${key}`),
    "and it carries the absolute ticket link");

  globalThis.__testEmails = [];
  const ticket = await db.get("SELECT id FROM tickets WHERE ref = ?", ref);
  const staff = await adminClient(app, env);
  await staff.get(`/admin/support/${ticket.id}`);
  await staff.post(`/admin/support/${ticket.id}/reply`, { body: "Have you tried reinstalling over the top?" });

  const replied = globalThis.__testEmails.find((m) => m.subject.startsWith(`[${ref}] Re:`));
  assert.ok(replied, "a reply notification goes out");
  assert.ok(!replied.text.includes("reinstalling over the top"),
    "the reply body stays on the ticket, not in the mailbox");
  globalThis.__testEmails = [];
});

test("a new ticket alerts staff over the webhook, and an outage does not lose the ticket", async () => {
  const env = { ...ENV, SUPPORT_WEBHOOK_URL: "https://discord.example/api/webhooks/1/x", SITE_URL: "https://goyhub.test" };
  const { app, db } = await buildTestApp(env);

  const calls = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), body: JSON.parse(init.body) });
    return new Response("", { status: 204 });
  };
  let ref;
  try {
    ({ ref } = await openGuestTicket(app, env));
  } finally {
    globalThis.fetch = realFetch;
  }

  assert.equal(calls.length, 1, "exactly one alert");
  assert.equal(calls[0].url, env.SUPPORT_WEBHOOK_URL);
  const embed = calls[0].body.embeds[0];
  assert.match(embed.title, /New support ticket/);
  assert.equal(embed.url, `https://goyhub.test/admin/support/${(await db.get("SELECT id FROM tickets WHERE ref = ?", ref)).id}`);
  assert.ok(embed.fields.some((f) => f.value === ref));

  // Now the same thing with the webhook down.
  globalThis.fetch = async () => { throw new Error("connection refused"); };
  let second;
  try {
    second = await openGuestTicket(app, env, { subject: "Second ticket during an outage" });
  } finally {
    globalThis.fetch = realFetch;
  }
  assert.equal(second.res.status, 200, "the visitor still gets their confirmation");
  assert.ok(await db.get("SELECT id FROM tickets WHERE ref = ?", second.ref), "and the ticket exists");
});

test("AI triage sets category, priority and tags — and is re-validated, not trusted", async () => {
  const env = { ...ENV, GEMINI_API_KEY: "test-key" };
  const { app, db } = await buildTestApp(env);

  const realFetch = globalThis.fetch;
  const seen = [];
  globalThis.fetch = async (url, init) => {
    seen.push({ url: String(url), init });
    return new Response(JSON.stringify({
      candidates: [{
        content: {
          parts: [{
            text: JSON.stringify({
              // A deliberately hostile payload: an unknown category, a made-up
              // priority and tags full of punctuation.
              category: "../../etc/passwd",
              priority: "apocalyptic",
              tags: ["Crash!!", "windows 11"],
              language: "en",
              spam: false,
              reason: "app crash on launch",
            }),
          }],
        },
      }],
    }), { status: 200, headers: { "content-type": "application/json" } });
  };

  let ref;
  try {
    ({ ref } = await openGuestTicket(app, env));
  } finally {
    globalThis.fetch = realFetch;
  }

  assert.ok(seen.length >= 1, "Gemini was called");
  assert.match(seen[0].url, /generativelanguage\.googleapis\.com/);
  assert.equal(seen[0].init.headers["x-goog-api-key"], "test-key", "the key goes in a header, not the URL");
  const sent = JSON.parse(seen[0].init.body);
  assert.match(sent.systemInstruction.parts[0].text, /untrusted DATA/, "the injection guard is always attached");
  assert.match(sent.contents[0].parts[0].text, /<<<BEGIN_MESSAGE>>>/, "ticket text is fenced");

  const row = await db.get("SELECT * FROM tickets WHERE ref = ?", ref);
  assert.equal(row.category, "app", "an unknown category leaves the customer's own choice alone");
  assert.equal(row.priority, "normal", "an invented priority is discarded");
  assert.equal(row.tags, "crash,windows-11", "tags are normalised");
  assert.equal(row.locale, "en");
  assert.ok(row.ai_classified_at, "the ticket is marked as triaged so it is not re-run");
});

test("the AI opt-out is a promise the server keeps, not one the page makes", async () => {
  const env = { ...ENV, GEMINI_API_KEY: "test-key" };
  const { app, db } = await buildTestApp(env);

  const realFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls += 1; throw new Error("the AI should not have been called"); };
  let ref;
  try {
    ({ ref } = await openGuestTicket(app, env, { no_ai: "1" }));

    // The lookahead endpoint honours it too, not just the checkbox in the page.
    const client = makeClient(app, env);
    await client.get("/support/new");
    const suggested = await client.post("/support/suggest", {
      no_ai: "1", subject: "GoyHub crashes on launch",
      body: "It closes immediately every single time I try to open it.",
    });
    assert.deepEqual((await suggested.json()).suggestions, []);
  } finally {
    globalThis.fetch = realFetch;
  }

  assert.equal(calls, 0, "nothing was sent to the model at any point");
  const ticket = await db.get("SELECT * FROM tickets WHERE ref = ?", ref);
  assert.match(ticket.tags, /no-ai/, "and the ticket carries the opt-out for the staff side");
  assert.equal(ticket.ai_classified_at, null);

  // Staff cannot run the assist on it either.
  const staff = await adminClient(app, env);
  await staff.get(`/admin/support/${ticket.id}`);
  const refused = await staff.post(`/admin/support/${ticket.id}/ai/summary`, {});
  assert.equal(refused.status, 302);
  assert.equal((await db.get("SELECT ai_summary FROM tickets WHERE id = ?", ticket.id)).ai_summary, null);
});

test("an AI spam verdict tags the ticket for a human, and never hides it", async () => {
  const env = { ...ENV, GEMINI_API_KEY: "test-key" };
  const { app, db } = await buildTestApp(env);
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({
    candidates: [{ content: { parts: [{ text: JSON.stringify({
      category: "other", priority: "low", tags: ["advert"], language: "en", spam: true,
      reason: "looks like advertising",
    }) }] } }],
  }), { status: 200, headers: { "content-type": "application/json" } });

  let ref;
  try { ({ ref } = await openGuestTicket(app, env)); } finally { globalThis.fetch = realFetch; }

  const ticket = await db.get("SELECT * FROM tickets WHERE ref = ?", ref);
  assert.equal(Number(ticket.spam), 0,
    "a false positive here is a customer who is simply never answered — that call stays with a human");
  assert.match(ticket.tags, /possible-spam/, "but it is tagged so a human sees it");

  const staff = await adminClient(app, env);
  const queue = await (await staff.get("/admin/support")).text();
  assert.match(queue, new RegExp(ref), "and it is still in the default queue");
  assert.match(queue, /possible-spam/);
});

test("the confirmation email still goes out when the AI throws", async () => {
  const env = {
    ...ENV, GEMINI_API_KEY: "test-key",
    EMAIL_PROVIDER: "test", EMAIL_FROM: "support@goyhub.test", SITE_URL: "https://goyhub.test",
  };
  const { app, db } = await buildTestApp(env);
  globalThis.__testEmails = [];

  const realFetch = globalThis.fetch;
  // A response shaped to break the re-validation layer rather than the transport.
  globalThis.fetch = async () => new Response(JSON.stringify({
    candidates: [{ content: { parts: [{ text: '{"category":{},"priority":{},"tags":{},"language":{},"spam":{}}' }] } }],
  }), { status: 200, headers: { "content-type": "application/json" } });

  let ref;
  try { ({ ref } = await openGuestTicket(app, env)); } finally { globalThis.fetch = realFetch; }

  assert.ok(await db.get("SELECT id FROM tickets WHERE ref = ?", ref), "the ticket exists");
  assert.ok(globalThis.__testEmails.some((m) => m.subject.includes(ref)),
    "and the confirmation was not swallowed by the AI step in front of it");
  globalThis.__testEmails = [];
});

test("a ticket opens normally when the AI is down", async () => {
  const env = { ...ENV, GEMINI_API_KEY: "test-key" };
  const { app, db } = await buildTestApp(env);
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response("upstream on fire", { status: 500 });
  let result;
  try {
    result = await openGuestTicket(app, env);
  } finally {
    globalThis.fetch = realFetch;
  }
  assert.equal(result.res.status, 200);
  const row = await db.get("SELECT * FROM tickets WHERE ref = ?", result.ref);
  assert.ok(row, "the ticket exists");
  assert.equal(row.ai_classified_at, null, "and is simply left untriaged");
  assert.equal(row.priority, "normal");
});

test("staff get an AI summary and reply drafts, and nothing is sent without them", async () => {
  const env = { ...ENV, GEMINI_API_KEY: "test-key", SUPPORT_AI_CLASSIFY: "0" };
  const { app, db } = await buildTestApp(env);
  const { ref } = await openGuestTicket(app, env);
  const ticket = await db.get("SELECT id FROM tickets WHERE ref = ?", ref);
  const staff = await adminClient(app, env);
  await staff.get(`/admin/support/${ticket.id}`);

  const realFetch = globalThis.fetch;
  const reply = (payload) => new Response(JSON.stringify({
    candidates: [{ content: { parts: [{ text: JSON.stringify(payload) }] } }],
  }), { status: 200, headers: { "content-type": "application/json" } });

  try {
    globalThis.fetch = async () => reply({
      summary: "Windows member cannot launch the app; it closes immediately.",
      problem: "The app exits on launch.",
      tried: ["Restarting"],
      nextSteps: ["Ask for the log file"],
      sentiment: "frustrated",
      urgency: "high",
      waitingOn: "support",
    });
    const summarised = await staff.post(`/admin/support/${ticket.id}/ai/summary`, {});
    assert.equal(summarised.status, 302);

    globalThis.fetch = async () => reply({
      drafts: [
        { label: "Ask for the log", body: "Could you send me the newest .log file?" },
        { label: "Holding reply", body: "Thanks — looking into this now." },
      ],
    });
    const drafted = await staff.post(`/admin/support/${ticket.id}/ai/drafts`, {});
    const html = await drafted.text();
    assert.match(html, /Could you send me the newest/, "drafts are shown to the agent");
    assert.match(html, /Use this draft/);
    assert.match(html, /nothing here reaches the customer on its own/i);
  } finally {
    globalThis.fetch = realFetch;
  }

  const row = await db.get("SELECT ai_summary FROM tickets WHERE id = ?", ticket.id);
  const stored = JSON.parse(row.ai_summary);
  assert.equal(stored.sentiment, "frustrated");
  assert.match(stored.summary, /cannot launch/);

  const messages = await db.all("SELECT * FROM ticket_messages WHERE ticket_id = ?", ticket.id);
  assert.equal(messages.length, 1, "the AI sent nothing to the customer");

  const customer = makeClient(app, env);
  const page = await customer.get(`/support/t/${ref}`);
  assert.equal(page.status, 404, "and the drafts were never on a customer-visible page");
});

test("AI assist is absent, not broken, without a key", async () => {
  const { app, db } = await buildTestApp(ENV);
  const { ref } = await openGuestTicket(app, ENV);
  const ticket = await db.get("SELECT id FROM tickets WHERE ref = ?", ref);
  const staff = await adminClient(app);
  const page = await (await staff.get(`/admin/support/${ticket.id}`)).text();
  assert.match(page, /GEMINI_API_KEY/, "the panel explains how to turn it on");
  assert.ok(!page.includes("Summarise thread"), "and offers no button that would fail");

  const res = await staff.post(`/admin/support/${ticket.id}/ai/summary`, {});
  assert.equal(res.status, 302, "posting it anyway is handled, not a 500");
});

test("a closed ticket reopens when the requester replies, as the closing email promises", async () => {
  const { app, db } = await buildTestApp(ENV);
  const { client } = await signUp(app, ENV, "comesback");
  await client.get("/support/new");
  const created = await client.post("/support/new", {
    subject: "Crosshair keeps resetting", category: "ingame",
    body: "My crosshair resets to the default every time CS2 restarts.",
  });
  const ref = created.headers.get("location").split("/").pop();
  const ticket = await db.get("SELECT id FROM tickets WHERE ref = ?", ref);

  const staff = await adminClient(app);
  await staff.get(`/admin/support/${ticket.id}`);
  await staff.post(`/admin/support/${ticket.id}/status`, { status: "closed" });
  assert.equal((await db.get("SELECT status FROM tickets WHERE id = ?", ticket.id)).status, "closed");

  const page = await (await client.get(`/support/t/${ref}`)).text();
  assert.match(page, /Replying below reopens it/, "the page says what a reply will do");
  assert.match(page, /chat-composer/, "and there is something to reply with");

  const replied = await client.post(`/support/t/${ref}/reply`, { body: "It has come back, sorry." });
  assert.equal(replied.status, 302);
  const reopened = await db.get("SELECT status, closed_at FROM tickets WHERE id = ?", ticket.id);
  assert.equal(reopened.status, "open");
  assert.equal(reopened.closed_at, null, "and it is no longer stamped closed");
});

test("UID 0 is a real member and can read their own ticket", async () => {
  // The reserved vanity block starts at zero, so a truthy check on user_id
  // would lock exactly one account out of the entire support system.
  const { app, db } = await buildTestApp(ENV);
  const zero = await db.get("SELECT id, username FROM users WHERE id = 0");
  assert.ok(zero, "the vanity block seeds a user at UID 0");
  await db.run("UPDATE users SET password_hash = (SELECT password_hash FROM users WHERE username = 'admin'), tier = 'user' WHERE id = 0");

  const client = makeClient(app, ENV);
  await client.get("/auth/login");
  const login = await client.post("/auth/login", {
    identifier: zero.username, password: ENV.ADMIN_PASSWORD,
  });
  assert.equal(login.status, 302, "UID 0 can sign in");

  await client.get("/support/new");
  const created = await client.post("/support/new", {
    subject: "A ticket from user zero", category: "other",
    body: "This account has the id zero, which is a perfectly ordinary id.",
  });
  assert.equal(created.status, 302);
  const ref = created.headers.get("location").split("/").pop();

  const res = await client.get(`/support/t/${ref}`);
  assert.equal(res.status, 200, "and can read the ticket they just opened");
  assert.match(await res.text(), /A ticket from user zero/);
});

test("a solved ticket gets its full grace period before auto-closing", async () => {
  const { app, db } = await buildTestApp(ENV);
  const cfg = supportConfig({});
  const { ref } = await openGuestTicket(app, ENV);
  const ticket = await db.get("SELECT id FROM tickets WHERE ref = ?", ref);

  // Solved just now, but the last message is a fortnight old — which is the
  // ordinary shape of a ticket answered by phone or closed after a long wait.
  const fortnightAgo = Date.now() - 14 * 86_400_000;
  await db.run(
    "UPDATE tickets SET status = 'solved', closed_at = ?, last_staff_at = ?, last_user_at = ? WHERE id = ?",
    Date.now(), fortnightAgo, fortnightAgo, ticket.id
  );
  assert.equal(await sweepAutoClose(db, cfg), 0, "the grace period runs from the close, not the last message");

  await db.run("UPDATE tickets SET closed_at = ? WHERE id = ?", fortnightAgo, ticket.id);
  assert.equal(await sweepAutoClose(db, cfg), 1);
  assert.equal((await db.get("SELECT status FROM tickets WHERE id = ?", ticket.id)).status, "closed");
});

test("relaxing a priority lifts a breach the new deadline no longer justifies", async () => {
  const { app, db } = await buildTestApp(ENV);
  const { ref } = await openGuestTicket(app, ENV);
  const ticket = await db.get("SELECT id FROM tickets WHERE ref = ?", ref);
  // Urgent, opened three hours ago, breached against the 2h target.
  await db.run(
    "UPDATE tickets SET priority = 'urgent', sla_breached = 1, sla_due_at = ?, created_at = datetime('now', '-3 hours') WHERE id = ?",
    Date.now() - 3_600_000, ticket.id
  );

  const staff = await adminClient(app);
  await staff.get(`/admin/support/${ticket.id}`);
  await staff.post(`/admin/support/${ticket.id}/priority`, { priority: "low" });

  const after = await db.get("SELECT sla_breached, sla_due_at FROM tickets WHERE id = ?", ticket.id);
  assert.equal(Number(after.sla_breached), 0, "72 hours have not passed, so it is not breaching");
  assert.ok(Number(after.sla_due_at) > Date.now());

  const events = await db.all("SELECT * FROM ticket_events WHERE ticket_id = ? AND kind = 'sla_reset'", ticket.id);
  assert.equal(events.length, 1, "and the change is on the record");
});

test("merging rebuilds the survivor's lifecycle and refuses a closed survivor", async () => {
  const { app, db } = await buildTestApp(ENV);
  const { client } = await signUp(app, ENV, "rebuilder");
  const a = { ref: await openMemberTicket(client, "First report") };
  const b = { ref: await openMemberTicket(client, "Same thing again") };
  const target = await db.get("SELECT id FROM tickets WHERE ref = ?", a.ref);
  const source = await db.get("SELECT id FROM tickets WHERE ref = ?", b.ref);

  const staff = await adminClient(app);
  // A closed survivor would bury the live conversation being merged into it.
  await staff.get(`/admin/support/${target.id}`);
  await staff.post(`/admin/support/${target.id}/status`, { status: "closed" });
  await staff.get(`/admin/support/${source.id}`);
  await staff.post(`/admin/support/${source.id}/merge`, { into: a.ref });
  assert.equal((await db.get("SELECT merged_into FROM tickets WHERE id = ?", source.id)).merged_into, null,
    "refused while the survivor is closed");

  // Reopen it and the merge goes through, with the survivor's state rebuilt.
  await staff.get(`/admin/support/${target.id}`);
  await staff.post(`/admin/support/${target.id}/status`, { status: "open" });
  await staff.post(`/admin/support/${target.id}/reply`, { body: "Looking into it." });
  await staff.get(`/admin/support/${source.id}`);
  await staff.post(`/admin/support/${source.id}/merge`, { into: a.ref });

  const merged = await db.get("SELECT * FROM tickets WHERE id = ?", target.id);
  // The merged-in message was written BEFORE the staff reply, so chronologically
  // it is already answered — the state is rebuilt from message order, not from
  // which ticket a message arrived on.
  assert.equal(merged.status, "answered");
  assert.ok(merged.first_response_at, "the staff reply it holds still counts as the first response");
  assert.ok(Number(merged.last_user_at) > 0);

  // A customer message that lands after the reply flips it back to open.
  const cRef = await openMemberTicket(client, "Still broken");
  const third = await db.get("SELECT id FROM tickets WHERE ref = ?", cRef);
  await staff.get(`/admin/support/${third.id}`);
  await staff.post(`/admin/support/${third.id}/merge`, { into: a.ref });
  assert.equal((await db.get("SELECT status FROM tickets WHERE id = ?", target.id)).status, "open",
    "the newest message is now the customer's, so it needs an answer");
});

test("asking for a fresh link does not instantly break the one already saved", async () => {
  // Getting here needs a reference and an email address. Neither is a secret,
  // so a re-issue must not be a way for a stranger to lock the owner out.
  const env = { ...ENV, EMAIL_PROVIDER: "test", EMAIL_FROM: "s@goyhub.test", SITE_URL: "https://goyhub.test" };
  const { app, db } = await buildTestApp(env);
  globalThis.__testEmails = [];
  const { ref, key } = await openGuestTicket(app, env);

  const stranger = makeClient(app, env);
  await stranger.get("/support/lookup");
  await stranger.post("/support/lookup", { ref, email: "guest@example.com" });

  const rotated = await db.get("SELECT key_hash, key_hash_prev, key_rotated_at FROM tickets WHERE ref = ?", ref);
  assert.ok(rotated.key_hash_prev, "the old key is kept");
  assert.ok(Number(rotated.key_rotated_at) > 0);

  // The owner's saved link still works…
  const owner = makeClient(app, env);
  assert.equal((await owner.get(`/support/t/${ref}?k=${key}`)).status, 200);

  // …and the new one, which only ever went to the address on the ticket.
  const mail = globalThis.__testEmails.find((m) => m.subject.includes("Your ticket link"));
  assert.ok(mail, "the replacement went out by email, not to whoever asked");
  const fresh = mail.text.match(/\?k=([a-f0-9]{64})/)[1];
  assert.notEqual(fresh, key);
  assert.equal((await makeClient(app, env).get(`/support/t/${ref}?k=${fresh}`)).status, 200);

  // Once the window closes, the old key stops.
  await db.run("UPDATE tickets SET key_rotated_at = ? WHERE ref = ?", Date.now() - 30 * 86400000, ref);
  assert.equal((await makeClient(app, env).get(`/support/t/${ref}?k=${key}`)).status, 404);
  assert.equal((await makeClient(app, env).get(`/support/t/${ref}?k=${fresh}`)).status, 200);
  globalThis.__testEmails = [];
});

test("the ticket-link lookup answers identically however the site is configured", async () => {
  // With email off, the response must not depend on whether the pair matched —
  // otherwise the "cannot re-send" message is an oracle.
  const { app } = await buildTestApp(ENV);
  const { ref } = await openGuestTicket(app, ENV);
  const client = makeClient(app, ENV);
  await client.get("/support/lookup");

  // Same reference, one real address and one wrong: the only thing that could
  // differ is what the form echoes back, so normalise that away.
  const real = await client.post("/support/lookup", { ref, email: "guest@example.com" });
  const fake = await client.post("/support/lookup", { ref, email: "nobody@example.com" });
  assert.equal(real.status, fake.status);
  const normalise = (html) => html.replace(/guest@example\.com|nobody@example\.com/g, "SOMEONE");
  assert.equal(normalise(await real.text()), normalise(await fake.text()),
    "the response says nothing about whether the pair matched");
});

/* ================================================================== *
 * Privacy
 * ================================================================== */

test("deleting an account scrubs the identity copied onto its tickets", async () => {
  const { app, db } = await buildTestApp(ENV);
  const { client } = await signUp(app, ENV, "leaver");
  await client.get("/support/new");
  const created = await client.post("/support/new", {
    subject: "One last question before I go", category: "other",
    body: "I am thinking about closing my account but had a question first.",
  });
  const ref = created.headers.get("location").split("/").pop();

  await client.get("/profile");
  const deleted = await client.post("/profile/delete", {
    password: "supersecret1", confirm_phrase: "DELETE",
  });
  assert.equal(deleted.status, 302);

  const ticket = await db.get("SELECT * FROM tickets WHERE ref = ?", ref);
  assert.ok(ticket, "the ticket survives the account (a dispute has to outlive it)");
  assert.equal(ticket.user_id, null);
  assert.equal(ticket.guest_email, null);
  assert.equal(ticket.ip, null);

  const messages = await db.all("SELECT author_name FROM ticket_messages WHERE ticket_id = ?", ticket.id);
  assert.ok(messages.every((m) => m.author_name === "[deleted]"),
    "the username copied onto each message is scrubbed too");
});
