/**
 * What the store sells.
 *
 * main shipped a single price (PAID_PRICE_AMOUNT / PAID_PERIOD_DAYS). This adds
 * a catalogue on top without changing that contract:
 *
 *   STORE_PLANS = "id:Name:amount:days,…"     days 0 = lifetime
 *
 * With STORE_PLANS set, /buy offers those plans. With only the single-price
 * vars set, it offers exactly one plan and behaves as before. With neither, the
 * catalogue is empty and the page says checkout is not live — deliberately no
 * built-in prices, so an unconfigured deployment can never advertise a number
 * nobody chose.
 *
 * Kept dependency-free (pure parsing) so btcpay.js can import it without a cycle.
 */

const PRICE_RE = /^\d{1,7}(\.\d{1,2})?$/;
const PLAN_ID_RE = /^[a-z0-9][a-z0-9_-]{0,23}$/;

/** Human wording for a period. null = lifetime. */
function planDuration(days) {
  if (days === null || days === undefined) return 'Never expires';
  const n = Math.floor(Number(days));
  if (n % 365 === 0) return `${n / 365} year${n === 365 ? '' : 's'}`;
  if (n % 30 === 0) return `${n / 30} month${n === 30 ? '' : 's'}`;
  return `${n} days`;
}

/**
 * Parses STORE_PLANS. An entry that does not parse cleanly is dropped rather
 * than shipped as a broken price — a typo costs one plan, never a wrong charge.
 */
function parsePlans(raw) {
  const out = [];
  const seen = new Set();
  for (const entry of String(raw || '').split(',')) {
    const parts = entry.split(':').map((p) => p.trim());
    if (parts.length < 4) continue;
    const [id, name, amount, daysRaw] = parts;
    const days = Number(daysRaw);
    if (!PLAN_ID_RE.test(id) || seen.has(id)) continue;
    if (!name || name.length > 40) continue;
    if (!PRICE_RE.test(amount) || Number(amount) <= 0) continue;
    if (!Number.isInteger(days) || days < 0 || days > 3650) continue;
    seen.add(id);
    out.push({ id, name, amount, periodDays: days === 0 ? null : days });
  }
  return out;
}

/**
 * The catalogue for this environment. Always returns an array; empty means
 * nothing is for sale yet.
 */
function storePlans(env = {}) {
  const parsed = parsePlans(env.STORE_PLANS);
  if (parsed.length > 0) return parsed;

  // Back-compat: the original single-price configuration is one plan.
  const amountNum = Number(env.PAID_PRICE_AMOUNT);
  if (!Number.isFinite(amountNum) || amountNum <= 0) return [];
  const daysNum = Number(env.PAID_PERIOD_DAYS);
  return [{
    id: 'paid',
    name: 'Paid membership',
    amount: String(env.PAID_PRICE_AMOUNT).trim(),
    periodDays: Number.isFinite(daysNum) && daysNum > 0 ? Math.floor(daysNum) : null,
  }];
}

/** Looks up one plan by id, or null. Never falls back to a different plan. */
function findPlan(env, id) {
  const wanted = String(id || '').trim();
  if (!wanted) return null;
  return storePlans(env).find((p) => p.id === wanted) || null;
}

export { storePlans, findPlan, parsePlans, planDuration };
