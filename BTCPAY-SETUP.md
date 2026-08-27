# Self-hosting BTCPay Server for GoyHub (crypto-only checkout)

This is the complete, copy-pasteable guide to stand up your **own** BTCPay
Server on a small VPS and wire it into the GoyHub `/upgrade` page, so members
pay in Bitcoin and get upgraded to **Paid** automatically — no card processor,
no third party, no manual admin step.

It is written for **Ubuntu 24.04 LTS** on a **2 vCPU / 4 GB RAM** VPS, over
**SSH**.

> **Ubuntu version:** there is no "24.02" — the current LTS is **24.04**
> ("Noble"). Use 24.04 LTS. Everything below works the same on 22.04 LTS if
> that's what your host offers.

---

## 0. What you're building & what you need

```
   Member's browser                 Your VPS (this guide)            Cloudflare Pages (GoyHub)
   ───────────────                  ─────────────────────            ────────────────────────
   /upgrade  ── click ─────────────────────────────────────────────▶  POST /upgrade/checkout
                                    BTCPay Greenfield API  ◀────────── creates invoice
        ◀──── redirect to  https://btcpay.you/i/INVOICE  ────────────
   pays BTC (on-chain / Lightning) ▶  BTCPay confirms on-chain
                                    signed webhook  ─────────────────▶  POST /api/btcpay/webhook
                                                                        verifies + grants Paid
```

**You need:**

- A VPS: **2 vCPU, 4 GB RAM**, and disk per the table in §5 (≈ **40–60 GB**
  with a pruned node). Ubuntu 24.04 LTS, root or sudo SSH access.
- A **domain** you control, with the ability to add DNS records. This guide
  uses `btcpay.goyhub.st` as the BTCPay hostname — substitute your own.
- The GoyHub site already deployed on Cloudflare Pages (see `DEPLOY.md`).
- ~30 minutes of setup, plus **blockchain sync time** (§7 — minutes with
  FastSync, or many hours without).
- A Bitcoin wallet you control to **receive** funds (an xpub / hardware wallet
  is strongly recommended — §10).

