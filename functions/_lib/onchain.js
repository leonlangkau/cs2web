/**
 * Turning money that landed in the operator's own wallet into a membership.
 *
 * There is no processor and no webhook here: buyers send ETH, SOL or USDT
 * straight to an address pasted in as a secret, and this module watches those
 * addresses and decides what each arriving transfer paid for. The whole problem
 * is attribution — everyone pays the SAME address, and a blockchain transfer
 * carries no username — so:
 *
 *   1. Starting a checkout quotes the plan's fiat price in the chosen coin and
 *      freezes that quote onto an order.
 *   2. The quoted amount is made UNIQUE among every live order for that coin by
 *      varying its last three payable decimals. The spread is worth about a
 *      cent, and it is what makes an anonymous transfer identifiable.
 *   3. A scan reads recent transfers to the address and matches each one to at
 *      most one order. An exact amount always wins. Failing that, a transfer is
 *      only auto-attributed when exactly ONE live order could account for it —
 *      if two could, the money is real but the owner is a guess, so it goes to
 *      the admin queue instead of to whichever account happened to sort first.
 *   4. Once the transfer has enough confirmations, the membership is granted.
 *
 * Every step is idempotent. `chain_orders.credited_at` is claimed atomically and
 * `chain_transfers` is unique per (asset, transaction), so a transaction seen by
 * two concurrent scans grants exactly one membership, and a scan may be run as
 * often as you like.
 *
 * Nothing here trusts the client. Prices come from the catalogue, the address
 * comes from config, and the amount comes from a rate feed — never from the
 * request. The only thing a buyer can supply is a transaction hash, and that is
 * merely a hint about where to look: the transfer it names is still read from
 * the chain and still has to match an amount we quoted.
 */
import {
  chainConfig, fetchIncoming, fetchTransaction, requiredConfirmations,
  paymentUri, explorerLink, isTransactionRef,
} from "./chains.js";
import { getRate } from "./rates.js";
import { fiatToUnits, ceilTo, fromUnits, parseUnits, pow10, unitsToFiat } from "./units.js";
import { grantMembership } from "./membership.js";
import { getSetting, setSetting } from "./settings.js";
import { audit } from "./middleware.js";
import { newToken, randomBytes } from "./crypto.js";
import { storeCurrency } from "./plans.js";

/** How many distinct amounts a single price band is split into. */
const TAG_SLOTS = 1000;

/**
 * How long a quoted amount stays bound to the order it was quoted for.
 *
 * An order stops being payable long before its amount stops being MEANINGFUL.
 * The amount was handed to exactly one person, so for as long as their money
 * might still be in flight it identifies them and nobody else — whether their
 * order was since cancelled, expired, or already paid. Matching against only
 * the live set is what let one person's payment land on another person's
 * account.
 */
const AMOUNT_RESERVE_DAYS = 30;

/**
 * How much nearer the best-matching quote must be than the runner-up before an
 * inexact payment is attributed to it.
 *
 * Quotes for the same plan are spaced about a cent apart, so a payment that
 * rounding moved a fraction of a cent still sits far nearer its own quote than
 * anyone else's. A payment that is genuinely between two of them is a coin
 * toss, and goes to the admin queue instead.
 */
const NEAREST_QUOTE_MARGIN = 4n;

/** Statuses that mean a human, not another scan, decides what a transfer paid for. */
const RESOLVED_TRANSFER_STATUSES = new Set(['unmatched', 'ambiguous', 'ignored']);

/**
 * How far the chain's clock may run ahead of ours before we stop believing an
 * order could have been paid by a given transfer. Block timestamps are miner-
 * and validator-reported and drift by seconds, not minutes.
 */
const ORDER_CLOCK_GRACE_SECONDS = 600;

/** Solana scans cost one RPC round trip per unseen signature — keep it bounded. */
const MAX_TX_LOOKUPS_PER_SCAN = 12;

/** Re-read a few blocks either side of the cursor, so a reorg can't hide a payment. */
const ETH_CURSOR_LAG_BLOCKS = 20;

function positiveNumber(value, fallback, min = 0) {
  const n = Number(value);
  return Number.isFinite(n) && n >= min ? n : fallback;
}

