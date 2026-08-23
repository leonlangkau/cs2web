/**
 * Node test/dev harness.
 *
 * Production runs on Cloudflare Pages (functions/[[path]].js + D1). This harness
 * mounts the identical app from functions/_lib/app.js over a node:sqlite adapter
 * that presents the same async interface as the D1 adapter, so the smoke test
 * exercises the real route, middleware and view code — not a reimplementation.
 */
import { DatabaseSync } from "node:sqlite";
import { createApp } from "../functions/_lib/app.js";
import { seed } from "../functions/_lib/bootstrap.js";

/** node:sqlite adapter with the same shape as functions/_lib/d1-adapter.js. */
export function createNodeAdapter(dbPath = ":memory:") {
  const db = new DatabaseSync(dbPath);
  db.exec("PRAGMA foreign_keys = ON;");
  return {
    kind: "node",
    raw: db,
    async all(sql, ...params) { return db.prepare(sql).all(...params); },
    async get(sql, ...params) { return db.prepare(sql).get(...params); },
    async run(sql, ...params) {
      const r = db.prepare(sql).run(...params);
      return { lastInsertRowid: Number(r.lastInsertRowid), changes: Number(r.changes) };
    },
    async exec(sql) { db.exec(sql); },
  };
}

/**
 * Builds a fetch-compatible app over a fresh in-memory database.
 * Returns { app, db } where app.fetch(request, env) drives the real router.
 */
export async function buildTestApp(env = {}) {
  globalThis.PBKDF2_ITERATIONS_OVERRIDE = env.PBKDF2_ITERATIONS;
  const db = createNodeAdapter(env.GOYHUB_DB || ":memory:");
  await seed(db, env);
  const app = createApp({ env, resolveDb: () => db });
  return { app, db, env };
}
