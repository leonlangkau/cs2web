'use strict';

/**
 * Self-hosted proof-of-work CAPTCHA.
 *
 * Design note — what this does and does not do:
 *
 * Distorted-text and pick-the-image puzzles are solved by current multimodal
 * models more reliably than by people, so this does not try to out-puzzle a
 * bot. It attacks the ECONOMICS instead: every submission must carry a valid
 * proof of work, which costs real CPU per attempt and is negligible once but
 * expensive across thousands of automated sign-ups. That is layered with a
 * honeypot field, a minimum elapsed time measured on the SERVER clock,
 * single-use challenges bound to the client IP, and the existing per-IP rate
 * limits.
 *
 * A determined attacker driving a real browser can still pass this. It is a
 * cost multiplier and a filter for commodity bots, not an identity proof.
 */

const crypto = require('node:crypto');

// Persist CAPTCHA_SECRET in production; a generated secret invalidates
// outstanding challenges whenever the process restarts.
const SECRET = process.env.CAPTCHA_SECRET || crypto.randomBytes(32).toString('hex');

/** Leading zero BITS the solution hash must have. Each +1 doubles the work. */
const DIFFICULTY = Math.max(8, Math.min(24, Number(process.env.CAPTCHA_DIFFICULTY) || 16));
/** How long a challenge stays valid. */
const TTL_MS = 10 * 60 * 1000;
/** Floor on how fast a challenge may come back, measured server-side. */
const MIN_ELAPSED_MS = 800;

/** Nonces already redeemed, so a solved challenge can't be replayed. */
const consumed = new Map();

function sha256hex(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function sign(payload) {
  return crypto.createHmac('sha256', SECRET).update(payload).digest('hex');
}

function pruneConsumed() {
  const now = Date.now();
  for (const [nonce, expiresAt] of consumed) {
    if (expiresAt <= now) consumed.delete(nonce);
  }
}

/**
 * Mints a challenge bound to the caller's IP.
 * Returns the wire form handed to the browser.
 */
function issue(ip) {
  const nonce = crypto.randomBytes(16).toString('hex');
  const issuedAt = Date.now();
  const payload = [nonce, issuedAt, DIFFICULTY, sha256hex(ip || 'unknown').slice(0, 16)].join('.');
  return {
    token: `${payload}.${sign(payload)}`,
    nonce,
    difficulty: DIFFICULTY,
  };
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

/**
 * Validates a submitted solution.
 * Returns { ok: true } or { ok: false, reason } — `reason` is for logs, not users.
 */
function verify({ token, solution, honeypot, ip }) {
  pruneConsumed();

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
  const expected = sign(payload);
  if (signature.length !== expected.length
    || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
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
  if (ipHash !== sha256hex(ip || 'unknown').slice(0, 16)) {
    return { ok: false, reason: 'challenge issued to another client' };
  }

  // 5. Single use.
  if (consumed.has(nonce)) return { ok: false, reason: 'challenge already used' };

  // 6. The actual work.
  if (leadingZeroBits(sha256hex(`${nonce}:${solution}`)) < difficulty) {
    return { ok: false, reason: 'invalid proof of work' };
  }

  consumed.set(nonce, issuedAt + TTL_MS);
  return { ok: true };
}

module.exports = { issue, verify, DIFFICULTY, sha256hex, leadingZeroBits, pruneConsumed };