/**
 * Everything the on-chain payment path needs, read from env/secrets.
 *
 *   CRYPTO_PAY_WINDOW_MINUTES     how long a quote is honoured (default 60)
 *   CRYPTO_MATCH_HOURS            how long a late payment can still be matched
 *                                 back to its order (default 48)
 *   CRYPTO_UNDERPAY_TOLERANCE_PCT how far under the quote still counts as paid
 *                                 (default 1%) — covers exchange withdrawal
 *                                 rounding and rate drift
 *   CRYPTO_OVERPAY_TOLERANCE_PCT  how far over still reads as that order's
 *                                 payment (default 100%); beyond it, a human
 *                                 decides rather than one membership silently
 *                                 absorbing a large multiple of the price
 *   CRYPTO_SCAN_INTERVAL_SECONDS  floor on how often the chains are polled
 *   CRYPTO_SCAN_SECRET            lets an external cron call POST /api/crypto/scan
 */
function onchainConfig(env = {}) {
  const chains = chainConfig(env);
  return {
    ...chains,
    currency: storeCurrency(env),
    payWindowMinutes: Math.max(5, positiveNumber(env.CRYPTO_PAY_WINDOW_MINUTES, 60, 5)),
    matchHours: Math.max(1, positiveNumber(env.CRYPTO_MATCH_HOURS, 48, 1)),
    // Basis points, so the comparison stays integer-exact.
    toleranceBp: Math.min(2000, Math.round(positiveNumber(env.CRYPTO_UNDERPAY_TOLERANCE_PCT, 1, 0) * 100)),
    // How far OVER the quote still reads as paying that order. Overpaying a
    // little is ordinary; a large multiple is a mistake, and silently turning
    // it into one membership would be the wrong favour.
    overpayBp: Math.round(positiveNumber(env.CRYPTO_OVERPAY_TOLERANCE_PCT, 100, 0) * 100),
    scanIntervalSeconds: Math.max(5, positiveNumber(env.CRYPTO_SCAN_INTERVAL_SECONDS, 20, 5)),
    scanSecret: String(env.CRYPTO_SCAN_SECRET ?? '').trim(),
  };
}

/* ------------------------------------------------------------------ *
 * Quoting
 * ------------------------------------------------------------------ */

/** The smallest amount that still counts as paying an order in full. */
function minimumFor(units, toleranceBp) {
  if (toleranceBp <= 0) return units;
  return units - (units * BigInt(toleranceBp)) / 10_000n;
}

/** Random tag in [0, TAG_SLOTS). Uses the CSPRNG so amounts aren't guessable. */
function randomTag() {
  const [a, b] = randomBytes(2);
  return ((a << 8) | b) % TAG_SLOTS;
}

/** Live orders for an asset — anything not cancelled that could still be paid. */
const LIVE_ORDERS_SQL = `SELECT * FROM chain_orders
  WHERE asset = ? AND credited_at IS NULL AND status <> 'cancelled' AND match_until >= ?`;

/**
 * Every order whose amount is still spoken for, whatever became of the order.
 * This is the set matching works against; `isLive` below then decides which of
 * them can still legitimately RECEIVE a payment.
 */
const RESERVED_ORDERS_SQL = `SELECT * FROM chain_orders
  WHERE asset = ? AND created_at >= datetime('now', '-${AMOUNT_RESERVE_DAYS} days')`;

/** Can this order still take a payment, or is it merely holding its amount? */
function isLiveOrder(order, now) {
  return !order.credited_at && order.status !== 'cancelled' && Number(order.match_until) >= now;
}

/**
 * Picks an amount that is at least `base` and shared with no other live order
 * for the same coin. Uniqueness is what makes an anonymous transfer
 * attributable, so a band with no free slot left returns null and the checkout
 * declines rather than issuing a duplicate amount.
 */
async function uniqueExpected(db, asset, base, now) {
  const step = pow10(asset.decimals - asset.payDecimals);
  const band = step * BigInt(TAG_SLOTS);
  const floor = ceilTo(base, band);

  // Reserved, not merely live: reissuing an amount that a cancelled or expired
  // order was quoted would put two people's payments on one number.
  const rows = await db.all(`${RESERVED_ORDERS_SQL} LIMIT 4000`, asset.key);
  const taken = new Set(rows.map((r) => String(r.expected_units)));

  for (let attempt = 0; attempt < 24; attempt += 1) {
    const candidate = floor + BigInt(randomTag()) * step;
    if (!taken.has(candidate.toString())) return candidate;
  }
  // The random probe kept colliding — walk the band so a nearly-full one still
  // finds its last free slot rather than failing on bad luck.
  for (let tag = 0; tag < TAG_SLOTS; tag += 1) {
    const candidate = floor + BigInt(tag) * step;
    if (!taken.has(candidate.toString())) return candidate;
  }
  return null;
}

