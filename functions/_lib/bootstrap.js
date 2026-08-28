import { hashPassword, verifyPassword, newToken, sha256hex } from "./crypto.js";
import { seedHelpCentre, seedMacros } from "./kb.js";

/**
 * Reserved account that inherits the threads and posts of a deleted user, so
 * deleting an account never destroys conversations other members took part in.
 * The bracketed name can't be registered (signup allows only [A-Za-z0-9_]) and
 * the row is banned, so it can never be signed into.
 */
const DELETED_USERNAME = '[deleted]';

import SCHEMA from "./schema-sql.js";

/**
 * `tier` was added after `users` already existed on deployed databases.
 * schema.sql's CREATE TABLE IF NOT EXISTS is a no-op against an existing
 * table, so an already-provisioned D1 database needs this ALTER TABLE run
 * once. Guarded by checking for the column first — ADD COLUMN isn't
 * idempotent on its own, and this runs on every fresh isolate's cold start.
 * Existing admins are backfilled from the legacy `role` column so nobody's
 * access silently changes.
 */
async function ensureTierColumn(db) {
  const columns = await db.all('PRAGMA table_info(users)');
  if (columns.some((c) => c.name === 'tier')) return;
  await db.run("ALTER TABLE users ADD COLUMN tier TEXT NOT NULL DEFAULT 'user'");
  await db.run("UPDATE users SET tier = 'admin' WHERE role = 'admin'");
}

/** Same guarded-ALTER pattern for ip_bans.expires_at (added for auto flood bans). */
async function ensureIpBanExpiryColumn(db) {
  const columns = await db.all('PRAGMA table_info(ip_bans)');
  if (columns.some((c) => c.name === 'expires_at')) return;
  await db.run('ALTER TABLE ip_bans ADD COLUMN expires_at INTEGER');
}

/** And for posts.edited_at / posts.edited_by (post editing shipped after launch). */
async function ensurePostEditColumns(db) {
  const columns = await db.all('PRAGMA table_info(posts)');
  if (!columns.some((c) => c.name === 'edited_at')) {
    await db.run('ALTER TABLE posts ADD COLUMN edited_at TEXT');
  }
  if (!columns.some((c) => c.name === 'edited_by')) {
    await db.run('ALTER TABLE posts ADD COLUMN edited_by TEXT');
  }
}

/** And for users.email_verified_at (email verification shipped after launch). */
async function ensureEmailVerifiedColumn(db) {
  const columns = await db.all('PRAGMA table_info(users)');
  if (columns.some((c) => c.name === 'email_verified_at')) return;
  await db.run('ALTER TABLE users ADD COLUMN email_verified_at TEXT');
}

/** And for users.paid_until (Paid subscriptions gained an optional expiry). */
async function ensurePaidUntilColumn(db) {
  const columns = await db.all('PRAGMA table_info(users)');
  if (columns.some((c) => c.name === 'paid_until')) return;
  await db.run('ALTER TABLE users ADD COLUMN paid_until INTEGER');
}

/**
 * Vanity / reserved UIDs. UIDs 0–1001 are a reserved block handed out by
 * admins; regular signups start at 1002. The brand accounts are pinned:
 * goyim=0, goy=1, omelette=2; the seeded admin gets the first free slot from
 * 3; the [deleted] placeholder anchors the top of the block at 1001 — which
 * also pushes SQLite's AUTOINCREMENT sequence past the block, so ordinary
 * inserts can never collide with a reserved UID.
 */
const VANITY_UIDS = [['goyim', 0], ['goy', 1], ['omelette', 2]];
const DELETED_UID = 1001;
const RESERVED_UID_MAX = 1001;
const VANITY_MARKER = 'vanity_uids_v1';

