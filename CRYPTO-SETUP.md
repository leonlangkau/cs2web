# Direct-to-wallet crypto payments (ETH, SOL, USDT)

Take ETH, SOL and USDT **straight into your own wallet** — no server to run, no
processor, no account with anybody. You paste two addresses in as secrets, and
the site watches those addresses and upgrades a buyer to **Paid** automatically
once their payment confirms on chain.

This is the lighter sibling of [BTCPAY-SETUP.md](BTCPAY-SETUP.md). BTCPay is
better if you want Bitcoin and Lightning and are willing to run a VPS; this
needs nothing but a wallet. **You can run both at once** — the store page shows
whichever are configured, and they are completely independent.

---

## 0. What you're building

```
   Buyer's browser                      Cloudflare Pages (GoyHub)         Public chain APIs
   ───────────────                      ─────────────────────────         ─────────────────
   /buy → picks a coin ───────────────▶ POST /upgrade/crypto
                                        quotes the plan at a live rate ──▶ price feed
                                        and picks a UNIQUE amount
        ◀──── /pay/<order>: exact amount + your address + QR ────────────
   sends from any wallet ─────────────▶ (money lands in YOUR wallet)
                                        a scan reads recent transfers ───▶ explorer / RPC
                                        matches the amount to the order
                                        grants Paid once confirmed
```

**You need:** an ETH address, a SOL address, and about five minutes. That is the
whole list. There is no node to sync and no third party in the path.

---

## 1. The idea, in one paragraph

Every buyer pays the **same** address, and a blockchain transfer carries no
username — so something has to say which payment belongs to whom. That
something is the **amount**. When somebody starts a checkout, the plan's price
is converted at a live rate and then nudged by a few hundredths of a cent, to a
figure no other open order is using. When a transfer of exactly that amount
arrives, there is exactly one order it can be.

This is why the pay page insists on the exact amount, and why an amount typed by
hand rather than copied is the one thing that can land a payment in the admin
queue instead of upgrading an account straight away. Nothing is ever lost — see
§7 — but it costs a manual step.

---

## 2. Get your addresses

Use a wallet **you** control the keys to.

- **Ethereum** (covers ETH and USDT-ERC20): any wallet — MetaMask, Rabby,
  Ledger, Trezor. Copy the `0x…` address.
- **Solana** (covers SOL and USDT-SPL): Phantom, Solflare, Backpack, Ledger.
  Copy the base58 address.

> **Do not use an exchange deposit address.** Exchange deposit addresses can be
> rotated, are sometimes shared, and often reject tokens sent on a network the
> deposit page did not expect. Use a wallet whose seed phrase you hold.

Any Ethereum wallet works, and a multi-chain one derives both a Solana and an
Ethereum account from a single seed, so one app can hold all four of the coins
this sells. Whether a given wallet *displays* an incoming token is a question
about that wallet's UI, never about whether the money arrived: an ERC-20 balance
lives in the token contract keyed by your address, so it is yours the moment the
transfer confirms, and any wallet holding that private key can reach it —
importing the seed elsewhere recovers a token a wallet declines to show.

The site validates both before offering them. An Ethereum address is checked
against its **EIP-55 checksum** — the mixed-case pattern in a normal `0x…`
address is a checksum of itself, so a single transposed character is caught. A
Solana address must decode to exactly 32 bytes. **A address that fails takes its
coins off the checkout entirely** and is reported in the admin panel, rather
than silently collecting money to somewhere nobody can spend it.

---

## 3. Set the secrets

In the **Cloudflare dashboard**:

1. **dash.cloudflare.com** → **Workers & Pages** → your Pages project.
2. **Settings** → **Variables and Secrets**.
3. **+ Add** — and set the type to **Secret**, not Text. (Text values are
   readable by anyone with dashboard access and end up in build logs; a Secret
   is write-only once saved.)
4. Add these two, then **Save**:

| Name | Value |
| --- | --- |
| `ETH_ADDRESS` | your `0x…` address — covers **ETH** and **USDT-ERC20** |
| `SOL_ADDRESS` | your base58 address — covers **SOL** and **USDT-SPL** |

5. **Redeploy.** This is the step people miss: on Pages, environment variables
   and secrets are bound at deploy time, so an existing deployment keeps running
   with the old (empty) values. Push any commit, or **Deployments** → the latest
   one → **⋯** → **Retry deployment**. Until you do, `/buy` will look exactly as
   it did before and you will think it didn't work.

> **Production vs Preview.** The dashboard keeps a separate set per environment.
> Add them under **Production**. If you also want the coins on preview branch
> deployments, add them to **Preview** as well — the same values are fine, since
> these are receive-only addresses.

Prefer the CLI? `npx wrangler pages secret put ETH_ADDRESS` does the same thing.

