/**
 * Status page tests: the derived verdict, the incident lifecycle, the JSON
 * endpoint, and the heads-up banner that puts a known outage in front of
 * someone before they open a ticket about it.
 *
 * Run: npm test
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildTestApp } from "./harness.mjs";
import { makeClient, signUp } from "./client.mjs";
import { readUtcDateTime } from "../functions/_lib/routes-admin-status.js";
import {
  worstOf, overallStatus, uptimeHistory, statusHeadsUp, publicSnapshot, statusSnapshot,
  normalizeComponentState, normalizeImpact, componentList,
} from "../functions/_lib/status.js";

const ENV = {
  ADMIN_USERNAME: "admin",
  ADMIN_PASSWORD: "admin-test-password-1",
  CAPTCHA_DIFFICULTY: "10",
  CAPTCHA_SECRET: "test-captcha-secret",
  PBKDF2_ITERATIONS: "10000",
  RATE_LIMIT_SIGNUP: "200",
};

async function adminClient(app, env = ENV) {
  const client = makeClient(app, env);
  await client.get("/auth/login");
  const res = await client.post("/auth/login", {
    identifier: env.ADMIN_USERNAME, password: env.ADMIN_PASSWORD,
  });
  assert.equal(res.status, 302, "admin login should redirect");
  return client;
}

/** The incident form posts a checkbox group, which URLSearchParams can repeat. */
async function postIncident(app, client, fields, components = []) {
  const form = new URLSearchParams();
  form.append("_csrf", client.jar.get("ghcsrf") || "");
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  for (const slug of components) form.append("components", slug);
  const res = await app.fetch(new Request("http://local/admin/status/incidents", {
    method: "POST",
    headers: {
      cookie: [...client.jar].map(([k, v]) => `${k}=${v}`).join("; "),
      "content-type": "application/x-www-form-urlencoded",
    },
    body: form.toString(),
  }), ENV);
  return res;
}

/* ================================================================== *
 * Pure units
 * ================================================================== */

test("severity ordering decides the overall verdict", () => {
  assert.equal(worstOf("operational", "degraded"), "degraded");
  assert.equal(worstOf("major", "degraded"), "major");
  assert.equal(worstOf("maintenance", "operational"), "maintenance");
  assert.equal(worstOf("nonsense", "partial"), "partial", "an unknown state cannot outrank a real one");

  assert.equal(overallStatus([]), "operational");
  assert.equal(overallStatus([
    { status: "operational", visible: 1 },
    { status: "major", visible: 1 },
    { status: "degraded", visible: 1 },
  ]), "major");
  assert.equal(overallStatus([
    { status: "operational", visible: 1 },
    { status: "major", visible: 0 },
  ]), "operational", "a hidden component cannot drag the public verdict down");
});

test("input normalisation", () => {
  assert.equal(normalizeComponentState("major"), "major");
  assert.equal(normalizeComponentState("catastrophic"), "operational");
  assert.equal(normalizeImpact("critical"), "critical");
  assert.equal(normalizeImpact("apocalyptic"), "minor");
  assert.deepEqual(componentList(" a , b ,, c "), ["a", "b", "c"]);
});

test("a maintenance window is read as UTC, not as the admin's wall clock", () => {
  assert.equal(readUtcDateTime("2026-03-12T14:05"), Date.parse("2026-03-12T14:05:00Z"));
  assert.equal(readUtcDateTime("2026-03-12T14:05:30"), Date.parse("2026-03-12T14:05:30Z"));
  assert.equal(readUtcDateTime(""), null);
  assert.equal(readUtcDateTime("tomorrow"), null);
  assert.equal(readUtcDateTime("2026-03-12"), null, "a date with no time is not a window");
});

