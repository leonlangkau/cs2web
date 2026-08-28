# GoyHub — CS2 Companion Website

Full website for the GoyHub CS2 companion app: animated landing page with gated
download, community forum, a help centre and support desk with live chat, a
public status page,
account system with IP audit logging, a self-hosted proof-of-work CAPTCHA, and a
secured admin backend.

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
tests/                   node --test suites (drive the same app code)
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
- **Admin → Payments**: the order queue, with re-check and manual credit both
  staff-level and audited
- Loader API: `POST /api/loader/auth` (username+password → tier + signed
  license) and `POST /api/loader/verify` (server-side check, live tier)

### Help centre & support desk
- **`/help` — the "try this first" layer.** Admin-editable sections and articles,
  written as runbooks (the fix first, the explanation after), with search over
  titles, curated keywords and bodies. Every article ends in *"Did this solve
  it?"*, and a **No** goes straight into a ticket pre-filled with which article
  failed — so the queue tells you which pages to rewrite
- **Tickets are open to everyone.** Any tier including Free, *and* visitors with
  no account at all. Guests pass the same proof-of-work CAPTCHA and honeypot as
  sign-up and get back a private ticket link; only a hash of its key is stored,
  like sessions and password-reset tokens. The link is remembered in an HttpOnly
  cookie so a returning guest never needs it again, and can be re-issued by email
- **Every ticket is a live chat.** 3-second polling while the tab is visible,
  paused when hidden, catch-up on focus — the same pattern as the shoutbox, no
  extra infrastructure. With JavaScript off it is an ordinary form and the whole
  flow still works
- **Attachments** — screenshots and log files, size-capped and stored in D1 (no R2
  binding needed). The stored content type is decided from the file's magic bytes,
  never the browser's header; the allowlist contains nothing a browser executes
  (no SVG, no HTML), and anything that is not a verified raster image is served
  as a download with `Content-Disposition: attachment` and its own locked-down CSP
- **Admin → Support** — the queue with filters, search and saved views; a ticket
  workspace holding the live chat, **internal notes** (a separate table, so no
  query bug can leak one to a customer), **staff notes on the member** that follow
  the account across tickets, assignment, tags, priority, status, merge, and
  spam quarantine that hides without deleting
- **Canned replies** that send the message *and* move the ticket — status,
  priority and tags in one click
- **SLA timers** per priority with a breach view. There is no cron on Pages, so
  the clock is reconciled by a bounded, idempotent sweep whenever staff open the
  queue (or via `GET /api/support/sweep?key=…` for an external cron)
- **CSAT** — a 1–5 rating after a ticket is solved, settable once, by the
  requester only
- **Gemini Flash assist (optional)** — a one-click thread summary, 2–3 reply
  drafts a human edits and sends, "try this first" re-ranking on the contact
  form, and automatic topic/priority/language/spam triage. Ticket text is fenced
  as untrusted data and passed through a credential redactor before it leaves
  the site; every value the model returns is re-validated against our own
  allowlists. **The AI never sends anything to a customer** — a human presses
  send. Unset `GEMINI_API_KEY` and everything above simply isn't there; nothing
  else changes
- **Notifications** — the requester is emailed when a ticket opens and when staff
  reply (reusing the existing provider, silently off without one), and a
  Discord-compatible webhook can ping your staff channel on new tickets,
  escalations and SLA breaches

### Status page
- **`/status`** — component health, live incidents with their update trail,
  scheduled maintenance and 90 days of history, open to everyone including
  logged-out and banned visitors (the people who most need to know whether
  sign-in is broken are the ones who cannot sign in)
- **The headline is derived, never stored.** The worst visible component decides
  the banner, the beacon colour and the pulse — so "All systems operational"
  cannot sit above a component marked *Major outage*
- **Animation that means something**: a beacon pulses only while something is
  actually wrong, so a glance at a pinned tab is enough; the banner gets a slow
  tint sweep during an incident; and a row flashes once when a live update
  changes it, so nothing is swapped in silently. All of it collapses under
  `prefers-reduced-motion`, and the page is correct before any JavaScript runs
- **Admin → Status** — set any component's state in two clicks, open an incident
  or schedule maintenance (which moves its components with it), post updates,
  and an *all clear* button. Resolving hands components back — but only the ones
  no other open incident still claims
