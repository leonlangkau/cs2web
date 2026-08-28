/**
 * Support domain: statuses, priorities, SLA, ticket identity and the
 * side-effects a ticket triggers (email, webhook, audit).
 *
 * Everything here is deliberately free of view and route concerns so the
 * public routes, the staff backend and the tests all share one definition of
 * what a ticket IS. Two rules the rest of the code leans on:
 *
 *  - a requester's access to a ticket is decided in exactly one place
 *    (`resolveAccess`), never re-derived at a call site;
 *  - notifications never throw. A support ticket must be created even if the
 *    mail provider is down, the webhook 404s or the AI key expired.
 */
import { newToken, sha256hex, safeEqual } from "./crypto.js";
import { getCookie, setCookie } from "./cookies.js";
import { sendEmail, isEmailConfigured } from "./email.js";
import { notifySupport } from "./webhooks.js";
import { isStaff } from "./tiers.js";

/* ------------------------------------------------------------------ *
 * Vocabulary
 * ------------------------------------------------------------------ */

/**
 * Status flow. `answered` means the ball is in the customer's court and
 * `pending` means it is in ours — the distinction is what lets the queue sort
 * by "who is actually waiting on whom" rather than by age alone.
 */
const STATUSES = ['open', 'pending', 'answered', 'solved', 'closed'];
const STATUS_LABELS = {
  open: 'Open',
  pending: 'Pending',
  answered: 'Awaiting reply',
  solved: 'Solved',
  closed: 'Closed',
};
/** Statuses that still count as work in the queue. */
const ACTIVE_STATUSES = ['open', 'pending', 'answered'];
/** Statuses in which the requester may still write. */
const REPLYABLE_STATUSES = new Set(['open', 'pending', 'answered', 'solved']);

const PRIORITIES = ['low', 'normal', 'high', 'urgent'];
const PRIORITY_LABELS = { low: 'Low', normal: 'Normal', high: 'High', urgent: 'Urgent' };
const PRIORITY_RANK = { low: 0, normal: 1, high: 2, urgent: 3 };

/**
 * Ticket categories. These are the buckets the help centre is organised into
 * as well, so a deflected article and the ticket it failed to deflect land in
 * the same reporting row.
 */
const CATEGORIES = [
  ['install', 'Install & updates'],
  ['account', 'Account & login'],
  ['billing', 'Payments & membership'],
  ['app', 'App bugs & crashes'],
  ['ingame', 'In-game & performance'],
  ['safety', 'Anti-cheat & safety'],
  ['forum', 'Forum & moderation'],
  ['privacy', 'Privacy & data'],
  ['other', 'Something else'],
];
const CATEGORY_LABELS = Object.fromEntries(CATEGORIES);
const CATEGORY_IDS = CATEGORIES.map(([id]) => id);

const MAX_SUBJECT = 120;
const MAX_BODY = 8000;
const MAX_NOTE = 4000;
const MAX_TAG_LEN = 24;
const MAX_TAGS = 8;
const MAX_GUEST_NAME = 40;
const MAX_RATING_COMMENT = 500;

const TICKET_COOKIE = 'ghtickets';
const TICKET_COOKIE_MAX = 8;
const TICKET_COOKIE_DAYS = 120;

const normalizeStatus = (v) => (STATUSES.includes(v) ? v : 'open');
const normalizePriority = (v) => (PRIORITIES.includes(v) ? v : 'normal');
const normalizeCategory = (v) => (CATEGORY_IDS.includes(v) ? v : 'other');

/* ------------------------------------------------------------------ *
 * Configuration
 * ------------------------------------------------------------------ */

function intVar(env, key, fallback, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  const raw = Number(env[key]);
  if (!Number.isFinite(raw)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(raw)));
}

const boolVar = (env, key, fallback) => {
  const raw = String(env[key] ?? '').trim();
  if (raw === '') return fallback;
  return raw === '1' || raw.toLowerCase() === 'true';
};

/**
 * Everything the support system reads from env, resolved once per request so
 * a route never has to remember a default.
 */
