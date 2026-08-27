/**
 * What the shop sells.
 *
 * Three sources, in order of precedence:
 *
 *   1. the `products` table — managed from Admin -> Shop, the normal case;
 *   2. STORE_PLANS = "id:Name:amount:days,…" (days 0 = lifetime), for a
 *      deployment that would rather pin its catalogue in config;
 *   3. the original single PAID_PRICE_AMOUNT / PAID_PERIOD_DAYS pair.
 *
 * With none of them, nothing is for sale and the buy page says so — deliberately
 * no built-in prices, so a fresh deployment can never advertise a number nobody
 * chose.
 *
 * A plan's price is only ever read from here. The buyer's form carries a slug
 * and nothing else.
 *
 * The env half is kept pure (no imports) so btcpay.js can use it without a cycle.
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

/**
 * Durations offered in the admin form. "etc" is covered by the custom field —
 * these are just the ones worth one click.
 */
const PERIOD_PRESETS = [
  { days: 1, label: '1 day' },
  { days: 7, label: '7 days' },
  { days: 30, label: '30 days (month)' },
  { days: 90, label: '90 days' },
  { days: 180, label: '180 days' },
  { days: 365, label: '365 days (year)' },
  { days: 0, label: 'Lifetime (never expires)' },
];

/** A products row in the same shape the rest of the app expects from a plan. */
function rowToPlan(row) {
  return {
    id: row.slug,
    name: row.name,
    amount: row.amount,
    periodDays: row.period_days === null || row.period_days === undefined ? null : Number(row.period_days),
    description: row.description || '',
  };
}

/**
 * The live catalogue. Reads the admin-managed table first and only falls back
 * to env config when it holds nothing sellable, so adding the first product in
 * the admin panel quietly takes over from STORE_PLANS.
 */
async function resolvePlans(db, env = {}) {
  try {
    const rows = await db.all(
      'SELECT * FROM products WHERE active = 1 ORDER BY position ASC, id ASC'
    );
    if (rows && rows.length > 0) return rows.map(rowToPlan);
  } catch {
    // Table not created yet (a database provisioned before this shipped) —
    // fall through to the env catalogue rather than breaking the shop.
  }
  return storePlans(env);
}

/** Resolves one plan by slug across the same sources. Never guesses a substitute. */
async function resolvePlan(db, env, id) {
  const wanted = String(id || '').trim();
  if (!wanted) return null;
  return (await resolvePlans(db, env)).find((p) => p.id === wanted) || null;
}

export {
  storePlans, findPlan, parsePlans, planDuration,
  resolvePlans, resolvePlan, rowToPlan, PERIOD_PRESETS,
};
