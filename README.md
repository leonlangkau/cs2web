# GoyHub — CS2 Companion Website

Full website for the GoyHub CS2 companion app: animated landing page with gated
download, community forum, account system with IP audit logging, a self-hosted
proof-of-work CAPTCHA, and a secured admin backend.

A **Cloudflare Pages project** — static `public/` plus one catch-all Pages
Function backed by **D1**. Deploys with default settings, no build step. See
[DEPLOY.md](DEPLOY.md).

## Structure

```
public/                  static site (Pages build output dir)
├─ index.html-less:      the app renders HTML server-side; public/ holds
│                        styles.css-equivalents under css/ and js/, plus assets
├─ css/ · js/            served straight from the edge
functions/
├─ [[path]].js           one catch-all Pages Function = the whole app
└─ _lib/                 router, middleware, routes, views, D1 adapter, crypto
schema.sql               D1 schema
scripts/                 build-schema.cjs, build-installer.cjs
tests/                   node --test smoke suite (drives the same app code)
wrangler.toml            Pages + D1 config
```

This mirrors the layout of the `fivestarrepairs` site: a `public/` static root,
a `functions/` directory of Pages Functions with shared helpers, `schema.sql` at
the root, and `wrangler.toml` with `pages_build_output_dir`.

## Quick start

```bash
npm install         # dev-only: wrangler
npm run dev         # wrangler pages dev — the real runtime + local D1
npm test            # node --test
```

Copy `.dev.vars.example` to `.dev.vars` and set `CAPTCHA_SECRET` and
`ADMIN_PASSWORD` before `npm run dev`.

## Features

### Website
- Animated hero: particle canvas, gradient headline, floating HUD cards, scroll reveals
- Spinning Star of David brand mark, white + `#0137B7`
- Download is **members only** — the button is hidden when logged out *and* the
  route requires a session, so the URL can't be shared around
- The installer lives outside `public/`, so every download goes through the
  audited, rate-limited route
- Landing page stays fully readable with JavaScript disabled

### Accounts
- Sign up / log in / log out; passwords hashed with **PBKDF2-HMAC-SHA256** (Web Crypto)
- Sessions stored in D1 — only a hash of the token is persisted
- **IP logging**: signup, login, failed login, blocked login, logout, download,
  CAPTCHA failure, terms acceptance and every admin action are recorded with IP,
  user agent and timestamp

### Forum
- Categories → threads → replies, with views, pinning, locking and pagination
- Deleting a user **preserves their threads and replies**, reattributed to a
  reserved `[deleted]` account

### Admin backend (`/admin`, hidden as 404 for non-admins)
- Dashboard, user management (ban/unban, promote/demote, delete), filterable IP
  log viewer, forum moderation

### Bot protection
Proof-of-work CAPTCHA in `functions/_lib/captcha.js` — no third party.
HMAC-signed, IP-bound, single-use challenges layered with a honeypot, a
server-clock minimum time, and DB-backed per-IP rate limits.

> Raises the cost of mass automated sign-ups and filters commodity bots. **Not**
> an identity proof — an attacker driving a real browser can pass it.

### Terms acceptance gate
A blocking dialog on first visit. Accepting sets a versioned cookie and writes a
`terms_accepted` audit row. Bump `TERMS_VERSION` in
`functions/_lib/middleware.js` to re-prompt everyone.

### Security hardening
- CSRF on every write: double-submit, additionally bound to the session
- DB-backed rate limits (hold across isolates, unlike an in-process map)
- Strict CSP, no frames, nosniff, referrer policy
- Error responses preserve status codes and never leak stack traces

## Configuration

Set as `[vars]`/secrets in `wrangler.toml` / the Pages dashboard (see DEPLOY.md).

| Variable | Default | Purpose |
| --- | --- | --- |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` | `admin` / random | Seeded admin; `ADMIN_PASSWORD` stays the source of truth — rotate it and the admin's password syncs on the next request, even if the account already existed |
| `CAPTCHA_SECRET` | insecure dev value | **Required** — signs CAPTCHA challenges |
| `CAPTCHA_DIFFICULTY` | `16` | Proof-of-work leading zero bits (8–24) |
| `PBKDF2_ITERATIONS` | `100000` | Hash cost; watch the free 10ms CPU limit |
| `RATE_LIMIT_*` | `10`/`5`/`6`/`30` | login / signup / post / download per window |
| `COMPANY_*` | placeholders | Registered entity on the legal pages |
| `TRUST_PROXY` | unset | Non-Cloudflare proxies only |

## Legal pages

`/terms` and `/privacy` are generated from an ordered section list, so the table
of contents can't drift from the anchors. The Privacy Policy matches what the
code actually does.

> The legal text is a template, **not a substitute for a lawyer's review**.

## Regenerating build artifacts

`npm run build` regenerates two files the runtime needs (it has no filesystem);
`npm test` fails if they drift.

- `functions/_lib/schema-sql.js` from `schema.sql`
- `functions/_lib/installer-data.js` from `artifacts/GoyHub-Setup-1.0.0.zip`