const USER_REF_COLUMNS = [
  ['threads', 'user_id'], ['posts', 'user_id'], ['shouts', 'user_id'],
  ['sessions', 'user_id'], ['auth_tokens', 'user_id'],
  ['ip_logs', 'user_id'], ['reports', 'reporter_id'],
  // Support. user_notes.user_id cascades on delete, so a UID move that did not
  // repoint it would silently destroy a member's staff notes.
  ['tickets', 'user_id'], ['tickets', 'assignee_id'],
  ['ticket_messages', 'author_id'], ['ticket_notes', 'author_id'],
  ['ticket_attachments', 'uploader_id'],
  ['user_notes', 'user_id'], ['user_notes', 'author_id'],
  ['support_views', 'owner_id'],
];

/**
 * Moves a user to a new id without ever violating UNIQUE or FK constraints,
 * and without needing a transaction (the D1 adapter runs statements
 * individually): copy the row under a temp name at the new id, repoint every
 * referencing row, delete the original, then restore the real name/email.
 * A crash mid-way is resumed safely on the next boot because every step of
 * the caller is guarded by current database state.
 */
async function relocateUserId(db, fromId, toId) {
  const original = await db.get('SELECT username, email FROM users WHERE id = ?', fromId);
  if (!original) return;
  const tempName = `__uidmove_${toId}`;
  await db.run('DELETE FROM users WHERE username = ?', tempName); // stale temp from a crashed run
  await db.run(
    `INSERT INTO users (id, username, email, password_hash, role, tier, banned,
                        email_verified_at, paid_until, signup_ip, last_login_ip, last_login_at, created_at)
     SELECT ?, ?, ?, password_hash, role, tier, banned,
            email_verified_at, paid_until, signup_ip, last_login_ip, last_login_at, created_at
     FROM users WHERE id = ?`,
    toId, tempName, `${tempName}@goyhub.invalid`, fromId
  );
  for (const [table, column] of USER_REF_COLUMNS) {
    await db.run(`UPDATE ${table} SET ${column} = ? WHERE ${column} = ?`, toId, fromId);
  }
  await db.run('DELETE FROM users WHERE id = ?', fromId);
  await db.run('UPDATE users SET username = ?, email = ? WHERE id = ?', original.username, original.email, toId);
}

/** First unoccupied UID in the reserved block from 3 upward (for displaced rows). */
async function firstFreeUid(db) {
  const taken = new Set((await db.all('SELECT id FROM users WHERE id BETWEEN 3 AND ?', RESERVED_UID_MAX - 1))
    .map((r) => Number(r.id)));
  for (let i = 3; i < RESERVED_UID_MAX; i += 1) {
    if (!taken.has(i)) return i;
  }
  return null;
}

async function ensureVanityUids(db) {
  if (await db.get('SELECT value FROM settings WHERE key = ?', VANITY_MARKER)) return;

  // [deleted] anchors the top of the reserved block (and the autoinc sequence).
  const del = await db.get('SELECT id FROM users WHERE username = ?', DELETED_USERNAME);
  if (del && del.id !== DELETED_UID && !(await db.get('SELECT id FROM users WHERE id = ?', DELETED_UID))) {
    await relocateUserId(db, del.id, DELETED_UID);
  }

  for (const [name, uid] of VANITY_UIDS) {
    // Whoever currently holds the slot (e.g. the seeded admin at id 2) moves
    // to the first free reserved UID — never deleted, never renamed.
    const occupant = await db.get('SELECT id, username FROM users WHERE id = ?', uid);
    if (occupant && String(occupant.username).toLowerCase() !== name) {
      const free = await firstFreeUid(db);
      if (free === null) continue; // block full — leave things as they are
      await relocateUserId(db, occupant.id, free);
    }
    const existing = await db.get('SELECT id FROM users WHERE username = ?', name);
    if (existing && existing.id !== uid) {
      if (!(await db.get('SELECT id FROM users WHERE id = ?', uid))) {
        await relocateUserId(db, existing.id, uid);
      }
    } else if (!existing) {
      // Random password — an admin assigns a real one from the Users tab.
      await db.run(
        'INSERT INTO users (id, username, email, password_hash, tier) VALUES (?, ?, ?, ?, ?)',
        uid, name, `${name}@goyhub.st`, await hashPassword(newToken(24)), 'user'
      );
    }
  }

  // Only mark done once the layout is actually in place, so partial runs
  // (crash mid-relocation) retry on the next boot.
  const anchored = await db.get('SELECT id FROM users WHERE username = ? AND id = ?', DELETED_USERNAME, DELETED_UID);
  const vanityOk = Number((await db.get(
    "SELECT COUNT(*) AS n FROM users WHERE (username = 'goyim' AND id = 0) OR (username = 'goy' AND id = 1) OR (username = 'omelette' AND id = 2)"
  )).n) === 3;
  if (anchored && vanityOk) {
    await db.run(
      `INSERT INTO settings (key, value, updated_at) VALUES (?, 'done', datetime('now'))
       ON CONFLICT(key) DO NOTHING`,
      VANITY_MARKER
    );
  }
}

