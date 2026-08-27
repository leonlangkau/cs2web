/**
 * Store routes: the catalogue, checkout, and the two ways an order settles.
 *
 *   GET  /store · /buy · /upgrade    plans + how to pay (three config states)
 *   POST /store/checkout             create an order, then a BTCPay invoice
 *   GET  /store/order/:ref           the buyer's status page — also RECONCILES
 *                                    against BTCPay, so checkout works before
 *                                    the webhook is wired up
 *   POST /store/order/:ref/cancel    tidy away an unpaid order
 *   POST /api/btcpay/webhook         signed settlement callback from BTCPay
 *
 * The webhook lives under /api/ deliberately: that prefix is exempt from CSRF
 * (see middleware.js) because nothing there acts on cookie authority. BTCPay
 * can't hold a CSRF token, and its HMAC signature is the real authentication.
 */
import * as views from "./views/store.js";
import * as site from "./views/site.js";
import * as store from "./store.js";
import * as btcpay from "./btcpay.js";
import * as limits from "./limits.js";
import { tooMany } from "./routes-main.js";
import { audit, requireAuth, formBody, setFlash, clientIp } from "./middleware.js";
import { isStaff } from "./tiers.js";

const WEBHOOK_PATH = '/api/btcpay/webhook';

function notFound(c) {
  return c.html(site.errorPage(c.get('view'), {
    code: 404, title: 'Not found', message: 'This order does not exist.',
  }), 404);
}

/**
 * Records a settled payment and grants what the order bought. Idempotent —
 * store.fulfillOrder() claims the order first, so a webhook redelivery landing
 * at the same moment as a page refresh grants once, not twice.
 */
async function settleOrder(c, order, source) {
  const result = await store.fulfillOrder(c.get('db'), order);
  const base = { userId: order.user_id, username: order.username };
  const label = `${order.order_ref} · ${order.product_name} · ${order.amount} ${order.currency}`;

  if (result.granted) {
    await audit(c, 'order_fulfilled', {
      ...base,
      detail: `${label} · ${result.lifetime ? 'lifetime' : `${result.days} days`} · via ${source}`,
    });
  } else if (result.reason === 'staff_account') {
    await audit(c, 'order_paid', { ...base, detail: `${label} · staff account — tier left unchanged` });
  } else if (result.reason === 'no_account') {
    await audit(c, 'order_paid', { ...base, detail: `${label} · account no longer exists — needs manual review` });
  }
  return result;
}

/**
 * Asks BTCPay whether an invoice really settled, so a forged callback (a
 * leaked webhook secret) can't mint memberships on its own. A network failure
 * answers `null`: unknown, in which case the signature stands on its own.
 */
async function confirmSettled(cfg, order) {
  if (!btcpay.isConfigured(cfg) || !order.invoice_id) return null;
  try {
    const invoice = await btcpay.getInvoice(cfg, order.invoice_id);
    return btcpay.orderStatusForInvoice(invoice && invoice.status) === 'paid';
  } catch (err) {
    console.error('BTCPay invoice confirmation failed:', err && err.message);
    return null;
  }
}

/**
 * Re-checks an open order against BTCPay and applies whatever it says. This is
 * what makes an order settle for a buyer who returns from the checkout page
 * even when no webhook has ever been delivered — the state the site is in
 * while the server is still being set up.
 */
async function syncOrder(c, order) {
  const db = c.get('db');
  const cfg = c.get('cfg');
  if (!order.invoice_id || !store.OPEN_STATUSES.has(order.status) || !btcpay.isConfigured(cfg)) return order;

  let invoice;
  try {
    invoice = await btcpay.getInvoice(cfg, order.invoice_id);
  } catch (err) {
    console.error('BTCPay invoice lookup failed:', err && err.message);
    return order;
  }

  const mapped = btcpay.orderStatusForInvoice(invoice && invoice.status);
  if (!mapped || mapped === order.status) return order;
  if (mapped === 'paid') await settleOrder(c, order, 'status check');
  else await store.setOrderStatus(db, order.id, mapped);
  return (await store.orderByRef(db, order.order_ref)) || order;
}

