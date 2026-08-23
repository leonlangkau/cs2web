/**
 * Fixed-window rate limiting backed by the database.
 *
 * The previous in-process Map worked on a single Node process but is useless on
 * Workers, where every isolate has its own memory. Storing the counters means
 * the limit holds across isolates and across restarts.
 *
 * Read-then-write is not atomic, so a burst of simultaneous requests can slip
 * one or two over the limit. That is an acceptable trade for a throttle; it is
 * not a correctness boundary.
 */

const DEFAULTS = {
  login: { limit: 10, windowMs: 10 * 60 * 1000 },     // per IP
  signup: { limit: 5, windowMs: 60 * 60 * 1000 },     // per IP
  post: { limit: 6, windowMs: 60 * 1000 },            // per user
  download: { limit: 30, windowMs: 60 * 60 * 1000 },  // per IP
};

const ENV_KEYS = {
  login: 'RATE_LIMIT_LOGIN',
  signup: 'RATE_LIMIT_SIGNUP',
  post: 'RATE_LIMIT_POST',
  download: 'RATE_LIMIT_DOWNLOAD',
};

function limitFor(name, env = {}) {
  const raw = Number(env[ENV_KEYS[name]]);
  const fallback = DEFAULTS[name].limit;
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : fallback;
}

/**
 * Records a hit against `name:key`. Returns { ok, retryAfterSec }.
 */
async function check(db, name, key, env = {}) {
  const { windowMs } = DEFAULTS[name];
  const limit = limitFor(name, env);
  const storageKey = `${name}:${key}`;
  const now = Date.now();

  const row = await db.get('SELECT count, reset_at FROM rate_limits WHERE key = ?', storageKey);

  if (!row || Number(row.reset_at) <= now) {
    await db.run(
      `INSERT INTO rate_limits (key, count, reset_at) VALUES (?, 1, ?)
       ON CONFLICT(key) DO UPDATE SET count = 1, reset_at = excluded.reset_at`,
      storageKey, now + windowMs
    );
    return { ok: true, retryAfterSec: 0 };
  }

  const next = Number(row.count) + 1;
  await db.run('UPDATE rate_limits SET count = ? WHERE key = ?', next, storageKey);

  if (next > limit) {
    return { ok: false, retryAfterSec: Math.max(1, Math.ceil((Number(row.reset_at) - now) / 1000)) };
  }
  return { ok: true, retryAfterSec: 0 };
}

/** Forgives one recorded hit — used after a successful login. */
async function forgive(db, name, key) {
  await db.run(
    'UPDATE rate_limits SET count = count - 1 WHERE key = ? AND count > 0',
    `${name}:${key}`
  );
}

export { check, forgive, limitFor, DEFAULTS };
