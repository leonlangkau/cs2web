# GoyHub — CS2 Companion Website

Full website for the GoyHub CS2 companion app: animated landing page with download,
community forum, account system, and a secured admin backend with IP audit logs.

## Stack

- **Node.js 22+** (uses the built-in `node:sqlite` — no native modules)
- **Express 5** + **EJS** server-rendered views
- **SQLite** database (created automatically at `data/goyhub.db`)
- Vanilla CSS/JS frontend — no build step, no CDNs, CSP-friendly

## Quick start

```bash
npm install
npm start          # http://localhost:3000
```

On first run a default **admin** account is created and its generated password is
printed to the console **once**. To control it instead:

```bash
ADMIN_USERNAME=admin ADMIN_PASSWORD='choose-a-strong-one' npm start
```

## Features

### Website
- Animated hero (particle canvas, gradient headline, floating HUD cards, scroll reveals)
- Download button serving the installer via an audited, rate-limited route (SHA-256 shown on page);
  the artifact lives in `artifacts/`, outside the static web root, so the audit log cannot be bypassed
- Live site stats (users, downloads, threads, posts); the landing page stays fully readable without JavaScript

### Accounts
- Sign up / log in / log out with scrypt-hashed passwords
- Sessions stored server-side (only a hash of the token is persisted), HttpOnly + SameSite cookies
- **IP logging**: signups, logins (success/failed/blocked), logouts and downloads are recorded
  with IP address + user agent to the `ip_logs` audit table

### Forum
- Categories → threads → replies, with views, pinned and locked threads
- Pagination, recent-activity sidebar, staff badges

### Admin backend (`/admin`, admins only — hidden as 404 for everyone else)
- Dashboard: users, active sessions, downloads, signups & failed logins (24h)
- User management: search, ban/unban (kills all sessions), promote/demote, delete
- IP log viewer with event filter and IP/username search
- Forum management: create/delete categories, pin/lock/delete threads, delete posts

### Bot protection (self-hosted CAPTCHA)
Sign-up is gated by a proof-of-work challenge in `src/captcha.js` — no third-party service.
It attacks the *economics* of bulk automation rather than trying to out-puzzle a model:

- Server mints an HMAC-signed challenge bound to the client IP, single-use, 10-minute TTL
- Browser must find a nonce whose SHA-256 has N leading zero bits (`CAPTCHA_DIFFICULTY`, default 16
  ≈ 1s of work) using a bundled SHA-256, solved in yielded chunks so the page never freezes
- Plus a honeypot field, a minimum elapsed time on the **server** clock, and the per-IP rate limits
- Failures are recorded as `captcha_failed` in the audit log

> This raises the cost of mass automated sign-ups and filters commodity bots. It is **not** an
> identity proof — an attacker driving a real browser can still pass it. Treat it as one layer.

### Terms acceptance gate
First visit shows a blocking dialog requiring the visitor to accept the Terms and Privacy Policy.
Acceptance sets a versioned cookie (`TERMS_VERSION` in `src/middleware.js`) and writes a
`terms_accepted` audit row with IP, timestamp and version. The `/terms` and `/privacy` pages are
exempt so the documents stay readable before accepting. Bump `TERMS_VERSION` to re-prompt everyone.

### Security hardening
- CSRF protection on every state-changing request: double-submit token, additionally
  bound server-side to the session for logged-in users
- Rate limits: login, signup, posting and downloads (with periodic pruning)
- Async scrypt on the request path; login timing-equalized against user enumeration; reserved usernames
- Strict security headers (CSP `default-src 'self'`, no frames, nosniff, referrer policy)
- Error responses preserve status codes and never leak stack traces
- Banned users are locked out and force-logged-out everywhere

## Configuration (env vars)

| Variable         | Default            | Purpose                                        |
| ---------------- | ------------------ | ---------------------------------------------- |
| `PORT`           | `3000`             | HTTP port                                      |
| `HOST`           | `0.0.0.0`          | Bind address                                   |
| `GOYHUB_DB`      | `data/goyhub.db`   | SQLite file path                               |
| `ADMIN_USERNAME` | `admin`            | Seeded admin username (first run only)         |
| `ADMIN_PASSWORD` | random, printed    | Seeded admin password (first run only)         |
| `TRUST_PROXY`    | unset              | Set to `true` (or a hop count) behind a proxy so client IPs come from `X-Forwarded-For` |
| `CAPTCHA_SECRET` | random per boot    | HMAC key for CAPTCHA challenges — **set this in production** or restarts invalidate them |
| `CAPTCHA_DIFFICULTY` | `16`           | Proof-of-work leading zero bits (8–24). Each +1 doubles the client's work |
| `COMPANY_LEGAL_NAME` / `COMPANY_REG_NUMBER` / `COMPANY_ADDRESS` | placeholders | Registered entity shown on the legal pages |

> Deploy behind HTTPS. Session cookies are marked `Secure` automatically when the
> request is secure (set `TRUST_PROXY` so Express sees the proxy's `X-Forwarded-Proto`).

## Tests

```bash
npm test
```

Boots the app on a throwaway database and exercises the full surface end-to-end:
signup/login/logout, IP audit rows, CSRF rejection, forum posting, locked threads,
admin gating, ban flow, download logging and rate limiting.

## Replacing the download

Drop your real installer at `artifacts/GoyHub-Setup-1.0.0.zip` (or update the filename
in `src/routes/main.js`). It is deliberately stored outside `public/` so every download
goes through the logged, rate-limited `/download/file` route. The SHA-256 checksum shown
on the site is computed automatically at startup.
