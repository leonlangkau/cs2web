/**
 * The store: what is for sale, and the order records behind a purchase.
 *
 * Everything sold today is a membership plan — a Paid grant with a duration —
 * so the catalog is small enough to live in code. `STORE_PLANS` overrides it
 * from the environment ("id:Name:price:days,…") so prices can move without a
 * deploy, and a malformed entry is dropped rather than shipped as a broken
 * price.
 *
 * The one rule that keeps checkout honest: an order's price and duration are
 * read from OUR row, never from the payment processor's callback. BTCPay tells
 * us "invoice X settled"; what that buys is decided here.
 */
import { newToken } from "./crypto.js";
import { isStaff, normalizeTier } from "./tiers.js";

const DAY_MS = 86_400_000;

/** days: null = lifetime. `popular` just drives the highlight on the card. */
const DEFAULT_PLANS = [
  { id: '1m', name: '1 Month', price: '9.99', days: 30,
    blurb: 'Full Paid access for 30 days. Cancel by simply not renewing.' },
  { id: '3m', name: '3 Months', price: '24.99', days: 90,
    blurb: 'Three months up front — a month cheaper than paying monthly.' },
  { id: '12m', name: '12 Months', price: '79.99', days: 365, popular: true,
    blurb: 'A full year of Paid at the lowest monthly rate we offer.' },
  { id: 'lifetime', name: 'Lifetime', price: '149.99', days: null,
    blurb: 'One payment, Paid access that never expires. No renewals, ever.' },
];

const ORDER_STATUSES = ['new', 'processing', 'paid', 'fulfilled', 'expired', 'invalid', 'cancelled'];

const STATUS_LABELS = {
  new: 'Awaiting payment',
  processing: 'Payment seen — confirming',
  paid: 'Paid',
  fulfilled: 'Complete',
  expired: 'Expired',
  invalid: 'Failed',
  cancelled: 'Cancelled',
};

/** Statuses that can still change on their own (worth re-checking with BTCPay). */
const OPEN_STATUSES = new Set(['new', 'processing', 'paid']);

const PRICE_RE = /^\d{1,7}(\.\d{1,2})?$/;
const PLAN_ID_RE = /^[a-z0-9][a-z0-9_-]{0,23}$/;

function planDuration(days) {
  if (days === null) return 'Never expires';
  if (days % 365 === 0) return `${days / 365} year${days === 365 ? '' : 's'}`;
  if (days % 30 === 0) return `${days / 30} month${days === 30 ? '' : 's'}`;
  return `${days} days`;
}

/**
 * Parses STORE_PLANS ("id:Name:price:days,…"; days 0 = lifetime). Entries that
 * don't parse cleanly are skipped — a typo costs one plan, never a wrong price
 * on a live checkout — and an override that leaves nothing valid falls back to
 * the built-in catalog.
 */
function parsePlans(raw) {
  const out = [];
  const seen = new Set();
  for (const entry of String(raw || '').split(',')) {
    const parts = entry.split(':').map((p) => p.trim());
    if (parts.length < 4) continue;
    const [id, name, price, daysRaw] = parts;
    const days = Number(daysRaw);
    if (!PLAN_ID_RE.test(id) || seen.has(id)) continue;
    if (!name || name.length > 40) continue;
    if (!PRICE_RE.test(price) || Number(price) <= 0) continue;
    if (!Number.isInteger(days) || days < 0 || days > 3650) continue;
    seen.add(id);
    const preset = DEFAULT_PLANS.find((p) => p.id === id);
    out.push({
      id,
      name,
      price,
      days: days === 0 ? null : days,
      blurb: preset ? preset.blurb : `Paid access ${days === 0 ? 'that never expires' : `for ${days} days`}.`,
      popular: Boolean(preset && preset.popular),
    });
  }
  return out;
}

function storePlans(env = {}) {
  const overridden = parsePlans(env.STORE_PLANS);
  return overridden.length > 0 ? overridden : DEFAULT_PLANS;
}

function storeCurrency(env = {}) {
  const raw = String(env.STORE_CURRENCY || '').trim().toUpperCase();
  return /^[A-Z]{3}$/.test(raw) ? raw : 'USD';
}

function findPlan(env, id) {
  return storePlans(env).find((p) => p.id === String(id || '')) || null;
}

/**
 * The pre-BTCPay manual checkout, kept as the fallback while the processor is
 * being set up:
 *   CRYPTO_PAY_URL       hosted checkout link (Coinbase Commerce, NOWPayments…)
 *   CRYPTO_PAY_ADDRESSES "BTC:bc1…,ETH:0x…,LTC:ltc1…" — pay-then-email-support
 * With neither set (and no BTCPay), the store says so plainly instead of
 * pretending to have a checkout.
 */
function legacyPayConfig(env = {}) {
  const addresses = String(env.CRYPTO_PAY_ADDRESSES || '')
    .split(',')
    .map((pair) => {
      const i = pair.indexOf(':');
      if (i < 1) return null;
      const coin = pair.slice(0, i).trim().toUpperCase().slice(0, 12);
      const address = pair.slice(i + 1).trim().slice(0, 128);
      return coin && address ? { coin, address } : null;
    })
    .filter(Boolean);
  return { url: String(env.CRYPTO_PAY_URL || '').trim(), addresses };
}