/** And for payments.plan_id / plan_name (the catalogue shipped after checkout did). */
async function ensurePaymentPlanColumns(db) {
  const columns = await db.all('PRAGMA table_info(payments)');
  if (columns.length === 0) return; // table not created yet; schema.sql covers it
  if (!columns.some((c) => c.name === 'plan_id')) {
    await db.run('ALTER TABLE payments ADD COLUMN plan_id TEXT');
  }
  if (!columns.some((c) => c.name === 'plan_name')) {
    await db.run('ALTER TABLE payments ADD COLUMN plan_name TEXT');
  }
}

/**
 * Marker holding a hash of the DDL that was last applied successfully.
 *
 * D1 has no multi-statement exec, so the adapter replays schema.sql one
 * statement at a time — every CREATE TABLE IF NOT EXISTS and CREATE INDEX IF
 * NOT EXISTS is its own round-trip. On a schema this size that is ~70 calls on
 * every isolate cold start, all of them no-ops against a database that already
 * has the tables. Recording a fingerprint of the DDL turns that into a single
 * SELECT, while still re-running everything (including the guarded ALTERs) the
 * moment schema.sql actually changes — so it cannot become the "CREATE TABLE
 * IF NOT EXISTS silently did nothing" trap in a new costume.
 */
const SCHEMA_MARKER = 'schema_fingerprint';

async function schemaFingerprint(db) {
  try {
    const row = await db.get('SELECT value FROM settings WHERE key = ?', SCHEMA_MARKER);
    return row ? row.value : null;
  } catch {
    // `settings` itself does not exist yet — a brand-new database.
    return null;
  }
}

/** Runs the DDL once per process/isolate, and only when it has changed. */
const schemaReady = new WeakMap();

