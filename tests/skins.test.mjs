/**
 * The UI redesign skins (functions/_lib/ui-skins.js): selection, the assets
 * they serve, CSP-clean markup, route parity with the classic design and —
 * the one that keeps a restyle honest — every class the site renders or its
 * scripts create is mentioned by the skin's stylesheets.
 *
 * Run: npm test
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildScenario, renderPages, coverage } from "./skin-scenario.mjs";
import { SKINS, skinIds, defaultSkin, isSkin } from "../functions/_lib/ui-skins.js";
import { buildTestApp } from "./harness.mjs";
import { makeClient } from "./client.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const REDESIGNS = skinIds().filter((id) => id !== "classic");

test("skin registry", () => {
  assert.deepEqual(skinIds(), ["classic", "neon", "prism"]);
  assert.equal(defaultSkin({}), "classic", "unset UI_THEME is the classic design");
  assert.equal(defaultSkin({ UI_THEME: "PRISM " }), "prism", "UI_THEME is case/space tolerant");
  assert.equal(defaultSkin({ UI_THEME: "nope" }), "classic", "unknown UI_THEME falls back to classic");
  assert.ok(!isSkin("__proto__") && !isSkin("constructor"), "prototype names are not skins");
  for (const id of REDESIGNS) {
    assert.ok(SKINS[id].label && SKINS[id].tagline, `${id} has switcher copy`);
  }
});

test("skin selection: query, cookie, env default, switcher", async () => {
  const env = { CAPTCHA_SECRET: "s", ADMIN_PASSWORD: "admin-test-password-1", PBKDF2_ITERATIONS: "10000" };
  const { app } = await buildTestApp(env);
  const c = makeClient(app, env);

  let res = await c.get("/?ui=neon");
  assert.equal(res.status, 200);
  let html = await res.text();
  assert.ok(html.includes('<html lang="en" data-skin="neon">'), "neon skin renders");
  assert.ok(html.includes("/css/skin-neon.css?v=") && html.includes("/css/ui-neon.css?v="), "neon stylesheets are cache-stamped");
  assert.ok(html.includes('<script type="module" src="/js/ui-neon.js?v='), "neon bundle loads as an ES module");
  assert.ok(!html.includes("/js/fx.js") && !html.includes("/css/style.css"), "classic effects and stylesheet stay out of a redesign");
  assert.ok(html.includes("/js/main.js?v=") && html.includes("/js/boot.js?v=") && html.includes("/js/fingerprint.js?v="), "behaviour scripts still load");
  assert.ok(res.headers.getSetCookie().some((l) => l.startsWith("ghui=neon") && !/httponly/i.test(l)), "choice remembered in a page-readable cookie");
  assert.ok(html.includes('class="ui-switch"') && html.includes('href="/?ui=prism"'), "switcher offers the other designs");
  assert.ok(html.includes('class="ui-switch-item is-active" aria-current="true"'), "switcher marks the active design");

  html = await (await c.get("/faq")).text();
  assert.ok(html.includes('data-skin="neon"'), "cookie keeps the skin on the next page");

  html = await (await c.get("/faq?ui=bogus")).text();
  assert.ok(html.includes('data-skin="neon"'), "an unknown ?ui is ignored, cookie wins");

  html = await (await c.get("/faq?ui=classic")).text();
  assert.ok(!html.includes("data-skin=") && html.includes("/css/style.css?v=") && html.includes("/js/fx.js?v="), "classic is selectable again");

  // Deployment default from env, switcher hidden.
  const env2 = { ...env, UI_THEME: "prism", UI_SWITCHER: "0" };
  const { app: app2 } = await buildTestApp(env2);
  html = await (await makeClient(app2, env2).get("/")).text();
  assert.ok(html.includes('data-skin="prism"'), "UI_THEME picks the default design");
  assert.ok(!html.includes('class="ui-switch"') && !html.includes("ui-switch.css"), "UI_SWITCHER=0 hides the switcher and its stylesheet");
  html = await (await makeClient(app2, env2).get("/?ui=neon")).text();
  assert.ok(html.includes('data-skin="neon"'), "?ui still works with the switcher hidden");
});

test("skin assets are built and committed", () => {
  for (const id of REDESIGNS) {
    for (const rel of [`public/css/skin-${id}.css`, `public/css/ui-${id}.css`, `public/js/ui-${id}.js`]) {
      const file = path.join(ROOT, rel);
      assert.ok(fs.existsSync(file), `${rel} exists (run npm run build)`);
      assert.ok(fs.statSync(file).size > 2048, `${rel} is a real build, not a stub`);
    }
    // The CSP (connect/img/font/script-src 'self') would block them silently at
    // runtime, so an external URL in a bundle is a broken feature, not a style choice.
    const bundles = fs.readdirSync(path.join(ROOT, "public/js")).filter((n) => n === `ui-${id}.js` || n.startsWith("rb-"));
    for (const name of bundles) {
      const js = fs.readFileSync(path.join(ROOT, "public/js", name), "utf8");
      const urls = [...js.matchAll(/https?:\/\/[a-z0-9.-]+/gi)].map((m) => m[0]).filter((u) => !/w3\.org|reactjs\.org|react\.dev|github\.com|threejs\.org|greensock\.com|gsap\.com|motion\.dev|khronos\.org|npmjs\.com|mozilla\.org|schema\.org|localhost/i.test(u));
      assert.deepEqual([...new Set(urls)], [], `${name}: no runtime URLs to other origins`);
      assert.ok(!/<style[\s>]/.test(js) && !/createElement\(["']style["']\)/.test(js), `${name}: no <style> injection (CSP style-src 'self')`);
    }
  }
});

for (const id of REDESIGNS) {
  test(`${id}: every page renders, matches classic status codes, and is CSP-clean`, async () => {
    const scenario = await buildScenario();
    const classic = await renderPages(scenario, "classic");
    const skinned = await renderPages(scenario, id);
    assert.equal(skinned.length, classic.length);
    for (let i = 0; i < classic.length; i += 1) {
      const a = classic[i];
      const b = skinned[i];
      assert.equal(b.status, a.status, `${b.as} ${b.path}: ${id} returned ${b.status}, classic ${a.status}`);
      if (!b.html) continue;
      assert.ok(b.html.includes(`data-skin="${id}"`), `${b.as} ${b.path}: rendered under ${id}`);
      assert.ok(!/\sstyle="/.test(b.html), `${b.as} ${b.path}: no inline style attributes (CSP style-src 'self')`);
      const inlineScripts = [...b.html.matchAll(/<script(?![^>]*\ssrc=)([^>]*)>/g)].filter((m) => !/type="application\/json"/.test(m[1]));
      assert.equal(inlineScripts.length, 0, `${b.as} ${b.path}: no inline scripts (CSP script-src 'self')`);
      assert.ok(/<main id="main">/.test(b.html) && /<header/.test(b.html) && /<footer/.test(b.html), `${b.as} ${b.path}: has header, main and footer`);
      assert.ok(/<a class="skip-link" href="#main">/.test(b.html), `${b.as} ${b.path}: keeps the skip link`);
      // Every page has to carry the same forms/links classic does; a redesign
      // may reword copy, but a CSRF token or a nav destination cannot vanish.
      for (const need of ['name="_csrf"']) {
        if (a.html.includes(need)) assert.ok(b.html.includes(need), `${b.as} ${b.path}: keeps ${need}`);
      }
      for (const href of ['href="/forum"', 'href="/help"', 'href="/terms"', 'href="/privacy"']) {
        assert.ok(b.html.includes(href), `${b.as} ${b.path}: chrome links to ${href}`);
      }
      if (b.as === "admin") assert.ok(b.html.includes('href="/admin"'), `${b.as} ${b.path}: staff see the admin link`);
    }
  });

  test(`${id}: landing page carries the React data block and the right calls to action`, async () => {
    const scenario = await buildScenario();
    const pages = await renderPages(scenario, id);
    const anonHome = pages.find((p) => p.as === "anon" && p.path === "/").html;
    const userHome = pages.find((p) => p.as === "user" && p.path === "/").html;
    for (const [who, html] of [["anon", anonHome], ["user", userHome]]) {
      assert.ok(html.includes('id="rb-home"'), `${who}: landing root present`);
      const m = html.match(/<script type="application\/json" id="rb-home-data">([\s\S]*?)<\/script>/);
      assert.ok(m, `${who}: landing data block present`);
      const data = JSON.parse(m[1]);
      for (const key of ["stats", "recentThreads", "downloadMeta", "canDownload", "canViewForum", "user", "appVersion"]) {
        assert.ok(key in data, `${who}: landing data has ${key}`);
      }
      assert.ok(!m[1].includes("</script"), `${who}: data block cannot break out of its script tag`);
      assert.ok(html.includes("<h1"), `${who}: server-rendered headline for no-JS/crawlers`);
    }
    assert.ok(!anonHome.includes("/download/file") && anonHome.includes("/auth/signup"), "logged-out landing hides the download and offers signup");
    assert.ok(userHome.includes("/download/file"), "paid member landing links the download");
  });

  test(`${id}: stylesheets cover every class the site renders or its scripts create`, async () => {
    const scenario = await buildScenario();
    const rendered = await renderPages(scenario, id);
    const { required, missing } = coverage(rendered, id);
    assert.ok(required.length > 200, "inventory looks complete");
    assert.deepEqual(missing, [], `${missing.length} unstyled class(es) under ${id}: ${missing.join(", ")}`);
  });
}
