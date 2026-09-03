/**
 * Turning a settled BTCPay invoice into membership.
 *
 * This is the ONLY place that grants Paid for a payment. It was extracted from
 * the webhook handler so that the webhook is no longer the sole way an invoice
 * gets credited: the same verified path also runs when the buyer lands back on
 * the thank-you page, when they next load /buy or /profile with an open
 * payment, and when staff open the payments queue.
 *
 * That matters because a webhook is a single point of failure — it can be
 * unconfigured (the store is still being set up), mis-signed, dropped by a
 * network blip, or exhausted after BTCPay gives up retrying. Money has left the
 * buyer's wallet either way, so every one of those cases must still fulfil.
 *
 * Nothing here trusts a caller: whatever triggers it, the invoice is re-fetched
 * from BTCPay with the store key and re-validated (status, amount, currency and
 * order id) before a single row is touched.
 */
import { getInvoice } from "./btcpay.js";
import { audit } from "./middleware.js";
import { isStaff } from "./tiers.js";
import { grantMembership } from "./membership.js";

/** Invoice statuses BTCPay reports as fully paid + confirmed. */
const SETTLED_STATUSES = new Set(['settled', 'complete', 'confirmed']);

/**
 * Verifies one payment against BTCPay and credits it if it really settled.
 *
 * Returns a verdict rather than an HTTP response, so the webhook can map it to
 * the status codes BTCPay's retry logic expects while the in-page callers just
 * read `granted`:
 *
 *   { granted: true }                       membership applied by this call
 *   { reason: 'already' }                   a previous call already credited it
 *   { reason: 'verify_failed', retry }      BTCPay unreachable — try again later
 *   { reason: 'not_settled', terminal }     not (yet) paid; terminal = expired/invalid
 *   { reason: 'mismatch' }                  invoice doesn't match what we priced
 *   { reason: 'user_gone' }                 buyer's account no longer exists
 *   { reason: 'grant_failed' }              claim rolled back; safe to retry
 */
