/**
 * Crypto membership checkout, backed by a self-hosted BTCPay Server.
 *
 *   POST /upgrade/checkout   auth + CSRF + rate-limited — creates a BTCPay
 *                            invoice and redirects the member to it.
 *   GET  /upgrade/thanks     landing page BTCPay redirects back to after pay.
 *   POST /api/btcpay/webhook BTCPay -> us. Signed with the store's webhook
 *                            secret (HMAC-SHA256 over the raw body); on a
 *                            confirmed ("Settled") invoice it grants Paid.
 *
 * Security model: the price/currency/period are server config, never taken
 * from the request. Membership is only ever granted by a webhook whose
 * signature verifies AND whose invoice, re-fetched from BTCPay, is Settled with
 * a matching amount/currency/order. Crediting is idempotent — a replayed
 * "Settled" webhook can never grant a second period.
 */
import * as views from "./views/site.js";
import * as limits from "./limits.js";
import { newToken } from "./crypto.js";
import { audit, requireAuth, clientIp, setFlash } from "./middleware.js";
import { tooMany } from "./routes-main.js";
import { isStaff, normalizeTier } from "./tiers.js";
import { btcpayConfig, createInvoice, getInvoice, verifyWebhookSignature } from "./btcpay.js";

/** Invoice statuses BTCPay reports as fully paid + confirmed. */
const SETTLED_STATUSES = new Set(['settled', 'complete', 'confirmed']);