function register(app) {
  const storeHandler = async (c) => {
    const cfg = c.get('cfg');
    const user = c.get('user');
    return c.html(views.storePage(c.get('view'), {
      plans: store.storePlans(cfg),
      currency: store.storeCurrency(cfg),
      live: btcpay.isConfigured(cfg),
      legacy: store.legacyPayConfig(cfg),
      missing: btcpay.missingSettings(cfg),
      orders: user ? await store.userOrders(c.get('db'), user.id, 5) : [],
      origin: new URL(c.req.url).origin,
    }));
  };

  app.get('/store', storeHandler);
  app.get('/buy', storeHandler);      // friendlier URL
  app.get('/upgrade', storeHandler);  // where the tier gates and older links point

  app.post('/store/checkout', async (c) => {
    const gate = requireAuth(c);
    if (gate) return gate;

    const cfg = c.get('cfg');
    const db = c.get('db');
    const user = c.get('user');

    if (isStaff(user)) {
      setFlash(c, 'error', 'Staff accounts already include everything in the store.');
      return c.redirect('/store', 302);
    }

    const body = await formBody(c);
    const plan = store.findPlan(cfg, body.plan);
    if (!plan) {
      setFlash(c, 'error', 'That plan is not available.');
      return c.redirect('/store', 302);
    }
    if (!btcpay.isConfigured(cfg)) {
      setFlash(c, 'error', 'Bitcoin checkout is not live yet — the store page has the current way to buy.');
      return c.redirect('/store', 302);
    }

    // Per-account, so one member can't hammer the payment server with invoices.
    const verdict = await limits.check(db, 'checkout', `u${user.id}`, cfg);
    if (!verdict.ok) return tooMany(c, verdict.retryAfterSec);

    const currency = store.storeCurrency(cfg);
    const origin = new URL(c.req.url).origin;
    // The order row exists before the invoice does: a settlement that arrives
    // while this request is still in flight has somewhere to land.
    const order = await store.createOrder(db, { user, plan, currency });

    try {
      const invoice = await btcpay.createInvoice(cfg, {
        amount: plan.price,
        currency,
        orderRef: order.order_ref,
        itemDesc: `GoyHub Paid — ${plan.name}`,
        redirectUrl: `${origin}/store/order/${order.order_ref}`,
        userId: user.id,
        username: user.username,
      });
      await store.attachInvoice(db, order.id, invoice.id, invoice.checkoutLink);
      await audit(c, 'order_created', {
        userId: user.id, username: user.username,
        detail: `${order.order_ref} · ${plan.name} · ${plan.price} ${currency}`,
      });
      return c.redirect(`/store/order/${order.order_ref}`, 302);
    } catch (err) {
      await store.setOrderStatus(db, order.id, 'invalid');
      await audit(c, 'order_failed', {
        userId: user.id, username: user.username,
        detail: `${order.order_ref} · ${String((err && err.message) || 'unknown error').slice(0, 150)}`,
      });
      console.error('BTCPay invoice creation failed:', err && err.message);
      setFlash(c, 'error', 'The payment server did not answer. Nothing was charged — try again in a minute.');
      return c.redirect('/store', 302);
    }
  });

  app.get('/store/order/:ref', async (c) => {
    const gate = requireAuth(c);
    if (gate) return gate;
    const user = c.get('user');
    const found = await store.orderByRef(c.get('db'), c.req.param('ref'));
    // Staff can open any order (support), everyone else only their own.
    if (!found || (found.user_id !== user.id && !isStaff(user))) return notFound(c);

    const order = await syncOrder(c, found);
    c.header('Cache-Control', 'no-store');
    return c.html(views.orderPage(c.get('view'), {
      order,
      live: btcpay.isConfigured(c.get('cfg')),
    }));
  });

  // Tidies an unpaid order out of the buyer's list. Deliberately NOT terminal
  // for fulfillment: if coins land on a cancelled invoice anyway, the webhook
  // still grants the membership — a payment always wins over the tidy-up.
  app.post('/store/order/:ref/cancel', async (c) => {
    const gate = requireAuth(c);
    if (gate) return gate;
    const db = c.get('db');
    const user = c.get('user');
    const order = await store.orderByRef(db, c.req.param('ref'));
    if (!order || order.user_id !== user.id) return notFound(c);

    if (order.status !== 'new') {
      setFlash(c, 'error', 'That order can no longer be cancelled.');
      return c.redirect(`/store/order/${order.order_ref}`, 302);
    }
    await store.setOrderStatus(db, order.id, 'cancelled');
    setFlash(c, 'success', 'Order cancelled. Nothing was charged.');
    return c.redirect('/store', 302);
  });

  /**
   * BTCPay settlement callback. Authentication is the `BTCPay-Sig` HMAC over
   * the exact raw body — so the body is read as text and never re-serialised.
   * Nothing in the payload decides what a payment buys: the invoice id only
   * selects one of OUR order rows, and that row carries the price and duration.
   */
  app.post(WEBHOOK_PATH, async (c) => {
    const cfg = c.get('cfg');
    const db = c.get('db');
    c.header('Cache-Control', 'no-store');

    const secret = btcpay.btcpayConfig(cfg).webhookSecret;
    if (!secret) return c.json({ ok: false, error: 'webhook_not_configured' }, 503);

    const raw = await c.req.raw.text();
    const signed = await btcpay.verifyWebhookSignature(secret, raw, c.req.header('btcpay-sig'));
    if (!signed) {
      await audit(c, 'order_failed', { detail: `BTCPay webhook rejected — bad signature from ${clientIp(c)}` });
      return c.json({ ok: false, error: 'bad_signature' }, 401);
    }

    let payload;
    try { payload = JSON.parse(raw); } catch { return c.json({ ok: false, error: 'bad_json' }, 400); }

    const type = String((payload && payload.type) || '');
    const mapped = btcpay.orderStatusForEvent(type);
    if (mapped === undefined) return c.json({ ok: true, ignored: 'event' }, 200);

    const order = await store.orderByInvoice(db, payload && payload.invoiceId);
    if (!order) return c.json({ ok: true, ignored: 'invoice' }, 200);
    if (mapped === null) return c.json({ ok: true }, 200); // informational event

    if (mapped !== 'paid') {
      await store.setOrderStatus(db, order.id, mapped);
      return c.json({ ok: true, status: mapped }, 200);
    }

    // Second opinion straight from BTCPay before granting anything. `null` =
    // couldn't ask; the signature already proved the callback is genuine.
    const confirmed = await confirmSettled(cfg, order);
    if (confirmed === false) {
      await audit(c, 'order_failed', {
        userId: order.user_id, username: order.username,
        detail: `${order.order_ref} · settlement callback contradicted by BTCPay — not fulfilled`,
      });
      return c.json({ ok: false, error: 'not_settled' }, 409);
    }

    const result = await settleOrder(c, order, 'webhook');
    return c.json({ ok: true, granted: Boolean(result.granted) }, 200);
  });
}

export { register, settleOrder, syncOrder, confirmSettled, WEBHOOK_PATH };
