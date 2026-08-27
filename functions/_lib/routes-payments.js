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
import { audit, requireAuth, clientIp, setFlash, formBody } from "./middleware.js";
import { tooMany } from "./routes-main.js";
import { isStaff, normalizeTier } from "./tiers.js";
import { btcpayConfig, createInvoice, verifyWebhookSignature } from "./btcpay.js";
import { verifyAndCredit, reconcileForUser } from "./fulfil.js";
import { findPlan, planDuration } from "./plans.js";

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

    // Which plan. The id names a catalogue entry; its price and period are read
    // from OUR catalogue, never from the request — a body that names an unknown
    // plan is refused rather than quietly charged at the default price.
    const body = await formBody(c);
    const requested = String(body.plan || '').trim();
    const plan = requested ? findPlan(env, requested) : (cfg.plans[0] || null);
    if (!plan) {
      setFlash(c, 'error', 'That membership plan is not available.');
      return c.redirect('/buy', 302);
    }

    const orderId = newToken(16);
    // Snapshot price/period onto the row NOW, so a later config change can't
    // retroactively alter an in-flight order.
    await db.run(
      `INSERT INTO payments (order_id, user_id, username, amount, currency, period_days, plan_id, plan_name, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'new')`,
      orderId, user.id, user.username, plan.amount, cfg.currency, plan.periodDays, plan.id, plan.name
    );

    const origin = new URL(c.req.url).origin;
    const redirectUrl = `${origin}/upgrade/thanks?order=${encodeURIComponent(orderId)}`;

    try {
      const invoice = await createInvoice(cfg, {
        orderId, userId: user.id, username: user.username, redirectUrl,
        amount: plan.amount,
        itemDesc: `GoyHub Paid — ${plan.name} (${planDuration(plan.periodDays)})`,
      });
      await db.run(
        "UPDATE payments SET invoice_id = ?, updated_at = datetime('now') WHERE order_id = ?",
        invoice.id, orderId
      );
      await audit(c, 'checkout_created', {
        userId: user.id, username: user.username,
        detail: `order ${orderId} invoice ${invoice.id} — ${plan.name} ${plan.amount} ${cfg.currency}`,
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
      return c.redirect('/buy', 302);
    }
  });

  // Where BTCPay sends the member back after they pay. This does not wait for
  // the webhook: it re-checks the invoice against BTCPay right now and credits
  // it if it has settled, so a member who pays and returns is upgraded even if
  // the webhook is unconfigured, delayed or lost entirely.
  app.get('/upgrade/thanks', async (c) => {
    const gate = requireAuth(c);
    if (gate) return gate;
    const db = c.get('db');
    const user = c.get('user');
    const cfg = btcpayConfig(c.get('cfg'));
    const order = String(new URL(c.req.url).searchParams.get('order') || '').slice(0, 64);

    let payment = order
      ? await db.get('SELECT * FROM payments WHERE order_id = ? AND user_id = ?', order, user.id)
      : null;

    if (payment && !payment.credited_at && cfg.configured) {
      await verifyAndCredit(c, cfg, payment, 'return from checkout');
      payment = await db.get('SELECT * FROM payments WHERE id = ?', payment.id);
    }

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

    // --- InvoiceSettled: verify against BTCPay and credit ---
    // The work itself lives in fulfil.js, because the webhook is no longer the
    // only thing that can credit a payment (see /upgrade/thanks and the sweep).
    // Status codes below are what BTCPay's retry logic reads: 5xx = come back,
    // 2xx = done, stop retrying.
    const verdict = await verifyAndCredit(c, cfg, payment, 'webhook');
    switch (verdict.reason) {
      case 'verify_failed':
        // Couldn't reach the store to confirm — ask BTCPay to redeliver.
        return c.json({ ok: false, error: 'verify_failed' }, 502);
      case 'not_settled':
        await audit(c, 'btcpay_webhook_rejected', {
          userId: payment.user_id, username: payment.username,
          detail: `order ${payment.order_id}: status ${verdict.status} not settled`,
        });
        // Only genuinely terminal states are final; New/Processing is store-side
        // lag between the webhook firing and the API reflecting it, so retry.
        return c.json({ ok: false, error: 'not_settled' }, verdict.terminal ? 200 : 503);
      case 'mismatch':
        return c.json({ ok: false, error: 'mismatch' }, 200);
      case 'user_gone':
        return c.json({ ok: true, ignored: 'user_gone' }, 200);
      case 'grant_failed':
        return c.json({ ok: false, error: 'grant_failed' }, 500);
      case 'already':
        return c.json({ ok: true, already: true }, 200);
      default:
        return c.json({ ok: true, granted: true }, 200);
    }
  });
}

export { register };