function register(app) {
  // Start a purchase: create a pending payment row + a BTCPay invoice, then
  // hand the member off to BTCPay's hosted checkout.
  app.post('/upgrade/checkout', async (c) => {
    const gate = requireAuth(c);
    if (gate) return gate;

    const db = c.get('db');
    const env = c.get('cfg');
    const user = c.get('user');
    const cfg = btcpayConfig(env);

    if (!cfg.configured) {
      setFlash(c, 'error', 'Crypto checkout is not available right now. Please try again later.');
      return c.redirect('/upgrade', 302);
    }

    // Don't take money for access the account already has. Staff sit above Paid,
    // and a lifetime member has nothing to buy; dated Paid members may renew.
    if (isStaff(user)) {
      setFlash(c, 'success', 'Your account already has full access beyond Paid, so no purchase is needed.');
      return c.redirect('/upgrade', 302);
    }
    if (normalizeTier(user.tier) === 'paid' && (user.paid_until === null || user.paid_until === undefined)) {
      setFlash(c, 'success', 'You already have a lifetime Paid membership, so there is nothing to buy.');
      return c.redirect('/upgrade', 302);
    }

    // Per-member cap on how many invoices can be spun up per hour — an invoice
    // is a real object created on the BTCPay server, so this is abuse control.
    const verdict = await limits.check(db, 'checkout', String(user.id), env);
    if (!verdict.ok) return tooMany(c, verdict.retryAfterSec);

    const orderId = newToken(16);
    // Snapshot price/period onto the row NOW, so a later config change can't
    // retroactively alter an in-flight order.
    await db.run(
      `INSERT INTO payments (order_id, user_id, username, amount, currency, period_days, status)
       VALUES (?, ?, ?, ?, ?, ?, 'new')`,
      orderId, user.id, user.username, cfg.amount, cfg.currency, cfg.periodDays
    );

    const origin = new URL(c.req.url).origin;
    const redirectUrl = `${origin}/upgrade/thanks?order=${encodeURIComponent(orderId)}`;

    try {
      const invoice = await createInvoice(cfg, {
        orderId, userId: user.id, username: user.username, redirectUrl,
      });
      await db.run(
        "UPDATE payments SET invoice_id = ?, updated_at = datetime('now') WHERE order_id = ?",
        invoice.id, orderId
      );
      await audit(c, 'checkout_created', {
        userId: user.id, username: user.username,
        detail: `order ${orderId} invoice ${invoice.id}`,
      });
      return c.redirect(invoice.checkoutLink, 302);
    } catch (err) {
      await db.run(
        "UPDATE payments SET status = 'invalid', updated_at = datetime('now') WHERE order_id = ?",
        orderId
      );
      await audit(c, 'checkout_failed', {
        userId: user.id, username: user.username,
        detail: `order ${orderId}: ${String(err && err.message || err).slice(0, 160)}`,
      });
      console.error('BTCPay checkout failed:', err);
      setFlash(c, 'error', 'Could not start checkout: the payment server was unreachable. Please try again in a moment.');
      return c.redirect('/upgrade', 302);
    }
  });

  // Where BTCPay sends the member back after they pay. The upgrade itself is
  // applied by the webhook, not here — this page just reflects current status.
  app.get('/upgrade/thanks', async (c) => {
    const gate = requireAuth(c);
    if (gate) return gate;
    const db = c.get('db');
    const user = c.get('user');
    const order = String(new URL(c.req.url).searchParams.get('order') || '').slice(0, 64);
    const payment = order
      ? await db.get('SELECT status, credited_at FROM payments WHERE order_id = ? AND user_id = ?', order, user.id)
      : null;
    return c.html(views.upgradeThanksPage(c.get('view'), { payment }));
  });

  // BTCPay -> us. Not CSRF-protected (it's under /api/, which the CSRF
  // middleware exempts) because it carries no cookie authority; it is
  // authenticated by the HMAC signature instead.
  app.post('/api/btcpay/webhook', async (c) => {
    c.header('Cache-Control', 'no-store');
    const db = c.get('db');
    const cfg = btcpayConfig(c.get('cfg'));
    if (!cfg.configured) return c.json({ ok: false, error: 'unconfigured' }, 503);

    // Read the EXACT bytes BTCPay signed. The CSRF middleware skips /api/, so
    // the body has not been consumed upstream.
    const raw = await c.req.raw.text();
    const signature = c.req.header('btcpay-sig');
    const valid = await verifyWebhookSignature(cfg.webhookSecret, raw, signature);
    if (!valid) {
      await audit(c, 'btcpay_webhook_rejected', { detail: 'bad or missing signature' });
      return c.json({ ok: false, error: 'invalid_signature' }, 400);
    }

    let event;
    try { event = JSON.parse(raw); } catch { return c.json({ ok: false, error: 'bad_json' }, 400); }

    const type = String(event.type || '');
    const invoiceId = String(event.invoiceId || '');
    const eventStoreId = String(event.storeId || '');

    // Only ever act on our own store.
    if (eventStoreId && eventStoreId !== cfg.storeId) {
      return c.json({ ok: true, ignored: 'other_store' }, 200);
    }
    if (!invoiceId) return c.json({ ok: true, ignored: 'no_invoice' }, 200);

    const payment = await db.get('SELECT * FROM payments WHERE invoice_id = ?', invoiceId);
    // Unknown invoice (e.g. one created outside this flow) — acknowledge so
    // BTCPay stops retrying, but do nothing.
    if (!payment) return c.json({ ok: true, ignored: 'unknown_invoice' }, 200);

    // Non-terminal / negative states: record for visibility, never grant.
    if (type === 'InvoiceProcessing') {
      if (!payment.credited_at) {
        await db.run("UPDATE payments SET status = 'processing', updated_at = datetime('now') WHERE id = ?", payment.id);
      }
      return c.json({ ok: true }, 200);
    }
    if (type === 'InvoiceExpired' || type === 'InvoiceInvalid') {
      if (!payment.credited_at) {
        const status = type === 'InvoiceExpired' ? 'expired' : 'invalid';
        await db.run("UPDATE payments SET status = ?, updated_at = datetime('now') WHERE id = ?", status, payment.id);
      }
      return c.json({ ok: true }, 200);
    }
    if (type !== 'InvoiceSettled') {
      // InvoiceCreated, InvoiceReceivedPayment, InvoicePaymentSettled, the
      // webhook test ping, etc. — nothing to do.
      return c.json({ ok: true, ignored: type || 'unhandled' }, 200);
    }

    // --- InvoiceSettled: the only path that grants membership ---

    // Idempotency: already credited by an earlier delivery of this event.
    if (payment.credited_at) return c.json({ ok: true, already: true }, 200);

    // Never trust the webhook body's own amount/status. Re-fetch the invoice
    // from BTCPay with the store key and re-validate from scratch. A transient
    // fetch failure returns 5xx so BTCPay retries later.
    let invoice;
    try {
      invoice = await getInvoice(cfg, invoiceId);
    } catch (err) {
      console.error('BTCPay getInvoice failed in webhook:', err);
      return c.json({ ok: false, error: 'verify_failed' }, 502);
    }

    const invStatus = String(invoice.status || '').toLowerCase();
    if (!SETTLED_STATUSES.has(invStatus)) {
      // Signed webhook said Settled but the store doesn't agree yet. If the
      // invoice is still New/Processing this is likely store-side lag between
      // the webhook firing and the API reflecting it — ask BTCPay to retry (503)
      // rather than permanently dropping a real settlement. Only genuinely
      // terminal states (Expired/Invalid) are acknowledged as final.
      const terminal = invStatus === 'expired' || invStatus === 'invalid';
      await audit(c, 'btcpay_webhook_rejected', {
        userId: payment.user_id, username: payment.username,
        detail: `order ${payment.order_id}: status ${invoice.status} not settled`,
      });
      return c.json({ ok: false, error: 'not_settled' }, terminal ? 200 : 503);
    }

    // Amount, currency and order must match what we priced at checkout.
    const amountOk = Number(invoice.amount) === Number(payment.amount);
    const currencyOk = String(invoice.currency || '').toUpperCase() === String(payment.currency).toUpperCase();
    const orderOk = !invoice.metadata || !invoice.metadata.orderId
      || String(invoice.metadata.orderId) === String(payment.order_id);
    if (!amountOk || !currencyOk || !orderOk) {
      await audit(c, 'btcpay_webhook_rejected', {
        userId: payment.user_id, username: payment.username,
        detail: `order ${payment.order_id}: mismatch amount=${invoice.amount}/${payment.amount} `
          + `cur=${invoice.currency}/${payment.currency} orderOk=${orderOk}`,
      });
      return c.json({ ok: false, error: 'mismatch' }, 200);
    }

    // Look up the buyer BEFORE claiming the credit, so a missing user never
    // leaves a credit-claim stranded.
    const target = await db.get('SELECT id, tier, paid_until FROM users WHERE id = ?', payment.user_id);

    // Claim the credit atomically: only the delivery that flips credited_at
    // from NULL wins, so concurrent deliveries can't double-grant.
    const claim = await db.run(
      "UPDATE payments SET status = 'settled', credited_at = ?, updated_at = datetime('now') WHERE id = ? AND credited_at IS NULL",
      Date.now(), payment.id
    );
    if (claim.changes === 0) return c.json({ ok: true, already: true }, 200);

    if (!target) {
      // A deleted user cascades its payment rows, so this is nearly impossible —
      // acknowledge (credit already claimed) so BTCPay stops retrying.
      await audit(c, 'btcpay_webhook_rejected', {
        username: payment.username, detail: `order ${payment.order_id}: user gone`,
      });
      return c.json({ ok: true, ignored: 'user_gone' }, 200);
    }

    // Staff already sit above Paid and never expire — record the payment but
    // don't touch their tier. Everyone else is granted/renewed Paid. The new
    // expiry is computed in SQL against the row's LIVE value (not a value read
    // earlier), so two invoices settling at once extend rather than clobber
    // each other. If the grant fails we roll the claim back so BTCPay's retry
    // re-processes it, rather than leaving the member charged-but-not-upgraded.
    if (!isStaff(target)) {
      const periodDays = payment.period_days === null || payment.period_days === undefined
        ? null : Number(payment.period_days);
      try {
        if (periodDays === null) {
          // Lifetime purchase.
          await db.run("UPDATE users SET tier = 'paid', paid_until = NULL WHERE id = ?", target.id);
        } else {
          const ms = Math.floor(periodDays) * 86_400_000;
          const now = Date.now();
          await db.run(
            `UPDATE users SET tier = 'paid', paid_until = CASE
               WHEN tier = 'paid' AND paid_until IS NULL THEN NULL          -- keep an existing lifetime
               WHEN paid_until IS NULL OR paid_until < ? THEN ? + ?         -- new/expired: start from now
               ELSE paid_until + ? END                                      -- active: extend from current expiry
             WHERE id = ?`,
            now, now, ms, ms, target.id
          );
        }
      } catch (err) {
        await db.run(
          "UPDATE payments SET credited_at = NULL, status = 'processing', updated_at = datetime('now') WHERE id = ?",
          payment.id
        ).catch(() => {});
        console.error('BTCPay grant failed after credit claim:', err);
        return c.json({ ok: false, error: 'grant_failed' }, 500);
      }
      // No session teardown: loadContext reads tier/paid_until fresh on every
      // request, so the upgrade is live on the member's next page load.
    }

    await audit(c, 'membership_granted', {
      userId: target.id, username: payment.username,
      detail: `order ${payment.order_id} invoice ${invoiceId} — ${payment.amount} ${payment.currency}`
        + (payment.period_days ? ` for ${payment.period_days}d` : ' lifetime'),
    });
    return c.json({ ok: true, granted: true }, 200);
  });
}

export { register };
