/**
 * Direct-to-wallet crypto checkout: ETH, SOL and USDT paid to the operator's
 * own addresses, with membership granted automatically once the payment
 * confirms on chain.
 *
 *   POST /upgrade/crypto      auth + CSRF + rate-limited — quotes the plan in
 *                             the chosen coin and opens an order.
 *   GET  /pay/:order          the payment page: exact amount, address, QR.
 *   GET  /pay/:order/status   JSON the page polls; also nudges a chain scan, so
 *                             the person watching the page gets the fastest answer.
 *   POST /pay/:order/tx       "here's my transaction hash" — the fallback for a
 *                             payment the scan hasn't picked up.
 *   POST /pay/:order/cancel   drop an order the buyer decided against.
 *   GET|POST /api/crypto/scan a shared-secret endpoint so an external cron can
 *                             keep watching while nobody is on the site.
 *
 * Security model: the price comes from the catalogue, the address from config,
 * and the amount from a rate feed — the buyer's form carries only a plan slug
 * and a coin name. The only thing a buyer can supply is a transaction hash, and
 * that just says where to look: the transfer is still read from the chain and
 * still has to match an amount we quoted. Nothing here can grant a membership
 * that the chain does not back.
 */
import * as views from "./views/pay.js";
import * as limits from "./limits.js";
import { audit, requireAuth, setFlash, formBody, clientIp } from "./middleware.js";
import { tooMany } from "./routes-main.js";
import { isStaff, normalizeTier } from "./tiers.js";
import { resolvePlan, resolvePlans } from "./plans.js";
import { safeEqual } from "./crypto.js";
import {
  onchainConfig, createOrder, maybeScan, submitTransactionRef, orderView,
} from "./onchain.js";

/** Why an order couldn't be opened, in words a buyer can act on. */
const ORDER_ERRORS = {
  unknown_asset: 'That coin is not accepted right now. Pick another one.',
  no_rate: 'Live exchange rates are unavailable at the moment, so we can’t quote a price. '
    + 'Please try again in a minute.',
  no_slot: 'Too many payments are in flight for that coin right now. Try again in a few minutes, '
    + 'or pick a different coin.',
};

/** Why a submitted transaction hash didn't help. */
const TX_ERRORS = {
  bad_reference: 'That doesn’t look like a transaction hash for this network. Copy it from your '
    + 'wallet’s transaction history.',
  not_found: 'We couldn’t find a payment to our address in that transaction. Double-check you '
    + 'copied the right one — and note it has to be confirmed on chain before it shows up.',
  already_used: 'That transaction has already been credited to another order.',
  lookup_failed: 'We couldn’t reach the network to check that transaction. Try again shortly — '
    + 'your payment is safe either way, and the automatic check keeps running.',
  unknown_asset: 'That coin is no longer accepted, so this order can’t be completed.',
};

