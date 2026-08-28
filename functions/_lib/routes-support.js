/**
 * Public support: the help centre, the contact funnel and the live ticket
 * chat.
 *
 * Everything here is open to EVERY tier, including Free, and to visitors with
 * no account at all — support is the one part of the site that is never a
 * membership benefit. Guests are held to the same anti-abuse bar as sign-up
 * (proof-of-work CAPTCHA, honeypot, per-IP rate limits) and get back a
 * single-secret ticket key, so an anonymous conversation is still private.
 */
import * as views from "./views/support.js";
import * as site from "./views/site.js";
import * as limits from "./limits.js";
import * as captcha from "./captcha.js";
import * as ai from "./ai.js";
import { searchArticles, terms } from "./kb.js";
import {
  readUploads, saveUploads, attachmentResponse,
} from "./attachments.js";
import {
  audit, clientIp, userAgent, formBody, setFlash, cookieOptions, requireAuth, defer,
} from "./middleware.js";
import { safeEqual } from "./crypto.js";
import { isStaff } from "./tiers.js";
import { tooMany } from "./routes-main.js";
import {
  CATEGORIES, MAX_SUBJECT, MAX_BODY, MAX_RATING_COMMENT,
  normalizeCategory, normalizePriority, normalizeTags, cleanBody, cleanLine, validEmail,
  supportConfig, slaDueAt, allocateRef, normalizeRef, issueTicketKey,
  rememberTicketKey, readTicketCookie, checkAccess,
  addMessage, addEvent, sweepSla, sweepAutoClose, sweepAttachments,
  emailRequester, ticketOpenedMail, staffReplyMail, alertStaff, ticketUrl,
} from "./support.js";

const MESSAGES_PER_LOAD = 60;
const SUGGEST_LIMIT = 4;

function notFound(c) {
  return c.html(site.errorPage(c.get('view'), {
    code: 404, title: 'Not found', message: 'This page does not exist.',
  }), 404);
}

const intParam = (value, fallback = 0) => {
  const n = parseInt(value, 10);
  return Number.isInteger(n) ? n : fallback;
};

/** Ticket row plus the requester's identity, whichever kind of requester it is. */
async function loadTicket(db, ref) {
  return db.get(
    `SELECT t.*, u.username, u.email AS user_email, u.tier AS user_tier
       FROM tickets t LEFT JOIN users u ON u.id = t.user_id
      WHERE t.ref = ?`,
    ref
  );
}

const messagesFor = (db, ticketId, afterId = 0) => db.all(
  `SELECT id, author_name, author_role, body, created_at
     FROM ticket_messages WHERE ticket_id = ? AND id > ? ORDER BY id LIMIT ?`,
  ticketId, afterId, MESSAGES_PER_LOAD
);

const attachmentsFor = (db, ticketId) => db.all(
  `SELECT id, message_id, filename, mime, bytes FROM ticket_attachments
    WHERE ticket_id = ? ORDER BY id`,
  ticketId
);

/** Reads ?k= (GET) or the k field (POST) — the guest ticket key. */
function submittedKey(c, body = null) {
  const fromQuery = new URL(c.req.url).searchParams.get('k');
  const fromBody = body ? body.k : null;
  return String(fromQuery || fromBody || '') || null;
}

/**
 * "Your link doesn't work here" — deliberately identical whether the ticket
 * does not exist or the key is wrong, so ticket references cannot be probed.
 */
function needTicketKey(c, extra = []) {
  return c.html(views.guestLookup(c.get('view'), {
    errors: ['That ticket link is not valid on this browser. Ask for it again below.', ...extra],
    values: {},
  }), 404);
}