function supportConfig(env = {}) {
  return {
    guestsAllowed: boolVar(env, 'SUPPORT_GUEST_TICKETS', true),
    slaHours: {
      low: intVar(env, 'SUPPORT_SLA_LOW_HOURS', 72, { min: 1, max: 720 }),
      normal: intVar(env, 'SUPPORT_SLA_NORMAL_HOURS', 24, { min: 1, max: 720 }),
      high: intVar(env, 'SUPPORT_SLA_HIGH_HOURS', 8, { min: 1, max: 720 }),
      urgent: intVar(env, 'SUPPORT_SLA_URGENT_HOURS', 2, { min: 1, max: 720 }),
    },
    // 600 KB base64-inflates to ~800 KB, which keeps real headroom under D1's
    // 1 MB per-value ceiling; four of them still fit the router's upload cap.
    attachMaxKb: intVar(env, 'SUPPORT_ATTACH_MAX_KB', 512, { min: 16, max: 600 }),
    attachMaxCount: intVar(env, 'SUPPORT_ATTACH_MAX_COUNT', 4, { min: 0, max: 10 }),
    // Total bytes one conversation may ever hold. Without it, the per-message
    // cap is no cap at all: the reply bucket is keyed per ticket, so sixty
    // messages of four files each is 120 MB in a single thread.
    attachTicketMaxKb: intVar(env, 'SUPPORT_ATTACH_TICKET_MAX_KB', 8192, { min: 512, max: 262144 }),
    autoCloseDays: intVar(env, 'SUPPORT_AUTOCLOSE_DAYS', 7, { min: 0, max: 365 }),
    attachRetainDays: intVar(env, 'SUPPORT_ATTACH_RETAIN_DAYS', 180, { min: 0, max: 3650 }),
    emailNotify: boolVar(env, 'SUPPORT_EMAIL_NOTIFY', true) && isEmailConfigured(env),
    webhookConfigured: Boolean(env.SUPPORT_WEBHOOK_URL),
    siteUrl: String(env.SITE_URL || '').replace(/\/+$/, ''),
  };
}

/** First-response deadline in ms epoch for a priority. */
function slaDueAt(priority, cfg, from = Date.now()) {
  const hours = cfg.slaHours[normalizePriority(priority)] ?? cfg.slaHours.normal;
  return from + hours * 3_600_000;
}

/* ------------------------------------------------------------------ *
 * Identity: public ref + guest access key
 * ------------------------------------------------------------------ */

/**
 * Human-quotable public reference, e.g. GH-9F3A2C71. Uppercase hex has no
 * O/0 or I/1 ambiguity to read out over chat, and the UNIQUE constraint plus
 * this retry loop make a collision a non-event.
 */
async function allocateRef(db) {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const ref = `GH-${newToken(4).toUpperCase()}`;
    if (!(await db.get('SELECT id FROM tickets WHERE ref = ?', ref))) return ref;
  }
  // Astronomically unlikely; widen rather than fail the customer's request.
  return `GH-${newToken(8).toUpperCase()}`;
}

const REF_RE = /^GH-[0-9A-F]{8,16}$/;
const KEY_RE = /^[a-f0-9]{64}$/;

function normalizeRef(raw) {
  const ref = String(raw || '').trim().toUpperCase();
  return REF_RE.test(ref) ? ref : null;
}

/** Mints a guest access key; only its SHA-256 is ever stored. */
async function issueTicketKey() {
  const key = newToken(32);
  return { key, hash: await sha256hex(key) };
}

/**
 * Reads the guest's remembered ticket keys. Kept in one HttpOnly cookie so a
 * guest who came back on the same browser never needs the emailed link, while
 * the link itself remains the portable way in.
 */
function readTicketCookie(c) {
  const raw = getCookie(c, TICKET_COOKIE);
  if (!raw) return [];
  try {
    const decoded = JSON.parse(atob(raw.replace(/-/g, '+').replace(/_/g, '/')));
    if (!Array.isArray(decoded)) return [];
    return decoded
      .filter((e) => e && normalizeRef(e.r) && KEY_RE.test(String(e.k || '')))
      .slice(0, TICKET_COOKIE_MAX)
      .map((e) => ({ r: normalizeRef(e.r), k: String(e.k) }));
  } catch {
    return [];
  }
}