function register(app) {
  /** The order named in the path, if it belongs to the caller (or they're staff). */
  const findOrder = async (c) => {
    const id = String(c.req.param('order') || '').slice(0, 64);
    if (!/^[a-f0-9]{8,64}$/.test(id)) return null;
    const user = c.get('user');
    if (!user) return null;
    const row = await c.get('db').get('SELECT * FROM chain_orders WHERE order_id = ?', id);
    if (!row) return null;
    if (Number(row.user_id) !== Number(user.id) && !isStaff(user)) return null;
    return row;
  };

  // Open an order: pick the plan out of the catalogue, quote it in the chosen
  // coin at a rate we freeze onto the row, and send the buyer to the pay page.
  app.post('/upgrade/crypto', async (c) => {
    const gate = requireAuth(c);
    if (gate) return gate;

    const db = c.get('db');
    const env = c.get('cfg');
    const user = c.get('user');
    const cfg = onchainConfig(env);

    if (!cfg.configured) {
      setFlash(c, 'error', 'Crypto payments are not available right now. Please try again later.');
      return c.redirect('/buy', 302);
    }

    // Don't take money for access the account already has.
    if (isStaff(user)) {
      setFlash(c, 'success', 'Your account already has full access beyond Paid, so no purchase is needed.');
      return c.redirect('/buy', 302);
    }
    if (normalizeTier(user.tier) === 'paid' && (user.paid_until === null || user.paid_until === undefined)) {
      setFlash(c, 'success', 'You already have a lifetime Paid membership, so there is nothing to buy.');
      return c.redirect('/buy', 302);
    }

    // Each order costs a rate lookup and burns one of the unique-amount slots
    // for its coin, so this is abuse control rather than politeness.
    const verdict = await limits.check(db, 'cryptoorder', String(user.id), env);
    if (!verdict.ok) return tooMany(c, verdict.retryAfterSec);

    const body = await formBody(c);
    const assetKey = String(body.asset || '').trim().toLowerCase().slice(0, 24);
    const requested = String(body.plan || '').trim();
    const plan = requested
      ? await resolvePlan(db, env, requested)
      : ((await resolvePlans(db, env))[0] || null);
    if (!plan) {
      setFlash(c, 'error', 'That membership plan is not available.');
      return c.redirect('/buy', 302);
    }

    const { order, error } = await createOrder(c, cfg, { user, plan, assetKey });
    if (error) {
      await audit(c, 'chain_order_failed', {
        userId: user.id, username: user.username,
        detail: `${plan.id} in ${assetKey || '(none)'}: ${error}`,
      });
      setFlash(c, 'error', ORDER_ERRORS[error] || 'Could not start that payment. Please try again.');
      return c.redirect('/buy', 302);
    }

    return c.redirect(`/pay/${order.order_id}`, 302);
  });

  // The payment page. Loading it also nudges the (throttled) chain scan, so a
  // buyer who pays and refreshes gets credited without waiting for anything else.
  app.get('/pay/:order', async (c) => {
    const gate = requireAuth(c);
    if (gate) return gate;
    const cfg = onchainConfig(c.get('cfg'));
    let order = await findOrder(c);
    if (!order) {
      return c.html(views.payNotFound(c.get('view')), 404);
    }

    if (!order.credited_at && cfg.configured) {
      await maybeScan(c, cfg, { source: 'pay page' }).catch((err) => {
        console.error('chain scan failed during pay page load:', err);
      });
      order = await c.get('db').get('SELECT * FROM chain_orders WHERE id = ?', order.id);
    }

    c.header('Cache-Control', 'no-store');
    return c.html(views.payPage(c.get('view'), { order: orderView(cfg, order), cfg }));
  });

  // What the page polls. Deliberately small and cheap: the scan behind it is
  // throttled site-wide, so a hundred open tabs still cost one poll per window.
  app.get('/pay/:order/status', async (c) => {
    c.header('Cache-Control', 'no-store');
    const gate = requireAuth(c);
    if (gate) return c.json({ ok: false, error: 'auth' }, 401);
    const cfg = onchainConfig(c.get('cfg'));
    let order = await findOrder(c);
    if (!order) return c.json({ ok: false, error: 'not_found' }, 404);

    let scan = null;
    if (!order.credited_at && cfg.configured) {
      scan = await maybeScan(c, cfg, { source: 'status poll' }).catch(() => null);
      order = await c.get('db').get('SELECT * FROM chain_orders WHERE id = ?', order.id);
    }

    const view = orderView(cfg, order);
    return c.json({
      ok: true,
      status: view.status,
      credited: view.credited,
      confirmations: view.confirmations,
      needed: view.needed,
      received: view.received,
      shortfall: view.shortfall,
      txHash: view.txHash,
      explorer: view.explorer,
      expired: view.expired,
      // Told plainly so the page can say "we couldn't reach the network" rather
      // than silently looking like nothing has arrived.
      scanned: Boolean(scan && !scan.skipped),
      scanError: scan && scan.results ? (scan.results.find((r) => r.error) || {}).error || null : null,
    });
  });

  // The buyer's escape hatch. Their hash only tells us where to look — the
  // amount, the recipient and the confirmations still come from the chain.
  app.post('/pay/:order/tx', async (c) => {
    const gate = requireAuth(c);
    if (gate) return gate;
    const order = await findOrder(c);
    if (!order) return c.html(views.payNotFound(c.get('view')), 404);

    const user = c.get('user');
    const cfg = onchainConfig(c.get('cfg'));
    const verdict = await limits.check(c.get('db'), 'cryptotx', String(user.id), c.get('cfg'));
    if (!verdict.ok) return tooMany(c, verdict.retryAfterSec);

    const body = await formBody(c);
    const reference = String(body.txid || '').trim().slice(0, 128);
    const result = await submitTransactionRef(c, cfg, order, reference);

    if (!result.ok) {
      await audit(c, 'chain_tx_submitted', {
        userId: user.id, username: user.username,
        detail: `order ${order.order_id}: ${result.reason} for ${reference.slice(0, 24)}…`,
      });
      setFlash(c, 'error', TX_ERRORS[result.reason] || 'That transaction could not be checked.');
      return c.redirect(`/pay/${order.order_id}`, 302);
    }

    const reason = result.verdict && result.verdict.reason;
    if (result.verdict && result.verdict.granted) {
      setFlash(c, 'success', 'Payment confirmed — your account is now Paid. Thank you!');
    } else if (reason === 'confirming') {
      setFlash(c, 'success', 'Found it. Waiting for the network to confirm — this page updates itself.');
    } else if (reason === 'already') {
      setFlash(c, 'success', 'That payment has already been credited.');
    } else if (reason === 'ambiguous') {
      setFlash(c, 'error', 'We found that payment but it doesn’t match one specific order, so a '
        + 'human needs to look at it. Nothing is lost — contact us and we’ll sort it out.');
    } else {
      setFlash(c, 'error', 'We found that transaction, but the amount doesn’t match this order. '
        + 'It has been recorded and staff can credit it manually.');
    }
    return c.redirect(`/pay/${order.order_id}`, 302);
  });

  app.post('/pay/:order/cancel', async (c) => {
    const gate = requireAuth(c);
    if (gate) return gate;
    const order = await findOrder(c);
    if (!order) return c.html(views.payNotFound(c.get('view')), 404);

    // Never cancel out from under money that has already arrived: an order with
    // a transaction against it stays open so it can still be credited.
    const claim = await c.get('db').run(
      `UPDATE chain_orders SET status = 'cancelled', updated_at = datetime('now')
       WHERE id = ? AND credited_at IS NULL AND tx_hash IS NULL`,
      order.id
    );
    setFlash(c, claim.changes > 0 ? 'success' : 'error', claim.changes > 0
      ? 'Payment cancelled. Nothing was charged.'
      : 'That payment can’t be cancelled — a transaction has already been matched to it.');
    return c.redirect('/buy', 302);
  });

  /**
   * Lets an external scheduler drive the watcher, so payments confirm while
   * nobody is browsing. Under /api/ (CSRF-exempt — it carries no cookie
   * authority) and authenticated by CRYPTO_SCAN_SECRET instead. GET is accepted
   * because most free cron services only send GET.
   */
  const scan = async (c) => {
    c.header('Cache-Control', 'no-store');
    const cfg = onchainConfig(c.get('cfg'));
    if (!cfg.configured) return c.json({ ok: false, error: 'unconfigured' }, 503);
    if (!cfg.scanSecret) return c.json({ ok: false, error: 'scan_secret_not_set' }, 503);

    // Throttle BEFORE checking the secret, so an unauthenticated flood is capped
    // too — otherwise the rate limit only ever applies to the legitimate cron.
    const verdict = await limits.check(c.get('db'), 'cryptoscan', clientIp(c), c.get('cfg'));
    if (!verdict.ok) {
      c.header('Retry-After', String(verdict.retryAfterSec));
      return c.json({ ok: false, error: 'rate_limited' }, 429);
    }

    // The header form is preferred and documented first: a secret in the query
    // string is written into request logs, the scheduler's run history, and any
    // workflow file that holds the URL.
    const url = new URL(c.req.url);
    const provided = String(c.req.header('x-crypto-scan-secret') || url.searchParams.get('key') || '');
    if (!provided || !safeEqual(provided, cfg.scanSecret)) {
      return c.json({ ok: false, error: 'unauthorized' }, 401);
    }

    const result = await maybeScan(c, cfg, { force: true, source: 'cron' });
    return c.json({ ok: true, skipped: result.skipped, results: result.results });
  };
  app.get('/api/crypto/scan', scan);
  app.post('/api/crypto/scan', scan);
}

export { register, ORDER_ERRORS, TX_ERRORS };