async function verifyAndCredit(c, cfg, payment, source = 'webhook') {
  const db = c.get('db');

  // Cheap pre-check. The authoritative guard is the atomic claim below.
  if (payment.credited_at) return { granted: false, reason: 'already' };
  if (!payment.invoice_id) return { granted: false, reason: 'not_settled', terminal: false };

  let invoice;
  try {
    invoice = await getInvoice(cfg, payment.invoice_id);
  } catch (err) {
    console.error('BTCPay getInvoice failed during', source, err);
    return { granted: false, reason: 'verify_failed', retry: true };
  }

  const invStatus = String(invoice.status || '').toLowerCase();
  if (!SETTLED_STATUSES.has(invStatus)) {
    const terminal = invStatus === 'expired' || invStatus === 'invalid';
    // Record a terminal state so the buyer's page and the admin queue stop
    // showing it as pending — but never over an already-credited row.
    if (terminal && !payment.credited_at) {
      await db.run(
        "UPDATE payments SET status = ?, updated_at = datetime('now') WHERE id = ? AND credited_at IS NULL",
        invStatus === 'expired' ? 'expired' : 'invalid', payment.id
      );
    } else if (invStatus === 'processing') {
      await db.run(
        "UPDATE payments SET status = 'processing', updated_at = datetime('now') WHERE id = ? AND credited_at IS NULL",
        payment.id
      );
    }
    return { granted: false, reason: 'not_settled', terminal, status: invoice.status };
  }

  // Settled — but only for the exact thing we priced at checkout.
  const amountOk = Number(invoice.amount) === Number(payment.amount);
  const currencyOk = String(invoice.currency || '').toUpperCase() === String(payment.currency).toUpperCase();
  const orderOk = !invoice.metadata || !invoice.metadata.orderId
    || String(invoice.metadata.orderId) === String(payment.order_id);
  if (!amountOk || !currencyOk || !orderOk) {
    await audit(c, 'btcpay_webhook_rejected', {
      userId: payment.user_id, username: payment.username,
      detail: `order ${payment.order_id}: mismatch amount=${invoice.amount}/${payment.amount} `
        + `cur=${invoice.currency}/${payment.currency} orderOk=${orderOk} (${source})`,
    });
    return { granted: false, reason: 'mismatch' };
  }

  // Look up the buyer BEFORE claiming, so a missing user never strands a claim.
  const target = await db.get('SELECT id, tier, paid_until FROM users WHERE id = ?', payment.user_id);

  // Claim atomically: only the caller that flips credited_at from NULL wins, so
  // a webhook delivery and a page load racing each other grant once between them.
  const claim = await db.run(
    "UPDATE payments SET status = 'settled', credited_at = ?, updated_at = datetime('now') WHERE id = ? AND credited_at IS NULL",
    Date.now(), payment.id
  );
  if (claim.changes === 0) return { granted: false, reason: 'already' };

  if (!target) {
    await audit(c, 'btcpay_webhook_rejected', {
      username: payment.username, detail: `order ${payment.order_id}: user gone (${source})`,
    });
    return { granted: false, reason: 'user_gone' };
  }

  // Staff already sit above Paid and never expire — record the payment but don't
  // touch their tier. A failed grant rolls the claim back, so the next trigger
  // retries it rather than leaving the member charged-but-not-upgraded.
  try {
    await grantMembership(db, target, payment.period_days);
  } catch (err) {
    await db.run(
      "UPDATE payments SET credited_at = NULL, status = 'processing', updated_at = datetime('now') WHERE id = ?",
      payment.id
    ).catch(() => {});
    console.error('BTCPay grant failed after credit claim:', err);
    return { granted: false, reason: 'grant_failed' };
  }
  // No session teardown: loadContext reads tier/paid_until fresh on every
  // request, so the upgrade is live on the member's next page load.

  await audit(c, 'membership_granted', {
    userId: target.id, username: payment.username,
    detail: `order ${payment.order_id} invoice ${payment.invoice_id} — ${payment.amount} ${payment.currency}`
      + (payment.period_days ? ` for ${payment.period_days}d` : ' lifetime')
      + (source === 'webhook' ? '' : ` (via ${source})`),
  });
  return { granted: true, staff: isStaff(target) };
}

/** Payments that could still turn into a membership on their own. */
const OPEN_PAYMENTS_SQL = `SELECT * FROM payments
  WHERE credited_at IS NULL AND invoice_id IS NOT NULL AND status IN ('new', 'processing')`;

/**
 * Re-checks a member's own unfinished payments. Cheap and targeted — it runs on
 * pages that member was already loading, so someone who paid and wandered off
 * gets credited the moment they come back to the site at all, webhook or no
 * webhook.
 */
async function reconcileForUser(c, cfg, userId, limit = 3) {
  if (!cfg.configured) return [];
  const rows = await c.get('db').all(
    `${OPEN_PAYMENTS_SQL} AND user_id = ? ORDER BY id DESC LIMIT ?`, userId, limit
  );
  const out = [];
  for (const payment of rows) out.push(await verifyAndCredit(c, cfg, payment, 'status check'));
  return out;
}

/**
 * Sweeps the oldest unfinished payments across every member — the safety net
 * for a buyer who paid and never returned. Deliberately small and bounded: each
 * row costs one outbound call to BTCPay, so this trickles rather than storms.
 * Rows younger than two minutes are skipped (the invoice is almost certainly
 * still open) and rows older than a week are left to the admin queue.
 */
async function sweepOpenPayments(c, cfg, limit = 5) {
  if (!cfg.configured) return [];
  const rows = await c.get('db').all(
    `${OPEN_PAYMENTS_SQL}
       AND created_at <= datetime('now', '-2 minutes')
       AND created_at >= datetime('now', '-7 days')
     ORDER BY updated_at ASC LIMIT ?`, limit
  );
  const out = [];
  for (const payment of rows) out.push(await verifyAndCredit(c, cfg, payment, 'sweep'));
  return out;
}

export { verifyAndCredit, reconcileForUser, sweepOpenPayments, SETTLED_STATUSES };
