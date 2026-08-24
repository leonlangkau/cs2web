/**
 * Single-use, expiring auth tokens (password reset, email verification).
 * The raw token goes into the emailed link; only its SHA-256 lands in the
 * database, so a database leak can't be replayed into account takeovers.
 */
import { newToken, sha256hex } from "./crypto.js";

const TTL_MS = { reset: 60 * 60 * 1000, verify: 24 * 60 * 60 * 1000 };

/** Mints a token of `kind` for a user, invalidating their older ones of the same kind. */
async function createAuthToken(db, kind, userId) {
  const raw = newToken(32);
  await db.run('UPDATE auth_tokens SET used = 1 WHERE user_id = ? AND kind = ?', userId, kind);
  await db.run(
    'INSERT INTO auth_tokens (kind, token_hash, user_id, expires_at) VALUES (?, ?, ?, ?)',
    kind, await sha256hex(raw), userId, Date.now() + TTL_MS[kind]
  );
  return raw;
}

/** Looks up a live token without consuming it (to render the reset form). */
async function peekAuthToken(db, kind, raw) {
  if (!/^[a-f0-9]{64}$/.test(String(raw || ''))) return null;
  const row = await db.get(
    'SELECT * FROM auth_tokens WHERE token_hash = ? AND kind = ? AND used = 0 AND expires_at > ?',
    await sha256hex(raw), kind, Date.now()
  );
  return row || null;
}

/** Consumes a live token; returns its row once, null on replay/expiry/garbage. */
async function consumeAuthToken(db, kind, raw) {
  const row = await peekAuthToken(db, kind, raw);
  if (!row) return null;
  const res = await db.run('UPDATE auth_tokens SET used = 1 WHERE id = ? AND used = 0', row.id);
  return res.changes === 1 ? row : null; // changes=0: a concurrent request won the race
}

export { createAuthToken, peekAuthToken, consumeAuthToken };