function ensureSchema(db) {
  if (!schemaReady.has(db)) {
    schemaReady.set(db, (async () => {
      const fingerprint = await sha256hex(SCHEMA);
      if (await schemaFingerprint(db) === fingerprint) return;

      await db.exec(SCHEMA);
      await ensureTierColumn(db);
      await ensureIpBanExpiryColumn(db);
      await ensurePostEditColumns(db);
      await ensureEmailVerifiedColumn(db);
      await ensurePaidUntilColumn(db);
      await ensurePaymentPlanColumns(db);

      // Written last: a crash part-way through leaves no marker, so the next
      // cold start does the whole thing again rather than trusting a
      // half-applied schema.
      await db.run(
        `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
        SCHEMA_MARKER, fingerprint
      );
    })());
  }
  return schemaReady.get(db);
}

async function deletedUserId(db) {
  const existing = await db.get('SELECT id FROM users WHERE username = ?', DELETED_USERNAME);
  if (existing) return existing.id;
  const created = await db.run(
    'INSERT INTO users (username, email, password_hash, banned) VALUES (?, ?, ?, 1)',
    DELETED_USERNAME, 'deleted@goyhub.invalid', await hashPassword(newToken(32))
  );
  return created.lastInsertRowid;
}

const CATEGORIES = [
  ['Announcements', 'announcements', 'Official news, changelogs and release notes from the GoyHub team.', 0],
  ['General Discussion', 'general', 'Talk about GoyHub, CS2 and everything in between.', 1],
  ['Support & Bug Reports', 'support', 'Something broken? Get help from the team and the community.', 2],
  ['Configs & Setups', 'configs', 'Share crosshairs, video settings, autoexecs and launch options.', 3],
  ['Off-Topic', 'off-topic', 'Anything that is not CS2. Keep it friendly.', 4],
];

const WELCOME_BODY = 'Welcome to the official GoyHub forum!\n\n'
  + 'This is the place to discuss the app, share your CS2 configs, report bugs and hang out with the community.\n\n'
  + 'House rules:\n'
  + '1. Be respectful. No harassment, hate speech or personal attacks.\n'
  + '2. No cheating software, exploits or account trading — instant ban.\n'
  + '3. Keep threads in the right category so people can find them.\n'
  + '4. Use Support & Bug Reports for issues — include your GoyHub version and logs.\n\n'
  + 'GL & HF!';

/**
 * First-run data. Safe to call repeatedly; every step is conditional.
 * Returns a note when it could not create the admin so the caller can warn.
 */
async function seed(db, env = {}) {
  await ensureSchema(db);
  await deletedUserId(db);

  const username = env.ADMIN_USERNAME || 'admin';
  let generatedPassword = null;
  // The lookup accepts tier OR legacy role so the break-glass below still
  // finds the account even if one of the two columns drifted. It does NOT
  // match an ordinary user row with that name: the default 'admin' is a
  // reserved signup name, so the row can only have been created here.
  const seededAdmin = await db.get(
    "SELECT id, password_hash FROM users WHERE username = ? AND (role = 'admin' OR tier = 'admin')",
    username
  );

  if (!seededAdmin) {
    // Someone may have already promoted a different account to admin (or
    // renamed/deleted the seed one) — only create a new one if no admin
    // exists at all, so this never produces two seeded admins.
    const anyAdmin = await db.get("SELECT id FROM users WHERE tier = 'admin' OR role = 'admin' LIMIT 1");
    if (!anyAdmin) {
      let password = env.ADMIN_PASSWORD;
      if (!password) {
        // Workers has no interactive console, so a generated password is only
        // useful locally. Deployments should set the ADMIN_PASSWORD secret.
        password = newToken(9);
        generatedPassword = password;
      }
      await db.run(
        "INSERT INTO users (username, email, password_hash, role, tier) VALUES (?, ?, ?, 'admin', 'admin')",
        username, env.ADMIN_EMAIL || 'admin@goyhub.st', await hashPassword(password)
      );
    }
  } else if (env.ADMIN_PASSWORD) {
    // Break-glass guarantee: while the ADMIN_PASSWORD secret is set, the
    // account named ADMIN_USERNAME is kept signed-in-able with exactly that
    // password and full admin tier, re-checked on every cold start. Rotating
    // the secret (or setting it late, after the account was first created
    // with a generated password) takes effect on the next request — no
    // database surgery, no redeploy-ordering traps.
    const matches = await verifyPassword(env.ADMIN_PASSWORD, seededAdmin.password_hash);
    if (!matches) {
      await db.run(
        'UPDATE users SET password_hash = ? WHERE id = ?',
        await hashPassword(env.ADMIN_PASSWORD), seededAdmin.id
      );
    }
    await db.run(
      "UPDATE users SET tier = 'admin', role = 'admin', banned = 0 WHERE id = ? AND (tier != 'admin' OR role != 'admin' OR banned != 0)",
      seededAdmin.id
    );
  }

  await ensureVanityUids(db);

  const hasCategories = await db.get('SELECT id FROM categories LIMIT 1');
  if (!hasCategories) {
    for (const [name, slug, description, position] of CATEGORIES) {
      await db.run(
        'INSERT INTO categories (name, slug, description, position) VALUES (?, ?, ?, ?)',
        name, slug, description, position
      );
    }

    const firstAdmin = await db.get("SELECT id FROM users WHERE role = 'admin' ORDER BY id LIMIT 1");
    const announcements = await db.get("SELECT id FROM categories WHERE slug = 'announcements'");
    if (firstAdmin && announcements) {
      const thread = await db.run(
        'INSERT INTO threads (category_id, user_id, title, pinned) VALUES (?, ?, ?, 1)',
        announcements.id, firstAdmin.id, 'Welcome to the GoyHub community forum!'
      );
      await db.run(
        'INSERT INTO posts (thread_id, user_id, body) VALUES (?, ?, ?)',
        thread.lastInsertRowid, firstAdmin.id, WELCOME_BODY
      );
    }
  }

  // Guests can open support tickets, which makes the proof-of-work the only
  // thing standing between an anonymous form and the outbound mailer. Its
  // fallback secret is in this repository, so say so once per cold start
  // rather than letting a deployment quietly run on it.
  if (!env.CAPTCHA_SECRET) {
    console.warn('CAPTCHA_SECRET is not set — the proof-of-work CAPTCHA is running on the public '
      + 'development secret, so sign-up and guest support tickets can be forged. Set it as a secret.');
  }

  // Help centre + canned replies. Both are one-shot: once a section (or a
  // macro) exists the seed never runs again, so an operator who rewrites or
  // deletes an article does not find it reinstated on the next cold start.
  await seedHelpCentre(db);
  await seedMacros(db);

  return { generatedPassword };
}

/**
 * Removes the identifying copies a support ticket keeps outside the users
 * table. `tickets.user_id` is ON DELETE SET NULL so the conversation itself
 * survives the account (a payment dispute has to outlive a rage-quit), but
 * `ticket_messages.author_name`, the guest address and the staff notes about
 * the person are denormalised copies that a foreign key will not touch.
 */
async function scrubSupportIdentity(db, userId, placeholderName) {
  await db.run(
    'UPDATE ticket_messages SET author_name = ? WHERE author_id = ?', placeholderName, userId
  );
  await db.run(
    'UPDATE ticket_attachments SET uploader_name = ? WHERE uploader_id = ?', placeholderName, userId
  );
  await db.run(
    'UPDATE tickets SET guest_email = NULL, guest_name = NULL, key_hash = NULL, ip = NULL, user_agent = NULL WHERE user_id = ?',
    userId
  );
  await db.run('DELETE FROM user_notes WHERE user_id = ?', userId);
  await db.run('DELETE FROM support_views WHERE owner_id = ?', userId);
}

/** Housekeeping: expired sessions, rate-limit windows, CAPTCHA nonces and auto IP bans. */
async function cleanup(db) {
  const now = Date.now();
  await db.run("DELETE FROM sessions WHERE expires_at <= datetime('now')");
  await db.run('DELETE FROM rate_limits WHERE reset_at <= ?', now);
  await db.run('DELETE FROM captcha_used WHERE expires_at <= ?', now);
  await db.run('DELETE FROM ip_bans WHERE expires_at IS NOT NULL AND expires_at <= ?', now);
  await db.run('DELETE FROM auth_tokens WHERE expires_at <= ? OR used = 1', now);

  // On-chain orders nobody ever paid, past the window in which a late payment
  // could still be matched to them. Deliberately only 'new' rows: a 'seen'
  // order has money against it and is never quietly written off. Nothing is
  // deleted — the row stays for the admin queue and the audit trail.
  await db.run(
    `UPDATE chain_orders SET status = 'expired', updated_at = datetime('now')
      WHERE status = 'new' AND credited_at IS NULL AND match_until < ?`, now
  ).catch(() => {});
  // Transactions that touched our wallet but paid us nothing (someone else's
  // activity on the same address). Kept a month so a scan doesn't re-fetch
  // them, then dropped. Rows carrying real money are never pruned.
  await db.run(
    `DELETE FROM chain_transfers
      WHERE status = 'ignored' AND created_at < datetime('now', '-30 days')`
  ).catch(() => {});
}

export {
  ensureSchema, seed, cleanup, deletedUserId, relocateUserId, scrubSupportIdentity,
  DELETED_USERNAME, RESERVED_UID_MAX,
};
