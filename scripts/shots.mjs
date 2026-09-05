#!/usr/bin/env node
/**
 * Screenshots + console audit for a skin, against a running tests/serve.mjs.
 *
 *   node scripts/shots.mjs <baseUrl> <skin> <outDir> [--pages=/,/forum,...] [--mobile]
 *
 * Visits a page list as a visitor, as the Paid member and as admin, saves a
 * full-page PNG per page (desktop 1440x900, plus 390x844 with --mobile) and
 * writes <outDir>/report.json with console errors, page errors and failed
 * requests. Uses the globally installed Playwright + the preinstalled Chromium.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
function loadPlaywright() {
  for (const candidate of ["playwright", "/opt/node22/lib/node_modules/playwright"]) {
    try { return require(candidate); } catch { /* next */ }
  }
  throw new Error("playwright not found — install it or run with a global install");
}
const { chromium } = loadPlaywright();

const [baseUrl, skin, outDir] = process.argv.slice(2);
if (!baseUrl || !skin || !outDir) {
  console.error("usage: node scripts/shots.mjs <baseUrl> <skin> <outDir> [--pages=/a,/b] [--mobile]");
  process.exit(2);
}
const mobile = process.argv.includes("--mobile");
const pagesArg = process.argv.find((a) => a.startsWith("--pages="));

const DEFAULT_PAGES = [
  ["anon", "/"], ["anon", "/auth/login"], ["anon", "/auth/signup"], ["anon", "/help"], ["anon", "/status"],
  ["anon", "/upgrade"], ["anon", "/faq"], ["anon", "/support/new"], ["anon", "/download"],
  ["user", "/"], ["user", "/forum"], ["user", "/profile"], ["user", "/support/mine"],
  ["admin", "/admin"], ["admin", "/admin/users"], ["admin", "/admin/support"],
];
const CREDS = {
  user: { identifier: "player_one", password: "supersecret1" },
  admin: { identifier: "admin", password: "admin-test-password-1" },
};

const pages = pagesArg
  ? pagesArg.slice(8).split(",").map((p) => p.includes(":") ? p.split(":") : ["anon", p])
  : DEFAULT_PAGES;

fs.mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const report = [];

async function audit(as, viewport) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1, hasTouch: viewport.width < 600 });
  const page = await ctx.newPage();
  const issues = [];
  page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") issues.push({ kind: m.type(), text: m.text().slice(0, 400) }); });
  page.on("pageerror", (e) => issues.push({ kind: "pageerror", text: String(e).slice(0, 400) }));
  page.on("requestfailed", (r) => issues.push({ kind: "requestfailed", text: `${r.url()} ${r.failure()?.errorText || ""}` }));
  page.on("response", (r) => { if (r.status() >= 400) issues.push({ kind: "http", text: `${r.status()} ${r.url()}` }); });

  await page.goto(`${baseUrl}/?ui=${skin}`, { waitUntil: "networkidle" });
  if (CREDS[as]) {
    await page.goto(`${baseUrl}/auth/login`, { waitUntil: "networkidle" });
    await page.fill('input[name="identifier"]', CREDS[as].identifier);
    await page.fill('input[name="password"]', CREDS[as].password);
    await Promise.all([page.waitForNavigation({ waitUntil: "networkidle" }), page.click('form button[type="submit"], form input[type="submit"]')]);
  }
  for (const [who, p] of pages) {
    if (who !== as) continue;
    issues.length = 0;
    const started = Date.now();
    try {
      await page.goto(`${baseUrl}${p}`, { waitUntil: "networkidle", timeout: 30000 });
      await page.waitForTimeout(1600); // let entrance animations settle
      const name = `${as}-${viewport.width}-${p.replace(/[^a-z0-9]+/gi, "_").replace(/^_+|_+$/g, "") || "home"}.png`;
      await page.screenshot({ path: path.join(outDir, name), fullPage: true });
      const metrics = await page.evaluate(() => ({
        title: document.title,
        skin: document.documentElement.getAttribute("data-skin"),
        docWidth: document.documentElement.scrollWidth,
        viewportWidth: window.innerWidth,
        h1: (document.querySelector("h1") || {}).textContent?.trim().slice(0, 80) || null,
        canvases: document.querySelectorAll("canvas").length,
        reactRoots: document.querySelectorAll("[data-rb-root], #rb-home [data-rb]").length,
      }));
      report.push({ as, viewport: viewport.width, path: p, file: name, ms: Date.now() - started, ...metrics, horizontalOverflow: metrics.docWidth > metrics.viewportWidth + 1, issues: [...issues] });
    } catch (err) {
      report.push({ as, viewport: viewport.width, path: p, error: String(err).slice(0, 300), issues: [...issues] });
    }
  }
  await ctx.close();
}

for (const viewport of mobile ? [{ width: 1440, height: 900 }, { width: 390, height: 844 }] : [{ width: 1440, height: 900 }]) {
  for (const as of ["anon", "user", "admin"]) await audit(as, viewport);
}
await browser.close();
fs.writeFileSync(path.join(outDir, "report.json"), JSON.stringify(report, null, 2));
const bad = report.filter((r) => r.error || r.horizontalOverflow || r.issues.some((i) => i.kind !== "warning"));
console.log(`${report.length} pages captured to ${outDir}; ${bad.length} with errors/overflow`);
for (const r of bad) console.log(`  ${r.as} ${r.viewport} ${r.path}: ${r.error || ""} ${r.horizontalOverflow ? "[horizontal overflow]" : ""} ${r.issues.filter((i) => i.kind !== "warning").map((i) => `${i.kind}: ${i.text}`).join(" | ")}`);