- **It feeds the support funnel**: while anything is degraded, the help centre,
  the support inbox and the new-ticket form all carry a "we already know about
  this" strip naming the incident. The moment before someone describes a problem
  we already know about is the only moment that saves anyone any work
- **`/status.json`** — the same data with CORS open, for an uptime monitor, the
  desktop app, or anything else. The page itself polls it every 30s
- Where a support webhook is configured, opening and resolving an incident pings
  the staff channel too

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

### Support ticketing internals

Three things carry the security of the support desk, and they are worth knowing
before changing anything in `functions/_lib/support.js`:

1. **One access decision.** `checkAccess(c, ticket, key)` is the only
   authorisation answer in the feature. Staff pass by session; a member owner
   passes only on a `user_id` match; the guest-key path is consulted *only* when
   the ticket has a `key_hash`. A member ticket is therefore unreachable with a
   key and a guest ticket unreachable by merely being signed in — the two paths
   never cross.
2. **Staff-private text lives in different tables.** `ticket_messages` holds only
   what the requester may read. Internal notes are in `ticket_notes` and staff
   history in `ticket_events`, and neither name appears anywhere in
   `routes-support.js`. "Don't leak the note" is a property of the schema, not a
   rule someone has to remember in a `WHERE` clause.
3. **The AI is a suggestion layer with hard edges.** It writes nothing a human
   cannot undo in one click, triage runs once per ticket (`WHERE
   ai_classified_at IS NULL`), deflection can only reorder a shortlist the
   database produced — so it cannot invent an article — and drafts are never
   stored or sent.

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
| `RATE_LIMIT_*` | see wrangler.toml | login / signup / post / download / shout / report / burst / flood, plus the support desk's own buckets (`TICKET`, `TICKET_REPLY`, `TICKET_POLL`, `ATTACH`, `ATTACH_READ`, `HELP_VOTE`, `HELP_VIEW`, `AI_ASSIST`, `AI_DEFLECT`, `AI_GLOBAL`) |
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
| `SITE_URL` | unset | Absolute base URL. Needed for clickable links in support emails and Discord alerts — without it they fall back to bare paths |
| `GEMINI_API_KEY`* / `GEMINI_MODEL` | unset / `gemini-2.5-flash` | Google AI Studio key for the support desk's AI assist (the free tier is enough). Unset = no AI anywhere, and every AI-backed feature degrades to its non-AI path. A rejected model name automatically retries once on `gemini-2.0-flash` |
| `SUPPORT_AI_ASSIST` / `SUPPORT_AI_DEFLECT` / `SUPPORT_AI_CLASSIFY` | `1` | Turn the three AI uses on/off individually: staff summary + drafts, "try this first" re-ranking, automatic triage |
| `SUPPORT_WEBHOOK_URL`* | unset | Discord-compatible webhook for new tickets, escalations and SLA breaches. Must be `https` |
| `SUPPORT_SWEEP_SECRET`* | unset | Lets an external cron call `GET /api/support/sweep?key=…` so SLA breaches are stamped and stale tickets closed while nobody is in the panel. Unset closes the endpoint |
| `SUPPORT_GUEST_TICKETS` | `1` | `0` requires an account (any tier, Free included) to open a ticket |
| `SUPPORT_SLA_*_HOURS` | `72`/`24`/`8`/`2` | First-response target per priority (low/normal/high/urgent) |
| `SUPPORT_ATTACH_MAX_KB` / `SUPPORT_ATTACH_MAX_COUNT` | `512` / `4` | Per file (max 600 — D1 caps a value at 1 MB and base64 inflates by a third) and per message; count `0` disables attachments |
| `SUPPORT_ATTACH_TICKET_MAX_KB` | `8192` | Total attachment bytes one conversation may hold. The per-message cap is not a ceiling on its own — the reply limit is keyed per ticket — so this is what actually bounds storage |
| `SUPPORT_ATTACH_RETAIN_DAYS` / `SUPPORT_AUTOCLOSE_DAYS` | `180` / `7` | When a closed ticket's attachment bytes are dropped (the record that a file existed stays), and when a solved ticket nobody returned to is closed. `0` disables either |
| `SUPPORT_EMAIL_NOTIFY` | `1` | Email the requester when a ticket opens and when staff reply (needs `EMAIL_*`) |
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