/**
 * Prices `fiatAmount` in `asset`, without touching the database beyond the
 * rate cache. Returns null when no price could be established — the caller
 * must then refuse the sale rather than invent one.
 */
async function quoteAsset(db, env, cfg, asset, fiatAmount) {
  const quote = await getRate(db, env, asset.priceSymbol, cfg.currency);
  if (!quote) return null;
  const base = fiatToUnits(fiatAmount, quote.rate, asset.decimals);
  if (base === null || base <= 0n) return null;
  return { base, rate: quote.rate, stale: Boolean(quote.stale), source: quote.source };
}

/**
 * Creates an order and returns { order } or { error }. The plan must already
 * have been resolved from the catalogue by the caller — the buyer's form
 * carries a slug and a coin, never a price.
 */
async function createOrder(c, cfg, { user, plan, assetKey, now = Date.now() }) {
  const db = c.get('db');
  const env = c.get('cfg');
  const asset = cfg.byKey[String(assetKey || '')];
  if (!asset) return { error: 'unknown_asset' };

  const quote = await quoteAsset(db, env, cfg, asset, plan.amount);
  if (!quote) return { error: 'no_rate' };

  const expected = await uniqueExpected(db, asset, quote.base, now);
  if (expected === null) return { error: 'no_slot' };

  const orderId = newToken(16);
  const expiresAt = now + Math.round(cfg.payWindowMinutes * 60_000);
  const matchUntil = now + Math.round(cfg.matchHours * 3_600_000);

  await db.run(
    `INSERT INTO chain_orders
       (order_id, user_id, username, asset, chain, address, decimals,
        expected_units, min_units, fiat_amount, fiat_currency, rate,
        period_days, plan_id, plan_name, status, expires_at, match_until)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'new', ?, ?)`,
    orderId, user.id, user.username, asset.key, asset.chain, asset.address, asset.decimals,
    expected.toString(), minimumFor(expected, cfg.toleranceBp).toString(),
    plan.amount, cfg.currency, quote.rate,
    plan.periodDays === null || plan.periodDays === undefined ? null : Math.floor(Number(plan.periodDays)),
    plan.id, plan.name, expiresAt, matchUntil
  );

  await audit(c, 'chain_order_created', {
    userId: user.id, username: user.username,
    detail: `order ${orderId} — ${plan.name} ${plan.amount} ${cfg.currency} `
      + `= ${fromUnits(expected, asset.decimals)} ${asset.symbol} @ ${quote.rate}`
      + (quote.stale ? ' (stale rate)' : ''),
  });

  return { order: await db.get('SELECT * FROM chain_orders WHERE order_id = ?', orderId) };
}

/* ------------------------------------------------------------------ *
 * Matching + crediting
 * ------------------------------------------------------------------ */

/**
 * Grants the membership an order was paid for. The claim on `credited_at` is
 * the single guard: exactly one caller can flip it from NULL, so a scan, a page
 * load and an admin clicking at the same moment grant once between them.
 */
async function creditOrder(c, cfg, order, transfer, source) {
  const db = c.get('db');
  const asset = cfg.byKey[order.asset];

  // `transfer` is null when staff credit an order by hand — money that arrived
  // out of band, or a payment the chain APIs simply cannot see. Everything the
  // order already knows is kept in that case rather than being blanked out.
  const txHash = transfer ? transfer.tx_hash : (order.tx_hash || null);
  const units = transfer ? String(transfer.units) : (order.received_units || null);
  const confirmations = transfer ? Number(transfer.confirmations) || 0 : Number(order.confirmations) || 0;

  // Look the buyer up BEFORE claiming, so a deleted account never strands a claim.
  const target = await db.get('SELECT id, tier, paid_until FROM users WHERE id = ?', order.user_id);

  const claim = await db.run(
    `UPDATE chain_orders SET status = 'settled', credited_at = ?, tx_hash = ?,
       received_units = ?, confirmations = ?, updated_at = datetime('now')
     WHERE id = ? AND credited_at IS NULL`,
    Date.now(), txHash, units, confirmations, order.id
  );
  if (claim.changes === 0) return { granted: false, reason: 'already' };

  if (!target) {
    await audit(c, 'chain_payment_rejected', {
      username: order.username,
      detail: `order ${order.order_id}: the buyer's account no longer exists (${source})`,
    });
    return { granted: false, reason: 'user_gone' };
  }

  try {
    await grantMembership(db, target, order.period_days);
  } catch (err) {
    // Roll the claim back so the next scan retries, rather than leaving someone
    // charged and not upgraded.
    await db.run(
      "UPDATE chain_orders SET credited_at = NULL, status = 'seen', updated_at = datetime('now') WHERE id = ?",
      order.id
    ).catch(() => {});
    console.error('on-chain grant failed after credit claim:', err);
    return { granted: false, reason: 'grant_failed' };
  }

  if (transfer && transfer.id) {
    await db.run(
      "UPDATE chain_transfers SET status = 'credited', order_id = ?, updated_at = datetime('now') WHERE id = ?",
      order.order_id, transfer.id
    );
  }

  const paid = parseUnits(units) ?? 0n;
  const expected = parseUnits(order.expected_units) ?? 0n;
  const shortfall = expected > paid ? ` (short by ${fromUnits(expected - paid, order.decimals)})` : '';
  await audit(c, 'membership_granted', {
    userId: target.id, username: order.username,
    detail: `on-chain order ${order.order_id} — ${fromUnits(paid, order.decimals)} ${asset ? asset.symbol : order.asset}`
      + `${shortfall} ${txHash ? `tx ${String(txHash).slice(0, 20)}…` : 'with no on-chain transaction'}`
      + (order.period_days ? ` for ${order.period_days}d` : ' lifetime')
      + ` (via ${source})`,
  });
  return { granted: true, staff: false };
}

