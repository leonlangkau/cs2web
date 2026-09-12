/**
 * Exact decimal arithmetic for money that must never be wrong by one wei.
 *
 * Crypto amounts are integers of a chain's smallest unit (wei, lamports, a
 * token's decimals) and routinely exceed 2^53, so every amount in the on-chain
 * payment path is a BigInt of base units — carried through the database as a
 * decimal TEXT string — and never a JS number. `0.1 + 0.2` deciding whether a
 * member gets what they paid for is not a trade this codebase makes.
 *
 * Everything here is pure and total: bad input returns null rather than
 * throwing, so a malformed API response from an explorer can't take a request
 * down.
 */

/** Plain non-negative decimal. No exponents, no sign, no separators. */
const DECIMAL_RE = /^\d{1,30}(\.\d{1,30})?$/;

const POW10 = [];
function pow10(n) {
  if (POW10[n] === undefined) POW10[n] = 10n ** BigInt(n);
  return POW10[n];
}

/**
 * Parses a decimal string into integer base units at `decimals` precision.
 *
 * A value with MORE fraction digits than the asset supports is rounded per
 * `mode` ('down' by default, 'up' when the result is something we are going to
 * ask a buyer to pay, so rounding can never shortchange the store). Returns
 * null for anything that isn't a plain non-negative decimal.
 */
function toUnits(value, decimals, mode = 'down') {
  const raw = String(value ?? '').trim();
  if (!DECIMAL_RE.test(raw)) return null;
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 30) return null;

  const dot = raw.indexOf('.');
  const whole = dot === -1 ? raw : raw.slice(0, dot);
  const frac = dot === -1 ? '' : raw.slice(dot + 1);

  const kept = frac.slice(0, decimals).padEnd(decimals, '0');
  const dropped = frac.slice(decimals);
  let units = BigInt(whole) * pow10(decimals) + BigInt(kept || '0');
  // Round away anything below the asset's precision.
  if (mode === 'up' && /[1-9]/.test(dropped)) units += 1n;
  return units;
}

/**
 * Renders base units back to a decimal string, trailing zeros trimmed.
 * `fromUnits(1500000000000000n, 18)` -> "0.0015".
 */
function fromUnits(units, decimals) {
  let n;
  try { n = BigInt(units); } catch { return null; }
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 30) return null;
  const negative = n < 0n;
  if (negative) n = -n;
  const scale = pow10(decimals);
  const whole = (n / scale).toString();
  if (decimals === 0) return (negative ? '-' : '') + whole;
  const frac = (n % scale).toString().padStart(decimals, '0').replace(/0+$/, '');
  return `${negative ? '-' : ''}${whole}${frac ? `.${frac}` : ''}`;
}

/** Ceiling division for positive BigInts — never hands out a fraction of a unit. */
function ceilDiv(a, b) {
  if (b <= 0n) return null;
  return (a + b - 1n) / b;
}

/** Rounds `value` UP to the next multiple of `step`. */
function ceilTo(value, step) {
  if (step <= 0n) return value;
  const rem = value % step;
  return rem === 0n ? value : value + (step - rem);
}

/**
 * Converts a fiat amount into base units of a coin at a given price.
 *
 *   fiat      "10.00"          what the plan costs
 *   rate      "3421.55"        fiat per 1 whole coin
 *   decimals  18               the coin's precision
 *
 * Both inputs are taken as exact decimals and the division rounds UP, so the
 * quoted amount always covers the price. Returns null if either side is
 * unparseable or the rate is zero — callers treat that as "no quote", never as
 * "free".
 */
function fiatToUnits(fiat, rate, decimals) {
  const FIAT_DP = 8;
  const fiatUnits = toUnits(fiat, FIAT_DP, 'up');
  const rateUnits = toUnits(rate, FIAT_DP, 'down');
  if (fiatUnits === null || rateUnits === null || rateUnits <= 0n || fiatUnits <= 0n) return null;
  // (fiat / rate) coins, expressed in base units, rounded up.
  return ceilDiv(fiatUnits * pow10(decimals), rateUnits);
}

/** The fiat value of some base units at `rate`, as a 2dp string (for display). */
function unitsToFiat(units, rate, decimals) {
  const FIAT_DP = 8;
  const rateUnits = toUnits(rate, FIAT_DP, 'down');
  let n;
  try { n = BigInt(units); } catch { return null; }
  if (rateUnits === null || rateUnits <= 0n) return null;
  const cents = (n * rateUnits * 100n) / (pow10(decimals) * pow10(FIAT_DP));
  return fromUnits(cents, 2);
}

/** Parses a decimal TEXT column back into BigInt units. Null-safe. */
function parseUnits(text) {
  const raw = String(text ?? '').trim();
  if (!/^-?\d{1,40}$/.test(raw)) return null;
  return BigInt(raw);
}

export { toUnits, fromUnits, ceilDiv, ceilTo, fiatToUnits, unitsToFiat, parseUnits, pow10, DECIMAL_RE };