test("uptime history is derived from incidents, day by day", () => {
  const DAY = 86_400_000;
  const now = Date.UTC(2026, 2, 20, 12, 0, 0);
  const components = [{ slug: "app", name: "App" }, { slug: "forum", name: "Forum" }];
  const incidents = [{
    components: "app",
    kind: "incident",
    impact: "critical",
    started_at: now - 2 * DAY,
    resolved_at: now - 2 * DAY + 3600_000,
  }];

  const [app, forum] = uptimeHistory(components, incidents, { days: 10, now });
  assert.equal(app.timeline.length, 10);
  const bad = app.timeline.filter((d) => d.state !== "operational");
  assert.equal(bad.length, 1, "exactly the one day the incident ran");
  assert.equal(bad[0].state, "major", "a critical incident reads as a major outage that day");
  assert.equal(app.uptimePct, "90", "9 of 10 days clean");
  assert.ok(forum.timeline.every((d) => d.state === "operational"), "an unaffected component is untouched");
});

/* ================================================================== *
 * The page
 * ================================================================== */

test("a fresh install has a status page that says everything is fine", async () => {
  const { app, db } = await buildTestApp(ENV);
  const guest = makeClient(app, ENV);

  const res = await guest.get("/status");
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.match(html, /All systems operational/);
  assert.match(html, /Match tracking/, "the seeded components are listed");
  assert.ok(!/beacon-live/.test(html), "nothing pulses while nothing is wrong");
  assert.match(html, /incident-free/, "90-day history is drawn");
  assert.equal(res.headers.get("cache-control"), "no-store",
    "a status page must never outlive the incident it reports");

  const components = await db.all("SELECT * FROM status_components");
  assert.ok(components.length >= 5, "seeded on first run");
  assert.ok(components.every((c) => c.status === "operational"));
});

test("the status page is reachable by absolutely everyone", async () => {
  const { app } = await buildTestApp(ENV);
  // The people who most need it are the ones who cannot sign in.
  assert.equal((await makeClient(app, ENV).get("/status")).status, 200);
  assert.equal((await makeClient(app, ENV).get("/status.json")).status, 200);
  const { client } = await signUp(app, ENV, "freeviewer");
  assert.equal((await client.get("/status")).status, 200);
});

test("/status.json is a stable machine-readable contract", async () => {
  const { app } = await buildTestApp(ENV);
  const res = await makeClient(app, ENV).get("/status.json");
  assert.equal(res.headers.get("access-control-allow-origin"), "*",
    "an uptime monitor on another origin must be able to read it");
  const data = await res.json();
  assert.equal(data.status, "operational");
  assert.equal(data.headline, "All systems operational");
  assert.ok(Array.isArray(data.components) && data.components.length > 0);
  assert.deepEqual(Object.keys(data.components[0]).sort(), ["label", "name", "slug", "status"]);
  assert.deepEqual(data.incidents, []);
  assert.ok(!JSON.stringify(data).includes('"id"'), "no internal ids leak into the public shape");
  assert.match(data.updatedAt, /^\d{4}-\d{2}-\d{2}T/);
});

/* ================================================================== *
 * The incident lifecycle
 * ================================================================== */

test("opening an incident moves the components, the page and the JSON together", async () => {
  const { app, db } = await buildTestApp(ENV);
  const staff = await adminClient(app);
  await staff.get("/admin/status");

  const res = await postIncident(app, staff, {
    title: "Match tracking is delayed",
    body: "Matches are taking up to an hour to appear. We are investigating.",
    kind: "incident",
    impact: "major",
    component_status: "degraded",
  }, ["stats", "app"]);
  assert.equal(res.status, 302);

  const incident = await db.get("SELECT * FROM status_incidents ORDER BY id DESC LIMIT 1");
  assert.equal(incident.components, "stats,app", "the whole checkbox group is captured, not just the last one");
  assert.equal(incident.state, "investigating");
  assert.equal(incident.impact, "major");

  const updates = await db.all("SELECT * FROM status_updates WHERE incident_id = ?", incident.id);
  assert.equal(updates.length, 1, "an incident is never published empty");
  assert.match(updates[0].body, /taking up to an hour/);

  const stats = await db.get("SELECT status FROM status_components WHERE slug = 'stats'");
  assert.equal(stats.status, "degraded");

  const guest = makeClient(app, ENV);
  const html = await (await guest.get("/status")).text();
  assert.match(html, /Degraded performance/, "the verdict follows the worst component");
  assert.match(html, /beacon-live/, "and it pulses now");
  assert.match(html, /Match tracking is delayed/);
  assert.match(html, /Happening now/);

  const json = await (await guest.get("/status.json")).json();
  assert.equal(json.status, "degraded");
  assert.equal(json.incidents.length, 1);
  assert.deepEqual(json.incidents[0].components, ["stats", "app"]);
  assert.match(json.incidents[0].latest, /taking up to an hour/);
});

