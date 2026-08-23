# Deploying GoyHub to Cloudflare

Two supported paths. **Pages with Git integration** is what this repo is configured
for by default — push to `main` and Cloudflare rebuilds automatically.

| | Pages (default) | Workers |
| --- | --- | --- |
| Config file | `wrangler.toml` | `wrangler.workers.toml` |
| Entry point | `functions/[[path]].js` | `worker/index.js` |
| Deploy | `git push` (or `npm run pages:deploy`) | `npm run cf:deploy` |
| Local dev | `npm run pages:dev` | `npm run cf:dev` |

Both mount the identical app, so behaviour matches. Pages Functions *is* the Workers
runtime — Cloudflare merged the two products; the difference is packaging, not capability.

---

# Path A — Pages with Git integration

## 1. Create the database

```bash
npm install
npx wrangler login
npx wrangler d1 create goyhub
```

It prints a `database_id`. Paste it into **`wrangler.toml`** and commit:

```toml
[[d1_databases]]
binding = "DB"
database_name = "goyhub"
database_id = "the-id-it-printed"
```

(The database ID is an identifier, not a secret — it is safe to commit.)

Create the tables:

```bash
npm run cf:db:remote
```

## 2. Configure the Pages project — this is the step that was failing

In the Cloudflare dashboard: **Workers & Pages → goyhub → Settings → Build**.

| Setting | Value |
| --- | --- |
| Build command | `npm run build` |
| Build output directory | `public` |
| Root directory | `/` |

**The build command is not optional.** With none set, Pages logs
`No build command specified. Skipping build step.` and never runs `npm install`,
so bundling the Functions fails with `Could not resolve "hono"`.

## 3. Add your secrets

**Settings → Variables and Secrets**, added as **Secret** (not plaintext):

| Name | Value |
| --- | --- |
| `CAPTCHA_SECRET` | a long random string |
| `ADMIN_PASSWORD` | password for the seeded admin account |
| `ADMIN_USERNAME` | optional, defaults to `admin` |

Generate a good CAPTCHA secret:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

If `CAPTCHA_SECRET` is unset, challenges stop validating whenever an isolate is
recycled and sign-ups fail intermittently.

## 4. Fill in your company details

Edit the `[vars]` block in `wrangler.toml`. Until `COMPANY_LEGAL_NAME`,
`COMPANY_REG_NUMBER` and `COMPANY_ADDRESS` hold real values, both legal pages show a
visible "Setup required" banner.

## 5. Deploy

```bash
git push
```

Pages builds and deploys on every push to `main`. You can also deploy from your
machine with `npm run pages:deploy`.

Then log in at `/auth/login` with the admin credentials from step 3 and change the
password.

---

# Path B — Workers

```bash
# paste your database_id into wrangler.workers.toml first
npx wrangler secret put CAPTCHA_SECRET -c wrangler.workers.toml
npx wrangler secret put ADMIN_PASSWORD -c wrangler.workers.toml
npm run build && npm run cf:deploy
```

Workers additionally gives you the hourly cron trigger for housekeeping (expiring
sessions, rate-limit windows and used CAPTCHA nonces) already wired in
`wrangler.workers.toml`. On Pages, add an equivalent Cron Trigger in the dashboard if
you want the same cleanup, or let the tables grow — they are small and self-limiting.

---

# Attaching your custom domain

**Your domain must be on Cloudflare first.** If it is not:

1. Cloudflare dashboard → **Add a site** → enter your domain.
2. Cloudflare shows you two nameservers.
3. At your registrar (GoDaddy, Namecheap, Google Domains…), replace the existing
   nameservers with those two.
4. Wait for the zone to read **Active** — usually minutes, up to 24 hours.

Do **not** create an A or CNAME record by hand. Cloudflare makes the record for you,
and a manual one will conflict.

### On Pages

1. **Workers & Pages → goyhub → Custom domains**.
2. **Set up a custom domain**.
3. Enter `goyhub.com` (or `www.goyhub.com`, or any subdomain) → **Continue** → **Activate**.

### On Workers

**Workers & Pages → goyhub → Settings → Domains & Routes → Add → Custom domain**, or
uncomment the routes block in `wrangler.workers.toml` and redeploy:

```toml
[[routes]]
pattern = "goyhub.com"
custom_domain = true
```

### After it is live

- HTTPS is automatic; Cloudflare issues and renews the certificate.
- Turn on **SSL/TLS → Edge Certificates → Always Use HTTPS**.
- IP logging works with no configuration: `CF-Connecting-IP` is set by the Cloudflare
  edge and cannot be spoofed by the client, so the app trusts it directly. Do **not**
  set `TRUST_PROXY` on Cloudflare — that is only for non-Cloudflare proxies.

---

# Shipping a real installer

The placeholder zip is small enough to embed in the bundle. A real installer will not
be — the bundle caps at 1 MB (free) / 10 MB (paid). Use R2:

```bash
npx wrangler r2 bucket create goyhub-installer
npx wrangler r2 object put goyhub-installer/GoyHub-Setup-1.0.0.zip --file=./path/to/installer.zip
```

Bind it as `INSTALLER` (uncomment the block in `wrangler.workers.toml`, or add the
binding in the Pages dashboard). The download route prefers R2 and falls back to the
embedded copy, so nothing else changes. The artifact stays out of `public/`, so every
download still goes through the audited, rate-limited route.

---

# Local development

```bash
npm run dev        # Node + local SQLite — fastest iteration
npm run pages:dev  # real Pages Functions + local D1
npm run cf:dev     # real Worker + local D1
npm test           # 77-check end-to-end suite
```

`pages:dev` and `cf:dev` run the same runtime Cloudflare does, so use one of them to
check anything runtime-specific before deploying.

---

# Troubleshooting

**`Could not resolve "hono"`** — no build command is set on the Pages project, so
dependencies were never installed. See step 2.

**`A Wrangler configuration file was found but it does not appear to be valid… make
sure it contains the pages_build_output_dir property`** — the Pages project is reading
a Workers config. `wrangler.toml` in this repo is the Pages config and does contain
that key; make sure the project's **Root directory** is `/`.

**Sign-ups fail intermittently** — `CAPTCHA_SECRET` is unset, so challenges break
whenever an isolate recycles.

**Logins fail under load** — Workers Free caps CPU at 10ms per request and PBKDF2 is
the heaviest thing the app does. Lower `PBKDF2_ITERATIONS` or move to the paid plan.

# Operations

| Task | Command |
| --- | --- |
| Live logs | `npx wrangler pages deployment tail` (Pages) / `npm run cf:tail` (Workers) |
| Query the database | `npx wrangler d1 execute goyhub --remote --command "SELECT COUNT(*) FROM users"` |
| Re-apply schema | `npm run cf:db:remote` |
| Rollback | Dashboard → Deployments → **Rollback** on a previous build |

# Costs

The free plan covers 100,000 requests/day, and D1 gives 5 GB storage with 5 million row
reads/day — comfortably enough to launch on.
