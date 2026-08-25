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

The placeholder zip is embedded in the Function bundle. A real installer will be
too big (the bundle caps at ~1 MB free / 10 MB paid), so use R2:

```bash
npx wrangler r2 bucket create goyhub-installer
npx wrangler r2 object put goyhub-installer/GoyHub-Setup-1.0.0.zip --file=./installer.zip
```

Uncomment the `[[r2_buckets]]` block in `wrangler.toml` (or add the binding in
the dashboard as `INSTALLER`). The download route prefers R2 and falls back to
the embedded copy. The artifact stays out of `public/`, so every download goes
through the audited, rate-limited route.

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