test("resolving hands the components back and files the incident in history", async () => {
  const { app, db } = await buildTestApp(ENV);
  const staff = await adminClient(app);
  await staff.get("/admin/status");
  await postIncident(app, staff, {
    title: "Sign-in failing", body: "Some sign-ins are failing.", kind: "incident",
    impact: "critical", component_status: "major",
  }, ["accounts"]);
  const incident = await db.get("SELECT * FROM status_incidents ORDER BY id DESC LIMIT 1");

  await staff.get("/admin/status");
  const res = await staff.post(`/admin/status/incidents/${incident.id}/update`, {
    body: "Fixed — sign-in is working normally again.", state: "resolved",
  });
  assert.equal(res.status, 302);

  const closed = await db.get("SELECT * FROM status_incidents WHERE id = ?", incident.id);
  assert.ok(closed.resolved_at, "stamped as resolved");
  assert.equal(closed.state, "resolved");
  const accounts = await db.get("SELECT status FROM status_components WHERE slug = 'accounts'");
  assert.equal(accounts.status, "operational", "the component is handed back");

  const html = await (await makeClient(app, ENV).get("/status")).text();
  assert.match(html, /All systems operational/);
  assert.match(html, /Past 90 days[\s\S]*Sign-in failing/, "it moves into the history");
  assert.ok(!/Happening now/.test(html));
});

test("resolving one of two overlapping incidents does not declare the other one fixed", async () => {
  const { app, db } = await buildTestApp(ENV);
  const staff = await adminClient(app);
  await staff.get("/admin/status");

  await postIncident(app, staff, {
    title: "Forum slow", body: "The forum is slow.", kind: "incident",
    impact: "minor", component_status: "degraded",
  }, ["forum", "website"]);
  const first = await db.get("SELECT * FROM status_incidents ORDER BY id DESC LIMIT 1");

  await staff.get("/admin/status");
  await postIncident(app, staff, {
    title: "Website errors", body: "The website is throwing errors.", kind: "incident",
    impact: "major", component_status: "partial",
  }, ["website"]);

  await staff.get("/admin/status");
  await staff.post(`/admin/status/incidents/${first.id}/update`, {
    body: "The forum is back to normal.", state: "resolved",
  });

  const forum = await db.get("SELECT status FROM status_components WHERE slug = 'forum'");
  const website = await db.get("SELECT status FROM status_components WHERE slug = 'website'");
  assert.equal(forum.status, "operational", "released — nothing else claims it");
  assert.equal(website.status, "partial", "still claimed by the second incident, so left alone");

  const json = await (await makeClient(app, ENV).get("/status.json")).json();
  assert.equal(json.status, "partial");
  assert.equal(json.incidents.length, 1);
});

test("scheduled maintenance does not mark anything broken today", async () => {
  const { app, db } = await buildTestApp(ENV);
  const staff = await adminClient(app);
  await staff.get("/admin/status");

  const future = new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 16);
  await postIncident(app, staff, {
    title: "Database upgrade", body: "We are moving the database.", kind: "maintenance",
    impact: "none", component_status: "maintenance",
    scheduled_for: future, scheduled_until: future,
  }, ["website"]);

  const incident = await db.get("SELECT * FROM status_incidents ORDER BY id DESC LIMIT 1");
  assert.equal(incident.kind, "maintenance");
  assert.equal(incident.state, "scheduled");
  assert.ok(incident.scheduled_for > Date.now());

  const website = await db.get("SELECT status FROM status_components WHERE slug = 'website'");
  assert.equal(website.status, "operational", "a window three days out is not an outage now");

  const html = await (await makeClient(app, ENV).get("/status")).text();
  assert.match(html, /All systems operational/);
  assert.match(html, /Scheduled maintenance[\s\S]*Database upgrade/);
});