/**
 * Does `units` still pay for the order, valued at TODAY's rate?
 *
 * Only consulted when a payment lands after its quote expired. Returns ok when
 * no live rate can be established — an outage in our price feed is our problem,
 * not a reason to hold somebody's money.
 */
async function quoteStillCovers(db, env, cfg, order, units) {
  const asset = cfg.byKey[order.asset];
  if (!asset) return { ok: true };
  const quote = await getRate(db, env, asset.priceSymbol, order.fiat_currency).catch(() => null);
  if (!quote) return { ok: true };
  const needed = fiatToUnits(order.fiat_amount, quote.rate, asset.decimals);
  if (needed === null || needed <= 0n) return { ok: true };
  const floor = minimumFor(needed, cfg.toleranceBp);
  if (units >= floor) return { ok: true };
  return { ok: false, shortBy: fromUnits(floor - units, asset.decimals) };
}

/**
 * Decides which order — if any — an incoming transfer paid for, and credits it
 * when it is confirmed enough.
 *
 * The ambiguity rule is the important one. An exact amount is unambiguous by
 * construction and always wins. Anything else is only attributed when a single
 * live order could account for it; two candidates means somebody's money would
 * be credited to somebody else's account, so it is parked for an admin instead.
 */
async function matchTransfer(c, cfg, transfer, { now = Date.now(), source = 'scan' } = {}) {
  const db = c.get('db');
  const asset = cfg.byKey[transfer.asset];
  if (!asset) return { reason: 'unknown_asset' };
  if (transfer.status === 'credited') return { reason: 'already' };

  // A transfer that has already been ruled unattributable stays that way. Order
  // amounts are assigned randomly, so a later order "matching" an older stray
  // deposit is coincidence, never truth — and auto-crediting on that coincidence
  // would hand one person's money to whoever happened to check out next. Those
  // rows belong to the admin queue until a human says otherwise.
  if (RESOLVED_TRANSFER_STATUSES.has(transfer.status)) return { reason: transfer.status };

  const units = parseUnits(transfer.units);
  if (units === null || units <= 0n) return { reason: 'empty' };

  // An order cannot have been paid by money that arrived before it existed: the
  // buyer gets the amount FROM the order. The grace window absorbs clock skew
  // between us and the chain, nothing more.
  const paidAt = Number(transfer.block_time) || 0;
  const bornBefore = paidAt > 0 ? paidAt + ORDER_CLOCK_GRACE_SECONDS : null;
  const recent = bornBefore === null
    ? await db.all(`${RESERVED_ORDERS_SQL} ORDER BY id ASC LIMIT 500`, asset.key)
    : await db.all(
      `${RESERVED_ORDERS_SQL} AND CAST(strftime('%s', created_at) AS INTEGER) <= ?
       ORDER BY id ASC LIMIT 500`, asset.key, bornBefore
    );

  let order = null;
  let verdict = 'unmatched';
  let note = 'no order was quoted this amount';

  // --- 1. An exact amount names its owner, and only its owner ---------------
  //
  // Searched across every reserved order rather than only the live ones. This
  // is the guard that matters: the amount was quoted to exactly one person, so
  // if it turns up we know whose money it is even when their order has since
  // been cancelled, expired, or paid. Matching exact amounts against the live
  // set alone let a payment fall through to whoever was still queued.
  const exact = recent.filter((o) => parseUnits(o.expected_units) === units);
  if (exact.length === 1) {
    const owner = exact[0];
    if (owner.credited_at) {
      // Their order is already paid, and this is a DIFFERENT transaction for
      // the same amount — almost always a buyer who paid twice. Crediting it
      // again would be wrong and dropping it would be theft, so a human looks.
      verdict = 'unmatched';
      note = `a second payment for order ${owner.order_id}, which is already paid `
        + '— likely a duplicate, may be owed a refund';
    } else {
      order = owner;
      verdict = 'matched';
    }
  } else if (exact.length > 1) {
    verdict = 'ambiguous';
    note = `${exact.length} orders were quoted this exact amount — needs a human`;
  } else {
    // --- 2. No exact amount: the nearest quote, when it is clearly nearest ----
    //
    // Wallets send exactly what you paste, but exchange withdrawal forms round,
    // and a buyer who retypes the figure drops a digit. Those payments are
    // still obviously somebody's: they sit a hair away from ONE quote and far
    // from every other, because quotes are spaced deliberately.
    //
    // So rather than refusing whenever a second order is technically in range —
    // which it always is, since the tolerance is far wider than that spacing —
    // this takes the nearest quote, and only gives up when the runner-up is
    // close enough that "nearest" would be a coin toss.
    const scored = recent.map((o) => {
      const min = parseUnits(o.min_units);
      const expected = parseUnits(o.expected_units);
      if (min === null || expected === null) return null;
      // Bounded on BOTH sides. Overpaying a little is ordinary and credits;
      // paying a large multiple is a mistake worth a human, not a silent
      // membership at fifty times the price.
      const ceiling = expected + (expected * BigInt(cfg.overpayBp)) / 10_000n;
      if (units < min || units > ceiling) return null;
      return { order: o, distance: units > expected ? units - expected : expected - units };
    }).filter(Boolean).sort((a, b) => (a.distance > b.distance ? 1 : a.distance < b.distance ? -1 : 0));

    const best = scored[0];
    const runnerUp = scored[1];
    // "Clearly nearest" means the next candidate is several times further away.
    const clear = best && (!runnerUp
      || runnerUp.distance >= best.distance * BigInt(NEAREST_QUOTE_MARGIN));

    if (!best) {
      verdict = 'unmatched';
    } else if (!clear) {
      verdict = 'ambiguous';
      note = `${scored.length} orders are about equally close to this amount — needs a human`;
    } else if (!isLiveOrder(best.order, now)) {
      // The nearest quote is somebody's, but their order can no longer take a
      // payment. Their money must not fall through to whoever is still queued.
      verdict = 'unmatched';
      note = `closest to order ${best.order.order_id}, which is no longer open — needs a human`;
    } else {
      order = best.order;
      verdict = 'matched';
    }
  }

  // --- 3. A payment made after the quote expired is re-checked at today's price
  //
  // `expires_at` was only ever used for display, so a buyer could sit on a
  // quote, wait for the coin to fall, and pay the frozen amount — a free option
  // on the price. Money that arrives after the window closed still counts, but
  // only if it still covers what the plan costs now.
  if (order && paidAt > 0 && Number(order.expires_at) < paidAt * 1000) {
    const fresh = await quoteStillCovers(db, c.get('cfg'), cfg, order, units);
    if (!fresh.ok) {
      note = `paid ${fresh.shortBy} short of what ${order.fiat_amount} ${order.fiat_currency} `
        + 'costs at today\'s rate, on a quote that had expired — needs a human';
      verdict = 'unmatched';
      order = null;
    }
  }

  if (!order) {
    await db.run(
      `UPDATE chain_transfers SET status = ?, note = ?, updated_at = datetime('now')
       WHERE id = ? AND status <> 'credited'`,
      verdict, note, transfer.id
    );
    return { reason: verdict };
  }

  // Bind the transfer to its order even before it is confirmed, so the buyer's
  // page can say "payment seen, waiting for confirmations" instead of nothing.
  await db.run(
    `UPDATE chain_transfers SET order_id = ?, status = 'seen', note = NULL, updated_at = datetime('now')
     WHERE id = ? AND status <> 'credited'`,
    order.order_id, transfer.id
  );
  await db.run(
    `UPDATE chain_orders SET status = CASE WHEN status = 'new' THEN 'seen' ELSE status END,
       tx_hash = ?, received_units = ?, confirmations = ?, updated_at = datetime('now')
     WHERE id = ? AND credited_at IS NULL`,
    transfer.tx_hash, String(units), Number(transfer.confirmations) || 0, order.id
  );

  const needed = requiredConfirmations(cfg, asset);
  if ((Number(transfer.confirmations) || 0) < needed) {
    return { reason: 'confirming', order, needed, confirmations: Number(transfer.confirmations) || 0 };
  }

  return { ...(await creditOrder(c, cfg, order, transfer, source)), order };
}