/** Unguessable, URL-safe order reference — it names the order's status page. */
function newOrderRef() {
  return newToken(8); // 16 hex chars
}

async function createOrder(db, { user, plan, currency }) {
  const ref = newOrderRef();
  await db.run(
    `INSERT INTO orders (order_ref, user_id, username, product_id, product_name, amount, currency, days)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ref, user.id, user.username, plan.id, plan.name, plan.price, currency,
    plan.days === null || plan.days === undefined ? null : Number(plan.days)
  );
  return orderByRef(db, ref);
}

function orderByRef(db, ref) {
  if (!/^[a-f0-9]{16}$/.test(String(ref || ''))) return Promise.resolve(null);
  return db.get('SELECT * FROM orders WHERE order_ref = ?', String(ref));
}

function orderByInvoice(db, invoiceId) {
  const id = String(invoiceId || '').slice(0, 120);
  if (!id) return Promise.resolve(null);
  return db.get('SELECT * FROM orders WHERE invoice_id = ?', id);
}

function userOrders(db, userId, limit = 10) {
  return db.all('SELECT * FROM orders WHERE user_id = ? ORDER BY id DESC LIMIT ?', userId, limit);
}

async function attachInvoice(db, orderId, invoiceId, checkoutLink) {
  await db.run(
    `UPDATE orders SET invoice_id = ?, checkout_url = ?, updated_at = datetime('now') WHERE id = ?`,
    String(invoiceId).slice(0, 120), String(checkoutLink || '').slice(0, 500), orderId
  );
}

/**
 * Moves an order's status forward. Fulfilled and cancelled are terminal — a
 * late "expired" webhook must never un-grant a membership someone paid for.
 */
async function setOrderStatus(db, orderId, status) {
  if (!ORDER_STATUSES.includes(status)) return false;
  const res = await db.run(
    `UPDATE orders SET status = ?, updated_at = datetime('now')
     WHERE id = ? AND status != ? AND status NOT IN ('fulfilled', 'cancelled')`,
    status, orderId, status
  );
  return res.changes === 1;
}

/**
 * Grants what the order bought. Idempotent by construction: the status flip to
 * 'fulfilled' is the claim, and only the request that wins it touches the
 * account — so a webhook redelivery, a page refresh and an admin clicking
 * "fulfil" at the same moment can't stack three memberships.
 *
 * Only 'fulfilled' blocks a grant — a payment that lands on an order the buyer
 * cancelled is still honoured, because their coins left their wallet either way.
 *
 * Never shortens what someone already has: time is added on top of a running
 * subscription, and an existing lifetime membership is left alone. Staff
 * accounts are marked fulfilled without a tier change — dropping a Developer
 * to Paid would be a downgrade dressed up as a purchase.
 */
async function fulfillOrder(db, order) {
  const claim = await db.run(
    `UPDATE orders SET status = 'fulfilled', fulfilled_at = datetime('now'), updated_at = datetime('now')
     WHERE id = ? AND status != 'fulfilled'`,
    order.id
  );
  if (claim.changes !== 1) return { granted: false, reason: 'already_settled' };

  const user = order.user_id === null || order.user_id === undefined
    ? null
    : await db.get('SELECT id, username, tier, paid_until FROM users WHERE id = ?', order.user_id);
  if (!user) {
    // The buyer's account is gone (deleted between paying and settling). Roll
    // the claim back to 'paid' so the money shows up in the admin queue as
    // something a human still has to deal with, not as a completed order.
    await db.run(
      "UPDATE orders SET status = 'paid', fulfilled_at = NULL, updated_at = datetime('now') WHERE id = ?",
      order.id
    );
    return { granted: false, reason: 'no_account' };
  }
  if (isStaff(user)) return { granted: false, reason: 'staff_account', username: user.username };

  const now = Date.now();
  const currentlyPaid = normalizeTier(user.tier) === 'paid';
  const hasLifetime = currentlyPaid && (user.paid_until === null || user.paid_until === undefined);
  const days = order.days === null || order.days === undefined ? null : Number(order.days);

  let paidUntil;
  if (days === null || hasLifetime) {
    paidUntil = null;
  } else {
    const base = currentlyPaid && user.paid_until ? Math.max(now, Number(user.paid_until)) : now;
    paidUntil = base + days * DAY_MS;
  }

  // `role` stays 'user' — it is a legacy mirror that nothing reads for access
  // control, and a Paid member is not an admin.
  await db.run("UPDATE users SET tier = 'paid', paid_until = ? WHERE id = ?", paidUntil, user.id);
  return {
    granted: true, username: user.username, days, paidUntil,
    lifetime: paidUntil === null,
  };
}

export {
  DEFAULT_PLANS, ORDER_STATUSES, STATUS_LABELS, OPEN_STATUSES, DAY_MS,
  storePlans, storeCurrency, findPlan, parsePlans, planDuration, legacyPayConfig,
  createOrder, orderByRef, orderByInvoice, userOrders, attachInvoice,
  setOrderStatus, fulfillOrder, newOrderRef,
};
