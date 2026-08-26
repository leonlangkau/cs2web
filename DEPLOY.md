# Deploying GoyHub to Cloudflare Pages

GoyHub is a **Cloudflare Pages project**, structured exactly like a static site:
`public/` is the build output directory, and one catch-all **Pages Function**
(`functions/[[path]].js`) handles the dynamic routes, backed by **D1**.

It deploys with **Cloudflare's default settings** — no build command, no
dependencies to install. The Function is plain ES modules under
`functions/_lib/`, so Pages uploads them as-is.

---

## 1. Create the database

```bash
npx wrangler login
npx wrangler d1 create goyhub
```

It prints a `database_id`. Paste it into `wrangler.toml` and commit
(the ID is an identifier, not a secret):

```toml
[[d1_databases]]
binding = "DB"
database_name = "goyhub"
database_id = "the-id-it-printed"
```

Create the tables:

```bash
npx wrangler d1 execute goyhub --remote --file=schema.sql
```

## 2. Connect the repo to Pages

**Workers & Pages → Create → Pages → Connect to Git**, pick this repo.

Leave the build settings at their defaults:

| Setting | Value |
| --- | --- |
| Framework preset | None |
| Build command | *(blank)* |
| Build output directory | `public` |
| Root directory | `/` |

No build command is needed — the Functions are committed ready to run.

## 3. Add secrets and bindings

**Settings → Variables and Secrets**, added as **Secret**:

| Name | Value |
| --- | --- |
| `CAPTCHA_SECRET` | a long random string |
| `ADMIN_PASSWORD` | password for the seeded admin account |
| `ADMIN_USERNAME` | optional, defaults to `admin` |
| `DOWNLOAD_URL` | required for the download to work (no fallback) — where the real installer lives (see "Shipping a real installer" below) |

Generate a CAPTCHA secret:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**Settings → Bindings → Add → D1 database**: variable name `DB`, the `goyhub`
database. (Committing `database_id` in `wrangler.toml` also works; the dashboard
binding is the belt-and-braces option.)

## 4. Fill in your company details

Edit `[vars]` in `wrangler.toml`. Until `COMPANY_LEGAL_NAME`,
`COMPANY_REG_NUMBER` and `COMPANY_ADDRESS` are real, both legal pages show a
"Setup required" banner.

## 5. Deploy

Push to the branch Pages is watching. Every push builds and deploys. Or from
your machine:

```bash
npm run deploy
```

Then log in at `/auth/login` with the admin credentials from step 3 and change
the password.

---

## Attaching your custom domain

**Your domain must be on Cloudflare first.** If it is not: dashboard → **Add a
site** → enter the domain → Cloudflare gives you two nameservers → set those at
your registrar → wait for the zone to read **Active**.

Then: **Workers & Pages → goyhub → Custom domains → Set up a custom domain** →
enter `goyhub.st` (or `www.`, or any subdomain) → **Activate**. Cloudflare
creates the DNS record and issues the TLS certificate automatically. Do **not**
add an A/CNAME by hand.

After it is live, turn on **SSL/TLS → Edge Certificates → Always Use HTTPS**.
IP logging works with no configuration: `CF-Connecting-IP` is set by Cloudflare
and can't be spoofed, so the app trusts it directly. Don't set `TRUST_PROXY` on
Cloudflare.

---

## Local development

```bash
npm run dev     # wrangler pages dev — the real Pages runtime + local D1
npm test        # node --test — drives the same app over an in-memory database
```

For `npm run dev`, copy `.dev.vars.example` to `.dev.vars` and fill in
`CAPTCHA_SECRET` and `ADMIN_PASSWORD`. Local D1 is created on first run; apply
the schema with `npm run db:local`.

---

## Shipping a real installer