/* ------------------------------------------------------------------ *
 * Scanning
 * ------------------------------------------------------------------ */

const CURSOR_KEY = (assetKey) => `chain_cursor:${assetKey}`;
const SCAN_AT_KEY = 'chain_scan_at';

async function readCursor(db, assetKey) {
  try {
    const parsed = JSON.parse(await getSetting(db, CURSOR_KEY(assetKey)) || '{}');
    return { block: Number(parsed.block) || 0 };
  } catch {
    return { block: 0 };
  }
}

/**
 * Stores one transfer, or refreshes the confirmation count of one already
 * known. A row that has already been credited is never rewritten — its amount
 * is the evidence for a membership that has already been granted.
 */
async function recordTransfer(db, transfer) {
  await db.run(
    `INSERT INTO chain_transfers (asset, tx_hash, address, units, block, block_time, confirmations, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(asset, tx_hash) DO UPDATE SET
       units = excluded.units,
       confirmations = MAX(chain_transfers.confirmations, excluded.confirmations),
       block = CASE WHEN chain_transfers.block = 0 THEN excluded.block ELSE chain_transfers.block END,
       block_time = CASE WHEN chain_transfers.block_time = 0 THEN excluded.block_time ELSE chain_transfers.block_time END,
       updated_at = datetime('now')
     WHERE chain_transfers.status <> 'credited'`,
    transfer.asset, transfer.txHash, transfer.address, transfer.units.toString(),
    Number(transfer.block) || 0, Number(transfer.blockTime) || 0,
    Number(transfer.confirmations) || 0,
    transfer.units > 0n ? 'seen' : 'ignored'
  );
  return db.get('SELECT * FROM chain_transfers WHERE asset = ? AND tx_hash = ?', transfer.asset, transfer.txHash);
}

