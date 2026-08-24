/**
 * Signed entitlement token ("license") a member can hand to the desktop
 * loader so it knows which tier they're on without the loader needing its
 * own account system. HMAC-signed with a server secret the loader is
 * configured with out of band — this module only issues and verifies it;
 * wiring an actual loader binary to check it is outside this repo.
 */
import { hmacHex, safeEqual } from "./crypto.js";
import { tierOf } from "./tiers.js";

const LICENSE_TTL_MS = 24 * 60 * 60 * 1000; // loader is expected to re-fetch, not cache forever

function licenseSecret(env) {
  // Falls back to CAPTCHA_SECRET so this works out of the box without an
  // extra secret in dev; set a dedicated LICENSE_SECRET in production so
  // rotating one doesn't invalidate the other.
  return (env && (env.LICENSE_SECRET || env.CAPTCHA_SECRET)) || '';
}

function payloadOf({ userId, username, tier, issuedAt, expiresAt }) {
  return `${userId}:${username}:${tier}:${issuedAt}:${expiresAt}`;
}

/** Builds a signed entitlement token for `user`. */
async function issueLicense(user, env) {
  const tier = tierOf(user);
  const issuedAt = Date.now();
  const expiresAt = issuedAt + LICENSE_TTL_MS;
  const license = { userId: user.id, username: user.username, tier, issuedAt, expiresAt };
  const token = await hmacHex(licenseSecret(env), payloadOf(license));
  return { ...license, token };
}

/** Re-derives the signature for a license payload and checks it matches and hasn't expired. */
async function verifyLicense(license, env) {
  if (!license || Date.now() > Number(license.expiresAt)) return false;
  const expected = await hmacHex(licenseSecret(env), payloadOf(license));
  return safeEqual(expected, String(license.token || ''));
}

export { issueLicense, verifyLicense, LICENSE_TTL_MS };
