#!/usr/bin/env node
/**
 * Local preview server for the UI skins — the real app over an in-memory
 * database, populated with the tests' scenario, plus public/ static files.
 *
 *   node tests/serve.mjs [port=8787] [skin=neon]
 *
 * Log in as admin / admin-test-password-1 or player_one / supersecret1
 * (a Paid member). Any skin can be viewed with ?ui=<classic|neon|prism>.
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildScenario, CREDENTIALS } from "./skin-scenario.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const PUBLIC = path.join(ROOT, "public");
const port = Number(process.argv[2] || 8787);
const skin = process.argv[3] || "neon";

const TYPES = {
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".ttf": "font/ttf",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".json": "application/json",
  ".glb": "model/gltf-binary",
};

const scenario = await buildScenario({ UI_THEME: skin });
const { app, env } = scenario;

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${port}`);
  const p = decodeURIComponent(url.pathname);
  if (/^\/(css|js|fonts)\//.test(p) || p === "/favicon.ico") {
    const file = path.normalize(path.join(PUBLIC, p));
    if (file.startsWith(PUBLIC) && fs.existsSync(file) && fs.statSync(file).isFile()) {
      res.writeHead(200, { "content-type": TYPES[path.extname(file)] || "application/octet-stream", "cache-control": "no-store" });
      fs.createReadStream(file).pipe(res);
      return;
    }
    res.writeHead(404); res.end("not found"); return;
  }
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const body = chunks.length ? Buffer.concat(chunks) : undefined;
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) if (typeof v === "string") headers.set(k, v);
  const request = new Request(url.toString(), { method: req.method, headers, body: body && req.method !== "GET" && req.method !== "HEAD" ? body : undefined });
  try {
    const out = await app.fetch(request, env);
    const outHeaders = {};
    out.headers.forEach((v, k) => { if (k !== "set-cookie") outHeaders[k] = v; });
    const cookies = out.headers.getSetCookie();
    if (cookies.length) outHeaders["set-cookie"] = cookies;
    res.writeHead(out.status, outHeaders);
    res.end(Buffer.from(await out.arrayBuffer()));
  } catch (err) {
    res.writeHead(500, { "content-type": "text/plain" });
    res.end(`server error: ${err && err.stack || err}`);
  }
});

server.listen(port, () => {
  console.log(`GoyHub preview  http://localhost:${port}/  (default skin: ${skin}; switch with ?ui=classic|neon|prism)`);
  console.log(`admin: ${CREDENTIALS.admin.identifier} / ${CREDENTIALS.admin.password}`);
  console.log(`paid member: ${CREDENTIALS.user.identifier} / ${CREDENTIALS.user.password}`);
  console.log(`thread /forum/t/${scenario.ids.threadId} · ticket /support/t/${scenario.ids.ticketRef}`);
});