/** Transaction hashes we have already looked at, so a scan never re-fetches them. */
async function knownHashes(db, assetKey) {
  const rows = await db.all(
    `SELECT tx_hash FROM chain_transfers WHERE asset = ? ORDER BY id DESC LIMIT 400`, assetKey
  );
  return new Set(rows.map((r) => String(r.tx_hash)));
}

/**
 * Reads one asset's recent incoming transfers and runs each through matching.
 *
 * Solana is listed signature-by-signature and needs a round trip per unseen
 * one, so `seen` is consulted first and the number of lookups per scan is
 * capped: anything left over is simply picked up by the next scan.
 */
async function scanAsset(c, cfg, asset, { now = Date.now(), source = 'scan' } = {}) {
  const db = c.get('db');
  const cursor = await readCursor(db, asset.key);
  const out = { asset: asset.key, seen: 0, matched: 0, credited: 0, unmatched: 0, error: null };

  let result;
  try {
    if (asset.chain === 'ethereum') {
      result = await fetchIncoming(cfg, asset, {
        sinceBlock: Math.max(0, cursor.block - ETH_CURSOR_LAG_BLOCKS),
      });
    } else {
      const known = await knownHashes(db, asset.key);
      result = await fetchIncoming(cfg, asset, { known, limit: MAX_TX_LOOKUPS_PER_SCAN });
    }
  } catch (err) {
    // A provider that is down must never look like "nothing has been paid".
    out.error = String(err && err.message || err).slice(0, 200);
    console.error(`chain scan failed for ${asset.key}:`, out.error);
    return out;
  }

  const transfers = result.transfers || [];
  // The provider reports where its own reading got to. Taking the cursor from
  // the payments alone would stall it whenever a window held only unrelated
  // traffic, and re-read that same window forever.
  let highestBlock = Math.max(cursor.block, Number(result.highestBlock) || 0);
  for (const transfer of transfers) {
    highestBlock = Math.max(highestBlock, Number(transfer.block) || 0);
    if (transfer.units <= 0n) {
      await recordTransfer(db, transfer);
      continue;
    }
    out.seen += 1;
    const row = await recordTransfer(db, transfer);
    if (!row) continue;
    const verdict = await matchTransfer(c, cfg, row, { now, source });
    if (verdict.granted) out.credited += 1;
    else if (verdict.order) out.matched += 1;
    else if (verdict.reason === 'unmatched' || verdict.reason === 'ambiguous') out.unmatched += 1;
  }

  if (highestBlock > cursor.block) {
    await setSetting(db, CURSOR_KEY(asset.key), JSON.stringify({ block: highestBlock, at: now })).catch(() => {});
  }
  return out;
}