Setting only one of the two is fine — you will simply be offering two coins
instead of four. Setting neither leaves the store exactly as it was.

That is the minimum. Everything from here is optional.

### Checking it took

Sign in as an admin and open **Admin → On-chain**. The "Receiving addresses"
panel lists every coin that is live, with the address money will arrive at and
how many confirmations it waits for. If a coin is missing, its address was
rejected — the reason is printed right there. If the panel says nothing is
configured at all, the redeploy in step 5 hasn't happened.

### Optional: a cron so payments confirm while nobody is browsing

Cloudflare **Pages** Functions have no cron triggers, so by default the chains
are polled during requests that were happening anyway: the buyer's own payment
page, the store page, a profile load, the admin queue. In practice a buyer
watching their payment page is exactly the traffic needed to confirm it, and
anyone who wanders off is picked up the moment they come back.

To have it run regardless, add one more **Secret** the same way —
`CRYPTO_SCAN_SECRET`, any long random string (`node -e
"console.log(require('crypto').randomBytes(32).toString('hex'))"` will make you
one) — redeploy, then point any scheduler at it every few minutes. It accepts `GET` (so the free
services work) and `POST`:

```
https://goyhub.st/api/crypto/scan?key=YOUR_SECRET
```

Anything works: cron-job.org, a GitHub Actions schedule, a `curl` in your own
crontab, or a tiny Cloudflare **Worker** (Workers *do* have cron triggers) that
fetches that URL. Without the secret set, the endpoint returns 503 to everyone —
an unset secret closes the door, it does not open it.

---

## 4. What you are now selling, and for how much

Prices come from **Admin → Shop** exactly as they do for BTCPay — same products,
same lengths, same catalogue. A plan priced at `9.99 EUR` is quoted in ETH, SOL
or USDT at the live rate when the buyer clicks, and that rate is frozen onto the
order so a swing five minutes later cannot change what they owe.

Rates come from Coinbase, falling back to CoinGecko — both keyless — and are
cached for 90 seconds, so a rush of checkouts costs one lookup rather than one
each. **If no rate can be established, the checkout refuses** rather than
inventing a price. (One narrow exception: USDT priced in USD falls back to 1:1,
because that is what the token is a claim on. It does not apply to other
currencies.)

> **If your store prices in EUR** (`PAID_PRICE_CURRENCY = "EUR"`), USDT is
> quoted at the live USDT/EUR rate, not 1:1 — and it has no fallback, since a
> dollar stablecoin is not a euro. That is correct, just worth knowing.

---

## 5. Tuning (all optional)

Add to `wrangler.toml` under `[vars]`:

| Variable | Default | What it does |
| --- | --- | --- |
| `CRYPTO_ASSETS` | all configured | Allowlist, e.g. `"eth,sol"` — offer fewer coins than your addresses cover |
| `CRYPTO_ETH_CONFIRMATIONS` | `12` | Blocks before ETH/USDT-ERC20 money counts (~2.5 min). Lower is faster and less safe |
| `CRYPTO_SOL_CONFIRMATIONS` | `1` | Solana is read at `finalized`, which is already irreversible |
| `CRYPTO_UNDERPAY_TOLERANCE_PCT` | `1` | How far under the quote still counts as paid — covers exchange withdrawal rounding. Capped at 20% |
| `CRYPTO_PAY_WINDOW_MINUTES` | `60` | How long a quote is honoured |
| `CRYPTO_MATCH_HOURS` | `48` | How long a **late** payment is still matched back to its order |
| `CRYPTO_SCAN_INTERVAL_SECONDS` | `20` | Floor on how often the chains are polled, site-wide |
| `CRYPTO_SCAN_DEPTH` | `25` | How many recent transactions each scan looks back over |
| `RATE_LIMIT_CRYPTO_ORDER` | `12` | Orders a member can open per hour |
| `RATE_LIMIT_CRYPTO_TX` | `10` | Transaction hashes a member can submit per hour |

### Different addresses per token

By default USDT-ERC20 is collected at `ETH_ADDRESS` and USDT-SPL at
`SOL_ADDRESS`. To split them: `USDT_ERC20_ADDRESS`, `USDT_SPL_ADDRESS`.

### Higher-limit chain providers (secrets)

The defaults are public and keyless: **Blockscout** for Ethereum and the
**Solana mainnet RPC**. They work, and they are rate-limited. If you start
selling volume, drop in your own — no code change:

| Variable | Effect |
| --- | --- |
| `ETHERSCAN_API_KEY` | Switches Ethereum reads to the Etherscan v2 API |
| `ETH_EXPLORER_URL` | Any other Etherscan-compatible API base |
| `SOLANA_RPC_URL` | A dedicated RPC (Helius, QuickNode, Alchemy…) |
| `COINGECKO_API_KEY` | A CoinGecko demo key for the rate feed |

