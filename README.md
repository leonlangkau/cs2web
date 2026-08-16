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
- Download button serving the installer from `public/downloads/` with SHA-256 shown on page
- Live site stats (users, downloads, threads, posts)

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

### Security hardening
- CSRF protection (double-submit token) on every state-changing request
- Rate limits: login, signup, posting and downloads
- Login timing-equalized against user enumeration; reserved usernames
- Strict security headers (CSP `default-src 'self'`, no frames, nosniff, referrer policy)
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

Drop your real installer at `public/downloads/GoyHub-Setup-1.0.0.zip` (or update the
filename in `src/routes/main.js`). The SHA-256 checksum shown on the site is computed
automatically at startup.