/** Assets with at least one order that could still be paid. */
async function assetsWithLiveOrders(db, cfg, now) {
  const rows = await db.all(
    `SELECT DISTINCT asset FROM chain_orders
      WHERE credited_at IS NULL AND status <> 'cancelled' AND match_until >= ?`, now
  );
  const keys = new Set(rows.map((r) => String(r.asset)));
  return cfg.assets.filter((a) => keys.has(a.key));
}

/**
 * Polls the chains, at most once every `scanIntervalSeconds` across the whole
 * site. Pages Functions have no cron, so this rides along with requests that
 * were happening anyway — the buyer's own status poll, the store page, the
 * admin queue — plus POST /api/crypto/scan for anyone who wants a real cron.
 *
 * Only assets somebody is actually waiting on are polled, so a quiet site makes
 * no upstream calls at all.
 */
async function maybeScan(c, cfg, { force = false, now = Date.now(), only = null, includeIdle = false, source = 'scan' } = {}) {
  if (!cfg.configured) return { skipped: 'unconfigured', results: [] };
  const db = c.get('db');

  if (!force) {
    const last = Number(await getSetting(db, SCAN_AT_KEY).catch(() => 0)) || 0;
    if (now - last < cfg.scanIntervalSeconds * 1000) return { skipped: 'throttled', results: [] };
  }
  // Normally only coins somebody is actually waiting on are polled, so a quiet
  // site makes no upstream calls at all. `includeIdle` is the admin's override,
  // for looking at money that no open order explains.
  let assets = includeIdle ? cfg.assets : await assetsWithLiveOrders(db, cfg, now);
  if (only) assets = assets.filter((a) => a.key === only);
  // Nothing to poll for costs nothing and must not burn the window: an order
  // opened a second later would otherwise wait a whole interval for its turn.
  if (assets.length === 0) return { skipped: 'nothing_pending', results: [] };

  // Claim the window before scanning, so two concurrent requests don't both
  // poll. A single-asset scan deliberately does NOT claim it: narrowing to one
  // coin must not starve the others of their turn for a whole interval.
  if (!only) await setSetting(db, SCAN_AT_KEY, String(now)).catch(() => {});

  const results = [];
  for (const asset of assets) results.push(await scanAsset(c, cfg, asset, { now, source }));
  return { skipped: null, results };
}

/**
 * Re-checks one specific order right now, ignoring the global throttle. This is
 * what the buyer's own status poll uses, so the person actually staring at the
 * page gets the fastest answer.
 */
async function reconcileOrder(c, cfg, order, { now = Date.now(), source = 'status check' } = {}) {
  if (!cfg.configured || order.credited_at) return { credited: Boolean(order.credited_at) };
  const asset = cfg.byKey[order.asset];
  if (!asset) return { credited: false, error: 'asset no longer offered' };

  // A transfer already bound to this order may just have gained confirmations —
  // re-matching it is cheap and needs no network call at all.
  const db = c.get('db');
  const bound = await db.get(
    "SELECT * FROM chain_transfers WHERE order_id = ? AND status <> 'credited' ORDER BY id DESC LIMIT 1",
    order.order_id
  );

  const result = await scanAsset(c, cfg, asset, { now, source });
  if (result.error && bound) {
    // Provider down, but we already know about this payment — try what we have.
    await matchTransfer(c, cfg, bound, { now, source }).catch(() => {});
  }
  const fresh = await db.get('SELECT * FROM chain_orders WHERE id = ?', order.id);
  return { credited: Boolean(fresh && fresh.credited_at), order: fresh, scan: result };
}

/**
 * The buyer's escape hatch: they paste the transaction hash their wallet gave
 * them and we go and read exactly that transaction.
 *
 * This is a hint about WHERE to look and nothing more. The amount, recipient
 * and confirmation count all still come from the chain, and the transfer still
 * has to match an amount we quoted — so pasting somebody else's transaction, or
 * one that paid a different address, grants nothing.
 */
