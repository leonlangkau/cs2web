/**
 * Tiny request router — the whole app in one Pages Function.
 *
 * Five Star Repairs puts a file per route under functions/; GoyHub has ~30
 * routes that all share one middleware chain (sessions, CSRF, the terms gate),
 * so a single catch-all Function with an internal router keeps that chain in one
 * place. This module provides just the Hono-shaped surface the routes use
 * (app.get/post/use, and a context with get/set/html/json/redirect/header/
 * req.param/req.header/req.parseBody), so the route and middleware code did not
 * change when Hono was dropped for a zero-dependency deploy.
 */
import { wwwRedirect, securityHeaders, loadContext, csrfProtection, termsGate, ipBanGate, floodProtection } from "./middleware.js";
import { errorPage } from "./views/site.js";
import { createCompany } from "./company.js";
import { register as registerMain } from "./routes-main.js";
import { register as registerAuth } from "./routes-auth.js";
import { register as registerProfile } from "./routes-profile.js";
import { register as registerApi } from "./routes-api.js";
import { register as registerPayments } from "./routes-payments.js";
import { register as registerOnchain } from "./routes-onchain.js";
import { register as registerForum } from "./routes-forum.js";
import { register as registerSupport } from "./routes-support.js";
import { register as registerStatus } from "./routes-status.js";
import { register as registerAdmin } from "./routes-admin.js";
import { register as registerAdminSupport } from "./routes-admin-support.js";
import { register as registerAdminStatus } from "./routes-admin-status.js";

const APP_VERSION = "1.2.0";
const MAX_BODY_BYTES = 256 * 1024;
/**
 * Support tickets are the only place a visitor uploads a file (screenshots
 * and app logs), so they get a bigger ceiling than the rest of the site
 * rather than raising the limit everywhere. The per-file and per-request
 * caps that actually protect the database live in routes-support.js —
 * this is only the outer "don't even buffer it" guard.
 */
const UPLOAD_BODY_BYTES = 3 * 1024 * 1024;
const UPLOAD_PATHS = ["/support/", "/admin/support/"];

function bodyLimitFor(path) {
  return UPLOAD_PATHS.some((prefix) => path.startsWith(prefix)) ? UPLOAD_BODY_BYTES : MAX_BODY_BYTES;
}

function fallbackView() {
  return {
    user: null, path: "/", flash: null, csrfToken: "",
    needsTermsGate: false, termsVersion: "", company: createCompany({}),
    appName: "GoyHub", appVersion: APP_VERSION, ui: "classic", uiSwitcher: false,
  };
}

/** Compiles "/forum/t/:id" into a matcher that returns { id } or null. */
function compile(pattern) {
  const keys = [];
  const rx = new RegExp("^" + pattern.replace(/:[A-Za-z0-9_]+/g, (m) => {
    keys.push(m.slice(1));
    return "([^/]+)";
  }).replace(/\*/g, ".*") + "$");
  return (path) => {
    const m = rx.exec(path);
    if (!m) return null;
    const params = {};
    keys.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]); });
    return params;
  };
}

class Context {
  constructor(request, env) {
    this._req = request;
    this._url = new URL(request.url);
    this._store = new Map();
    this._headers = new Headers();
    this._params = {};
    this.env = env;
    this.__setCookies = null;
    this.req = {
      url: request.url,
      method: request.method,
      raw: request,
      param: (name) => this._params[name],
      header: (name) => request.headers.get(name) || undefined,
      parseBody: async () => {
        if (this._body) return this._body;
        const ct = request.headers.get("content-type") || "";
        if (ct.includes("application/x-www-form-urlencoded") || ct.includes("multipart/form-data")) {
          const form = await request.formData();
          const out = {};
          this._files = [];
          this._multi = new Map();
          // Text fields are bounded here rather than by Content-Length, which a
          // chunked body simply omits. Files are bounded in readUploads().
          let textBytes = 0;
          for (const [k, v] of form.entries()) {
            if (typeof v === "string") {
              textBytes += k.length + v.length;
              if (textBytes > MAX_BODY_BYTES) break;
              out[k] = v;
              // A checkbox group posts the same name repeatedly; the flat map
              // keeps last-wins (which every existing form relies on) and the
              // full list is available through c.req.all().
              if (!this._multi.has(k)) this._multi.set(k, []);
              this._multi.get(k).push(v);
              continue;
            }
            // The body stream can only be read once, so uploaded files are
            // kept here for c.req.files(); the text map keeps the filename so
            // routes that only care about field names are unaffected.
            out[k] = v.name;
            this._files.push({ field: k, file: v });
          }
          this._body = out;
        } else {
          this._body = {};
          this._files = [];
          this._multi = new Map();
        }
        return this._body;
      },

      /** Every value posted under `name` — for checkbox groups and multi-selects. */
      all: (name) => (this._multi ? this._multi.get(name) || [] : []),

      /**
       * Uploaded files from a multipart body, as [{ field, file }]. Empty
       * unless parseBody() has run (csrfProtection runs it on every write).
       */
      files: (field = null) => {
        const all = this._files || [];
        return field === null ? all : all.filter((f) => f.field === field);
      },
    };
  }

  get(key) { return this._store.get(key); }
  set(key, value) { this._store.set(key, value); }
  header(name, value) { this._headers.set(name, value); }

  /**
   * Applies headers and Set-Cookie collected during the request onto the final
   * response. Called once at the very end, so headers set by middleware AFTER
   * next() (e.g. the security headers) still land on the response.
   */
  finalize(res) {
    for (const [k, v] of this._headers) {
      if (!res.headers.has(k)) res.headers.set(k, v);
    }
    if (this.__setCookies) for (const cookie of this.__setCookies) res.headers.append("Set-Cookie", cookie);
    return res;
  }