function writeTicketCookie(c, entries, cookieOpts) {
  const value = btoa(JSON.stringify(entries.slice(0, TICKET_COOKIE_MAX)))
    .replace(/\+/g, '-').replace(/\//g, '_');
  setCookie(c, TICKET_COOKIE, value, { ...cookieOpts, maxAge: TICKET_COOKIE_DAYS * 86400 });
}

/** Remembers `ref`'s key in the browser, newest first. */
function rememberTicketKey(c, ref, key, cookieOpts) {
  const entries = [{ r: ref, k: key }, ...readTicketCookie(c).filter((e) => e.r !== ref)];
  writeTicketCookie(c, entries, cookieOpts);
}

function forgetTicketKey(c, ref, cookieOpts) {
  writeTicketCookie(c, readTicketCookie(c).filter((e) => e.r !== ref), cookieOpts);
}

const cookieKeyFor = (c, ref) => (readTicketCookie(c).find((e) => e.r === ref) || {}).k || null;

/**
 * THE access decision for a ticket. Every route that reads or writes a
 * ticket goes through this — there is no second implementation to drift.
 *
 * Returns { ok, role, via } where role is 'staff' | 'owner' | null:
 *   - staff  : any developer/trial_admin/admin, from the session;
 *   - owner  : the signed-in member the ticket belongs to, OR a guest holding
 *              the ticket key (from the ?k= link or the remembered cookie).
 *
 * A member ticket is NEVER reachable with a key alone, and a guest ticket is
 * never reachable just by being signed in: the two paths do not cross.
 */
function resolveAccess(c, ticket, submittedKey = null) {
  if (!ticket) return { ok: false, role: null, via: null };
  const user = c.get('user');

  if (isStaff(user)) return { ok: true, role: 'staff', via: 'session' };
  // `!= null` rather than a truthy test: UID 0 is a real account in this
  // codebase (the reserved vanity block starts at zero), and a falsy check
  // would lock that member out of their own ticket.
  if (user && ticket.user_id != null && Number(ticket.user_id) === Number(user.id)) {
    return { ok: true, role: 'owner', via: 'session' };
  }
  if (ticket.key_hash) {
    const fromUrl = KEY_RE.test(String(submittedKey || ''));
    const candidate = fromUrl ? String(submittedKey) : cookieKeyFor(c, ticket.ref);
    // `source` decides whether the views keep ?k= in their links: with a
    // working cookie they do not need it, but a browser that drops the cookie
    // must still be able to use the ticket, so the URL key stays authoritative
    // when that is how the requester arrived.
    if (candidate) return { ok: false, role: null, via: 'key', candidate, source: fromUrl ? 'url' : 'cookie' };
  }
  return { ok: false, role: null, via: null };
}

/**
 * Async half of resolveAccess: hashing the candidate key needs await, so the
 * synchronous part above short-circuits first and this only runs for the
 * key path.
 */
async function checkAccess(c, ticket, submittedKey = null) {
  const sync = resolveAccess(c, ticket, submittedKey);
  if (sync.ok || !sync.candidate) return { ok: sync.ok, role: sync.role, via: sync.via };
  const hash = await sha256hex(sync.candidate);
  if (safeEqual(hash, String(ticket.key_hash || ''))) {
    return { ok: true, role: 'owner', via: 'key', key: sync.candidate, source: sync.source };
  }
  return { ok: false, role: null, via: null };
}

/* ------------------------------------------------------------------ *
 * Small value helpers
 * ------------------------------------------------------------------ */

/** "Crash , Windows11 ,, crash" -> "crash,windows11" */
function normalizeTags(raw) {
  const seen = [];
  for (const piece of String(raw || '').split(/[,\n]/)) {
    const tag = piece.trim().toLowerCase().replace(/[^a-z0-9 _-]/g, '').replace(/\s+/g, '-').slice(0, MAX_TAG_LEN);
    if (tag && !seen.includes(tag)) seen.push(tag);
    if (seen.length >= MAX_TAGS) break;
  }
  return seen.join(',');
}

const tagList = (raw) => String(raw || '').split(',').map((t) => t.trim()).filter(Boolean);

/** Collapses runaway whitespace without destroying paragraph breaks. */
function cleanBody(raw, max = MAX_BODY) {
  return String(raw || '')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim()
    .slice(0, max);
}

const EMAIL_RE = /^[^@\s]+@[^@\s.]+\.[^@\s]{2,}$/;
const validEmail = (value) => EMAIL_RE.test(String(value || '').trim().slice(0, 254));

/** Ticket subject/short text: single line, no control characters. */
const cleanLine = (raw, max) => String(raw || '').replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

/** Where a requester reads this ticket. */
const ticketPath = (ticket) => `/support/t/${encodeURIComponent(ticket.ref)}`;

/** Absolute URL for emails/webhooks; falls back to a path when SITE_URL is unset. */
function ticketUrl(ticket, cfg, key = null) {
  const path = ticketPath(ticket) + (key ? `?k=${key}` : '');
  return cfg.siteUrl ? `${cfg.siteUrl}${path}` : path;
}

/**
 * True when two tickets belong to the same person. Merging is only safe within
 * one requester: access is per-ticket (a guest key hashes against exactly one
 * key_hash), so folding someone else's conversation into yours would either
 * strand them at a dead link or hand you their thread.
 */
function sameRequester(a, b) {
  if (a.user_id && b.user_id) return Number(a.user_id) === Number(b.user_id);
  if (!a.user_id && !b.user_id) {
    const left = String(a.guest_email || '').toLowerCase();
    const right = String(b.guest_email || '').toLowerCase();
    return Boolean(left) && left === right;
  }
  return false;
}

/* ------------------------------------------------------------------ *
 * Writes
 * ------------------------------------------------------------------ */

/**
 * Appends a message and moves every derived counter with it, in one place:
 * a customer message raises staff_unread and re-opens an answered ticket; a
 * staff message raises user_unread, stamps the first response (closing the
 * SLA) and flips the ticket to "awaiting reply".
 */
async function addMessage(db, ticket, { role, authorId = null, authorName, body, via = 'web', aiAssisted = false }) {
  const now = Date.now();
  const res = await db.run(
    `INSERT INTO ticket_messages (ticket_id, author_id, author_name, author_role, body, via, ai_assisted)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ticket.id, authorId, authorName, role, body, via, aiAssisted ? 1 : 0
  );

  if (role === 'user') {
    const next = ticket.status === 'closed' ? 'open' : (ticket.status === 'answered' || ticket.status === 'solved' ? 'open' : ticket.status);
    await db.run(
      `UPDATE tickets
          SET last_user_at = ?, staff_unread = staff_unread + 1, status = ?,
              closed_at = NULL, closed_by = NULL, updated_at = datetime('now')
        WHERE id = ?`,
      now, next, ticket.id
    );
  } else if (role === 'staff') {
    await db.run(
      `UPDATE tickets
          SET last_staff_at = ?, user_unread = user_unread + 1,
              first_response_at = COALESCE(first_response_at, ?),
              status = CASE WHEN status IN ('open','pending') THEN 'answered' ELSE status END,
              updated_at = datetime('now')
        WHERE id = ?`,
      now, now, ticket.id
    );
  } else {
    await db.run("UPDATE tickets SET updated_at = datetime('now') WHERE id = ?", ticket.id);
  }

  return Number(res.lastInsertRowid);
}

/** Staff-only structured history entry. */
async function addEvent(db, ticketId, actorName, kind, detail = '') {
  await db.run(
    'INSERT INTO ticket_events (ticket_id, actor_name, kind, detail) VALUES (?, ?, ?, ?)',
    ticketId, actorName, kind, String(detail).slice(0, 300)
  );
}

/**
 * Lazy SLA sweep. There is no cron on Pages, so first-response breaches are
 * stamped whenever staff open the queue (and by the optional external cron
 * endpoint). Bounded and idempotent: only unbreached, un-answered, still-open
 * tickets past their deadline are touched, and each is marked exactly once.
 */
async function sweepSla(db, cfg, { limit = 50 } = {}) {
  const now = Date.now();
  const due = await db.all(
    `SELECT id, ref, subject, priority, category, sla_due_at FROM tickets
      WHERE sla_breached = 0 AND first_response_at IS NULL
        AND status IN ('open','pending')
        AND sla_due_at IS NOT NULL AND sla_due_at < ?
      ORDER BY sla_due_at LIMIT ?`,
    now, limit
  );
  const breached = [];
  for (const ticket of due) {
    const res = await db.run(
      'UPDATE tickets SET sla_breached = 1, updated_at = datetime(\'now\') WHERE id = ? AND sla_breached = 0',
      ticket.id
    );
    if (res.changes === 1) {
      await addEvent(db, ticket.id, 'system', 'sla_breach',
        `first-response SLA missed (${PRIORITY_LABELS[ticket.priority] || ticket.priority})`);
      breached.push(ticket);
    }
  }
  return breached;
}

/**
 * Auto-closes solved tickets nobody came back to. Same lazy pattern; keeps
 * the queue honest without a background job.
 */
async function sweepAutoClose(db, cfg, { limit = 50 } = {}) {
  if (!cfg.autoCloseDays) return 0;
  const cutoff = Date.now() - cfg.autoCloseDays * 86_400_000;
  const stale = await db.all(
    `SELECT id FROM tickets
      WHERE status = 'solved'
        AND closed_at IS NOT NULL AND closed_at < ?
        AND COALESCE(last_user_at, 0) < ?
      ORDER BY id LIMIT ?`,
    cutoff, cutoff, limit
  );
  for (const ticket of stale) {
    const res = await db.run(
      `UPDATE tickets SET status = 'closed', closed_at = ?, closed_by = 'system', updated_at = datetime('now')
        WHERE id = ? AND status = 'solved'`,
      Date.now(), ticket.id
    );
    if (res.changes === 1) await addEvent(db, ticket.id, 'system', 'auto_close', `no reply for ${cfg.autoCloseDays} days`);
  }
  return stale.length;
}

/** Broadened SELECT for sweepSla so an alert can name the ticket properly. */

/**
 * Drops the BYTES of old attachments on tickets that are finished with, while
 * leaving the row in place so the transcript still shows that a screenshot was
 * sent and when. Without this, base64 in D1 grows at screenshot rates forever
 * and the first symptom is a bill rather than an error.
 */
async function sweepAttachments(db, cfg, { limit = 40 } = {}) {
  if (!cfg.attachRetainDays) return 0;
  const cutoff = Date.now() - cfg.attachRetainDays * 86_400_000;
  const stale = await db.all(
    `SELECT a.id FROM ticket_attachments a JOIN tickets t ON t.id = a.ticket_id
      WHERE a.purged_at IS NULL
        AND t.status IN ('solved','closed')
        AND COALESCE(t.closed_at, 0) > 0 AND t.closed_at < ?
      ORDER BY a.id LIMIT ?`,
    cutoff, limit
  );
  for (const row of stale) {
    await db.run(
      "UPDATE ticket_attachments SET data = '', purged_at = ? WHERE id = ? AND purged_at IS NULL",
      Date.now(), row.id
    );
  }
  return stale.length;
}

/**
 * Recomputes a ticket's derived lifecycle fields from the messages it actually
 * holds. Needed after a merge, which moves a conversation between tickets and
 * would otherwise leave the survivor claiming a first response that happened
 * on the other ticket, or an "awaiting reply" state that is no longer true.
 */
async function recomputeTicketState(db, ticketId) {
  const rows = await db.all(
    `SELECT author_role, created_at FROM ticket_messages WHERE ticket_id = ? ORDER BY id`, ticketId
  );
  if (!rows.length) return;
  const msMs = (v) => {
    const t = new Date(`${String(v).replace(' ', 'T')}Z`).getTime();
    return Number.isFinite(t) ? t : Date.now();
  };
  const staff = rows.filter((r) => r.author_role === 'staff');
  const user = rows.filter((r) => r.author_role === 'user');
  const lastIsUser = rows[rows.length - 1].author_role === 'user';

  await db.run(
    `UPDATE tickets
        SET first_response_at = ?, last_staff_at = ?, last_user_at = ?,
            status = CASE WHEN status IN ('solved','closed') THEN status
                          WHEN ? = 1 THEN 'open' ELSE 'answered' END,
            updated_at = datetime('now')
      WHERE id = ?`,
    staff.length ? msMs(staff[0].created_at) : null,
    staff.length ? msMs(staff[staff.length - 1].created_at) : null,
    user.length ? msMs(user[user.length - 1].created_at) : null,
    lastIsUser ? 1 : 0,
    ticketId
  );
}

/* ------------------------------------------------------------------ *
 * Notifications — best effort, never fatal
 * ------------------------------------------------------------------ */

/** The address a ticket's requester reads, member or guest. */
const requesterEmail = (ticket) => ticket.user_email || ticket.guest_email || null;
const requesterName = (ticket) => ticket.username || ticket.guest_name || 'there';

async function emailRequester(env, cfg, ticket, { subject, text }) {
  if (!cfg.emailNotify) return { ok: false, error: 'not_configured' };
  const to = requesterEmail(ticket);
  if (!to) return { ok: false, error: 'no_address' };
  try {
    return await sendEmail(env, { to, subject, text });
  } catch (err) {
    console.warn('support email failed:', err && err.message);
    return { ok: false, error: 'send_failed' };
  }
}

/**
 * "A human replied" mail. Deliberately does NOT quote the whole reply: the
 * ticket link is the canonical place to read it, which keeps mail short and
 * avoids leaking a conversation to a mailbox someone else now controls.
 */
function staffReplyMail(ticket, cfg, key) {
  return {
    subject: `[${ticket.ref}] Re: ${ticket.subject}`,
    text: `Hi ${requesterName(ticket)},\n\n`
      + `Support has replied to your ticket ${ticket.ref} — "${ticket.subject}".\n\n`
      + `Read the reply and continue the conversation here:\n${ticketUrl(ticket, cfg, key)}\n\n`
      + `— GoyHub Support`,
  };
}

function ticketOpenedMail(ticket, cfg, key) {
  return {
    subject: `[${ticket.ref}] We got your message`,
    text: `Hi ${requesterName(ticket)},\n\n`
      + `Thanks for contacting GoyHub Support. Your ticket is ${ticket.ref} — "${ticket.subject}".\n\n`
      + `Track it, add details or attach a screenshot here:\n${ticketUrl(ticket, cfg, key)}\n\n`
      + (key ? 'Keep that link — it is the key to your ticket, so do not share it.\n\n' : '')
      + `— GoyHub Support`,
  };
}

function ticketClosedMail(ticket, cfg, key) {
  return {
    subject: `[${ticket.ref}] Ticket closed`,
    text: `Hi ${requesterName(ticket)},\n\n`
      + `Your ticket ${ticket.ref} — "${ticket.subject}" — has been closed.\n\n`
      + `If it is not actually fixed, reply on the ticket and it reopens automatically:\n${ticketUrl(ticket, cfg, key)}\n\n`
      + `We would love 10 seconds of feedback on how we did — there is a rating on that page.\n\n`
      + `— GoyHub Support`,
  };
}

/** Fire-and-forget staff alert (Discord-compatible webhook). */
async function alertStaff(env, cfg, kind, ticket, extra = {}) {
  if (!cfg.webhookConfigured) return { ok: false, error: 'not_configured' };
  return notifySupport(env, kind, {
    ref: ticket.ref,
    subject: ticket.subject,
    priority: ticket.priority,
    category: CATEGORY_LABELS[ticket.category] || ticket.category,
    requester: ticket.username || ticket.guest_email || 'guest',
    url: cfg.siteUrl ? `${cfg.siteUrl}/admin/support/${ticket.id}` : `/admin/support/${ticket.id}`,
    ...extra,
  });
}

export {
  STATUSES, STATUS_LABELS, ACTIVE_STATUSES, REPLYABLE_STATUSES,
  PRIORITIES, PRIORITY_LABELS, PRIORITY_RANK,
  CATEGORIES, CATEGORY_LABELS, CATEGORY_IDS,
  MAX_SUBJECT, MAX_BODY, MAX_NOTE, MAX_TAGS, MAX_GUEST_NAME, MAX_RATING_COMMENT,
  TICKET_COOKIE,
  normalizeStatus, normalizePriority, normalizeCategory, normalizeTags, tagList,
  cleanBody, cleanLine, validEmail,
  supportConfig, slaDueAt,
  allocateRef, normalizeRef, issueTicketKey, rememberTicketKey, forgetTicketKey,
  readTicketCookie, cookieKeyFor, checkAccess, resolveAccess,
  ticketPath, ticketUrl, requesterEmail, requesterName, sameRequester,
  addMessage, addEvent, sweepSla, sweepAutoClose, sweepAttachments, recomputeTicketState,
  emailRequester, staffReplyMail, ticketOpenedMail, ticketClosedMail, alertStaff,
};