The download route serves whatever `DOWNLOAD_URL` points at — **required**,
with **no fallback**. Without it (or if it's unreachable), `/download/file`
returns a clean "unavailable" response rather than silently serving the
placeholder zip embedded in the Function bundle.

Host the installer anywhere reachable over HTTPS — your own server, a CDN, a
GitHub release asset, S3/B2, R2, etc. — then set:

```bash
npx wrangler pages secret put DOWNLOAD_URL
# paste the file's URL when prompted
```

`/download/file` (still behind the sign-in + Paid-tier gate and the download
rate limit) fetches that URL **server-side** on each request and streams the
response straight back to the browser. The URL itself is never sent to the
client — not in the page HTML, not in a redirect's `Location` header, not in
any script — the browser only ever talks to the same-site `/download/file`.
That's the obfuscation: the value never leaves the server, which beats any
client-side encoding of the link (Base64, split strings, etc. are all
trivially readable from a browser's dev tools; a value the browser never
receives can't be read from it at all). And because there's no fallback, a
broken or misconfigured `DOWNLOAD_URL` fails loudly (a 503 on `/download/file`)
instead of quietly handing members a stale placeholder.

If hosting on Cloudflare R2, make the object itself the URL — either a public
R2.dev/custom domain, or a signed/presigned URL — and set that as
`DOWNLOAD_URL`; the route doesn't bind R2 directly, it only ever fetches a URL.

Always set it as a **Secret**, never as a plain `[vars]` entry in
`wrangler.toml` — that file is committed, and a plain var would put the
"hidden" URL in cleartext in git history and in the dashboard's variable
list. A Secret is encrypted at rest and, once saved, is no longer readable
from the dashboard either.

Keep the version metadata honest: `functions/_lib/installer-data.js` (built
from `artifacts/GoyHub-Setup-1.0.0.exe` — see below) is what the site shows
as the download's name, size and SHA-256 checksum — its filename's extension
also drives the `Content-Disposition` name and `scripts/build-installer.cjs`'s
`NAME` constant, so it must match whatever `DOWNLOAD_URL` actually serves.
When `DOWNLOAD_URL` points at a newer build, replace that artifact (renaming
it too, if the file type changes) and run `npm run build`, so the checksum
and filename shown on `/download` still match the file actually served.

---

The artifact stays out of `public/` regardless, so every download goes
through the same audited, rate-limited, login-gated route.

---

## How it's laid out

```
public/                  static site (Pages build output dir)
├─ css/ · js/            served straight from the edge
functions/
├─ [[path]].js           the one catch-all Pages Function
└─ _lib/                 the app: router, middleware, routes, views, db adapter
schema.sql               D1 schema (also generated into _lib/schema-sql.js)
scripts/                 build-schema.cjs, build-installer.cjs (npm run build)
tests/                   node --test smoke suite over the same app code
wrangler.toml            Pages + D1 config
```

`functions/_lib/schema-sql.js` and `functions/_lib/installer-data.js` are
generated (the runtime has no filesystem); `npm run build` regenerates them and
`npm test` fails if they drift from `schema.sql` / the installer.

---

## Troubleshooting a 404

If the deployed site 404s on every path, it's almost always one of:

1. **No successful deployment.** Check **Workers & Pages → goyhub →
   Deployments**. A red/failed build means nothing is being served. Open the
   failed build's log — earlier failures here were `Could not resolve "hono"`,
   which this structure removes (there are no dependencies to resolve).
2. **D1 not bound.** Without the `DB` binding the Function returns 503 with a
   setup message, not your pages. Bind it (step 3) and redeploy.
3. **Schema not applied.** The Function seeds the schema on first request, but
   if that fails (wrong database, permissions) routes error. Re-run
   `npx wrangler d1 execute goyhub --remote --file=schema.sql`.
4. **Custom domain not active.** The `*.pages.dev` URL works but the domain
   404s → the domain isn't attached to this Pages project yet (see above).

Other issues:

- **Sign-ups fail intermittently** → `CAPTCHA_SECRET` is unset, so challenges
  break when an isolate recycles.
- **Logins fail under load** → the free plan caps CPU at 10ms/request and PBKDF2
  is the heaviest operation. Lower `PBKDF2_ITERATIONS` or move to the paid plan.

## Operations

| Task | Command |
| --- | --- |
| Live logs | `npm run tail` |
| Query the database | `npx wrangler d1 execute goyhub --remote --command "SELECT COUNT(*) FROM users"` |
| Re-apply schema | `npm run db:remote` |
| Rollback | Dashboard → Deployments → **Rollback** |