  html(body, status = 200) {
    return new Response(body, { status, headers: { "Content-Type": "text/html; charset=UTF-8" } });
  }
  json(obj, status = 200) {
    return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
  }
  text(body, status = 200) {
    return new Response(body, { status, headers: { "Content-Type": "text/plain; charset=UTF-8" } });
  }
  redirect(location, status = 302) {
    return new Response(null, { status, headers: { Location: location } });
  }
}

/** Turns a use() pattern ("*", "/admin", "/admin/*") into a path predicate. */
function scopeMatch(pattern) {
  if (pattern === "*" || pattern === "/*") return () => true;
  if (pattern.endsWith("/*")) {
    const base = pattern.slice(0, -2);
    return (path) => path === base || path.startsWith(base + "/");
  }
  return (path) => path === pattern;
}

class Router {
  constructor() {
    this.middleware = [];
    this.routes = [];
    this._notFound = null;
    this._onError = null;
  }

  use(pattern, handler) { this.middleware.push({ scope: scopeMatch(pattern), handler }); }
  get(pattern, handler) { this.routes.push({ method: "GET", match: compile(pattern), handler }); }
  post(pattern, handler) { this.routes.push({ method: "POST", match: compile(pattern), handler }); }
  notFound(handler) { this._notFound = handler; }
  onError(handler) { this._onError = handler; }

  async dispatch(c) {
    // Middleware that applies to this path, in registration order. Any of them
    // may short-circuit by returning a Response; otherwise the route runs at the
    // end of the chain.
    const path = c._url.pathname;
    const chain = this.middleware.filter((m) => m.scope(path)).map((m) => m.handler);

    let response = null;
    const run = async (i) => {
      const mw = chain[i];
      if (!mw) { response = await this.runRoute(c); return response; }
      const r = await mw(c, () => run(i + 1));
      if (r instanceof Response && response === null) response = r;
      return response;
    };
    await run(0);
    return response;
  }

  async runRoute(c) {
    const path = c._url.pathname;
    for (const route of this.routes) {
      if (route.method !== c.req.method) continue;
      const params = route.match(path);
      if (params) {
        c._params = params;
        return route.handler(c);
      }
    }
    return this._notFound ? this._notFound(c) : c.text("Not found", 404);
  }
}

/**
 * Builds the router. `resolveDb(c)` returns the request's database adapter, and
 * `env` is the Cloudflare bindings/vars object (or a function of c).
 */
function createApp({ resolveDb, env = {} }) {
  const app = new Router();

  app.use("*", securityHeaders);

  // Reject oversized bodies before the route runs, mirroring Hono's bodyLimit.
  //
  // This is an EARLY-OUT, not the guarantee: a chunked request carries no
  // Content-Length, so the real ceilings are enforced after parsing — on the
  // field total in parseBody() below, and on the file total in
  // attachments.readUploads(). Cloudflare caps the request size above us too.
  app.use("*", async (c, next) => {
    const len = Number(c.req.header("content-length") || 0);
    if (len > bodyLimitFor(c._url.pathname)) {
      return c.html(errorPage(c.get("view") || fallbackView(), {
        code: 413, title: "Request failed", message: "Request too large. Trim it down and try again.",
      }), 413);
    }
    return next();
  });

  app.use("*", async (c, next) => {
    c.set("appVersion", APP_VERSION);
    // Present on Cloudflare, absent in the Node harness — routes use it to run
    // notifications and AI triage after the response, and simply await them
    // when it is missing.
    c.set("waitUntil", c.__waitUntil);
    const cfg = typeof env === "function" ? env(c) : env;
    c.set("cfg", cfg);
    c.set("company", createCompany(cfg));
    c.set("db", await resolveDb(c));
    return next();
  });

  // Canonicalize the host (www ↔ apex) before any DB work or route runs.
  app.use("*", wwwRedirect);

  app.use("*", loadContext);
  app.use("*", ipBanGate);
  app.use("*", floodProtection);
  app.use("*", csrfProtection);
  app.use("*", termsGate);

  registerMain(app);
  registerAuth(app);
  registerProfile(app);
  registerApi(app);
  registerPayments(app);
  registerOnchain(app);
  registerForum(app);
  registerSupport(app);
  registerStatus(app);
  registerAdmin(app);
  registerAdminSupport(app);
  registerAdminStatus(app);

  app.notFound((c) => c.html(errorPage(c.get("view") || fallbackView(), {
    code: 404, title: "Not found", message: "This page does not exist.",
  }), 404));

  app.onError((err, c) => {
    const status = Number(err && (err.status || err.statusCode));
    const code = status >= 400 && status < 600 ? status : 500;
    if (code >= 500) console.error("Unhandled error:", err);
    const messages = {
      400: "That request could not be understood. Go back and try again.",
      413: "Request too large. Trim it down and try again.",
    };
    try {
      return c.html(errorPage(c.get("view") || fallbackView(), {
        code,
        title: code >= 500 ? "Server error" : "Request failed",
        message: messages[code] || (code >= 500
          ? "Something went wrong on our side. Try again in a moment."
          : "The request could not be completed."),
      }), code);
    } catch {
      return c.text(`${code} — request failed`, code);
    }
  });

  return {
    async fetch(request, requestEnv, pagesContext = null) {
      const c = new Context(request, requestEnv);
      if (pagesContext && typeof pagesContext.waitUntil === "function") {
        c.__waitUntil = pagesContext.waitUntil.bind(pagesContext);
      }
      let res;
      try {
        res = await app.dispatch(c);
      } catch (err) {
        res = app._onError(err, c);
      }
      return c.finalize(res);
    },
  };
}

export { createApp, APP_VERSION };
