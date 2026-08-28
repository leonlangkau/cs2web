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
  audited, rate-limited route — staff/admin accounts are exempt from the
  download rate limit entirely
- The real file location is set once via the `DOWNLOAD_URL` secret and fetched
  server-side — it's never sent to the browser (no client-side link, no
  redirect), only the login-gated `/download/file` route is. There's no
  fallback: unset or unreachable, the route fails clearly instead of quietly
  serving a placeholder
- Landing page stays fully readable with JavaScript disabled

### Accounts
- Sign up / log in / log out; passwords hashed with **PBKDF2-HMAC-SHA256** (Web Crypto)
- Sessions stored in D1 — only a hash of the token is persisted
- **IP logging**: signup, login, failed login, blocked login, logout, download,
  CAPTCHA failure, terms acceptance and every admin action are recorded with IP,
  user agent and timestamp

### Accounts & tiers
- Access tiers `user < paid < developer < trial_admin < admin`; the forum and
  download are Paid+ benefits, staff tiers unlock the admin panel
- `/profile`: tier + loader license, change password/email, per-session revoke,
  sign-out-everywhere, self-serve account deletion
- `/buy`: automated **crypto-only** checkout via a self-hosted **BTCPay
  Server** — pick a plan, pay the invoice in Bitcoin, and the account becomes
  Paid automatically once the payment confirms on-chain (honest "coming soon"
  until configured). What is on sale is managed in **Admin → Shop** — a product
  per membership length (1/7/30/90/365 days, lifetime, or any custom number),
  with `STORE_PLANS` / `PAID_PRICE_AMOUNT` as config fallbacks while that table
  is empty. Setup: [BTCPAY-SETUP.md](BTCPAY-SETUP.md)
- **Fulfilment does not hang on the webhook**: the same verified credit path also
  runs when the buyer returns from checkout, when they next open `/buy` or
  `/profile` with an unfinished payment, and in a bounded sweep when staff open
  Admin → Payments. Every path re-fetches the invoice from BTCPay and re-checks
  status, amount, currency and order before granting; crediting is claimed
  atomically, so all of them racing still grant exactly once
- **Admin → Shop**: add, edit, reorder, hide and delete products (full admin).
  Editing a price only affects future sales — every order snapshots what it was
  sold at
- **Admin → Payments**: the order queue, with re-check (staff) and manual credit
  (full admin), both audited
- Loader API: `POST /api/loader/auth` (username+password → tier + signed
  license) and `POST /api/loader/verify` (server-side check, live tier)

### Forum
- Categories → threads → replies, with views, pinning, locking and pagination
- Search, member profiles (`/u/name`), live shoutbox, post editing (30-minute
  author window, staff anytime, edits marked), member reports
- Deleting a user **preserves their threads and replies**, reattributed to a
  reserved `[deleted]` account

### Admin backend (`/admin`, hidden as 404 for non-staff)
- Dashboard (+ site-wide announcement banner), user management (ban/unban,
  tier changes, delete), filterable IP log viewer with IP bans, report queue,
  forum moderation
- Admin accounts' IPs are hidden from other staff in the panel

### Flood protection
- Global per-IP burst cap on dynamic routes, temporary auto IP bans for repeat
  offenders, and a site-wide signup surge breaker — on top of Cloudflare's own
  DDoS protection

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
| `DOWNLOAD_URL` | unset | Real installer location — **required** for downloads to work, **no fallback**. Fetched server-side by `/download/file` (behind the Paid-tier login gate) and streamed straight through — the URL itself is never sent to the browser. Set as a **Secret**, not a plain var. Unset or unreachable: the route returns a clean "unavailable" response instead of substituting a different file |
| `CAPTCHA_SECRET` | insecure dev value | **Required** — signs CAPTCHA challenges |
| `CAPTCHA_DIFFICULTY` | `16` | Proof-of-work leading zero bits (8–24) |
| `PBKDF2_ITERATIONS` | `100000` | Hash cost; watch the free 10ms CPU limit |
| `RATE_LIMIT_*` | see wrangler.toml | login / signup / post / download / shout / report / burst / flood |
| `AUTO_IP_BAN_MINUTES` | `60` | How long automatic flood bans last |
| `SIGNUP_SURGE_LIMIT` | `100` | Site-wide signups per 10 min before registration pauses |
| `BTCPAY_URL` / `BTCPAY_STORE_ID` / `BTCPAY_API_KEY`* / `BTCPAY_WEBHOOK_SECRET`* | unset | Self-hosted BTCPay Server checkout. All set → `/upgrade` shows a one-click crypto pay button and grants Paid automatically on a confirmed, signature-verified webhook. `*` = secret. See [BTCPAY-SETUP.md](BTCPAY-SETUP.md) |
| `PAID_PRICE_AMOUNT` / `PAID_PRICE_CURRENCY` / `PAID_PERIOD_DAYS` | unset / `USD` / lifetime | Membership price, currency and length (days; empty = lifetime) for BTCPay invoices |
| `STORE_PLANS` | unset | Fallback catalogue used only while **Admin → Shop** has no products — `"id:Name:amount:days,…"`, days `0` = lifetime. Prices are always read server-side; the form only names a slug |
| `ETH_ADDRESS`* / `SOL_ADDRESS`* | unset | Direct-to-wallet crypto: your own receiving addresses. Set either and `/buy` gains a coin picker (ETH + USDT-ERC20, SOL + USDT-SPL); the site watches the chain and grants Paid once a payment confirms. No processor, no server, no private key anywhere. `*` = secret. See [CRYPTO-SETUP.md](CRYPTO-SETUP.md) |
| `CRYPTO_SCAN_SECRET`* | unset | Lets an external cron call `GET /api/crypto/scan?key=…` so payments confirm while nobody is on the site. Unset closes the endpoint entirely |
| `CRYPTO_ETH_CONFIRMATIONS` / `CRYPTO_UNDERPAY_TOLERANCE_PCT` / `CRYPTO_PAY_WINDOW_MINUTES` / `CRYPTO_MATCH_HOURS` | `12` / `1` / `60` / `48` | Confirmations before money counts; how far under the quote still counts as paid; how long a quote is honoured; how long a late payment is still matched to its order |
| `ETHERSCAN_API_KEY`* / `SOLANA_RPC_URL`* / `COINGECKO_API_KEY`* | unset (keyless defaults) | Optional higher-limit chain and price providers. All read-only |
| `CRYPTO_PAY_URL` / `CRYPTO_PAY_ADDRESSES` / `PAID_PRICE` | unset | Fallback checkout when BTCPay isn't configured (hosted link / manual addresses / price string) |
| `EMAIL_PROVIDER` + `EMAIL_API_KEY` + `EMAIL_FROM` | unset (disabled) | Outbound email: `cloudflare` (Email Service SMTPS relay) / `resend` / `sendgrid` / `mailchannels` |
| `TURNSTILE_SITE_KEY` / `TURNSTILE_SECRET_KEY` | unset | Optional Cloudflare Turnstile on signup |
| `LICENSE_SECRET` | falls back to `CAPTCHA_SECRET` | Signs loader license tokens |
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
- `functions/_lib/installer-data.js` from `artifacts/GoyHub-Setup-1.0.0.exe`
