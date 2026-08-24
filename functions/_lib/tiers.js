/**
 * Access tiers. This is the single source of truth for who can do what —
 * `role` ('user'/'admin') still exists in the users table for legacy reasons
 * but nothing reads it anymore outside bootstrap.js's one-time backfill.
 *
 * Rank order (lowest to highest) is exactly the order the tiers were
 * specified in: user < paid < developer < trial_admin < admin. Rank drives
 * content gates (forum, download) — "at least Paid". Admin-panel access is a
 * separate, explicit set rather than a rank cutoff, because Developer sits
 * below Trial Admin in seniority but still needs staff-side access.
 */

const TIERS = ['user', 'paid', 'developer', 'trial_admin', 'admin'];
const TIER_RANK = Object.fromEntries(TIERS.map((t, i) => [t, i]));

const TIER_LABELS = {
  user: 'Free',
  paid: 'Paid',
  developer: 'Developer',
  trial_admin: 'Trial Admin',
  admin: 'Admin',
};

/** Tiers with admin-panel and moderation access. */
const STAFF_TIERS = new Set(['developer', 'trial_admin', 'admin']);

function normalizeTier(tier) {
  return TIER_RANK[tier] !== undefined ? tier : 'user';
}

/**
 * A Paid membership can carry an expiry (users.paid_until, ms epoch;
 * NULL = lifetime). An expired Paid account is treated as Free everywhere
 * without a background job — every access check funnels through here.
 * Staff tiers never expire.
 */
function paidExpired(user) {
  return normalizeTier(user.tier) === 'paid'
    && user.paid_until !== null && user.paid_until !== undefined
    && Number(user.paid_until) <= Date.now();
}

function tierOf(user) {
  if (!user) return 'user';
  if (paidExpired(user)) return 'user';
  return normalizeTier(user.tier);
}

function rankOf(tier) {
  return TIER_RANK[normalizeTier(tier)];
}

/** True if `user`'s tier is at least `minTier` in rank. */
function meetsTier(user, minTier) {
  return rankOf(tierOf(user)) >= rankOf(minTier);
}

/** Admin panel + moderation actions (ban, IP-ban, forum moderation). */
function isStaff(user) {
  return user ? STAFF_TIERS.has(normalizeTier(user.tier)) : false;
}

/** The most sensitive actions: changing tiers, deleting accounts/categories. */
function isFullAdmin(user) {
  return tierOf(user) === 'admin';
}

export { TIERS, TIER_RANK, TIER_LABELS, STAFF_TIERS, normalizeTier, tierOf, rankOf, meetsTier, isStaff, isFullAdmin, paidExpired };
