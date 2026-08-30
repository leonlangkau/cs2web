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
| `CRYPTO_UNDERPAY_TOLERANCE_PCT` | `1` | How far under the quote still counts as paid — covers exchange withdrawal rounding. Capped at 20%. Raising it widens what is accepted without making misattribution more likely, since a payment still has to be clearly nearest to one quote |
| `CRYPTO_OVERPAY_TOLERANCE_PCT` | `100` | How far over still reads as this order's payment. Beyond it (a misplaced decimal point, say) a person decides, rather than fifty times the price silently buying one month |
| `CRYPTO_PAY_WINDOW_MINUTES` | `60` | How long a quote is honoured |
| `CRYPTO_MATCH_HOURS` | `48` | How long a **late** payment is still matched back to its order |
| `CRYPTO_SCAN_INTERVAL_SECONDS` | `20` | Floor on how often the chains are polled, site-wide |
| `CRYPTO_SCAN_DEPTH` | `25` | How many recent transactions each scan looks back over |
| `RATE_LIMIT_CRYPTO_ORDER` | `12` | Orders a member can open per hour |
| `RATE_LIMIT_CRYPTO_TX` | `10` | Transaction hashes a member can submit per hour |

### How much slack to allow

`CRYPTO_UNDERPAY_TOLERANCE_PCT` (default `1`) and `CRYPTO_OVERPAY_TOLERANCE_PCT`
(default `100`) set the window around a quote in which a payment still counts.
On a $10 plan the defaults accept anything from $9.90 to $20.

Widening the window is cheap. It does **not** make it likelier that money lands
on the wrong account, because the window only decides what is *considered* — the
payment is then attributed to whichever quote it is nearest, by a clear margin
or not at all. What widening actually buys is fewer trips to the admin queue
when a buyer's exchange rounds aggressively:

```toml
CRYPTO_UNDERPAY_TOLERANCE_PCT = "3"     # accept down to $9.70 on a $10 plan
CRYPTO_OVERPAY_TOLERANCE_PCT  = "50"    # hold anything above $15 for a human
```

What it costs is revenue per short payment, and a little room for someone to
probe for the cheapest amount that still upgrades them — at 3% on a $10 plan,
thirty cents. Set it to what you would rather not argue with a customer about.

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

Three other things land here rather than crediting automatically, all
deliberately:

- **A second payment for an order that is already paid.** Almost always someone
  who paid twice — and quite possibly owed a refund.
- **A large overpayment**, past `CRYPTO_OVERPAY_TOLERANCE_PCT`. A misplaced
  decimal point should not quietly become one month's membership.
- **A payment made after its quote expired, once the coin has fallen far
  enough that the amount no longer covers the price.** Without this an expired
  quote is a free option: open an order, wait, and pay only if the market moved
  your way. Paying late when the price has *not* moved against us still credits
  normally — nobody is punished for being slow.

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

### “It went through, but the site did nothing”

The money left the buyer's wallet and their order still says waiting. In roughly
the order it turns out to be the answer:

0. **The chain provider is not answering.** Check **Admin → On-chain** first:
   if a provider is failing, a red panel at the top of that page says which
   coin, since when, how many attempts, and what the provider actually said.
   Staff also get one alert on `SUPPORT_WEBHOOK_URL` when it starts, and hourly
   while it lasts. This is the one fault nothing routes around — no scan can
   see a payment, and a buyer pasting their own transaction hash hits the same
   endpoint, so that fails too. Usually a rate limit on the keyless default;
   set `ETHERSCAN_API_KEY` or `SOLANA_RPC_URL` (§5) for a higher-limit
   provider, or `ETH_EXPLORER_URL` to point elsewhere. **Nothing is lost**:
   money already sent is picked up on the first scan that succeeds, and the
   panel clears itself as soon as one does.

   The buyer's side of this reads *“We couldn't reach the blockchain network
   just now — that's a fault on our side.”* If someone quotes that at you, it
   is this, and their transaction hash is in the audit log under
   `chain_tx_submitted` whether or not it could be checked.
1. **It is still confirming.** ETH and ERC-20 USDT need
   `CRYPTO_ETH_CONFIRMATIONS` blocks — 12 by default, about two and a half
   minutes. The pay page shows the count climbing. Solana is read at
   `finalized`, so it has nothing to wait for. Nothing to do here.
2. **Nothing has driven a scan.** Pages Functions have no cron, so the chains
   are polled only when a request comes in. Without the cron from §3, a site
   with no visitors polls nothing at all. Opening **Admin → On-chain** nudges a
   poll; **Scan now** on that page forces one across every configured coin,
   including coins with no open order at all.
3. **Ask the buyer to reopen their payment link.** Their own pay page polls
   their own coin whenever they load it — whatever else is happening on the
   site, and including after their order's `CRYPTO_MATCH_HOURS` window has run
   out. Their amount stays reserved to them for 30 days, so a late payment for
   the exact quoted amount still credits itself. A late payment for a *rounded*
   amount is deliberately parked for you instead, in the table above.
4. **The scan cannot see that transaction.** USDT sent on Solana against an
   Ethereum order (or the reverse), a different address, or a provider that
   never returned the row. The buyer pasting their transaction hash into
   “Already sent it and nothing has happened?” reads that one transaction
   directly, which settles the question either way.
5. **It arrived but could not be attributed.** Then it is already in the top
   table on **Admin → On-chain**, with its hash and amount, waiting for you to
   assign it.

If the money is on chain and none of the above finds it, credit the order by
hand from **Admin → On-chain**. That is recorded in the audit log as a manual
action, and the buyer gets their membership immediately.

---

## 8. How the guarantees actually hold

Worth knowing before you trust it with money:

- **A payment can only ever grant one membership.** The order's `credited_at` is
  claimed atomically, and `chain_transfers` is unique per (coin, transaction).
  Two scans running at once, a replayed scan, a buyer refreshing forty times —
  all grant exactly once.
- **A quoted amount belongs to the person quoted it, for 30 days.** Not just
  while their order is open: if they cancel, or their order expires, or they pay
  twice, the amount still identifies *them*. This is the guard that stops one
  person's payment landing on another person's account, and it is why an amount
  is never reissued to a second buyer while the first one's money might still be
  in flight.
- **A near-miss goes to the quote it is nearest.** Exchange withdrawal forms
  round and buyers retype figures, so a payment often lands a hair off. Because
  quotes are spaced deliberately, such a payment still sits far nearer its own
  quote than anyone else's, and that is who gets it — checked against every
  recent order, not just the open ones. It is only handed to a human when the
  runner-up is close enough that "nearest" would be a coin toss, or when the
  nearest quote belongs to an order that can no longer take a payment (in which
  case the admin queue names that order, so crediting the right person is one
  click).
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