**Ports that must be reachable from the internet:** `22` (SSH), `80` and `443`
(BTCPay web + Let's Encrypt). That's it.

---

## Products, and how a payment becomes a membership

Add what you sell in **Admin → Shop** (full admin only). Each product is one
membership length — 1 day, 7 days, 30, 90, 365, lifetime, or any custom number
of days — with a price and an optional blurb. `/buy` shows one card per active
product, cheapest ordering under your control.

Two fallbacks exist for a deployment that would rather keep its catalogue in
config, used only while the products table is empty: `STORE_PLANS`
(`"id:Name:amount:days,…"`, days `0` = lifetime) and the original single
`PAID_PRICE_AMOUNT` / `PAID_PERIOD_DAYS` pair. Adding the first product in the
admin panel quietly takes over from both.

The buyer's form carries only a product **slug**; the price and period are read
server-side, snapshotted onto the order at checkout, and re-verified against the
invoice before anything is granted. Editing or deleting a product never rewrites
an order already placed, and a payment in flight settles at its original price.

**Fulfilment does not depend on the webhook arriving.** The same verified
credit path runs from four places:

| Trigger | Covers |
| --- | --- |
| The signed `InvoiceSettled` webhook | The normal case — credited within seconds |
| Returning to `/upgrade/thanks` after paying | Webhook unconfigured, delayed, or lost |
| Loading `/buy` or `/profile` with an unfinished payment | Buyer wandered off and came back later |
| A small sweep each time staff open **Admin → Payments** | Buyer who paid and never returned |

Every one of those re-fetches the invoice from BTCPay with the store key and
re-checks its status, amount, currency and order id before crediting. Crediting
is claimed atomically, so all four racing at once still grant exactly once — and
a member is never charged-but-not-upgraded because a single delivery went
missing. This also means checkout is usable before the webhook is configured at
all: it just credits when the buyer next loads a page instead of instantly.

Admin → Payments lists every order with its live status, a **Re-check** button
(staff — applies BTCPay's own verdict) and **Credit** (full admin — grants
without a confirmed payment, for money that arrived out of band). Both are
audited.

## 1. Point DNS at the VPS

Create a DNS **A record** for the BTCPay hostname pointing to your VPS's public
IPv4 (and an `AAAA` record if it has IPv6):

| Type | Name             | Value (example)   | Proxy |
| ---- | ---------------- | ----------------- | ----- |
| A    | `btcpay`         | `203.0.113.45`    | **DNS only** |

> **Important if your domain is on Cloudflare:** set this record to
> **DNS only (grey cloud)**, *not* proxied (orange cloud). BTCPay runs its own
> nginx + Let's Encrypt and uses WebSockets/Lightning that the Cloudflare proxy
> can break, and Let's Encrypt's HTTP-01 challenge needs to hit the box
> directly. The **main** GoyHub site stays proxied on Cloudflare as normal —
> only the `btcpay.` subdomain is grey-clouded.

Verify it resolves before continuing:

```bash
dig +short btcpay.goyhub.st        # should print your VPS IP
```

---

## 2. SSH in

From your local machine:

```bash
ssh root@203.0.113.45
# or, if your host gave you a sudo user:
ssh youruser@203.0.113.45
```

If you're using a password, switch to an SSH key as soon as you can (§18).

---

## 3. Update the system

```bash
sudo apt update && sudo apt -y full-upgrade
sudo apt -y install git curl ufw fail2ban
sudo reboot     # if the upgrade pulled a new kernel; reconnect after ~30s
```

---

## 4. Firewall (ufw)

Allow only SSH + HTTP + HTTPS, then enable:

```bash
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw --force enable
sudo ufw status verbose
```

`fail2ban` (installed above) will throttle SSH brute-force attempts out of the
box.

---

## 5. Add swap (do NOT skip on 4 GB)

Bitcoin's initial sync, NBXplorer, Postgres and BTCPay together push past 4 GB
of RAM during sync. Without swap the box will OOM-kill services mid-sync. Add a
**4 GB** swapfile:

```bash
sudo fallocate -l 4G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
# Prefer RAM, use swap only under pressure (better for an SSD):
echo 'vm.swappiness=10' | sudo tee /etc/sysctl.d/99-swappiness.conf
sudo sysctl --system
free -h        # confirm 4.0Gi of swap is present
```

**Disk sizing — pick a pruning level for your VPS** (set in §6 as
`BTCPAYGEN_ADDITIONAL_FRAGMENTS`):

| Fragment                | Keeps            | Bitcoin blocks on disk | Good for a disk of |
| ----------------------- | ---------------- | ---------------------- | ------------------ |
| `opt-save-storage`      | ~1 year          | ~100 GB                | 160 GB+            |
| `opt-save-storage-s`    | ~6 months        | ~50 GB                 | 100 GB             |
| **`opt-save-storage-xs`** | **~3 months**  | **~25 GB**             | **40–60 GB (this guide)** |
| `opt-save-storage-xxs`  | ~2 weeks         | ~5 GB                  | very small / 25 GB |

A **pruned** node is a full-validating node that discards old block data after
verifying it — perfectly fine for receiving payments. Leave ~15–20 GB free on
top of the block store for Postgres, NBXplorer and the OS. This guide uses
`opt-save-storage-xs`.

> **Bandwidth caveat:** even a pruned node must *download and verify* the entire
> chain during the initial sync (hundreds of GB of transfer), it just doesn't
> *keep* it all. If your VPS has a monthly bandwidth cap, budget for that — or
> use **FastSync** (§7) to skip most of it.

---

## 6. Install BTCPay Server

Run as **root** (BTCPay's installer expects it):

```bash
sudo su -

mkdir -p /root/BTCPayServer && cd /root/BTCPayServer
git clone https://github.com/btcpayserver/btcpayserver-docker
cd btcpayserver-docker
```

Set the deployment options. **Edit `BTCPAY_HOST` to your real hostname.**

```bash
export BTCPAY_HOST="btcpay.goyhub.st"
export NBITCOIN_NETWORK="mainnet"
export BTCPAYGEN_CRYPTO1="btc"
export BTCPAYGEN_REVERSEPROXY="nginx"
export BTCPAYGEN_ADDITIONAL_FRAGMENTS="opt-save-storage-xs"
export BTCPAY_ENABLE_SSH=false
# Optional: also run a Lightning node (LND). Leave unset for on-chain only.
# export BTCPAYGEN_LIGHTNING="lnd"
```

What these mean:

- `BTCPAY_HOST` — the domain from §1. The installer gets a Let's Encrypt TLS
  cert for it automatically.
- `NBITCOIN_NETWORK=mainnet` — real Bitcoin. Use `testnet` first if you want to
  rehearse without real money (see §17).
- `BTCPAYGEN_CRYPTO1=btc` — Bitcoin only (this is a crypto-only setup by design).
- `BTCPAYGEN_REVERSEPROXY=nginx` — nginx handles TLS/HTTPS termination.
- `BTCPAYGEN_ADDITIONAL_FRAGMENTS=opt-save-storage-xs` — prune to ~25 GB (§5).
- `BTCPAY_ENABLE_SSH=false` — keep BTCPay out of your host's SSH; you don't need
  in-app SSH and it's one less risk.

Kick off the install (this pulls images and builds the stack — several minutes):

```bash
. ./btcpay-setup.sh -i
```

When it finishes, `docker` is installed, all services are running, and
`https://btcpay.goyhub.st` is live with a valid certificate. Check:

```bash
cd /root/BTCPayServer/btcpayserver-docker
docker ps                 # nbxplorer, bitcoind, postgres, btcpayserver, nginx...
./btcpay-setup.sh --help  # the management commands now on your PATH
```

---

## 7. Let it sync (and how to skip most of it)

Bitcoin must sync before invoices can confirm. Watch progress:

```bash
# Tail the Bitcoin node's sync:
docker logs -f btcpayserver_bitcoind_1
# "verificationprogress" approaching 1.0 (0.9999...) means nearly done.
# Or from inside the container:
docker exec btcpayserver_bitcoind_1 bitcoin-cli -getinfo
```

**FastSync (recommended on a small VPS)** downloads a snapshot of the current
UTXO set so the node skips re-downloading/validating the whole chain from
genesis — cutting sync from many hours to a short time. It trades a bit of
trust in the snapshot for speed; read its README before running:

```bash
cd /root/BTCPayServer/btcpayserver-docker
. helpers.sh
btcpay_down                         # stop services
cd contrib/FastSync
cat README.md                       # understand the trust model first
./load-utxo-set.sh
cd /root/BTCPayServer/btcpayserver-docker
btcpay_up                           # start again; it resumes from the snapshot
```

In the BTCPay web UI, **Server Settings → Maintenance / the sync popup** also
shows chain sync status. Don't create real invoices until it's fully synced.

---

## 8. Create your BTCPay admin account

Open **`https://btcpay.goyhub.st`** in a browser. The **first** account you
register becomes the server admin — do this now, before anyone else can, and
use a strong unique password. (You can later require invitations for new users
in **Server Settings → Policies**, and enable 2FA on your account under
**Account → Two-Factor Authentication**.)

---

## 9. Create the store

**Create store** → name it e.g. `GoyHub`. In **Store Settings → General**, set
the default currency to match what you'll price memberships in (e.g. `USD`).
The invoice amount is set by GoyHub per checkout, so this is just the display
default.

You'll grab the **Store ID** in §13.

---

## 10. Connect a wallet (so you can actually receive)

A store can't take payment until it has a wallet. Two options — pick one:

**A. Watch-only from your own xpub / hardware wallet (recommended).**
**Store Settings → Wallets → Bitcoin → Setup → Connect an existing wallet →
Enter extended public key**, and paste the `xpub`/`zpub` from your hardware
wallet (Ledger, Trezor, ColdCard) or a wallet like Sparrow/BlueWallet. The VPS
then only ever holds a *public* key — it can generate receive addresses and
watch for payments, but **cannot spend**. Your keys never touch the server.
This is the safest setup.

**B. BTCPay hot wallet.** **… → Create a new wallet** and BTCPay generates a
seed on the server. Easier, but the private key lives on the VPS — only hold
small balances and sweep to cold storage regularly. **Write down the seed
phrase** shown and store it offline; it's the only backup.

*(Optional)* If you enabled Lightning in §6, finish its setup under
**Store Settings → Lightning** and open a channel or two so members can pay
instantly with low fees.

---

## 11. Price & membership length

These live on the **GoyHub side**, not in BTCPay — GoyHub sets each invoice's
amount when it's created. You'll configure them in §16:

- `PAID_PRICE_AMOUNT` — e.g. `10.00`
- `PAID_PRICE_CURRENCY` — e.g. `USD`
- `PAID_PERIOD_DAYS` — e.g. `30` (or empty/`0` for a lifetime membership)

---

## 12. (Reference) The endpoint GoyHub exposes

GoyHub already ships the webhook receiver — you don't build anything. It lives
at:

```
https://<your GoyHub domain>/api/btcpay/webhook
```

You'll point BTCPay's webhook here in §14.

---

## 13. Create a Greenfield API key (least-privilege)

GoyHub creates invoices via BTCPay's Greenfield API using an API key scoped to
**only** this store and **only** invoice permissions.

1. **Account → Manage Account → API Keys → Generate Key**.
2. Give it a label like `goyhub-checkout`.
3. Grant **only** these permissions, restricted to your `GoyHub` store:
   - `btcpay.store.cancreateinvoice`
   - `btcpay.store.canviewinvoices`
4. **Generate** and copy the key. You'll paste it into GoyHub's
   `BTCPAY_API_KEY` **secret** (§16). This key can create and read invoices —
   it **cannot** move funds or change store settings.

Grab the **Store ID** now too: open **Store Settings**; the id is the long
string in the URL (`/stores/<STORE_ID>/…`) and shown on the General page. That's
`BTCPAY_STORE_ID`.

---

## 14. Create the webhook (this is what grants Paid)

1. **Store Settings → Webhooks → Create Webhook**.
2. **Payload URL:** `https://<your GoyHub domain>/api/btcpay/webhook`
   (e.g. `https://goyhub.st/api/btcpay/webhook`).
3. **Automatic redelivery:** leave **on** (GoyHub is idempotent — redeliveries
   can't double-grant).
4. **Secret:** BTCPay generates one, or set your own long random string.
   **Copy it** — it goes into GoyHub's `BTCPAY_WEBHOOK_SECRET` **secret** (§16).
   Every webhook GoyHub receives is HMAC-verified against this before it can
   touch an account.
5. **Events:** the simplest correct choice is **"Send me all events"**. GoyHub
   only acts on the ones it cares about (it grants membership strictly on
   `InvoiceSettled`, after re-verifying the invoice) and safely ignores the
   rest. If you prefer to be explicit, enable at least:
   - `An invoice has been settled` (**InvoiceSettled**) — the one that grants
   - `An invoice is processing` (**InvoiceProcessing**) — status display
   - `An invoice has expired` (**InvoiceExpired**)
   - `An invoice became invalid` (**InvoiceInvalid**)
6. **Add webhook.**

> BTCPay's **"Test"** button on the webhook sends a sample event with a fake
> invoice id. GoyHub verifies the signature, finds no matching order, and
> replies `200 {"ignored":"unknown_invoice"}` — so a green test confirms
> signing + reachability without granting anything. 

---

## 15. Collect the four values

You now have everything GoyHub needs:

| GoyHub setting          | Where it came from                          |
| ----------------------- | ------------------------------------------- |
| `BTCPAY_URL`            | `https://btcpay.goyhub.st` (your §1 host)   |
| `BTCPAY_STORE_ID`       | Store Settings URL / General (§13)          |
| `BTCPAY_API_KEY`        | the API key from §13 (**secret**)           |
| `BTCPAY_WEBHOOK_SECRET` | the webhook secret from §14 (**secret**)    |

---

## 16. Wire it into GoyHub (Cloudflare Pages)

Non-secrets go in `wrangler.toml` `[vars]`; the two secrets go in the Pages
dashboard. Full steps are in **`DEPLOY.md` → "Crypto payments (BTCPay
Server)"**. In short:

```toml
# wrangler.toml  [vars]
BTCPAY_URL = "https://btcpay.goyhub.st"
BTCPAY_STORE_ID = "your-store-id"
PAID_PRICE_AMOUNT = "10.00"
PAID_PRICE_CURRENCY = "USD"
PAID_PERIOD_DAYS = "30"
```

```bash
# secrets — never in wrangler.toml
npx wrangler pages secret put BTCPAY_API_KEY
npx wrangler pages secret put BTCPAY_WEBHOOK_SECRET
```

Redeploy. The `/upgrade` page flips from "coming soon" to a live **Pay with
crypto** button.

---

## 17. Test it end-to-end

**Rehearse on testnet first (optional but recommended).** Stand up a second
throwaway BTCPay with `NBITCOIN_NETWORK="testnet"` (or use a public test
instance), point a staging GoyHub at it, and pay an invoice with free
[testnet coins](https://mempool.space/testnet) from a faucet. Testnet confirms
in minutes and costs nothing.

**On mainnet:**

1. Log into GoyHub as a **non-admin** test member (admins/staff already sit
   above Paid — the webhook records their payment but won't change their tier,
   so use a plain member to see the upgrade happen).
2. Click **Upgrade → Pay with crypto**. You should be redirected to your BTCPay
   invoice page.
3. Pay it (a small real amount, or set `PAID_PRICE_AMOUNT` low for the test).
4. Once it confirms, BTCPay marks the invoice **Settled** and fires the webhook.
   The member's tier becomes **Paid** on their next page load; the **Payments**
   panel on `/profile` shows the purchase as **Paid**.
5. Confirm delivery from both sides:
   - BTCPay: **Store Settings → Webhooks → your webhook → Deliveries** shows a
     `200` response.
   - GoyHub: the admin **IP log** shows `checkout_created` then
     `membership_granted` for that member.

If the webhook shows a non-`200`, see §20.

---

## 18. Harden the box

- **SSH keys, not passwords.** From your machine: `ssh-copy-id root@VPS_IP`,
  then set in `/etc/ssh/sshd_config`: `PasswordAuthentication no` and
  `PermitRootLogin prohibit-password`, and `sudo systemctl restart ssh`. Keep
  your current session open and test a new login before closing it.
- **Keep BTCPay's ports minimal** — you already restricted ufw to 22/80/443.
- **Enable 2FA** on your BTCPay admin account (**Account → Two-Factor**).
- **Lock down registration:** **Server Settings → Policies →** disable open
  registration once your admin account exists, so nobody else can register on
  your server.
- **Unattended security updates** for the OS:
  `sudo apt -y install unattended-upgrades && sudo dpkg-reconfigure -plow unattended-upgrades`.
- **Prefer a watch-only wallet** (§10A) so the server never holds spendable
  keys.

---

## 19. Keep it running (updates, backups, monitoring)

**Update BTCPay** (do this periodically):

```bash
cd /root/BTCPayServer/btcpayserver-docker
sudo bash -c '. helpers.sh && btcpay_update'
```

**Back up** (store off the server):

- Your **wallet seed / xpub** (the single most important thing — without it a
  hot wallet's funds are unrecoverable if the VPS dies).
- BTCPay's data/config via its built-in backup:
  ```bash
  cd /root/BTCPayServer/btcpayserver-docker
  sudo bash -c '. helpers.sh && btcpay_backup'   # writes a backup archive; copy it off-box
  ```

**Monitor:**

- Disk: `df -h` — a pruned node stays flat, but Postgres/logs grow. Alert well
  before full.
- Services: `docker ps` (all `Up`), and `docker logs <container>` for any that
  restart.
- Certificate renews automatically (Let's Encrypt via nginx).

---

## 20. Troubleshooting

| Symptom | Likely cause / fix |
| --- | --- |
| Cert didn't issue / site not HTTPS | DNS not pointing at the box yet, or the `btcpay.` record is **proxied** on Cloudflare. Make it **DNS only** (§1) and re-run `. ./btcpay-setup.sh -i`. |
| Invoices never confirm | Node still syncing (§7). Check `docker exec btcpayserver_bitcoind_1 bitcoin-cli -getinfo`. |
| Services OOM / restart during sync | No/insufficient swap. Do §5 (4 GB swap). |
| "No space left on device" | Disk too small for the pruning level. Use a smaller fragment (`opt-save-storage-xxs`) or a bigger disk (§5). |
| Webhook delivery shows `401`/`400` in BTCPay | Signature mismatch — the `BTCPAY_WEBHOOK_SECRET` on GoyHub doesn't match the webhook's secret. Re-copy it (§14) and redeploy. |
| Webhook shows `200 {"ignored":...}` for real payments | The `BTCPAY_STORE_ID` on GoyHub doesn't match, or the invoice was created outside GoyHub. Confirm the store id (§13). |
| Webhook shows `502 {"error":"verify_failed"}` | GoyHub couldn't re-fetch the invoice from BTCPay to verify it (BTCPay down/unreachable, or a wrong `BTCPAY_URL`/`BTCPAY_API_KEY`). BTCPay will retry; fix the URL/key. |
| Member paid but tier didn't change | If they're **staff/admin**, that's expected (they're already above Paid). Otherwise check the GoyHub IP log for a `btcpay_webhook_rejected` row — the detail says why (amount/currency/status mismatch). |
| Checkout button missing on `/upgrade` | One of `BTCPAY_URL`, `BTCPAY_STORE_ID`, `BTCPAY_API_KEY`, `BTCPAY_WEBHOOK_SECRET`, `PAID_PRICE_AMOUNT` is unset. All are required to show the button. |

---

## How GoyHub keeps this secure (for reference)

Implemented in `functions/_lib/btcpay.js` and `functions/_lib/routes-payments.js`:

1. **Price/period are server-side.** The browser's checkout POST carries no
   amount, currency or duration — they come from your config, so a tampered form
   can't buy cheaper or longer.
2. **Signed webhooks only.** Every `/api/btcpay/webhook` call is verified with
   **HMAC-SHA256 over the exact raw body** using `BTCPAY_WEBHOOK_SECRET`
   (constant-time compare). No valid signature → rejected, nothing happens.
3. **Re-verified against BTCPay.** Even after the signature passes, GoyHub
   **re-fetches the invoice** with the store API key and re-checks status
   (`Settled`), amount, currency and order id before granting. A forged body
   can't grant access.
4. **Idempotent crediting.** Membership is granted once, under a
   `WHERE credited_at IS NULL` guard — replays and duplicate deliveries can't
   grant a second period.
5. **Least-privilege key.** The API key can only create/read invoices on one
   store; it can't move funds.
6. **Rate-limited & audited.** Invoice creation is capped per member
   (`RATE_LIMIT_CHECKOUT`), and every checkout, grant and rejection is written
   to the IP audit log.

---

### Sources

- [BTCPay Server — Docker deployment](https://docs.btcpayserver.org/Docker/)
- [BTCPay Server — Hardware & pruning / `opt-save-storage`](https://docs.btcpayserver.org/FAQ/Synchronization/)
- [btcpayserver-docker (install script & fragments)](https://github.com/btcpayserver/btcpayserver-docker)
- [BTCPay Server — Greenfield API & webhooks](https://docs.btcpayserver.org/API/Greenfield/v1/)
