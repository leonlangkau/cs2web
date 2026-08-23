'use strict';

/**
 * Self-hosted proof-of-work CAPTCHA.
 *
 * Distorted-text and pick-the-image puzzles are solved by current multimodal
 * models more reliably than by people, so this does not try to out-puzzle a
 * bot. It attacks the ECONOMICS instead: every submission must carry a valid
 * proof of work, which costs real CPU per attempt — negligible once, expensive
 * across thousands of automated sign-ups. That is layered with a honeypot
 * field, a minimum elapsed time measured on the SERVER clock, single-use
 * challenges bound to the client IP, and the per-IP rate limits.
 *
 * A determined attacker driving a real browser can still pass this. It is a
 * cost multiplier and a filter for commodity bots, not an identity proof.
 */

const { hmacHex, sha256hex, timingSafeEqualBytes } = require('./crypto');
const { newToken } = require('./crypto');

const TTL_MS = 10 * 60 * 1000;
const MIN_ELAPSED_MS = 800;
const DEFAULT_DIFFICULTY = 16;

function difficultyFor(env = {}) {
  const raw = Number(env.CAPTCHA_DIFFICULTY);
  return Number.isFinite(raw) ? Math.max(8, Math.min(24, Math.floor(raw))) : DEFAULT_DIFFICULTY;
}

function secretFor(env = {}) {
  // Without a persisted secret, outstanding challenges break whenever the
  // process (or Workers isolate) is replaced.
  return env.CAPTCHA_SECRET || 'goyhub-insecure-development-captcha-secret';
}

/** Mints a challenge bound to the caller's IP. */
async function issue(ip, env = {}) {
  const nonce = newToken(16);
  const issuedAt = Date.now();
  const difficulty = difficultyFor(env);
  const ipHash = (await sha256hex(ip || 'unknown')).slice(0, 16);
  const payload = [nonce, issuedAt, difficulty, ipHash].join('.');
  const signature = await hmacHex(secretFor(env), payload);
  return { token: `${payload}.${signature}`, nonce, difficulty };
}

/** Counts leading zero bits of a hex digest. */
function leadingZeroBits(hex) {
  let bits = 0;
  for (const char of hex) {
    const nibble = parseInt(char, 16);
    if (nibble === 0) { bits += 4; continue; }
    if (nibble < 2) bits += 3;
    else if (nibble < 4) bits += 2;
    else if (nibble < 8) bits += 1;
    break;
  }
  return bits;
}

const encoder = new TextEncoder();

/**
 * Validates a submitted solution.
 * Returns { ok: true } or { ok: false, reason } — `reason` is for logs, not users.
 */
async function verify(db, { token, solution, honeypot, ip }, env = {}) {
  // 1. Honeypot: a field hidden from people that naive form bots fill in.
  if (typeof honeypot === 'string' && honeypot.trim() !== '') {
    return { ok: false, reason: 'honeypot filled' };
  }

  if (typeof token !== 'string' || typeof solution !== 'string') {
    return { ok: false, reason: 'missing challenge' };
  }
  if (solution.length > 64 || !/^[A-Za-z0-9_-]*$/.test(solution)) {
    return { ok: false, reason: 'malformed solution' };
  }

  const parts = token.split('.');
  if (parts.length !== 5) return { ok: false, reason: 'malformed token' };
  const [nonce, issuedAtRaw, difficultyRaw, ipHash, signature] = parts;
  const payload = [nonce, issuedAtRaw, difficultyRaw, ipHash].join('.');

  // 2. Signature: the challenge must be one we actually minted.
  const expected = await hmacHex(secretFor(env), payload);
  if (!timingSafeEqualBytes(encoder.encode(signature), encoder.encode(expected))) {
    return { ok: false, reason: 'bad signature' };
  }

  const issuedAt = Number(issuedAtRaw);
  const difficulty = Number(difficultyRaw);
  if (!Number.isFinite(issuedAt) || !Number.isFinite(difficulty)) {
    return { ok: false, reason: 'malformed token fields' };
  }

  // 3. Freshness and pacing, both on the server clock.
  const elapsed = Date.now() - issuedAt;
  if (elapsed > TTL_MS) return { ok: false, reason: 'challenge expired' };
  if (elapsed < MIN_ELAPSED_MS) return { ok: false, reason: 'submitted too fast' };

  // 4. Bound to the client that requested it.
  if (ipHash !== (await sha256hex(ip || 'unknown')).slice(0, 16)) {
    return { ok: false, reason: 'challenge issued to another client' };
  }

  // 5. The actual work.
  if (leadingZeroBits(await sha256hex(`${nonce}:${solution}`)) < difficulty) {
    return { ok: false, reason: 'invalid proof of work' };
  }

  // 6. Single use — the insert fails if this nonce was already redeemed.
  const claimed = await db.run(
    'INSERT INTO captcha_used (nonce, expires_at) VALUES (?, ?) ON CONFLICT(nonce) DO NOTHING',
    nonce, issuedAt + TTL_MS
  );
  if (claimed.changes === 0) return { ok: false, reason: 'challenge already used' };

  return { ok: true };
}

module.exports = { issue, verify, leadingZeroBits, difficultyFor };
