# Deploying GoyHub to Cloudflare

GoyHub runs as a **Cloudflare Worker with Static Assets**, backed by **D1** for the
database. Cloudflare has merged Pages into Workers and now steers new projects here —
a Pages project that runs server code was always Pages *Functions*, which is the same
Workers runtime. Static files in `public/` are served from the edge exactly as Pages
served them; the dynamic routes run in the Worker.

> If you specifically want a Pages project instead, `functions/[[path]].js` is included
> and mounts the identical app. Everything below applies except that you deploy with
> `wrangler pages deploy` and bind D1 in the Pages project settings.

---

## 1. One-time setup

```bash
npm install
npx wrangler login          # opens a browser to authorise your Cloudflare account
```

## 2. Create the database

```bash
npx wrangler d1 create goyhub
```

It prints a `database_id`. Paste it into `wrangler.toml`:

```toml
[[d1_databases]]
binding = "DB"
database_name = "goyhub"
database_id = "the-id-it-printed"
```

Then create the tables:

```bash
npm run cf:db:remote        # applies src/db/schema.sql to the live D1 database
```

## 3. Set your secrets

Never put these in `wrangler.toml` — it is committed to git.

```bash
npx wrangler secret put CAPTCHA_SECRET     # any long random string
npx wrangler secret put ADMIN_PASSWORD     # password for the seeded admin account
npx wrangler secret put ADMIN_USERNAME     # optional, defaults to "admin"
```

Generate a good CAPTCHA secret with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

If `CAPTCHA_SECRET` is unset, challenges stop validating whenever an isolate is
recycled, and sign-ups start failing intermittently.

## 4. Fill in your company details

Edit the `[vars]` block in `wrangler.toml`. Until `COMPANY_LEGAL_NAME`,
`COMPANY_REG_NUMBER` and `COMPANY_ADDRESS` are real values, both legal pages
display a visible "Setup required" banner.

## 5. Deploy

```bash
npm run build               # regenerates the schema + installer modules
npm run cf:deploy
```

You get a URL like `https://goyhub.<your-subdomain>.workers.dev`. Log in with the
admin credentials from step 3 and change the password.

---

## Attaching your custom domain

**Your domain must be on Cloudflare first.** If it is not:

1. Cloudflare dashboard → **Add a site** → enter your domain.
2. Cloudflare shows you two nameservers.
3. At your registrar (GoDaddy, Namecheap, Google Domains…), replace the existing
   nameservers with those two.
4. Wait for the zone to show **Active** — usually minutes, up to 24 hours.

You do **not** create an A or CNAME record by hand. A Custom Domain makes the DNS
record for you.

### Option A — dashboard (easiest)

1. **Workers & Pages** → **goyhub** → **Settings** → **Domains & Routes**.
2. **Add** → **Custom domain**.
3. Enter `goyhub.com` (or `www.goyhub.com`, or any subdomain).
4. **Add domain**. Cloudflare creates the DNS record and issues the TLS certificate
   automatically — usually live within a minute.

### Option B — `wrangler.toml`

Uncomment and edit the routes block, then redeploy:

```toml
[[routes]]
pattern = "goyhub.com"
custom_domain = true
```

```bash
npm run cf:deploy
```

To serve both apex and `www`, add a second entry:

```toml
[[routes]]
pattern = "goyhub.com"
custom_domain = true

[[routes]]
pattern = "www.goyhub.com"
custom_domain = true
```

### After it is live

- HTTPS is automatic; the certificate is issued and renewed by Cloudflare.
- Turn on **SSL/TLS → Edge Certificates → Always Use HTTPS**.
- IP logging keeps working with no configuration: `CF-Connecting-IP` is set by the
  Cloudflare edge and cannot be spoofed by the client, so the app trusts it directly.
  Do **not** set `TRUST_PROXY` on Cloudflare — it is only for non-Cloudflare proxies.

---

## Shipping a real installer

The placeholder zip is small enough to embed in the Worker bundle. A real installer
will not be — Workers caps the bundle at 1 MB (free) / 10 MB (paid). Use R2:

```bash
npx wrangler r2 bucket create goyhub-installer
npx wrangler r2 object put goyhub-installer/GoyHub-Setup-1.0.0.zip --file=./path/to/installer.zip
```

Uncomment the R2 block in `wrangler.toml` and redeploy. The download route prefers R2
and falls back to the embedded copy, so nothing else changes. The artifact stays out of
`public/`, so every download goes through the audited, rate-limited route.

---

## Local development

```bash
npm run dev        # Node + local SQLite, fastest iteration
npm run cf:dev     # real workerd + local D1, matches production behaviour
npm test           # 77-check end-to-end suite
```

`npm run cf:dev` runs the same runtime Cloudflare does, so use it to check anything
runtime-specific before deploying.

---

## Operations

| Task | Command |
| --- | --- |
| Live logs | `npm run cf:tail` |
| Query the database | `npx wrangler d1 execute goyhub --remote --command "SELECT COUNT(*) FROM users"` |
| Re-apply schema | `npm run cf:db:remote` |
| Rollback | `npx wrangler rollback` |

Housekeeping (expiring sessions, rate-limit windows and used CAPTCHA nonces) runs
hourly via the cron trigger in `wrangler.toml`.

## Costs

The Workers free plan covers 100,000 requests/day and D1 gives 5 GB of storage with
5 million row reads/day — comfortably enough to launch on. The one limit to watch is
**10ms CPU per request on the free plan**: PBKDF2 password hashing is the heaviest
thing the app does. If sign-ups or logins start failing under load, either lower
`PBKDF2_ITERATIONS` or move to the paid plan, which raises the limit substantially.
