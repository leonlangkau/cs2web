# GoyHub — CS2 Companion Website

Full website for the GoyHub CS2 companion app: animated landing page with gated
download, community forum, account system with IP audit logging, a self-hosted
proof-of-work CAPTCHA, and a secured admin backend.

**Deploys to Cloudflare Pages or Workers, and runs on Node** from one codebase — see [DEPLOY.md](DEPLOY.md).

> Deploying via the Pages Git integration? You **must** set a build command
> (`npm run build`) in the Pages project settings, or Pages skips `npm install`
> and the Functions bundle fails with `Could not resolve "hono"`.

## Stack

- **Hono** — a runtime-agnostic router, so the same app serves Workers and Node
- **Cloudflare D1** in production; **node:sqlite** locally and in tests
- **Web Crypto** for hashing and HMAC — identical on both runtimes
- **Plain JS template functions** for views. Workers blocks the `new Function`
  that EJS compiles with, so templates are functions returning escaped HTML
- No build step for the frontend, no CDNs, CSP-friendly

## Quick start

```bash
npm install
npm run dev          # http://localhost:3000, local SQLite
npm run cf:dev       # real workerd + local D1
npm test             # 77-check end-to-end suite
```

On first run an **admin** account is created and its generated password printed
once. Control it with `ADMIN_USERNAME` / `ADMIN_PASSWORD`.

## Features

### Website
- Animated hero: particle canvas, gradient headline, floating HUD cards, scroll reveals
- Download is **members only** — the button is hidden when logged out *and* the
  route requires a session, so the URL can't be shared around
- The installer lives in `artifacts/`, outside the static root, so every download
  goes through the audited, rate-limited route
- Landing page stays fully readable with JavaScript disabled

### Accounts
- Sign up / log in / log out; passwords hashed with **PBKDF2-HMAC-SHA256**
- Sessions stored server-side — only a hash of the token is persisted
- **IP logging**: signup, login, failed login, blocked login, logout, download,
  CAPTCHA failure, terms acceptance and every admin action are recorded with IP,
  user agent and timestamp

### Forum
- Categories → threads → replies, with views, pinning, locking and pagination
- Deleting a user **preserves their threads and replies**, reattributed to a
  reserved `[deleted]` account, so conversations other members joined stay intact

### Admin backend (`/admin`, hidden as 404 for non-admins)
- Dashboard, user management (ban/unban, promote/demote, delete), filterable IP
  log viewer, and forum moderation

### Bot protection
Proof-of-work CAPTCHA in `src/captcha.js` — no third party. HMAC-signed,
IP-bound, single-use challenges; the browser must find a nonce whose SHA-256 has
N leading zero bits (`CAPTCHA_DIFFICULTY`, default 16 ≈ 1s), layered with a
honeypot field, a server-clock minimum elapsed time, and per-IP rate limits.

> This raises the cost of mass automated sign-ups and filters commodity bots. It
> is **not** an identity proof — an attacker driving a real browser can pass it.

### Terms acceptance gate
A blocking dialog on first visit. Accepting sets a versioned cookie and writes a
`terms_accepted` audit row with IP, timestamp and version. Bump `TERMS_VERSION`
in `src/middleware.js` to re-prompt everyone.

### Security hardening
- CSRF on every write: double-submit, additionally bound to the session server-side
- Rate limits on login, signup, posting and downloads — **stored in the database**,
  so they hold across Workers isolates rather than living in one process's memory
- Strict CSP, no frames, nosniff, referrer policy
- Error responses preserve status codes and never leak stack traces

## Configuration

Set these as `[vars]` in `wrangler.toml` (Cloudflare) or environment variables (Node).

| Variable | Default | Purpose |
| --- | --- | --- |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` | `admin` / random | Seeded admin account (first run only) |
| `CAPTCHA_SECRET` | insecure dev value | **Set in production** — signs CAPTCHA challenges |
| `CAPTCHA_DIFFICULTY` | `16` | Proof-of-work leading zero bits (8–24) |
| `PBKDF2_ITERATIONS` | `100000` | Password hashing cost; watch the Workers Free 10ms CPU limit |
| `RATE_LIMIT_LOGIN` / `_SIGNUP` / `_POST` / `_DOWNLOAD` | `10` / `5` / `6` / `30` | Attempts per window |
| `COMPANY_LEGAL_NAME` / `COMPANY_REG_NUMBER` / `COMPANY_ADDRESS` | placeholders | Registered entity on the legal pages |
| `TRUST_PROXY` | unset | Non-Cloudflare proxies only. On Cloudflare, `CF-Connecting-IP` is used automatically |
| `GOYHUB_DB` | `data/goyhub.db` | SQLite path (Node only) |

## Legal pages

`/terms` and `/privacy` are generated from an ordered section list, so the table of
contents can never drift out of sync with the anchors. The Privacy Policy is written
to match what the code actually does — the cookies it names, the events it logs, and
the deletion behaviour it describes are all real.

> The legal text is a solid template, **not a substitute for a lawyer's review**.
> Arbitration clauses vary in enforceability against consumers, and GDPR applies to
> EU/UK users regardless of where the company is registered.

## Layout

```
functions/[[path]].js   Cloudflare Pages entry (default; wrangler.toml)
worker/index.js         Cloudflare Workers entry (wrangler.workers.toml)
server.js               Node entry
src/app.js              Hono app shared by all three
src/db/                 schema + node:sqlite and D1 adapters
src/views/              template functions
src/routes/             main, auth, forum, admin
public/                 static assets (served from the edge)
artifacts/              installer — deliberately outside public/
```

## Regenerating build artifacts

`npm run build` regenerates two files the Workers runtime needs, since it has no
filesystem. `npm test` asserts they are in sync with their sources.

- `src/db/schema-sql.js` from `src/db/schema.sql`
- `src/installer-data.js` from `artifacts/GoyHub-Setup-1.0.0.zip`
