'use strict';

const { RateLimiter } = require('./security');

/** Env override for a limit, falling back to the shipped default. */
function limitFor(name, fallback) {
  const raw = Number(process.env[name]);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : fallback;
}

// Single-process in-memory limiters, keyed by client IP (or user id where noted).
const limits = {
  login: new RateLimiter(limitFor('RATE_LIMIT_LOGIN', 10), 10 * 60 * 1000),       // per IP / 10 min
  signup: new RateLimiter(limitFor('RATE_LIMIT_SIGNUP', 5), 60 * 60 * 1000),      // per IP / hour
  post: new RateLimiter(limitFor('RATE_LIMIT_POST', 6), 60 * 1000),               // per user / minute
  download: new RateLimiter(limitFor('RATE_LIMIT_DOWNLOAD', 30), 60 * 60 * 1000), // per IP / hour
};

function pruneAll() {
  for (const limiter of Object.values(limits)) limiter.prune();
}

/** Renders the shared 429 page with a Retry-After header. */
function tooMany(res, retryAfterSec) {
  res.set('Retry-After', String(retryAfterSec));
  return res.status(429).render('error', {
    title: 'Slow down',
    code: 429,
    message: `Too many requests. Try again in about ${retryAfterSec} seconds.`,
  });
}

module.exports = { limits, pruneAll, tooMany };
