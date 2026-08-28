/**
 * The one place a Paid membership is actually granted.
 *
 * Three things can now decide a member has paid — a settled BTCPay invoice
 * (fulfil.js), a confirmed on-chain transfer (onchain.js), and an admin
 * clicking Credit (routes-admin.js) — and all three must apply time to the
 * account in exactly the same way. This used to be copied out three times,
 * which is one edit away from a member being extended by one route and
 * clobbered by another.
 *
 * Two rules that are easy to get wrong, so they live here and only here:
 *
 *   - Staff sit above Paid and never expire. A staff member who buys a
 *     membership has their payment recorded, but their tier is left alone
 *     rather than being demoted to 'paid'.
 *   - The new expiry is computed in SQL against the row's LIVE value, not a
 *     value read a moment earlier. Two payments confirming at the same instant
 *     then extend each other instead of one overwriting the other, and an
 *     existing lifetime membership is never downgraded to a dated one.
 */
import { isStaff } from "./tiers.js";

/**
 * Applies `periodDays` (null = lifetime) to a user row of the shape
 * { id, tier, paid_until }. Returns what it did, so callers can word their
 * audit line correctly. Throws only if the database itself fails — callers
 * treat that as "retry later", never as "granted".
 */
async function grantMembership(db, target, periodDays) {
  if (isStaff(target)) return { granted: false, staff: true, lifetime: false };

  const days = periodDays === null || periodDays === undefined ? null : Number(periodDays);
  if (days === null || !Number.isFinite(days)) {
    await db.run("UPDATE users SET tier = 'paid', paid_until = NULL WHERE id = ?", target.id);
    return { granted: true, staff: false, lifetime: true };
  }

  const ms = Math.floor(days) * 86_400_000;
  const now = Date.now();
  await db.run(
    `UPDATE users SET tier = 'paid', paid_until = CASE
       WHEN tier = 'paid' AND paid_until IS NULL THEN NULL          -- keep an existing lifetime
       WHEN paid_until IS NULL OR paid_until < ? THEN ? + ?         -- new/expired: start from now
       ELSE paid_until + ? END                                      -- active: extend from current expiry
     WHERE id = ?`,
    now, now, ms, ms, target.id
  );
  return { granted: true, staff: false, lifetime: false };
}

export { grantMembership };