async function submitTransactionRef(c, cfg, order, reference, { now = Date.now() } = {}) {
  const db = c.get('db');
  const asset = cfg.byKey[order.asset];
  if (!asset) return { ok: false, reason: 'unknown_asset' };
  if (!isTransactionRef(asset.chain, reference)) return { ok: false, reason: 'bad_reference' };

  const ref = String(reference).trim();
  const existing = await db.get(
    'SELECT * FROM chain_transfers WHERE asset = ? AND tx_hash = ?',
    asset.key, asset.chain === 'ethereum' ? ref.toLowerCase() : ref
  );
  if (existing && existing.status === 'credited' && existing.order_id !== order.order_id) {
    return { ok: false, reason: 'already_used' };
  }

  let transfer;
  try {
    transfer = await fetchTransaction(cfg, asset, ref);
  } catch (err) {
    console.error('on-chain transaction lookup failed:', err);
    return { ok: false, reason: 'lookup_failed' };
  }
  if (!transfer) return { ok: false, reason: 'not_found' };

  const row = await recordTransfer(db, transfer);
  if (!row) return { ok: false, reason: 'lookup_failed' };
  const verdict = await matchTransfer(c, cfg, row, { now, source: 'buyer-submitted transaction' });
  return { ok: true, verdict, transfer: row };
}

/**
 * A member's own unfinished orders, re-checked on a page they were loading
 * anyway. Cheap: it only runs the shared throttled scan.
 */
async function reconcileForUser(c, cfg, userId, { now = Date.now() } = {}) {
  if (!cfg.configured) return { skipped: 'unconfigured' };
  const open = await c.get('db').get(
    `SELECT id FROM chain_orders
      WHERE user_id = ? AND credited_at IS NULL AND status <> 'cancelled' AND match_until >= ? LIMIT 1`,
    userId, now
  );
  if (!open) return { skipped: 'nothing_pending' };
  return maybeScan(c, cfg, { now, source: 'store page' });
}

/* ------------------------------------------------------------------ *
 * Presentation helpers
 * ------------------------------------------------------------------ */

/** Everything a pay page needs about an order, already formatted. */
function orderView(cfg, order) {
  const asset = cfg.byKey[order.asset] || null;
  const expected = parseUnits(order.expected_units) ?? 0n;
  const received = parseUnits(order.received_units);
  const decimals = Number(order.decimals);
  return {
    orderId: order.order_id,
    asset,
    assetKey: order.asset,
    symbol: asset ? asset.symbol : String(order.asset).toUpperCase(),
    network: asset ? asset.network : '',
    address: order.address,
    amount: fromUnits(expected, decimals),
    amountUnits: expected.toString(),
    received: received === null ? null : fromUnits(received, decimals),
    shortfall: received !== null && received < expected ? fromUnits(expected - received, decimals) : null,
    fiat: `${order.fiat_amount} ${order.fiat_currency}`,
    rate: order.rate,
    planName: order.plan_name,
    periodDays: order.period_days,
    status: order.status,
    credited: Boolean(order.credited_at),
    confirmations: Number(order.confirmations) || 0,
    needed: asset ? requiredConfirmations(cfg, asset) : 0,
    txHash: order.tx_hash || '',
    explorer: asset && order.tx_hash ? explorerLink(asset, order.tx_hash) : '',
    uri: asset ? paymentUri(cfg, asset, expected) : '',
    expiresAt: Number(order.expires_at),
    matchUntil: Number(order.match_until),
    expired: !order.credited_at && Number(order.expires_at) <= Date.now(),
  };
}

/** Live quotes for the store page, so each coin can show its own price. */
async function quoteAll(db, env, cfg, plan) {
  const out = [];
  for (const asset of cfg.assets) {
    const quote = await quoteAsset(db, env, cfg, asset, plan.amount).catch(() => null);
    out.push({
      asset,
      amount: quote ? fromUnits(quote.base, asset.decimals) : null,
      rate: quote ? quote.rate : null,
      stale: Boolean(quote && quote.stale),
    });
  }
  return out;
}

export {
  onchainConfig, createOrder, RESOLVED_TRANSFER_STATUSES, isLiveOrder, quoteAsset, quoteAll, uniqueExpected, minimumFor,
  matchTransfer, creditOrder, scanAsset, maybeScan, reconcileOrder, reconcileForUser,
  submitTransactionRef, recordTransfer, orderView, LIVE_ORDERS_SQL, TAG_SLOTS,
};
