'use strict';

const crypto = require('node:crypto');
const { promisify } = require('node:util');

const scryptAsync = promisify(crypto.scrypt);

const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

/** Synchronous hash — boot-time only (seeding). Request paths use hashPasswordAsync. */
function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64, SCRYPT_PARAMS);
  return `scrypt$${SCRYPT_PARAMS.N}$${SCRYPT_PARAMS.r}$${SCRYPT_PARAMS.p}$${salt.toString('base64')}$${hash.toString('base64')}`;
}

/** Async scrypt hash for request handlers — keeps the event loop free. */
async function hashPasswordAsync(password) {
  const salt = crypto.randomBytes(16);
  const hash = await scryptAsync(password, salt, 64, SCRYPT_PARAMS);
  return `scrypt$${SCRYPT_PARAMS.N}$${SCRYPT_PARAMS.r}$${SCRYPT_PARAMS.p}$${salt.toString('base64')}$${hash.toString('base64')}`;
}

/** Async, constant-time verification of a password against a stored hash. */
async function verifyPasswordAsync(password, stored) {
  try {
    const parts = String(stored).split('$');
    if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
    const [, N, r, p, saltB64, hashB64] = parts;
    const salt = Buffer.from(saltB64, 'base64');
    const expected = Buffer.from(hashB64, 'base64');
    const actual = await scryptAsync(password, salt, expected.length, {
      N: Number(N), r: Number(r), p: Number(p), maxmem: 64 * 1024 * 1024,
    });
    return crypto.timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

/** Cryptographically random hex token. */
function newToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('hex');
}

function sha256hex(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

/** Constant-time string comparison that never throws on length mismatch. */
function safeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

/**
 * Fixed-window in-memory rate limiter.
 * Suitable for a single-process deployment; swap for a shared store when scaling out.
 */
class RateLimiter {
  constructor(limit, windowMs) {
    this.limit = limit;
    this.windowMs = windowMs;
    this.hits = new Map();
  }

  /** Records a hit for `key`; returns { ok, retryAfterSec }. */
  check(key) {
    const now = Date.now();
    let entry = this.hits.get(key);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + this.windowMs };
      this.hits.set(key, entry);
    }
    entry.count += 1;
    if (entry.count > this.limit) {
      return { ok: false, retryAfterSec: Math.max(1, Math.ceil((entry.resetAt - now) / 1000)) };
    }
    return { ok: true, retryAfterSec: 0 };
  }

  /** Forgives one recorded hit (e.g. after a successful login). */
  forgive(key) {
    const entry = this.hits.get(key);
    if (entry && entry.count > 0) entry.count -= 1;
  }

  prune() {
    const now = Date.now();
    for (const [key, entry] of this.hits) {
      if (entry.resetAt <= now) this.hits.delete(key);
    }
  }
}

module.exports = { hashPassword, hashPasswordAsync, verifyPasswordAsync, newToken, sha256hex, safeEqual, RateLimiter };
