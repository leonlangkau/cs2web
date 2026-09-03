/**
 * What a coin is worth, for pricing a checkout.
 *
 * Plans are priced in fiat (see plans.js), so starting an on-chain order means
 * converting that price into an exact amount of ETH, SOL or USDT at the moment
 * the buyer commits. The quote is then FROZEN onto the order: the rate that
 * mattered is the one the buyer was shown, and a swing five minutes later must
 * never change what they owe or retroactively make a paid order short.
 *
 * Two keyless public sources are tried in order, and the answer is cached in
 * the settings table (shared across Workers isolates, unlike anything in
 * memory) so a burst of checkouts costs one upstream call rather than one each.
 *
 * When every provider is down, a recent cached rate is reused and flagged
 * `stale` rather than blocking the sale; past that window there is no quote at
 * all and the checkout says so. Guessing a price is not an option — an invented
 * rate either overcharges a buyer or gives the membership away.
 */
import { getSetting, setSetting } from "./settings.js";
import { DECIMAL_RE } from "./units.js";

const DEFAULT_TTL_SECONDS = 90;
const DEFAULT_MAX_STALE_SECONDS = 900;
const FETCH_TIMEOUT_MS = 8000;

/** CoinGecko ids for the coins we price. */
const COINGECKO_IDS = { ETH: 'ethereum', SOL: 'solana', USDT: 'tether' };

function ttlSeconds(env) {
  const n = Number(env.CRYPTO_RATE_TTL_SECONDS);
  return Number.isFinite(n) && n >= 10 ? Math.floor(n) : DEFAULT_TTL_SECONDS;
}

function maxStaleSeconds(env) {
  const n = Number(env.CRYPTO_RATE_MAX_STALE_SECONDS);
  return Number.isFinite(n) && n >= 60 ? Math.floor(n) : DEFAULT_MAX_STALE_SECONDS;
}

async function timedFetch(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Normalises a provider's number into a plain decimal string we can do exact
 * arithmetic on. Rejects zero, negatives, NaN and exponent notation, so a
 * garbled response can never become a price.
 */
function cleanRate(value) {
  if (value === null || value === undefined) return null;
  let text = String(value).trim();
  // Providers sometimes hand back a JSON number, which stringifies with an
  // exponent for very small values; expand it before the exact-decimal check.
  if (/e/i.test(text) && Number.isFinite(Number(text))) text = Number(text).toFixed(12);
  if (!DECIMAL_RE.test(text)) return null;
  if (Number(text) <= 0) return null;
  return text.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
}

/** Coinbase spot price — keyless, generous limits, one pair per call. */
async function fromCoinbase(symbol, currency) {
  const url = `https://api.coinbase.com/v2/prices/${encodeURIComponent(symbol)}-${encodeURIComponent(currency)}/spot`;
  const res = await timedFetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`coinbase HTTP ${res.status}`);
  const body = await res.json();
  const rate = cleanRate(body && body.data && body.data.amount);
  if (!rate) throw new Error('coinbase returned no usable price');
  return rate;
}

/** CoinGecko simple price — keyless, with an optional demo key for higher limits. */
async function fromCoinGecko(symbol, currency, env) {
  const id = COINGECKO_IDS[symbol];
  if (!id) throw new Error(`no coingecko id for ${symbol}`);
  const vs = currency.toLowerCase();
  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=${encodeURIComponent(vs)}`;
  const key = String(env.COINGECKO_API_KEY ?? '').trim();
  const res = await timedFetch(url, {
    headers: { Accept: 'application/json', ...(key ? { 'x-cg-demo-api-key': key } : {}) },
  });
  if (!res.ok) throw new Error(`coingecko HTTP ${res.status}`);
  const body = await res.json();
  const rate = cleanRate(body && body[id] && body[id][vs]);
  if (!rate) throw new Error('coingecko returned no usable price');
  return rate;
}

const cacheKey = (symbol, currency) => `rate:${symbol}:${currency}`;

function readCache(raw) {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    const rate = cleanRate(parsed && parsed.rate);
    const at = Number(parsed && parsed.at);
    if (!rate || !Number.isFinite(at)) return null;
    return { rate, at };
  } catch {
    return null;
  }
}

/**
 * The price of one whole `symbol` in `currency`, as an exact decimal string.
 *
 * Returns { rate, at, source, stale } or null when no price could be
 * established at all. `now` is injectable so tests don't depend on the clock.
 */
async function getRate(db, env, symbol, currency, { now = Date.now(), force = false } = {}) {
  const sym = String(symbol || '').toUpperCase();
  const cur = String(currency || 'USD').toUpperCase();
  const key = cacheKey(sym, cur);

  const cached = readCache(await getSetting(db, key).catch(() => ''));
  if (!force && cached && now - cached.at < ttlSeconds(env) * 1000) {
    return { ...cached, source: 'cache', stale: false };
  }

  const providers = [
    ['coinbase', () => fromCoinbase(sym, cur)],
    ['coingecko', () => fromCoinGecko(sym, cur, env)],
  ];

  for (const [source, run] of providers) {
    try {
      const rate = await run();
      await setSetting(db, key, JSON.stringify({ rate, at: now })).catch(() => {});
      return { rate, at: now, source, stale: false };
    } catch (err) {
      console.error(`rate lookup failed via ${source} for ${sym}/${cur}:`, String(err && err.message || err));
    }
  }

  // Everything is down. A recent cached rate is still a real, recently-observed
  // price — better than refusing the sale — but it is marked so callers can
  // shorten the payment window or say something honest on the page.
  if (cached && now - cached.at < maxStaleSeconds(env) * 1000) {
    return { ...cached, source: 'cache', stale: true };
  }

  // Last resort for a dollar stablecoin: USDT is a claim on one US dollar, so a
  // 1:1 quote is the intended peg rather than a guess. Only for USD, and only
  // when there is nothing observed to use.
  if (sym === 'USDT' && cur === 'USD') {
    return { rate: '1', at: now, source: 'peg', stale: false };
  }

  return null;
}

export { getRate, cleanRate, cacheKey, COINGECKO_IDS };