All read-only. None of them can move money, and **nothing anywhere in this
system ever holds or needs a private key** — the site can only *watch* your
addresses.

---

## 6. Test it end-to-end

1. Sign in with a normal (non-staff) account and open `/buy`.
2. Pick a coin. You land on `/pay/<order>` with an exact amount, your address
   and a QR code.
3. Send that exact amount from any wallet. **Copy the amount — don't retype it.**
4. Leave the page open. It polls by itself; no refreshing.
5. After the confirmations complete, the page flips to "Payment confirmed" and
   the account is Paid. Check **Admin → On-chain** to see the order settled.

Testing cheaply: add a temporary £0.50-equivalent product in **Admin → Shop**,
buy it from a second account, then deactivate the product. A real payment of a
real (tiny) amount exercises everything; a testnet cannot, since these are
mainnet addresses.

---

## 7. When something needs a human

**Admin → On-chain** has two tables. The bottom one is every order. The top one
is the only thing that ever needs you: **payments that arrived but could not be
attributed to exactly one order.** There are two ways to get there:

- **The amount matches nothing** — someone underpaid heavily, or sent money to
  the address without starting a checkout at all.
- **The amount could be either of two orders** — it clears both of their
  minimums and exactly matches neither. The site deliberately credits
  **neither**: crediting the wrong account is worse than waiting.

Each row shows the coin, amount, transaction and a dropdown of the live orders
it could belong to. Pick one and click **Credit to**. That grants the membership
and closes the order, and is written to the audit log as a manual action.

Money that arrives is **never** discarded — an unattributed transfer stays on
record with the transaction hash, whether or not you act on it.

Two other things worth knowing:

- **A buyer can self-serve first.** The pay page has "Already sent it and
  nothing has happened?" where they paste their transaction hash. That is only a
  hint about where to look: the amount, recipient and confirmation count are
  still read from the chain, and a hash that paid a different address, or one
  already credited to another order, grants nothing.
- **Overpayment credits automatically.** Paying more than the quote covers the
  order; the buyer is not penalised and you are not asked to intervene.

---

## 8. How the guarantees actually hold

Worth knowing before you trust it with money:

- **A payment can only ever grant one membership.** The order's `credited_at` is
  claimed atomically, and `chain_transfers` is unique per (coin, transaction).
  Two scans running at once, a replayed scan, a buyer refreshing forty times —
  all grant exactly once.
- **A provider outage is never read as "nobody paid".** A failed lookup throws
  and is reported; it never returns an empty result that could expire a paid
  order. When the provider comes back, the payment that was there all along is
  found.
- **Amounts are exact integers throughout** — wei, lamports, token units, as
  BigInt and stored as text. No float ever touches a payment. A wei is not
  representable as a JS number and never has to be.
- **Nothing trusts the client.** The price comes from your catalogue, the
  address from your secrets, the amount from the rate feed, and the confirmation
  count from the chain. The buyer's form carries a plan slug and a coin name.
- **Late payments still work.** A quote expires for pricing purposes after an
  hour, but the amount stays matched to its order for 48 hours, so somebody who
  pays slowly is still upgraded rather than stranded.

`tests/crypto.test.mjs` asserts every one of these against a simulated chain,
including the cases that must **not** credit.

---

## 9. Withdrawing, and tax

Payments land in your wallet directly — there is no settlement step and no
balance held anywhere on your behalf. Which also means there is no chargeback,
no refund button, and no support desk but you: a crypto payment is final once
confirmed, in both directions.

**Keep a little native coin in each address for gas.** This catches people out
with tokens: USDT is not a balance your address holds, it is a row in the
token's contract keyed by your address — and *moving* that row costs a
transaction, paid in the chain's own coin. So an address holding 500 USDT and
zero ETH cannot send that USDT anywhere until some ETH arrives. Nothing is lost
and nothing is at risk; it is simply immovable until you fund the gas. The same
applies to SPL USDT and SOL, though Solana fees are fractions of a cent. If you
expect to take mostly USDT, keep roughly one transaction's worth of ETH in the
receiving address and top it up occasionally.

Receiving, by contrast, never needs gas or any setup at all — the sender pays
for that, which is why a brand-new empty address can take payments on day one.

Keep records. **Admin → On-chain** holds every order and transaction hash, which
is the paper trail. Whether that revenue is taxable, and how, is between you and
your jurisdiction — this guide has no opinion and gives no advice.

---

## 10. Turning it off

Delete the `ETH_ADDRESS` / `SOL_ADDRESS` secrets. The coins disappear from the
store immediately. Orders already open stay in the admin panel and can still be
credited by hand; nothing is deleted, and BTCPay (if you run it) is unaffected.
