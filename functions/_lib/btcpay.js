/**
 * BTCPay Server integration (self-hosted, crypto-only checkout).
 *
 * Talks to a BTCPay Server over its Greenfield API to create hosted invoices,
 * and verifies the store's signed webhooks so a paid invoice can grant a Paid
 * membership without any human step. Nothing here trusts the client:
 *
 *   - Invoices are created server-to-server with the store API key; the price
 *     and currency come from server config, never from the request.
 *   - Every webhook is authenticated by an HMAC-SHA256 signature over the exact
 *     raw request body (the shared webhook secret) — an unsigned or mis-signed
 *     call is rejected before it can touch an account.
 *   - Before crediting, the webhook handler re-fetches the invoice from BTCPay
 *     and re-checks its status, amount and currency, so a forged "settled" body
 *     (even one that somehow passed signature checks) cannot grant access.
 *
 * Built on fetch + Web Crypto only, so it runs unchanged on Cloudflare Workers
 * and on Node 22 (the test harness).
 */
import { hmacHex, safeEqual } from "./crypto.js";

/** 15s ceiling on any call to the BTCPay host so a stalled server can't hang a request. */
const FETCH_TIMEOUT_MS = 15_000;

/** Strip one trailing slash so `${url}/api/...` never doubles up. */
function normalizeUrl(raw) {
  const s = String(raw || '').trim();
  return s.endsWith('/') ? s.slice(0, -1) : s;
}

/**
 * Payment config read entirely from env / secrets. `configured` is true only
 * when everything required to run an automated checkout AND validate its
 * webhook is present — a half-set configuration never shows a pay button.
 *
 *   BTCPAY_URL            https base URL of the BTCPay Server
 *   BTCPAY_STORE_ID       the store's id
 *   BTCPAY_API_KEY        Greenfield API key (secret) — btcpay.store.cancreateinvoice
 *   BTCPAY_WEBHOOK_SECRET the store webhook's signing secret (secret)
 *   PAID_PRICE_AMOUNT     numeric price, e.g. "10.00"
 *   PAID_PRICE_CURRENCY   ISO code, default "USD"
 *   PAID_PERIOD_DAYS      membership length in days; empty/0 = lifetime
 */
function btcpayConfig(env = {}) {
  const url = normalizeUrl(env.BTCPAY_URL);
  const storeId = String(env.BTCPAY_STORE_ID || '').trim();
  const apiKey = String(env.BTCPAY_API_KEY || '').trim();
  const webhookSecret = String(env.BTCPAY_WEBHOOK_SECRET || '').trim();

  const amountNum = Number(env.PAID_PRICE_AMOUNT);
  const amount = Number.isFinite(amountNum) && amountNum > 0 ? String(env.PAID_PRICE_AMOUNT).trim() : '';

  const currencyRaw = String(env.PAID_PRICE_CURRENCY || 'USD').trim().toUpperCase();
  const currency = /^[A-Z]{2,10}$/.test(currencyRaw) ? currencyRaw : 'USD';

  const daysNum = Number(env.PAID_PERIOD_DAYS);
  const periodDays = Number.isFinite(daysNum) && daysNum > 0 ? Math.floor(daysNum) : null;

  const configured = Boolean(url && storeId && apiKey && webhookSecret && amount);
  return { url, storeId, apiKey, webhookSecret, amount, currency, periodDays, configured };
}

/** fetch() with an AbortController timeout, so the caller never hangs forever. */
async function timedFetch(url, options) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Creates a hosted invoice for a single Paid membership purchase and returns
 * { id, checkoutLink, status }. The member is bound to the invoice by an
 * `orderId` carried in the invoice metadata; the webhook uses it to find the
 * pending payment row. Throws on any non-2xx response.
 */
async function createInvoice(cfg, { orderId, userId, username, redirectUrl }) {
  const endpoint = `${cfg.url}/api/v1/stores/${encodeURIComponent(cfg.storeId)}/invoices`;
  const payload = {
    amount: cfg.amount,
    currency: cfg.currency,
    metadata: {
      orderId,
      userId: String(userId),
      username: String(username || ''),
      itemDesc: 'GoyHub Paid membership',
    },
    checkout: {
      redirectURL: redirectUrl,
      redirectAutomatically: true,
      // Only mark the invoice paid once the payment is actually confirmed on
      // chain — never on a zero-conf "processing" state.
      speedPolicy: 'MediumSpeed',
    },
  };

  const res = await timedFetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `token ${cfg.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`BTCPay createInvoice failed: ${res.status} ${detail.slice(0, 200)}`);
  }
  const data = await res.json();
  if (!data || !data.id || !data.checkoutLink) {
    throw new Error('BTCPay createInvoice returned an unexpected payload');
  }
  return { id: data.id, checkoutLink: data.checkoutLink, status: data.status };
}

/** Fetches one invoice from the store. Returns the parsed invoice, or throws. */
async function getInvoice(cfg, invoiceId) {
  const endpoint = `${cfg.url}/api/v1/stores/${encodeURIComponent(cfg.storeId)}/invoices/${encodeURIComponent(invoiceId)}`;
  const res = await timedFetch(endpoint, {
    method: 'GET',
    headers: { Authorization: `token ${cfg.apiKey}` },
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`BTCPay getInvoice failed: ${res.status} ${detail.slice(0, 200)}`);
  }
  return res.json();
}

/**
 * Verifies a BTCPay webhook signature. BTCPay sends `BTCPay-Sig: sha256=<hex>`,
 * an HMAC-SHA256 of the EXACT raw request body keyed by the webhook secret — so
 * the caller must pass the untouched body string, not a re-serialized object.
 * Constant-time comparison; any malformed input returns false rather than
 * throwing.
 */
async function verifyWebhookSignature(secret, rawBody, sigHeader) {
  if (!secret || typeof rawBody !== 'string' || !sigHeader) return false;
  const header = String(sigHeader).trim();
  const provided = header.startsWith('sha256=') ? header.slice('sha256='.length) : header;
  if (!/^[0-9a-fA-F]{64}$/.test(provided)) return false;
  const expected = await hmacHex(secret, rawBody);
  return safeEqual(expected, provided.toLowerCase());
}

/**
 * Computes the new paid_until (ms epoch) after crediting `periodDays`.
 * periodDays === null grants a lifetime membership (returns null). Otherwise
 * the period stacks on whatever is left — an unexpired member is extended, an
 * expired/new one starts from now.
 */
function extendPaidUntil(currentPaidUntil, periodDays, now = Date.now()) {
  if (periodDays === null || periodDays === undefined) return null;
  const current = currentPaidUntil === null || currentPaidUntil === undefined ? 0 : Number(currentPaidUntil);
  const base = current > now ? current : now;
  return base + Math.floor(periodDays) * 86_400_000;
}

export { btcpayConfig, createInvoice, getInvoice, verifyWebhookSignature, extendPaidUntil };