function register(app) {
  const cfgFor = (c) => supportConfig(c.get('cfg') || {});

  /* ================================================================ *
   * Help centre
   * ================================================================ */

  app.get('/help', async (c) => {
    const db = c.get('db');
    const q = String(new URL(c.req.url).searchParams.get('q') || '').trim().slice(0, 120);

    const sections = await db.all(
      `SELECT s.*,
          (SELECT COUNT(*) FROM help_articles a WHERE a.section_id = s.id AND a.published = 1) AS article_count,
          (SELECT a.title FROM help_articles a WHERE a.section_id = s.id AND a.published = 1
            ORDER BY a.pinned DESC, a.views DESC LIMIT 1) AS top_title
       FROM help_sections s ORDER BY s.position, s.id`
    );
    const popular = await db.all(
      `SELECT a.*, s.name AS section_name FROM help_articles a JOIN help_sections s ON s.id = a.section_id
        WHERE a.published = 1 ORDER BY a.pinned DESC, a.views DESC, a.id LIMIT 6`
    );
    const results = q ? await searchArticles(db, q, { limit: 12 }) : [];

    const user = c.get('user');
    const openTickets = user
      ? Number((await db.get(
        "SELECT COUNT(*) AS n FROM tickets WHERE user_id = ? AND status IN ('open','pending','answered')",
        user.id
      )).n)
      : 0;

    return c.html(views.helpIndex(c.get('view'), { sections, popular, q, results, openTickets }));
  });

  app.get('/help/s/:slug', async (c) => {
    const db = c.get('db');
    const section = await db.get('SELECT * FROM help_sections WHERE slug = ?', c.req.param('slug'));
    if (!section) return notFound(c);
    const articles = await db.all(
      'SELECT * FROM help_articles WHERE section_id = ? AND published = 1 ORDER BY pinned DESC, position, id',
      section.id
    );
    return c.html(views.helpSection(c.get('view'), { section, articles }));
  });

  app.get('/help/a/:slug', async (c) => {
    const db = c.get('db');
    const slug = String(c.req.param('slug') || '').slice(0, 80);
    const article = await db.get(
      `SELECT a.*, s.name AS section_name, s.slug AS section_slug
         FROM help_articles a JOIN help_sections s ON s.id = a.section_id
        WHERE a.slug = ?`,
      slug
    );
    // Unpublished drafts stay visible to staff so they can be reviewed in place.
    if (!article || (!article.published && !isStaff(c.get('user')))) return notFound(c);

    await db.run('UPDATE help_articles SET views = views + 1 WHERE id = ?', article.id);

    const related = await db.all(
      `SELECT a.slug, a.title, s.name AS section_name
         FROM help_articles a JOIN help_sections s ON s.id = a.section_id
        WHERE a.published = 1 AND a.id != ? AND a.section_id = ?
        ORDER BY a.pinned DESC, a.views DESC LIMIT 5`,
      article.id, article.section_id
    );

    const voted = new URL(c.req.url).searchParams.get('voted');
    return c.html(views.helpArticle(c.get('view'), {
      article,
      section: { id: article.section_id, name: article.section_name, slug: article.section_slug },
      related,
      voted: voted === 'yes' || voted === 'no' ? voted : null,
    }));
  });

  /**
   * "Did this help?" — a counter, not a poll, so it is protected by a per-IP
   * rate limit rather than an identity. A "no" is the most valuable signal
   * the help centre produces, so it routes straight into a pre-filled ticket.
   */
  app.post('/help/a/:slug/feedback', async (c) => {
    const db = c.get('db');
    const slug = String(c.req.param('slug') || '').slice(0, 80);
    const article = await db.get('SELECT id, slug FROM help_articles WHERE slug = ?', slug);
    if (!article) return notFound(c);

    const verdict = await limits.check(db, 'helpvote', clientIp(c), c.get('cfg'));
    if (!verdict.ok) return tooMany(c, verdict.retryAfterSec);

    const body = await formBody(c);
    const helpful = body.helpful === 'yes' ? 'yes' : 'no';
    await db.run(
      `UPDATE help_articles SET helpful_${helpful === 'yes' ? 'yes' : 'no'} = helpful_${helpful === 'yes' ? 'yes' : 'no'} + 1
        WHERE id = ?`,
      article.id
    );

    if (helpful === 'no') {
      return c.redirect(`/support/new?article=${encodeURIComponent(article.slug)}`, 302);
    }
    return c.redirect(`/help/a/${encodeURIComponent(article.slug)}?voted=yes`, 302);
  });

  /* ================================================================ *
   * Support inbox
   * ================================================================ */

  app.get('/support', async (c) => {
    const db = c.get('db');
    const user = c.get('user');
    const cfg = cfgFor(c);

    const tickets = user
      ? await db.all(
        `SELECT id, ref, subject, category, status, priority, user_unread, updated_at
           FROM tickets WHERE user_id = ? AND merged_into IS NULL ORDER BY updated_at DESC LIMIT 50`,
        user.id
      )
      : [];

    // Guest tickets remembered on this browser. Each key is re-verified
    // against its own ticket, so a doctored cookie lists nothing.
    const guestTickets = [];
    for (const entry of readTicketCookie(c)) {
      if (guestTickets.length >= 10) break;
      const ticket = await loadTicket(db, entry.r);
      if (!ticket || ticket.merged_into) continue;
      if (user && Number(ticket.user_id) === Number(user.id)) continue; // already listed above
      const access = await checkAccess(c, ticket, entry.k);
      if (access.ok && access.via === 'key') guestTickets.push({ ...ticket, __key: entry.k });
    }

    const popular = await db.all(
      `SELECT a.*, s.name AS section_name FROM help_articles a JOIN help_sections s ON s.id = a.section_id
        WHERE a.published = 1 ORDER BY a.pinned DESC, a.views DESC LIMIT 5`
    );

    return c.html(views.supportHome(c.get('view'), { tickets, guestTickets, popular, cfg }));
  });

  /* ---------------- New ticket ---------------- */

  /**
   * Keyword shortlist, then (optionally) an AI re-rank. The keyword pass is
   * what makes "try this first" work with no AI configured at all; the model
   * only ever reorders and explains that shortlist, so it can never invent an
   * article or surface an unpublished one.
   */
  async function suggestFor(c, text, { useAi = true } = {}) {
    const db = c.get('db');
    const shortlist = await searchArticles(db, text, { limit: SUGGEST_LIMIT + 2 });
    if (!shortlist.length) return [];

    const aiCfg = ai.aiConfig(c.get('cfg') || {});
    if (!useAi || !aiCfg.deflect || terms(text).length < 2) {
      return shortlist.slice(0, SUGGEST_LIMIT).map((article) => ({ article, why: article.summary }));
    }

    const verdict = await limits.check(db, 'aideflect', clientIp(c), c.get('cfg'));
    if (!verdict.ok) {
      return shortlist.slice(0, SUGGEST_LIMIT).map((article) => ({ article, why: article.summary }));
    }

    const ranked = await ai.rankArticles(c.get('cfg'), { text, articles: shortlist });
    if (!ranked.ok || !ranked.matches.length) {
      return shortlist.slice(0, SUGGEST_LIMIT).map((article) => ({ article, why: article.summary }));
    }
    return ranked.matches;
  }

  app.get('/support/new', async (c) => {
    const db = c.get('db');
    const cfg = cfgFor(c);
    const url = new URL(c.req.url);
    const user = c.get('user');

    if (!user && !cfg.guestsAllowed) {
      setFlash(c, 'error', 'Sign in (a free account is enough) to open a support ticket.');
      return c.redirect('/auth/login?next=%2Fsupport%2Fnew', 302);
    }

    const articleSlug = String(url.searchParams.get('article') || '').slice(0, 80);
    const fromArticle = articleSlug
      ? await db.get('SELECT slug, title, summary FROM help_articles WHERE slug = ? AND published = 1', articleSlug)
      : null;

    const q = String(url.searchParams.get('q') || '').slice(0, 400);
    const suggestions = q ? await suggestFor(c, q, { useAi: false }) : [];

    return c.html(views.newTicket(c.get('view'), {
      errors: [],
      values: { subject: q ? cleanLine(q, MAX_SUBJECT) : '', category: fromArticle ? '' : 'other' },
      suggestions,
      cfg,
      needsCaptcha: !user,
      aiDeflect: ai.aiConfig(c.get('cfg') || {}).deflect,
      fromArticle,
    }));
  });

  /**
   * Live "try this first" lookup while the problem is being typed. Returns
   * JSON only — it never creates anything, so the worst case for a failure is
   * that the panel stays empty.
   */
  app.post('/support/suggest', async (c) => {
    c.header('Cache-Control', 'no-store');
    // Rate-limited whether or not AI is configured: this endpoint scans the
    // article table on every call, so it is worth a bucket on its own.
    const verdict = await limits.check(c.get('db'), 'aideflect', clientIp(c), c.get('cfg'));
    if (!verdict.ok) return c.json({ ok: true, suggestions: [] });

    const body = await formBody(c);
    const text = `${String(body.subject || '')}\n${String(body.body || '')}`.slice(0, 4000);
    if (text.trim().length < 12) return c.json({ ok: true, suggestions: [] });

    const suggestions = await suggestFor(c, text);
    return c.json({
      ok: true,
      suggestions: suggestions.map((s) => ({
        slug: s.article.slug,
        title: s.article.title,
        why: String(s.why || s.article.summary || '').slice(0, 220),
        url: `/help/a/${encodeURIComponent(s.article.slug)}`,
      })),
    });
  });

  app.post('/support/new', async (c) => {
    const db = c.get('db');
    const env = c.get('cfg') || {};
    const cfg = cfgFor(c);
    const user = c.get('user');
    const body = await formBody(c);

    if (!user && !cfg.guestsAllowed) {
      setFlash(c, 'error', 'Sign in (a free account is enough) to open a support ticket.');
      return c.redirect('/auth/login?next=%2Fsupport%2Fnew', 302);
    }

    // Members are throttled per account, guests per IP.
    const bucketKey = user ? `u${user.id}` : clientIp(c);
    const verdict = await limits.check(db, 'ticket', bucketKey, env);
    if (!verdict.ok) return tooMany(c, verdict.retryAfterSec);

    const subject = cleanLine(body.subject, MAX_SUBJECT);
    const message = cleanBody(body.body, MAX_BODY);
    const category = normalizeCategory(String(body.category || ''));
    const email = user ? user.email : String(body.email || '').trim().slice(0, 254);
    const guestName = user ? null : cleanLine(body.name, 40);
    const articleSlug = String(body.article || '').slice(0, 80) || null;

    const errors = [];
    if (subject.length < 5) errors.push('Give the ticket a one-line summary (at least 5 characters).');
    if (message.length < 15) errors.push('Tell us a bit more — at least 15 characters, and the exact error text if you have it.');
    if (!user && !validEmail(email)) errors.push('We need a working email address to reply to.');

    // Proof-of-work + honeypot for anonymous tickets, exactly as on sign-up.
    if (!user && errors.length === 0) {
      const botCheck = await captcha.verify(db, {
        token: body.captcha_token,
        solution: body.captcha_solution,
        honeypot: body.website,
        ip: clientIp(c),
      }, env);
      if (!botCheck.ok) {
        await audit(c, 'captcha_failed', { detail: `support ticket: ${botCheck.reason}` });
        errors.push('Human verification failed or expired. Reload the page and try the check again.');
      }
    }

    const { files, errors: fileErrors } = await readUploads(c, cfg);
    // On a NEW ticket the form is still in front of them, so a rejected file
    // sends them back to fix it with everything they typed intact — losing an
    // essential screenshot silently is worse than one more click. On a REPLY
    // (below) the opposite is true: the message goes through and the rejection
    // is a warning, because that text is already worth having.
    errors.push(...fileErrors);

    if (errors.length > 0) {
      const suggestions = await suggestFor(c, `${subject}\n${message}`, { useAi: false });
      const fromArticle = articleSlug
        ? await db.get('SELECT slug, title, summary FROM help_articles WHERE slug = ?', articleSlug)
        : null;
      return c.html(views.newTicket(c.get('view'), {
        errors,
        values: { subject, body: message, category, email: user ? '' : email, name: guestName || '' },
        suggestions, cfg, needsCaptcha: !user,
        aiDeflect: ai.aiConfig(env).deflect,
        fromArticle,
      }), 400);
    }

    const ref = await allocateRef(db);
    const guestKey = user ? null : await issueTicketKey();
    const priority = 'normal';

    const created = await db.run(
      `INSERT INTO tickets
         (ref, user_id, guest_email, guest_name, key_hash, subject, category, priority,
          sla_due_at, last_user_at, article_slug, source, ip, user_agent)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'web', ?, ?)`,
      ref, user ? user.id : null, user ? null : email, guestName,
      guestKey ? guestKey.hash : null,
      subject, category, priority, slaDueAt(priority, cfg), Date.now(),
      articleSlug, clientIp(c) || 'unknown', userAgent(c)
    );
    const ticketId = Number(created.lastInsertRowid);
    const ticket = await loadTicket(db, ref);

    const messageId = await addMessage(db, ticket, {
      role: 'user',
      authorId: user ? user.id : null,
      authorName: user ? user.username : (guestName || 'Guest'),
      body: message,
    });
    if (files.length) {
      await saveUploads(db, {
        ticketId, messageId,
        uploaderId: user ? user.id : null,
        uploaderName: user ? user.username : (guestName || 'Guest'),
        uploaderRole: 'user',
      }, files);
    }
    if (articleSlug) {
      await addEvent(db, ticketId, 'system', 'from_article', `opened from help article "${articleSlug}"`);
    }

    await audit(c, 'ticket_opened', {
      userId: user ? user.id : null,
      username: user ? user.username : (email || 'guest'),
      detail: `${ref}: ${subject.slice(0, 120)}`,
    });

    if (guestKey) rememberTicketKey(c, ref, guestKey.key, cookieOptions(c));

    // Everything below is a side effect the requester should not wait for.
    await defer(c, (async () => {
      const fresh = await loadTicket(db, ref);
      await triage(db, env, cfg, fresh, message);
      const after = await loadTicket(db, ref);
      await alertStaff(env, cfg, after.priority === 'urgent' ? 'ticket_urgent' : 'ticket_new', after);
      await emailRequester(env, cfg, after, ticketOpenedMail(after, cfg, guestKey ? guestKey.key : null));
    })());

    if (guestKey) {
      return c.html(views.ticketCreated(c.get('view'), {
        ticket, key: guestKey.key, emailed: cfg.emailNotify,
      }));
    }
    setFlash(c, 'success', `Ticket ${ref} is open — we'll reply right here.`);
    return c.redirect(`/support/t/${encodeURIComponent(ref)}`, 302);
  });

  /**
   * AI triage, run off the request path. Only ever writes fields a human can
   * override in one click, and every value is re-validated against our own
   * allowlists — a prompt injection in the ticket body can at worst mislabel
   * the ticket it arrived in.
   */
  async function triage(db, env, cfg, ticket, message) {
    const aiCfg = ai.aiConfig(env);
    if (!aiCfg.classify || !ticket) return;

    const result = await ai.classifyTicket(env, {
      subject: ticket.subject, body: message, categories: CATEGORIES,
    });
    if (!result.ok) return;

    const category = result.category ? normalizeCategory(result.category) : ticket.category;
    const priority = result.priority ? normalizePriority(result.priority) : ticket.priority;
    const tags = normalizeTags(result.tags.join(','));

    await db.run(
      `UPDATE tickets
          SET category = ?, priority = ?, tags = ?, locale = ?, spam = ?,
              sla_due_at = ?, ai_classified_at = ?, updated_at = datetime('now')
        WHERE id = ? AND ai_classified_at IS NULL`,
      category, priority, tags, result.language, result.spam ? 1 : 0,
      slaDueAt(priority, cfg, new Date(`${String(ticket.created_at).replace(' ', 'T')}Z`).getTime() || Date.now()),
      Date.now(), ticket.id
    );
    await addEvent(db, ticket.id, 'AI triage', 'classified',
      `category ${category}, priority ${priority}${result.spam ? ', flagged as spam' : ''}${result.reason ? ` — ${result.reason}` : ''}`);

    if (result.spam) await alertStaff(env, cfg, 'ticket_spam', { ...ticket, category, priority });
  }

  /* ---------------- Guest lookup ---------------- */

  app.get('/support/lookup', (c) => c.html(views.guestLookup(c.get('view'), { errors: [], values: {} })));

  app.post('/support/lookup', async (c) => {
    const db = c.get('db');
    const env = c.get('cfg') || {};
    const cfg = cfgFor(c);
    const body = await formBody(c);

    const verdict = await limits.check(db, 'ticketlookup', clientIp(c), env);
    if (!verdict.ok) return tooMany(c, verdict.retryAfterSec);

    const ref = normalizeRef(body.ref);
    const email = String(body.email || '').trim().slice(0, 254);

    if (!ref || !validEmail(email)) {
      return c.html(views.guestLookup(c.get('view'), {
        errors: ['Enter a ticket reference like GH-1A2B3C4D and the email address you used.'],
        values: { ref: String(body.ref || ''), email },
      }), 400);
    }

    // Always answer the same way, whether or not the pair matched: this
    // endpoint must not confirm that a reference or an address exists.
    const ticket = await loadTicket(db, ref);
    const matches = ticket && ticket.key_hash
      && String(ticket.guest_email || '').toLowerCase() === email.toLowerCase();

    if (matches) {
      if (!cfg.emailNotify) {
        return c.html(views.guestLookup(c.get('view'), {
          errors: ['Email is not configured on this site, so the link cannot be re-sent. '
            + 'Open a new ticket and mention the old reference.'],
          values: { ref, email },
        }), 400);
      }
      // The key itself is not recoverable (only its hash is stored), so issue
      // a fresh one and retire the old link — the same trade the password
      // reset flow makes.
      const rotated = await issueTicketKey();
      await db.run('UPDATE tickets SET key_hash = ? WHERE id = ?', rotated.hash, ticket.id);
      await emailRequester(env, cfg, ticket, {
        subject: `[${ticket.ref}] Your ticket link`,
        text: `Here is a fresh link to your GoyHub support ticket ${ticket.ref}:\n\n`
          + `${ticketUrl(ticket, cfg, rotated.key)}\n\n`
          + 'Any older link for this ticket has stopped working.\n\n— GoyHub Support',
      });
      await audit(c, 'ticket_key_reissued', { username: email, detail: ticket.ref });
    }

    return c.html(views.guestLookup(c.get('view'), { errors: [], values: {}, sent: true }));
  });

  /* ================================================================ *
   * The ticket thread (live chat)
   * ================================================================ */

  app.get('/support/t/:ref', async (c) => {
    const db = c.get('db');
    const cfg = cfgFor(c);
    const ref = normalizeRef(c.req.param('ref'));
    if (!ref) return needTicketKey(c);

    const ticket = await loadTicket(db, ref);
    const key = submittedKey(c);
    const access = await checkAccess(c, ticket, key);
    if (!access.ok) return needTicketKey(c);

    // A merged ticket follows its survivor when the requester can actually
    // read it — which is the member case, where one session covers both. A
    // guest's key only ever opens the ticket it was issued for, so instead of
    // bouncing them into a 404 loop they stay here and read the marker the
    // merge left behind, with a pointer to the surviving reference.
    let mergedInto = null;
    if (ticket.merged_into) {
      const target = await db.get('SELECT * FROM tickets WHERE id = ?', ticket.merged_into);
      if (target) {
        const targetAccess = await checkAccess(c, target, key);
        if (targetAccess.ok) return c.redirect(`/support/t/${encodeURIComponent(target.ref)}`, 302);
        mergedInto = target.ref;
      }
    }

    // Arriving on a `?k=` link: remember the key so later visits work from a
    // clean URL. The link itself keeps working either way — a browser that
    // drops the cookie must not lose the ticket, and Referrer-Policy is
    // `no-referrer` site-wide, so the key never leaves in a Referer header.
    if (access.via === 'key' && access.source === 'url') {
      rememberTicketKey(c, ref, access.key, cookieOptions(c));
    }

    if (access.role === 'owner' && Number(ticket.user_unread) > 0) {
      await db.run('UPDATE tickets SET user_unread = 0 WHERE id = ?', ticket.id);
      ticket.user_unread = 0;
    }

    const messages = await messagesFor(db, ticket.id);
    const attachments = await attachmentsFor(db, ticket.id);
    const suggestions = ticket.first_response_at
      ? []
      : (await searchArticles(db, `${ticket.subject} ${messages[0] ? messages[0].body : ''}`, { limit: 3 }));

    return c.html(views.ticketView(c.get('view'), {
      ticket, messages, attachments, mergedInto,
      canReply: ticket.status !== 'closed' && !mergedInto,
      accessKey: access.via === 'key' && access.source === 'url' ? access.key : null,
      cfg, suggestions,
    }));
  });

  /** Live-chat poll. Returns only messages the requester is allowed to read. */
  app.get('/support/t/:ref/messages', async (c) => {
    const db = c.get('db');
    c.header('Cache-Control', 'no-store');
    const ref = normalizeRef(c.req.param('ref'));
    if (!ref) return c.json({ ok: false, error: 'not_found' }, 404);

    const verdict = await limits.check(db, 'ticketpoll', clientIp(c), c.get('cfg'));
    if (!verdict.ok) return c.json({ ok: false, error: 'rate_limited' }, 429);

    const ticket = await loadTicket(db, ref);
    const access = await checkAccess(c, ticket, submittedKey(c));
    if (!access.ok) return c.json({ ok: false, error: 'not_found' }, 404);

    const after = intParam(new URL(c.req.url).searchParams.get('after'), 0);
    const messages = await messagesFor(db, ticket.id, after);

    if (access.role === 'owner' && messages.some((m) => m.author_role === 'staff')) {
      await db.run('UPDATE tickets SET user_unread = 0 WHERE id = ?', ticket.id);
    }

    const attachments = messages.length ? await attachmentsFor(db, ticket.id) : [];
    return c.json({
      ok: true,
      status: ticket.status,
      canReply: ticket.status !== 'closed',
      messages: messages.map((m) => ({
        id: m.id,
        author: m.author_name,
        role: m.author_role,
        body: m.body,
        createdAt: m.created_at,
        files: attachments
          .filter((a) => Number(a.message_id) === Number(m.id))
          .map((a) => ({ id: a.id, name: a.filename, image: String(a.mime).startsWith('image/'), kb: Math.max(1, Math.round(a.bytes / 1024)) })),
      })),
    });
  });

  app.post('/support/t/:ref/reply', async (c) => {
    const db = c.get('db');
    const env = c.get('cfg') || {};
    const cfg = cfgFor(c);
    const wantsJson = c.req.header('x-requested-with') === 'fetch';
    const body = await formBody(c);

    const ref = normalizeRef(c.req.param('ref'));
    const ticket = ref ? await loadTicket(db, ref) : null;
    const access = await checkAccess(c, ticket, submittedKey(c, body));
    if (!access.ok) {
      return wantsJson ? c.json({ ok: false, error: 'not_found' }, 404) : needTicketKey(c);
    }

    const keyQuery = access.via === 'key' && access.source === 'url'
      ? `?k=${encodeURIComponent(access.key)}` : '';
    const back = `/support/t/${encodeURIComponent(ticket.ref)}${keyQuery}`;

    const fail = (message, status = 400) => {
      if (wantsJson) return c.json({ ok: false, error: message }, status);
      setFlash(c, 'error', message);
      return c.redirect(back, 302);
    };

    if (ticket.status === 'closed') return fail('This ticket is closed. Open a new one and mention this reference.');

    // Keyed per ticket, with staff on their own budget: an angry customer
    // sending twenty short messages must not throttle the reply.
    const bucket = access.role === 'staff' ? `staff:${ticket.id}` : String(ticket.id);
    const verdict = await limits.check(db, 'ticketreply', bucket, env);
    if (!verdict.ok) return fail('You are sending messages very quickly — give it a moment.', 429);

    const text = cleanBody(body.body, MAX_BODY);
    const { files, errors: fileErrors } = await readUploads(c, cfg);
    if (text.length < 1 && !files.length) return fail('Write a message (or attach a file) before sending.');

    // Staff replying from the customer-facing page still counts as staff —
    // the role is taken from the access decision, never from the form.
    const role = access.role === 'staff' ? 'staff' : 'user';
    const authorName = access.role === 'staff'
      ? c.get('user').username
      : (ticket.username || ticket.guest_name || 'Guest');

    const messageId = await addMessage(db, ticket, {
      role,
      authorId: c.get('user') ? c.get('user').id : null,
      authorName,
      body: text || '(file attached)',
    });

    if (files.length) {
      await saveUploads(db, {
        ticketId: ticket.id, messageId,
        uploaderId: c.get('user') ? c.get('user').id : null,
        uploaderName: authorName, uploaderRole: role,
      }, files);
    }

    if (role === 'staff') {
      const fresh = await loadTicket(db, ticket.ref);
      await defer(c, emailRequester(env, cfg, fresh, staffReplyMail(fresh, cfg, null)));
    }

    if (wantsJson) {
      return c.json({ ok: true, id: messageId, warnings: fileErrors });
    }
    if (fileErrors.length) setFlash(c, 'error', fileErrors.join(' '));
    return c.redirect(`${back}#msg-${messageId}`, 302);
  });

  app.post('/support/t/:ref/close', async (c) => {
    const db = c.get('db');
    const body = await formBody(c);
    const ref = normalizeRef(c.req.param('ref'));
    const ticket = ref ? await loadTicket(db, ref) : null;
    const access = await checkAccess(c, ticket, submittedKey(c, body));
    if (!access.ok) return needTicketKey(c);

    const keyQuery = access.via === 'key' && access.source === 'url'
      ? `?k=${encodeURIComponent(access.key)}` : '';
    if (ticket.status !== 'closed') {
      await db.run(
        `UPDATE tickets SET status = 'solved', closed_at = ?, closed_by = ?, updated_at = datetime('now')
          WHERE id = ?`,
        Date.now(), access.role === 'staff' ? c.get('user').username : 'requester', ticket.id
      );
      await addMessage(db, { ...ticket, status: 'solved' }, {
        role: 'system', authorName: 'System',
        body: 'The requester marked this ticket as solved. Replying here reopens it.',
      });
      await addEvent(db, ticket.id, access.role === 'staff' ? c.get('user').username : 'requester',
        'closed_by_requester', 'marked solved from the ticket page');
    }
    setFlash(c, 'success', 'Marked as solved. Reply any time to reopen it.');
    return c.redirect(`/support/t/${encodeURIComponent(ticket.ref)}${keyQuery}`, 302);
  });

  /** CSAT. Settable once, and only by the requester — never by staff. */
  app.post('/support/t/:ref/rate', async (c) => {
    const db = c.get('db');
    const body = await formBody(c);
    const ref = normalizeRef(c.req.param('ref'));
    const ticket = ref ? await loadTicket(db, ref) : null;
    const access = await checkAccess(c, ticket, submittedKey(c, body));
    if (!access.ok) return needTicketKey(c);

    const keyQuery = access.via === 'key' && access.source === 'url'
      ? `?k=${encodeURIComponent(access.key)}` : '';
    const back = `/support/t/${encodeURIComponent(ticket.ref)}${keyQuery}`;

    if (access.role !== 'owner') {
      setFlash(c, 'error', 'Only the person who opened the ticket can rate it.');
      return c.redirect(back, 302);
    }

    const rating = intParam(body.rating, 0);
    if (rating < 1 || rating > 5) {
      setFlash(c, 'error', 'Pick a rating from 1 to 5.');
      return c.redirect(back, 302);
    }

    // WHERE rating IS NULL is the whole anti-stuffing story: one rating per
    // ticket, decided by the first write that lands.
    const res = await db.run(
      'UPDATE tickets SET rating = ?, rating_comment = ?, rating_at = ? WHERE id = ? AND rating IS NULL',
      rating, cleanLine(body.comment, MAX_RATING_COMMENT) || null, Date.now(), ticket.id
    );
    if (res.changes === 1) {
      await addEvent(db, ticket.id, 'requester', 'rated', `${rating}/5`);
      setFlash(c, 'success', 'Thanks — that rating goes straight to the person who handled it.');
    }
    return c.redirect(back, 302);
  });

  /** Attachment download. Access is re-checked against the parent ticket. */
  app.get('/support/attachments/:id', async (c) => {
    const db = c.get('db');
    const id = intParam(c.req.param('id'), 0);
    if (id < 1) return notFound(c);

    const row = await db.get(
      `SELECT a.*, t.ref FROM ticket_attachments a JOIN tickets t ON t.id = a.ticket_id WHERE a.id = ?`,
      id
    );
    if (!row) return notFound(c);

    const ticket = await loadTicket(db, row.ref);
    const access = await checkAccess(c, ticket, submittedKey(c));
    if (!access.ok) return notFound(c);

    if (row.purged_at) {
      return c.html(site.errorPage(c.get('view'), {
        code: 410, title: 'File no longer stored',
        message: 'This attachment was removed by the retention policy — the conversation still records '
          + 'that it was sent. Re-attach it on the ticket if it is still needed.',
      }), 410);
    }
    return attachmentResponse(row);
  });

  /* ================================================================ *
   * Housekeeping endpoint
   * ================================================================ */

  /**
   * External cron hook, mirroring /api/crypto/scan: stamps SLA breaches and
   * auto-closes stale solved tickets while nobody is looking at the queue.
   * Unset SUPPORT_SWEEP_SECRET closes the endpoint entirely.
   */
  app.get('/api/support/sweep', async (c) => {
    const db = c.get('db');
    const env = c.get('cfg') || {};
    c.header('Cache-Control', 'no-store');

    const secret = String(env.SUPPORT_SWEEP_SECRET || '');
    if (!secret) return c.json({ ok: false, error: 'not_configured' }, 404);

    const verdict = await limits.check(db, 'supportsweep', clientIp(c), env);
    if (!verdict.ok) return c.json({ ok: false, error: 'rate_limited' }, 429);

    const provided = String(new URL(c.req.url).searchParams.get('key') || '');
    if (provided.length !== secret.length || !safeEqual(provided, secret)) {
      return c.json({ ok: false, error: 'not_found' }, 404);
    }

    const cfg = cfgFor(c);
    const breached = await sweepSla(db, cfg);
    // Bounded fan-out: each webhook carries a 5s timeout, so a backlog of
    // fifty would otherwise be minutes of wall clock inside one request.
    for (const ticket of breached.slice(0, 5)) await alertStaff(env, cfg, 'sla_breach', ticket);
    const closed = await sweepAutoClose(db, cfg);
    const purged = await sweepAttachments(db, cfg);
    return c.json({ ok: true, breached: breached.length, closed, purged });
  });

  /** Members' shortcut: /support/mine mirrors /support for old links. */
  app.get('/support/mine', (c) => {
    const gate = requireAuth(c);
    return gate || c.redirect('/support', 302);
  });
}

export { register, loadTicket, messagesFor, attachmentsFor };
