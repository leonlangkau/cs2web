'use strict';

const { RateLimiter } = require('./security');

// Single-process in-memory limiters, keyed by client IP (or user id where noted).
const limits = {
  login: new RateLimiter(10, 10 * 60 * 1000),    // 10 attempts / 10 min / IP
  signup: new RateLimiter(5, 60 * 60 * 1000),    // 5 accounts / hour / IP
  post: new RateLimiter(6, 60 * 1000),           // 6 posts / minute / user
  download: new RateLimiter(30, 60 * 60 * 1000), // 30 downloads / hour / IP
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