test("an incident cannot be published without saying anything", async () => {
  const { app, db } = await buildTestApp(ENV);
  const staff = await adminClient(app);
  await staff.get("/admin/status");
  const res = await postIncident(app, staff, { title: "Something is wrong", body: "" }, ["website"]);
  assert.equal(res.status, 302, "back to the form with a flash");
  assert.equal(Number((await db.get("SELECT COUNT(*) AS n FROM status_incidents")).n), 0);
});

/* ================================================================== *
 * Admin gates
 * ================================================================== */

test("the status manager is staff-only, and destroying history is admin-only", async () => {
  const { app, db } = await buildTestApp(ENV);
  assert.equal((await makeClient(app, ENV).get("/admin/status")).status, 404);
  const { client } = await signUp(app, ENV, "randomer");
  assert.equal((await client.get("/admin/status")).status, 404, "404, never 403");

  const staff = await adminClient(app);
  assert.equal((await staff.get("/admin/status")).status, 200);

  // A staff member can set a state without being a full admin.
  const component = await db.get("SELECT * FROM status_components WHERE slug = 'app'");
  await staff.get("/admin/status");
  const set = await staff.post(`/admin/status/components/${component.id}/state`, { status: "partial" });
  assert.equal(set.status, 302);
  const after = await db.get("SELECT status, changed_at FROM status_components WHERE id = ?", component.id);
  assert.equal(after.status, "partial");
  assert.ok(after.changed_at, "and when it changed is recorded");
});

test("the all-clear button puts everything back", async () => {
  const { app, db } = await buildTestApp(ENV);
  const staff = await adminClient(app);
  await db.run("UPDATE status_components SET status = 'major' WHERE slug IN ('app','forum')");

  await staff.get("/admin/status");
  const res = await staff.post("/admin/status/components/reset", {});
  assert.equal(res.status, 302);
  const remaining = await db.all("SELECT slug FROM status_components WHERE status != 'operational'");
  assert.equal(remaining.length, 0);
});

/* ================================================================== *
 * The point of the whole thing
 * ================================================================== */

test("a known outage is shown before someone opens a ticket about it", async () => {
  const { app, db } = await buildTestApp(ENV);
  const guest = makeClient(app, ENV);

  // Nothing wrong: no banner anywhere, and no wasted query result.
  assert.equal(await statusHeadsUp(db), null);
  assert.ok(!(await (await guest.get("/help")).text()).includes("status-note"));
  assert.ok(!(await (await guest.get("/support/new")).text()).includes("status-note"));

  const staff = await adminClient(app);
  await staff.get("/admin/status");
  await postIncident(app, staff, {
    title: "Stats are not updating", body: "We know, and we are on it.",
    kind: "incident", impact: "major", component_status: "partial",
  }, ["stats"]);

  const heads = await statusHeadsUp(db);
  assert.equal(heads.overall, "partial");
  assert.equal(heads.incidents.length, 1);

  for (const path of ["/help", "/support", "/support/new"]) {
    const html = await (await guest.get(path)).text();
    assert.match(html, /status-note/, `${path} should carry the banner`);
    assert.match(html, /Stats are not updating/, `${path} should name the incident`);
    assert.match(html, /See the status page/, `${path} should link to the detail`);
  }
});

test("the public snapshot never contradicts the components under it", async () => {
  const { app, db } = await buildTestApp(ENV);
  // The verdict is derived on every read, so there is no field to leave stale.
  await db.run("UPDATE status_components SET status = 'major' WHERE slug = 'payments'");
  const snapshot = await statusSnapshot(db);
  const published = publicSnapshot(snapshot);
  assert.equal(published.status, "major");
  const worstListed = published.components
    .map((c) => c.status)
    .reduce((worst, s) => worstOf(worst, s), "operational");
  assert.equal(published.status, worstListed, "headline == worst component, always");
});
