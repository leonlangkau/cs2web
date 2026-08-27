/**
 * BTCPay Server client (Greenfield API v1).
 *
 * BTCPay is self-hosted, so there is no SDK to pull in and nothing to trust
 * beyond one HTTPS call: create an invoice, send the buyer to its hosted
 * checkout, and learn about settlement two ways —
 *
 *   1. the webhook (POST /api/btcpay/webhook), authenticated by the
 *      HMAC-SHA256 `BTCPay-Sig` header over the exact raw body;
 *   2. polling this API when a buyer opens their order page, which is what
 *      makes checkout work before the webhook is wired up at all.
 *
 * Neither path decides what a payment buys — see store.js. This module only
 * answers "did BTCPay say this invoice settled?".
 *
 * Configuration (all four are needed for a live checkout):
 *   BTCPAY_URL             https://btcpay.example.com
 *   BTCPAY_STORE_ID        the store's id from its BTCPay settings URL
 *   BTCPAY_API_KEY         API key with `btcpay.store.cancreateinvoice` +
 *                          `btcpay.store.canviewinvoices` (secret)
 *   BTCPAY_WEBHOOK_SECRET  the webhook's signing secret (secret) — without it
 *                          the webhook route refuses every delivery
 */
import { hmacHex, safeEqual } from "./crypto.js";

const REQUEST_TIMEOUT_MS = 10_000;

class BtcpayError extends Error {
  constructor(message, status = 0) {
    super(message);
    this.name = 'BtcpayError';
    this.status = status;
  }
}

/** Normalised config. An unparseable or non-HTTP(S) URL reads as unconfigured. */
function btcpayConfig(env = {}) {
  const raw = String(env.BTCPAY_URL || '').trim().replace(/\/+$/, '');
  let url = '';
  try {
    const parsed = new URL(raw);
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') url = raw;
  } catch { /* leave unconfigured */ }
  return {
    url,
    storeId: String(env.BTCPAY_STORE_ID || '').trim(),
    apiKey: String(env.BTCPAY_API_KEY || '').trim(),
    webhookSecret: String(env.BTCPAY_WEBHOOK_SECRET || '').trim(),
  };
}

/** True when invoices can actually be created (the webhook secret is separate). */
function isConfigured(env = {}) {
  const cfg = btcpayConfig(env);
  return Boolean(cfg.url && cfg.storeId && cfg.apiKey);
}

function hasWebhookSecret(env = {}) {
  return Boolean(btcpayConfig(env).webhookSecret);
}

/**
 * Which of the four settings are still missing — surfaced to staff on the
 * store page so "checkout isn't live" is a to-do list, not a mystery.
 */
function missingSettings(env = {}) {
  const cfg = btcpayConfig(env);
  const missing = [];
  if (!cfg.url) missing.push('BTCPAY_URL');
  if (!cfg.storeId) missing.push('BTCPAY_STORE_ID');
  if (!cfg.apiKey) missing.push('BTCPAY_API_KEY');
  if (!cfg.webhookSecret) missing.push('BTCPAY_WEBHOOK_SECRET');
  return missing;
}

async function api(env, path, { method = 'GET', body } = {}) {
  const cfg = btcpayConfig(env);
  if (!isConfigured(env)) throw new BtcpayError('BTCPay is not configured', 0);

  const init = {
    method,
    headers: {
      Authorization: `token ${cfg.apiKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
  };
  if (body !== undefined) init.body = JSON.stringify(body);
  // A hung payment server must not hold a Worker request open to its own limit.
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
    init.signal = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  }

  const endpoint = `${cfg.url}/api/v1/stores/${encodeURIComponent(cfg.storeId)}${path}`;
  let res;
  try {
    res = await fetch(endpoint, init);
  } catch (err) {
    throw new BtcpayError(`BTCPay unreachable: ${err && err.message ? err.message : 'network error'}`, 0);
  }

  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { /* HTML error page, etc. */ }

  if (!res.ok) {
    const first = Array.isArray(data) ? data[0] : data;
    const detail = (first && (first.message || first.code)) || `HTTP ${res.status}`;
    throw new BtcpayError(String(detail).slice(0, 200), res.status);
  }
  return data;
}

/**
 * Creates an invoice for one order. `orderRef` is our own reference: BTCPay
 * echoes it back in webhook metadata and it names the status page the buyer
 * is returned to.
 */
async function createInvoice(env, { amount, currency, orderRef, itemDesc, buyerEmail, redirectUrl, userId, username }) {
  const invoice = await api(env, '/invoices', {
    method: 'POST',
    body: {
      amount: String(amount),
      currency,
      metadata: {
        orderId: orderRef,
        itemDesc,
        buyerEmail: buyerEmail || null,
        posData: { userId, username },
      },
      checkout: {
        redirectURL: redirectUrl,
        redirectAutomatically: true,
        defaultLanguage: 'en',
      },
    },
  });
  if (!invoice || !invoice.id) throw new BtcpayError('BTCPay returned no invoice id', 0);
  return {
    id: String(invoice.id),
    checkoutLink: String(invoice.checkoutLink || ''),
    status: String(invoice.status || 'New'),
    amount: invoice.amount,
    currency: invoice.currency,
    expirationTime: invoice.expirationTime || null,
  };
}

function getInvoice(env, invoiceId) {
  return api(env, `/invoices/${encodeURIComponent(String(invoiceId))}`);
}

/**
 * BTCPay invoice status -> our order status. "Settled" means the payment is
 * confirmed and final; "Processing" means paid but not yet confirmed enough,
 * which is worth showing the buyer but is not something to grant access on.
 */
const INVOICE_STATUS = {
  New: 'new',
  Processing: 'processing',
  Settled: 'paid',
  Complete: 'paid',   // pre-2.0 alias, still seen on older servers
  Confirmed: 'paid',  // ditto
  Expired: 'expired',
  Invalid: 'invalid',
};

/** Webhook event type -> our order status (null = informational only). */
const WEBHOOK_EVENT = {
  InvoiceCreated: 'new',
  InvoiceReceivedPayment: 'processing',
  InvoiceProcessing: 'processing',
  InvoicePaymentSettled: null,
  InvoiceSettled: 'paid',
  InvoiceExpired: 'expired',
  InvoiceInvalid: 'invalid',
};

function orderStatusForInvoice(invoiceStatus) {
  return INVOICE_STATUS[String(invoiceStatus || '')] || null;
}

function orderStatusForEvent(eventType) {
  const key = String(eventType || '');
  return Object.prototype.hasOwnProperty.call(WEBHOOK_EVENT, key) ? WEBHOOK_EVENT[key] : undefined;
}

/**
 * Verifies BTCPay's `BTCPay-Sig: sha256=<hex>` header against the raw request
 * body. The raw text matters — re-serialising the parsed JSON would change the
 * bytes and break every signature.
 */
async function verifyWebhookSignature(secret, rawBody, header) {
  const provided = String(header || '').trim();
  if (!secret || !provided) return false;
  const prefix = 'sha256=';
  if (provided.slice(0, prefix.length).toLowerCase() !== prefix) return false;
  const expected = await hmacHex(secret, rawBody);
  return safeEqual(provided.slice(prefix.length).toLowerCase(), expected);
}

export {
  BtcpayError, btcpayConfig, isConfigured, hasWebhookSecret, missingSettings,
  createInvoice, getInvoice, orderStatusForInvoice, orderStatusForEvent,
  verifyWebhookSignature, INVOICE_STATUS, WEBHOOK_EVENT,
};
