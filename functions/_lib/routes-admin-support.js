/**
 * Staff support backend (/admin/support).
 *
 * Registered after routes-admin.js, so the `/admin/*` staff gate there already
 * covers every path here; the extra gate below keeps this module correct on
 * its own rather than by registration order. Everything is staff-level
 * (developer / trial_admin / admin) — support is day-to-day work, not a
 * full-admin power — except deleting help-centre content, which is not.
 */
import * as views from "./views/admin-support.js";
import * as site from "./views/site.js";
import * as limits from "./limits.js";
import * as ai from "./ai.js";
import { readUploads, saveUploads } from "./attachments.js";
import { audit, formBody, setFlash, defer, requireStaff, requireAdmin } from "./middleware.js";
import { isStaff, STAFF_TIERS } from "./tiers.js";
import { searchArticles, MAX_ARTICLE_BODY } from "./kb.js";
import { adminIpMask } from "./routes-admin.js";
import {
  STATUSES, ACTIVE_STATUSES, PRIORITIES, CATEGORY_IDS, STATUS_LABELS,
  MAX_BODY, MAX_NOTE,
  normalizeStatus, normalizePriority, normalizeCategory, normalizeTags, tagList,
  cleanBody, cleanLine, supportConfig, slaDueAt, normalizeRef,
  addMessage, addEvent, sweepSla, sweepAutoClose, sweepAttachments, sameRequester,
  emailRequester, staffReplyMail, ticketClosedMail, alertStaff,
} from "./support.js";

const TICKETS_PER_PAGE = 25;
const TIMELINE_LIMIT = 200;

const intParam = (value, fallback = 0) => {
  const n = parseInt(value, 10);
  return Number.isInteger(n) ? n : fallback;
};

function notFound(c, message = 'This page does not exist.') {
  return c.html(site.errorPage(c.get('view'), { code: 404, title: 'Not found', message }), 404);
}

const adminAudit = (c, detail) => audit(c, 'admin_action', {
  userId: c.get('user').id, username: c.get('user').username, detail,
});

/** Full ticket row with everything the workspace shows about the requester. */
const fullTicket = (db, id) => db.get(
  `SELECT t.*, u.username, u.email AS user_email, u.tier AS user_tier,
          u.created_at AS user_created_at, u.paid_until, u.banned AS user_banned
     FROM tickets t LEFT JOIN users u ON u.id = t.user_id
    WHERE t.id = ?`,
  id
);

/** Median of a numeric array, or null when there is nothing to average. */
function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

const durationLabel = (ms) => {
  if (ms === null) return '—';
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `${mins}m`;
  if (mins < 1440) return `${Math.round(mins / 60)}h`;
  return `${Math.round(mins / 1440)}d`;
};

const sqliteMs = (value) => {
  const t = new Date(`${String(value).replace(' ', 'T')}Z`).getTime();
  return Number.isFinite(t) ? t : Date.now();
};

/**
 * Alerts staff about SLA breaches without letting the fan-out run away: each
 * webhook carries a 5s timeout, so a backlog of fifty would be minutes of wall
 * clock inside one request. Past a handful, one roll-up says the same thing.
 */
const MAX_BREACH_ALERTS = 5;

async function alertBreaches(env, cfg, breached) {
  if (!breached.length) return;
  for (const ticket of breached.slice(0, MAX_BREACH_ALERTS)) {
    await alertStaff(env, cfg, 'sla_breach', ticket);
  }
  const extra = breached.length - MAX_BREACH_ALERTS;
  if (extra > 0) {
    await alertStaff(env, cfg, 'sla_breach', {
      ...breached[MAX_BREACH_ALERTS],
      ref: `${breached[MAX_BREACH_ALERTS].ref} +${extra} more`,
      subject: `${extra + 1} more tickets breached at once`,
    }, { note: 'The queue has a backlog — open Admin → Support.' });
  }
}

function register(app) {
  const cfgFor = (c) => supportConfig(c.get('cfg') || {});

  // Self-contained staff gate. routes-admin.js already installs one for
  // /admin/*; this one means the module is still correct if that ever moves.
  app.use('/admin/support/*', async (c, next) => {
    const gate = requireStaff(c);
    if (gate) return gate;
    await next();
  });

  /* ================================================================ *
   * Queue
   * ================================================================ */

  /** Turns the querystring into a WHERE clause plus the filter state a view needs. */
  function readFilters(c) {
    const url = new URL(c.req.url);
    const p = url.searchParams;
    const user = c.get('user');

    const status = STATUSES.includes(p.get('status')) || p.get('status') === 'active' ? p.get('status') : '';
    const priority = PRIORITIES.includes(p.get('priority')) ? p.get('priority') : '';
    const category = CATEGORY_IDS.includes(p.get('category')) ? p.get('category') : '';
    const assigneeRaw = String(p.get('assignee') || '');
    const assignee = assigneeRaw === 'me' || assigneeRaw === 'none' || /^\d+$/.test(assigneeRaw) ? assigneeRaw : '';
    const q = String(p.get('q') || '').trim().slice(0, 100);
    const tag = String(p.get('tag') || '').trim().toLowerCase().slice(0, 24);
    const breached = p.get('breached') === '1';
    const spam = p.get('spam') === '1';

    const clauses = ['t.merged_into IS NULL'];
    const params = [];

    if (status === 'active') clauses.push(`t.status IN (${ACTIVE_STATUSES.map(() => '?').join(',')})`);
    else if (status) clauses.push('t.status = ?');
    if (status === 'active') params.push(...ACTIVE_STATUSES);
    else if (status) params.push(status);

    if (priority) { clauses.push('t.priority = ?'); params.push(priority); }
    if (category) { clauses.push('t.category = ?'); params.push(category); }
    if (assignee === 'me') { clauses.push('t.assignee_id = ?'); params.push(user.id); }
    else if (assignee === 'none') clauses.push('t.assignee_id IS NULL');
    else if (assignee) { clauses.push('t.assignee_id = ?'); params.push(Number(assignee)); }
    if (breached) clauses.push('t.sla_breached = 1');
    // Spam-flagged tickets are hidden from the default queue but never deleted:
    // a false positive must be one checkbox away from being seen again.
    if (spam) clauses.push('t.spam = 1'); else clauses.push('t.spam = 0');
    if (tag) { clauses.push("(',' || t.tags || ',') LIKE ?"); params.push(`%,${tag},%`); }
    if (q) {
      clauses.push('(t.ref LIKE ? OR t.subject LIKE ? OR t.guest_email LIKE ? OR u.username LIKE ? OR u.email LIKE ?)');
      params.push(...Array(5).fill(`%${q.replace(/[%_]/g, '')}%`));
    }

    // The canonical querystring, used for pagination links and saved views.
    const query = new URLSearchParams();
    for (const [key, value] of [['status', status], ['priority', priority], ['category', category],
      ['assignee', assignee], ['q', q], ['tag', tag],
      ['breached', breached ? '1' : ''], ['spam', spam ? '1' : '']]) {
      if (value) query.set(key, value);
    }

    return {
      where: `WHERE ${clauses.join(' AND ')}`,
      params,
      state: {
        status, priority, category, assignee, q, tag, breached, spam,
        query: query.toString(),
        dirty: query.toString().length > 0,
      },
    };
  }

  async function queueStats(db) {
    const one = async (sql, ...args) => Number((await db.get(sql, ...args))?.n || 0);
    const answered = await db.all(
      `SELECT created_at, first_response_at FROM tickets
        WHERE first_response_at IS NOT NULL ORDER BY id DESC LIMIT 100`
    );
    const deltas = answered
      .map((t) => Number(t.first_response_at) - sqliteMs(t.created_at))
      .filter((d) => Number.isFinite(d) && d >= 0);
    const rating = await db.get(
      'SELECT AVG(rating) AS avg, COUNT(*) AS n FROM tickets WHERE rating IS NOT NULL'
    );

    return {
      open: await one("SELECT COUNT(*) AS n FROM tickets WHERE status = 'open' AND spam = 0 AND merged_into IS NULL"),
      pending: await one("SELECT COUNT(*) AS n FROM tickets WHERE status = 'pending' AND spam = 0 AND merged_into IS NULL"),
      unassigned: await one("SELECT COUNT(*) AS n FROM tickets WHERE assignee_id IS NULL AND spam = 0 AND merged_into IS NULL AND status IN ('open','pending','answered')"),
      breached: await one('SELECT COUNT(*) AS n FROM tickets WHERE sla_breached = 1 AND first_response_at IS NULL'),
      newToday: await one("SELECT COUNT(*) AS n FROM tickets WHERE created_at > datetime('now', '-1 day')"),
      solved7d: await one("SELECT COUNT(*) AS n FROM tickets WHERE status IN ('solved','closed') AND updated_at > datetime('now', '-7 day')"),
      medianFirstResponse: durationLabel(median(deltas)),
      csat: rating && rating.n > 0 ? `${(Math.round(Number(rating.avg) * 10) / 10).toFixed(1)}/5` : '—',
    };
  }

  const staffAgents = (db) => db.all(
    `SELECT id, username FROM users WHERE tier IN (${[...STAFF_TIERS].map(() => '?').join(',')}) ORDER BY username`,
    ...STAFF_TIERS
  );

  const savedViewsFor = (db, userId) => db.all(
    'SELECT * FROM support_views WHERE owner_id IS NULL OR owner_id = ? ORDER BY position, id',
    userId
  );

  async function renderQueue(c, swept = null) {
    const db = c.get('db');
    const { where, params, state } = readFilters(c);

    const total = Number((await db.get(
      `SELECT COUNT(*) AS n FROM tickets t LEFT JOIN users u ON u.id = t.user_id ${where}`, ...params
    )).n);
    const pages = Math.max(1, Math.ceil(total / TICKETS_PER_PAGE));
    const page = Math.max(1, Math.min(pages, intParam(new URL(c.req.url).searchParams.get('page'), 1)));

    const tickets = await db.all(
      `SELECT t.*, u.username, u.tier AS user_tier
         FROM tickets t LEFT JOIN users u ON u.id = t.user_id
         ${where}
        ORDER BY t.sla_breached DESC,
                 CASE t.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END,
                 t.updated_at DESC
        LIMIT ? OFFSET ?`,
      ...params, TICKETS_PER_PAGE, (page - 1) * TICKETS_PER_PAGE
    );

    return c.html(views.queue(c.get('view'), {
      tickets,
      filters: state,
      page, pages, total,
      agents: await staffAgents(db),
      savedViews: await savedViewsFor(db, c.get('user').id),
      stats: await queueStats(db),
      swept,
    }));
  }

  app.get('/admin/support', async (c) => {
    // Opening the queue is also when the SLA clock is reconciled — there is no
    // cron on Pages, and this is the moment the numbers are about to be read.
    const cfg = cfgFor(c);
    const breached = await sweepSla(c.get('db'), cfg, { limit: 30 });
    await alertBreaches(c.get('cfg'), cfg, breached);
    await sweepAutoClose(c.get('db'), cfg, { limit: 30 });
    await sweepAttachments(c.get('db'), cfg, { limit: 20 });
    return renderQueue(c);
  });

  app.post('/admin/support/sweep', async (c) => {
    const cfg = cfgFor(c);
    const breached = await sweepSla(c.get('db'), cfg, { limit: 200 });
    await alertBreaches(c.get('cfg'), cfg, breached);
    const closed = await sweepAutoClose(c.get('db'), cfg, { limit: 200 });
    await sweepAttachments(c.get('db'), cfg, { limit: 100 });
    setFlash(c, 'success', `Swept the queue: ${breached.length} SLA breach${breached.length === 1 ? '' : 'es'} `
      + `stamped, ${closed} stale ticket${closed === 1 ? '' : 's'} auto-closed.`);
    return c.redirect('/admin/support', 302);
  });

  /* ---------------- Saved views ---------------- */

  app.post('/admin/support/views', async (c) => {
    const db = c.get('db');
    const body = await formBody(c);
    const name = cleanLine(body.name, 40);
    if (!name) {
      setFlash(c, 'error', 'Give the view a name.');
      return c.redirect('/admin/support', 302);
    }
    // Re-parse the query through readFilters' own allowlist so a saved view
    // can never smuggle an arbitrary querystring back into the queue.
    const params = new URLSearchParams(String(body.query || '').slice(0, 400));
    const clean = new URLSearchParams();
    for (const key of ['status', 'priority', 'category', 'assignee', 'q', 'tag', 'breached', 'spam']) {
      const value = params.get(key);
      if (value) clean.set(key, String(value).slice(0, 100));
    }
    await db.run(
      'INSERT INTO support_views (name, query, owner_id) VALUES (?, ?, ?)',
      name, clean.toString(), body.shared ? null : c.get('user').id
    );
    setFlash(c, 'success', `Saved the view “${name}”.`);
    return c.redirect(`/admin/support?${clean.toString()}`, 302);
  });

  app.post('/admin/support/views/:id/delete', async (c) => {
    const db = c.get('db');
    const id = intParam(c.req.param('id'), 0);
    const view = id > 0 ? await db.get('SELECT * FROM support_views WHERE id = ?', id) : null;
    if (!view) return notFound(c);
    // A shared view is everyone's; a private one is only its owner's.
    if (view.owner_id !== null && Number(view.owner_id) !== Number(c.get('user').id)) return notFound(c);
    await db.run('DELETE FROM support_views WHERE id = ?', id);
    return c.redirect('/admin/support', 302);
  });

  /* ================================================================ *
   * Macros
   * ================================================================ */

  const readMacroForm = (body) => ({
    title: cleanLine(body.title, 60),
    body: cleanBody(body.body, MAX_BODY),
    category: CATEGORY_IDS.includes(String(body.category)) ? String(body.category) : '',
    setStatus: STATUSES.includes(String(body.set_status)) ? String(body.set_status) : null,
    setPriority: PRIORITIES.includes(String(body.set_priority)) ? String(body.set_priority) : null,
    setTags: normalizeTags(body.set_tags),
    position: intParam(body.position, 0),
  });

  app.get('/admin/support/macros', async (c) => {
    const macros = await c.get('db').all('SELECT * FROM support_macros ORDER BY position, id');
    return c.html(views.macrosPage(c.get('view'), { macros }));
  });

  app.post('/admin/support/macros', async (c) => {
    const form = readMacroForm(await formBody(c));
    if (!form.title || !form.body) {
      setFlash(c, 'error', 'A canned reply needs a title and a body.');
      return c.redirect('/admin/support/macros', 302);
    }
    await c.get('db').run(
      `INSERT INTO support_macros (title, body, category, set_status, set_priority, set_tags, position)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      form.title, form.body, form.category, form.setStatus, form.setPriority, form.setTags, form.position
    );
    await adminAudit(c, `created canned reply "${form.title}"`);
    setFlash(c, 'success', 'Canned reply added.');
    return c.redirect('/admin/support/macros', 302);
  });

  app.post('/admin/support/macros/:id/edit', async (c) => {
    const db = c.get('db');
    const id = intParam(c.req.param('id'), 0);
    const macro = id > 0 ? await db.get('SELECT * FROM support_macros WHERE id = ?', id) : null;
    if (!macro) return notFound(c);
    const form = readMacroForm(await formBody(c));
    if (!form.title || !form.body) {
      setFlash(c, 'error', 'A canned reply needs a title and a body.');
      return c.redirect('/admin/support/macros', 302);
    }
    await db.run(
      `UPDATE support_macros SET title = ?, body = ?, category = ?, set_status = ?, set_priority = ?,
              set_tags = ?, position = ?, updated_at = datetime('now') WHERE id = ?`,
      form.title, form.body, form.category, form.setStatus, form.setPriority, form.setTags, form.position, id
    );
    await adminAudit(c, `edited canned reply #${id} ("${form.title}")`);
    setFlash(c, 'success', 'Canned reply saved.');
    return c.redirect('/admin/support/macros', 302);
  });

  app.post('/admin/support/macros/:id/toggle', async (c) => {
    const db = c.get('db');
    const id = intParam(c.req.param('id'), 0);
    const macro = id > 0 ? await db.get('SELECT * FROM support_macros WHERE id = ?', id) : null;
    if (!macro) return notFound(c);
    await db.run('UPDATE support_macros SET active = ?, updated_at = datetime(\'now\') WHERE id = ?',
      macro.active ? 0 : 1, id);
    return c.redirect('/admin/support/macros', 302);
  });

  app.post('/admin/support/macros/:id/delete', async (c) => {
    const db = c.get('db');
    const id = intParam(c.req.param('id'), 0);
    const macro = id > 0 ? await db.get('SELECT * FROM support_macros WHERE id = ?', id) : null;
    if (!macro) return notFound(c);
    await db.run('DELETE FROM support_macros WHERE id = ?', id);
    await adminAudit(c, `deleted canned reply #${id} ("${macro.title}")`);
    setFlash(c, 'success', 'Canned reply deleted.');
    return c.redirect('/admin/support/macros', 302);
  });

  /* ================================================================ *
   * Help centre editor
   * ================================================================ */

  const sectionsWithCounts = (db) => db.all(
    `SELECT s.*, (SELECT COUNT(*) FROM help_articles a WHERE a.section_id = s.id) AS article_count
       FROM help_sections s ORDER BY s.position, s.id`
  );

  app.get('/admin/support/articles', async (c) => {
    const db = c.get('db');
    const sections = await sectionsWithCounts(db);
    const articles = await db.all(
      `SELECT a.*, s.name AS section_name,
              (SELECT COUNT(*) FROM tickets t WHERE t.article_slug = a.slug) AS ticket_count
         FROM help_articles a JOIN help_sections s ON s.id = a.section_id
        ORDER BY s.position, a.pinned DESC, a.position, a.id`
    );
    return c.html(views.articlesPage(c.get('view'), { sections, articles }));
  });

  app.get('/admin/support/articles/new', async (c) => {
    const sections = await sectionsWithCounts(c.get('db'));
    if (!sections.length) {
      setFlash(c, 'error', 'Create a section first — every article lives in one.');
      return c.redirect('/admin/support/articles', 302);
    }
    return c.html(views.articleEdit(c.get('view'), { article: {}, sections, errors: [] }));
  });

  /** Slug from a title, uniqued — the slug is a public URL, so it is stable. */
  async function uniqueSlug(db, title, excludeId = 0) {
    const base = String(title).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50) || 'article';
    let slug = base;
    for (let n = 2; ; n += 1) {
      const clash = await db.get('SELECT id FROM help_articles WHERE slug = ? AND id != ?', slug, excludeId);
      if (!clash) return slug;
      slug = `${base}-${n}`;
      if (n > 50) return `${base}-${Date.now()}`;
    }
  }

  function readArticleForm(body) {
    return {
      title: cleanLine(body.title, 120),
      sectionId: intParam(body.section_id, 0),
      summary: cleanLine(body.summary, 200),
      keywords: cleanLine(body.keywords, 300).toLowerCase(),
      body: cleanBody(body.body, MAX_ARTICLE_BODY),
      position: intParam(body.position, 0),
      pinned: body.pinned ? 1 : 0,
      published: body.published ? 1 : 0,
    };
  }

  app.post('/admin/support/articles', async (c) => {
    const db = c.get('db');
    const form = readArticleForm(await formBody(c));
    const sections = await sectionsWithCounts(db);
    const errors = [];
    if (form.title.length < 3) errors.push('Give the article a title.');
    if (form.body.length < 20) errors.push('The body needs actual content.');
    if (!sections.some((s) => Number(s.id) === form.sectionId)) errors.push('Pick a section.');
    if (errors.length) {
      return c.html(views.articleEdit(c.get('view'), { article: { ...form, section_id: form.sectionId }, sections, errors }), 400);
    }

    const slug = await uniqueSlug(db, form.title);
    const created = await db.run(
      `INSERT INTO help_articles (section_id, slug, title, summary, keywords, body, position, pinned, published)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      form.sectionId, slug, form.title, form.summary, form.keywords, form.body,
      form.position, form.pinned, form.published
    );
    await adminAudit(c, `created help article "${form.title}" (/help/a/${slug})`);
    setFlash(c, 'success', 'Article created.');
    return c.redirect(`/admin/support/articles/${created.lastInsertRowid}`, 302);
  });

  app.get('/admin/support/articles/:id', async (c) => {
    const db = c.get('db');
    const id = intParam(c.req.param('id'), 0);
    const article = id > 0 ? await db.get('SELECT * FROM help_articles WHERE id = ?', id) : null;
    if (!article) return notFound(c);
    return c.html(views.articleEdit(c.get('view'), {
      article, sections: await sectionsWithCounts(db), errors: [],
    }));
  });

  app.post('/admin/support/articles/:id', async (c) => {
    const db = c.get('db');
    const id = intParam(c.req.param('id'), 0);
    const article = id > 0 ? await db.get('SELECT * FROM help_articles WHERE id = ?', id) : null;
    if (!article) return notFound(c);

    const form = readArticleForm(await formBody(c));
    const sections = await sectionsWithCounts(db);
    const errors = [];
    if (form.title.length < 3) errors.push('Give the article a title.');
    if (form.body.length < 20) errors.push('The body needs actual content.');
    if (!sections.some((s) => Number(s.id) === form.sectionId)) errors.push('Pick a section.');
    if (errors.length) {
      return c.html(views.articleEdit(c.get('view'), {
        article: { ...article, ...form, section_id: form.sectionId }, sections, errors,
      }), 400);
    }

    await db.run(
      `UPDATE help_articles SET section_id = ?, title = ?, summary = ?, keywords = ?, body = ?,
              position = ?, pinned = ?, published = ?, updated_at = datetime('now')
        WHERE id = ?`,
      form.sectionId, form.title, form.summary, form.keywords, form.body,
      form.position, form.pinned, form.published, id
    );
    await adminAudit(c, `edited help article #${id} ("${form.title}")`);
    setFlash(c, 'success', 'Article saved.');
    return c.redirect(`/admin/support/articles/${id}`, 302);
  });

  app.post('/admin/support/articles/:id/publish', async (c) => {
    const db = c.get('db');
    const id = intParam(c.req.param('id'), 0);
    const article = id > 0 ? await db.get('SELECT * FROM help_articles WHERE id = ?', id) : null;
    if (!article) return notFound(c);
    await db.run("UPDATE help_articles SET published = ?, updated_at = datetime('now') WHERE id = ?",
      article.published ? 0 : 1, id);
    await adminAudit(c, `${article.published ? 'unpublished' : 'published'} help article #${id} ("${article.title}")`);
    return c.redirect('/admin/support/articles', 302);
  });

  app.post('/admin/support/articles/:id/delete', async (c) => {
    const gate = requireAdmin(c);
    if (gate) return gate;
    const db = c.get('db');
    const id = intParam(c.req.param('id'), 0);
    const article = id > 0 ? await db.get('SELECT * FROM help_articles WHERE id = ?', id) : null;
    if (!article) return notFound(c);
    await db.run('DELETE FROM help_articles WHERE id = ?', id);
    await adminAudit(c, `deleted help article #${id} ("${article.title}")`);
    setFlash(c, 'success', 'Article deleted.');
    return c.redirect('/admin/support/articles', 302);
  });

  app.post('/admin/support/sections', async (c) => {
    const db = c.get('db');
    const body = await formBody(c);
    const name = cleanLine(body.name, 60);
    if (!name) {
      setFlash(c, 'error', 'Give the section a name.');
      return c.redirect('/admin/support/articles', 302);
    }
    const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'section';
    let slug = base;
    for (let n = 2; await db.get('SELECT id FROM help_sections WHERE slug = ?', slug); n += 1) slug = `${base}-${n}`;

    await db.run(
      'INSERT INTO help_sections (slug, name, description, icon, position) VALUES (?, ?, ?, ?, ?)',
      slug, name, cleanLine(body.description, 200), cleanLine(body.icon, 8), intParam(body.position, 0)
    );
    await adminAudit(c, `created help section "${name}"`);
    setFlash(c, 'success', 'Section created.');
    return c.redirect('/admin/support/articles', 302);
  });

  app.post('/admin/support/sections/:id/edit', async (c) => {
    const db = c.get('db');
    const id = intParam(c.req.param('id'), 0);
    const section = id > 0 ? await db.get('SELECT * FROM help_sections WHERE id = ?', id) : null;
    if (!section) return notFound(c);
    const body = await formBody(c);
    const name = cleanLine(body.name, 60) || section.name;
    await db.run(
      `UPDATE help_sections SET name = ?, description = ?, icon = ?, position = ?, updated_at = datetime('now')
        WHERE id = ?`,
      name, cleanLine(body.description, 200), cleanLine(body.icon, 8), intParam(body.position, section.position), id
    );
    await adminAudit(c, `edited help section #${id} ("${name}")`);
    return c.redirect('/admin/support/articles', 302);
  });

  app.post('/admin/support/sections/:id/delete', async (c) => {
    const gate = requireAdmin(c);
    if (gate) return gate;
    const db = c.get('db');
    const id = intParam(c.req.param('id'), 0);
    const section = id > 0 ? await db.get('SELECT * FROM help_sections WHERE id = ?', id) : null;
    if (!section) return notFound(c);
    await db.run('DELETE FROM help_sections WHERE id = ?', id);
    await adminAudit(c, `deleted help section #${id} ("${section.name}") and its articles`);
    setFlash(c, 'success', 'Section deleted.');
    return c.redirect('/admin/support/articles', 302);
  });

  /* ================================================================ *
   * Ticket workspace
   * ================================================================ */

  /** Messages + internal notes + events, merged into one staff timeline. */
  async function buildTimeline(db, ticketId) {
    const messages = await db.all(
      `SELECT * FROM ticket_messages WHERE ticket_id = ? ORDER BY id LIMIT ?`, ticketId, TIMELINE_LIMIT
    );
    const notes = await db.all(
      `SELECT * FROM ticket_notes WHERE ticket_id = ? ORDER BY id LIMIT ?`, ticketId, TIMELINE_LIMIT
    );
    const events = await db.all(
      `SELECT * FROM ticket_events WHERE ticket_id = ? ORDER BY id LIMIT ?`, ticketId, TIMELINE_LIMIT
    );
    const files = await db.all(
      'SELECT id, message_id, filename, mime, bytes FROM ticket_attachments WHERE ticket_id = ? ORDER BY id',
      ticketId
    );

    const items = [
      ...messages.map((row) => ({
        kind: 'message', row, at: sqliteMs(row.created_at), seq: 1,
        files: files.filter((f) => Number(f.message_id) === Number(row.id)),
      })),
      ...notes.map((row) => ({ kind: 'note', row, at: sqliteMs(row.created_at), seq: 2, files: [] })),
      ...events.map((row) => ({ kind: 'event', row, at: sqliteMs(row.created_at), seq: 3, files: [] })),
    ].sort((a, b) => (a.at - b.at) || (a.seq - b.seq) || (a.row.id - b.row.id));

    return { items, lastMessageId: messages.length ? messages[messages.length - 1].id : 0 };
  }

  async function renderDetail(c, ticket, extra = {}) {
    const db = c.get('db');
    // maskLog() keys on user_id/username, so hand it the ticket's requester
    // under those names — a staff member's own address stays hidden from
    // other staff here exactly as it does in the IP log.
    const { maskLog } = await adminIpMask(c);
    const masked = maskLog({ user_id: ticket.user_id, username: ticket.username, ip: ticket.ip, user_agent: ticket.user_agent });
    const shown = { ...ticket, ip: masked.ip, user_agent: masked.user_agent };
    const relatedTickets = ticket.user_id
      ? await db.all(
        `SELECT id, ref, subject, status, updated_at FROM tickets
          WHERE user_id = ? AND id != ? ORDER BY id DESC LIMIT 6`, ticket.user_id, ticket.id
      )
      : (ticket.guest_email
        ? await db.all(
          `SELECT id, ref, subject, status, updated_at FROM tickets
            WHERE guest_email = ? AND id != ? ORDER BY id DESC LIMIT 6`, ticket.guest_email, ticket.id
        )
        : []);

    return c.html(views.detail(c.get('view'), {
      ticket: shown,
      timeline: await buildTimeline(db, ticket.id),
      macros: await db.all('SELECT * FROM support_macros WHERE active = 1 ORDER BY position, id'),
      agents: await staffAgents(db),
      userNotes: ticket.user_id
        ? await db.all('SELECT * FROM user_notes WHERE user_id = ? ORDER BY pinned DESC, id DESC LIMIT 20', ticket.user_id)
        : [],
      relatedTickets,
      aiEnabled: ai.aiConfig(c.get('cfg') || {}).assist,
      aiDrafts: extra.aiDrafts || null,
      aiError: extra.aiError || null,
      cfg: cfgFor(c),
    }));
  }

  /** Loads the ticket for a staff action, or null (caller renders 404). */
  async function ticketFor(c) {
    const id = intParam(c.req.param('id'), 0);
    return id > 0 ? fullTicket(c.get('db'), id) : null;
  }

  app.get('/admin/support/:id', async (c) => {
    const db = c.get('db');
    const ticket = await ticketFor(c);
    if (!ticket) return notFound(c);
    if (Number(ticket.staff_unread) > 0) {
      await db.run('UPDATE tickets SET staff_unread = 0 WHERE id = ?', ticket.id);
      ticket.staff_unread = 0;
    }
    return renderDetail(c, ticket);
  });

  /** Staff-side live poll: messages AND internal notes, newest after `after`. */
  app.get('/admin/support/:id/messages', async (c) => {
    const db = c.get('db');
    c.header('Cache-Control', 'no-store');
    const ticket = await ticketFor(c);
    if (!ticket) return c.json({ ok: false, error: 'not_found' }, 404);

    const after = intParam(new URL(c.req.url).searchParams.get('after'), 0);
    const messages = await db.all(
      'SELECT * FROM ticket_messages WHERE ticket_id = ? AND id > ? ORDER BY id LIMIT 60',
      ticket.id, after
    );
    if (messages.length) await db.run('UPDATE tickets SET staff_unread = 0 WHERE id = ?', ticket.id);

    const files = messages.length
      ? await db.all('SELECT id, message_id, filename, mime, bytes FROM ticket_attachments WHERE ticket_id = ?', ticket.id)
      : [];

    return c.json({
      ok: true,
      status: ticket.status,
      canReply: true,
      messages: messages.map((m) => ({
        id: m.id,
        author: m.author_name,
        role: m.author_role,
        body: m.body,
        createdAt: m.created_at,
        files: files.filter((f) => Number(f.message_id) === Number(m.id)).map((f) => ({
          id: f.id, name: f.filename, image: String(f.mime).startsWith('image/'),
          kb: Math.max(1, Math.round(f.bytes / 1024)),
        })),
      })),
    });
  });

  app.post('/admin/support/:id/reply', async (c) => {
    const db = c.get('db');
    const env = c.get('cfg') || {};
    const cfg = cfgFor(c);
    const ticket = await ticketFor(c);
    if (!ticket) return notFound(c);
    const user = c.get('user');
    const body = await formBody(c);

    const text = cleanBody(body.body, MAX_BODY);
    const { files, errors } = await readUploads(c, cfg);
    if (!text && !files.length) {
      setFlash(c, 'error', 'Write a reply (or attach a file) before sending.');
      return c.redirect(`/admin/support/${ticket.id}`, 302);
    }

    const messageId = await addMessage(db, ticket, {
      role: 'staff',
      authorId: user.id,
      authorName: user.username,
      body: text || '(file attached)',
      aiAssisted: Boolean(body.ai_assisted),
    });
    if (files.length) {
      await saveUploads(db, {
        ticketId: ticket.id, messageId, uploaderId: user.id,
        uploaderName: user.username, uploaderRole: 'staff',
      }, files);
    }

    // Answering an unassigned ticket claims it — the person who replied is
    // the person the customer will expect to hear from next.
    if (!ticket.assignee_id) {
      await db.run('UPDATE tickets SET assignee_id = ?, assignee_name = ? WHERE id = ? AND assignee_id IS NULL',
        user.id, user.username, ticket.id);
      await addEvent(db, ticket.id, user.username, 'assigned', 'claimed by replying');
    }
    if (body.solve) {
      await db.run(
        `UPDATE tickets SET status = 'solved', closed_at = ?, closed_by = ?, updated_at = datetime('now')
          WHERE id = ?`, Date.now(), user.username, ticket.id
      );
      await addEvent(db, ticket.id, user.username, 'status', 'marked solved with the reply');
    }

    await adminAudit(c, `replied to ticket ${ticket.ref}`);
    const fresh = await fullTicket(db, ticket.id);
    await defer(c, emailRequester(env, cfg, fresh, staffReplyMail(fresh, cfg, null)));

    if (errors.length) setFlash(c, 'error', errors.join(' '));
    else setFlash(c, 'success', `Reply sent to ${fresh.username || fresh.guest_email || 'the requester'}.`);
    return c.redirect(`/admin/support/${ticket.id}#msg-${messageId}`, 302);
  });

  /** One click: send a canned reply and apply whatever it is configured to change. */
  app.post('/admin/support/:id/macro', async (c) => {
    const db = c.get('db');
    const env = c.get('cfg') || {};
    const cfg = cfgFor(c);
    const ticket = await ticketFor(c);
    if (!ticket) return notFound(c);
    const user = c.get('user');
    const body = await formBody(c);

    const macro = await db.get('SELECT * FROM support_macros WHERE id = ? AND active = 1',
      intParam(body.macro_id, 0));
    if (!macro) {
      setFlash(c, 'error', 'That canned reply no longer exists.');
      return c.redirect(`/admin/support/${ticket.id}`, 302);
    }

    const messageId = await addMessage(db, ticket, {
      role: 'staff', authorId: user.id, authorName: user.username, body: macro.body,
    });
    await db.run('UPDATE support_macros SET uses = uses + 1 WHERE id = ?', macro.id);

    if (macro.set_status) {
      await db.run("UPDATE tickets SET status = ?, updated_at = datetime('now') WHERE id = ?",
        normalizeStatus(macro.set_status), ticket.id);
    }
    if (macro.set_priority) {
      const priority = normalizePriority(macro.set_priority);
      await db.run("UPDATE tickets SET priority = ?, sla_due_at = ?, updated_at = datetime('now') WHERE id = ?",
        priority, slaDueAt(priority, cfg, sqliteMs(ticket.created_at)), ticket.id);
    }
    if (macro.set_tags) {
      const merged = normalizeTags([...tagList(ticket.tags), ...tagList(macro.set_tags)].join(','));
      await db.run('UPDATE tickets SET tags = ? WHERE id = ?', merged, ticket.id);
    }
    if (!ticket.assignee_id) {
      await db.run('UPDATE tickets SET assignee_id = ?, assignee_name = ? WHERE id = ? AND assignee_id IS NULL',
        user.id, user.username, ticket.id);
    }

    await addEvent(db, ticket.id, user.username, 'macro', `sent "${macro.title}"`);
    await adminAudit(c, `sent canned reply "${macro.title}" on ${ticket.ref}`);

    const fresh = await fullTicket(db, ticket.id);
    await defer(c, emailRequester(env, cfg, fresh, staffReplyMail(fresh, cfg, null)));
    setFlash(c, 'success', `Sent “${macro.title}”.`);
    return c.redirect(`/admin/support/${ticket.id}#msg-${messageId}`, 302);
  });

  app.post('/admin/support/:id/note', async (c) => {
    const db = c.get('db');
    const ticket = await ticketFor(c);
    if (!ticket) return notFound(c);
    const user = c.get('user');
    const text = cleanBody((await formBody(c)).body, MAX_NOTE);
    if (!text) {
      setFlash(c, 'error', 'Write something before saving the note.');
      return c.redirect(`/admin/support/${ticket.id}`, 302);
    }
    await db.run(
      'INSERT INTO ticket_notes (ticket_id, author_id, author_name, body) VALUES (?, ?, ?, ?)',
      ticket.id, user.id, user.username, text
    );
    await db.run("UPDATE tickets SET updated_at = datetime('now') WHERE id = ?", ticket.id);
    setFlash(c, 'success', 'Internal note added — the customer cannot see it.');
    return c.redirect(`/admin/support/${ticket.id}`, 302);
  });

  app.post('/admin/support/notes/:id/delete', async (c) => {
    const db = c.get('db');
    const id = intParam(c.req.param('id'), 0);
    const note = id > 0 ? await db.get('SELECT * FROM ticket_notes WHERE id = ?', id) : null;
    if (!note) return notFound(c);
    await db.run('DELETE FROM ticket_notes WHERE id = ?', id);
    return c.redirect(`/admin/support/${note.ticket_id}`, 302);
  });

  app.post('/admin/support/:id/user-note', async (c) => {
    const db = c.get('db');
    const ticket = await ticketFor(c);
    if (!ticket || !ticket.user_id) return notFound(c);
    const user = c.get('user');
    const text = cleanBody((await formBody(c)).body, MAX_NOTE);
    if (!text) {
      setFlash(c, 'error', 'Write something before saving the note.');
      return c.redirect(`/admin/support/${ticket.id}`, 302);
    }
    await db.run(
      'INSERT INTO user_notes (user_id, author_id, author_name, body) VALUES (?, ?, ?, ?)',
      ticket.user_id, user.id, user.username, text
    );
    await adminAudit(c, `added a staff note on user #${ticket.user_id}`);
    setFlash(c, 'success', 'Note saved against the member.');
    return c.redirect(`/admin/support/${ticket.id}`, 302);
  });

  app.post('/admin/support/user-notes/:id/delete', async (c) => {
    const db = c.get('db');
    const id = intParam(c.req.param('id'), 0);
    const note = id > 0 ? await db.get('SELECT * FROM user_notes WHERE id = ?', id) : null;
    if (!note) return notFound(c);
    await db.run('DELETE FROM user_notes WHERE id = ?', id);
    const back = await c.get('db').get(
      'SELECT id FROM tickets WHERE user_id = ? ORDER BY id DESC LIMIT 1', note.user_id
    );
    return c.redirect(back ? `/admin/support/${back.id}` : '/admin/support', 302);
  });

  /* ---------------- Field updates ---------------- */

  app.post('/admin/support/:id/status', async (c) => {
    const db = c.get('db');
    const env = c.get('cfg') || {};
    const cfg = cfgFor(c);
    const ticket = await ticketFor(c);
    if (!ticket) return notFound(c);
    const user = c.get('user');
    const status = normalizeStatus(String((await formBody(c)).status || ''));

    if (status !== ticket.status) {
      const closing = status === 'closed' || status === 'solved';
      await db.run(
        `UPDATE tickets SET status = ?, closed_at = ?, closed_by = ?, updated_at = datetime('now') WHERE id = ?`,
        status, closing ? Date.now() : null, closing ? user.username : null, ticket.id
      );
      await addEvent(db, ticket.id, user.username, 'status', `${ticket.status} → ${status}`);
      await adminAudit(c, `set ticket ${ticket.ref} to ${status}`);

      // Only a real close is worth an email; "solved" is announced by the
      // reply that solved it, and "pending" is internal bookkeeping.
      if (status === 'closed') {
        const fresh = await fullTicket(db, ticket.id);
        await defer(c, emailRequester(env, cfg, fresh, ticketClosedMail(fresh, cfg, null)));
      }
    }
    setFlash(c, 'success', `Status: ${STATUS_LABELS[status]}.`);
    return c.redirect(`/admin/support/${ticket.id}`, 302);
  });

  app.post('/admin/support/:id/priority', async (c) => {
    const db = c.get('db');
    const cfg = cfgFor(c);
    const ticket = await ticketFor(c);
    if (!ticket) return notFound(c);
    const user = c.get('user');
    const priority = normalizePriority(String((await formBody(c)).priority || ''));

    if (priority !== ticket.priority) {
      // Re-base the first-response clock on the new priority, measured from
      // when the ticket arrived — not from now, or an escalation would hand
      // us back time we had already used.
      await db.run(
        `UPDATE tickets SET priority = ?, sla_due_at = ?, updated_at = datetime('now') WHERE id = ?`,
        priority, slaDueAt(priority, cfg, sqliteMs(ticket.created_at)), ticket.id
      );
      await addEvent(db, ticket.id, user.username, 'priority', `${ticket.priority} → ${priority}`);
      await adminAudit(c, `set ticket ${ticket.ref} priority to ${priority}`);
      if (priority === 'urgent') {
        await alertStaff(c.get('cfg'), cfg, 'ticket_escalated', { ...ticket, priority },
          { note: `escalated by ${user.username}` });
      }
    }
    return c.redirect(`/admin/support/${ticket.id}`, 302);
  });

  app.post('/admin/support/:id/assign', async (c) => {
    const db = c.get('db');
    const ticket = await ticketFor(c);
    if (!ticket) return notFound(c);
    const user = c.get('user');
    const raw = String((await formBody(c)).assignee || '');

    let assignee = null;
    if (raw === 'me') assignee = { id: user.id, username: user.username };
    else if (/^\d+$/.test(raw)) {
      const row = await db.get('SELECT id, username, tier FROM users WHERE id = ?', Number(raw));
      if (row && isStaff(row)) assignee = row;
    }

    await db.run('UPDATE tickets SET assignee_id = ?, assignee_name = ?, updated_at = datetime(\'now\') WHERE id = ?',
      assignee ? assignee.id : null, assignee ? assignee.username : null, ticket.id);
    await addEvent(db, ticket.id, user.username, 'assigned', assignee ? `to ${assignee.username}` : 'unassigned');
    await adminAudit(c, `assigned ticket ${ticket.ref} to ${assignee ? assignee.username : 'nobody'}`);
    return c.redirect(`/admin/support/${ticket.id}`, 302);
  });

  app.post('/admin/support/:id/category', async (c) => {
    const db = c.get('db');
    const ticket = await ticketFor(c);
    if (!ticket) return notFound(c);
    const category = normalizeCategory(String((await formBody(c)).category || ''));
    if (category !== ticket.category) {
      await db.run("UPDATE tickets SET category = ?, updated_at = datetime('now') WHERE id = ?", category, ticket.id);
      await addEvent(db, ticket.id, c.get('user').username, 'category', `${ticket.category} → ${category}`);
    }
    return c.redirect(`/admin/support/${ticket.id}`, 302);
  });

  app.post('/admin/support/:id/tags', async (c) => {
    const db = c.get('db');
    const ticket = await ticketFor(c);
    if (!ticket) return notFound(c);
    const tags = normalizeTags((await formBody(c)).tags);
    await db.run("UPDATE tickets SET tags = ?, updated_at = datetime('now') WHERE id = ?", tags, ticket.id);
    await addEvent(db, ticket.id, c.get('user').username, 'tags', tags || '(cleared)');
    return c.redirect(`/admin/support/${ticket.id}`, 302);
  });

  app.post('/admin/support/:id/spam', async (c) => {
    const db = c.get('db');
    const ticket = await ticketFor(c);
    if (!ticket) return notFound(c);
    const next = ticket.spam ? 0 : 1;
    await db.run("UPDATE tickets SET spam = ?, updated_at = datetime('now') WHERE id = ?", next, ticket.id);
    await addEvent(db, ticket.id, c.get('user').username, 'spam', next ? 'flagged as spam' : 'cleared the spam flag');
    await adminAudit(c, `${next ? 'flagged' : 'unflagged'} ticket ${ticket.ref} as spam`);
    setFlash(c, 'success', next ? 'Flagged as spam and hidden from the queue.' : 'Back in the queue.');
    return c.redirect(next ? '/admin/support' : `/admin/support/${ticket.id}`, 302);
  });

  /**
   * Merge: the conversation, its files and its notes move to the survivor and
   * the source becomes a closed pointer at it. Nothing is deleted, and the
   * customer's old link keeps working — it redirects to the survivor.
   */
  app.post('/admin/support/:id/merge', async (c) => {
    const db = c.get('db');
    const ticket = await ticketFor(c);
    if (!ticket) return notFound(c);
    const user = c.get('user');
    const intoRef = normalizeRef((await formBody(c)).into);

    const target = intoRef ? await db.get('SELECT * FROM tickets WHERE ref = ?', intoRef) : null;
    if (!target || target.id === ticket.id) {
      setFlash(c, 'error', 'Give the reference of the ticket to merge INTO, e.g. GH-1A2B3C4D.');
      return c.redirect(`/admin/support/${ticket.id}`, 302);
    }
    if (target.merged_into) {
      setFlash(c, 'error', 'That ticket has itself been merged into another one. Merge into the survivor instead.');
      return c.redirect(`/admin/support/${ticket.id}`, 302);
    }
    if (!sameRequester(ticket, target)) {
      setFlash(c, 'error', 'Those tickets are from different people. Merging would either strand one of '
        + 'them at a dead link or hand them the other\'s conversation — link them with a note instead.');
      return c.redirect(`/admin/support/${ticket.id}`, 302);
    }

    // Ordered so an interruption is untidy rather than lossy: content moves
    // first, and the source is only marked merged once it has nothing left.
    // D1 is auto-commit with no batch(), so there is no transaction to lean on.
    await db.run('UPDATE ticket_messages SET ticket_id = ? WHERE ticket_id = ?', target.id, ticket.id);
    await db.run('UPDATE ticket_attachments SET ticket_id = ? WHERE ticket_id = ?', target.id, ticket.id);
    await db.run('UPDATE ticket_notes SET ticket_id = ? WHERE ticket_id = ?', target.id, ticket.id);
    await db.run('UPDATE ticket_events SET ticket_id = ? WHERE ticket_id = ?', target.id, ticket.id);
    await db.run(
      `UPDATE tickets SET merged_into = ?, status = 'closed', closed_at = ?, closed_by = ?,
              updated_at = datetime('now') WHERE id = ?`,
      target.id, Date.now(), user.username, ticket.id
    );
    await db.run(
      `UPDATE tickets SET staff_unread = staff_unread + ?, updated_at = datetime('now') WHERE id = ?`,
      Number(ticket.staff_unread) || 0, target.id
    );

    // The source keeps a visible marker of its own: its messages have moved,
    // and a guest's key only ever opens the ticket it was issued for, so an
    // empty thread with no explanation is exactly what they must not find.
    await addMessage(db, { ...ticket, status: 'closed' }, {
      role: 'system',
      authorName: 'System',
      body: `This ticket was merged into ${target.ref}, where the conversation continues. `
        + 'Your other ticket is listed under "Your tickets" on the support page.',
    });
    await addEvent(db, target.id, user.username, 'merged_in', `${ticket.ref} ("${ticket.subject}") merged in`);
    await addEvent(db, ticket.id, user.username, 'merged_into', `merged into ${target.ref}`);
    await adminAudit(c, `merged ticket ${ticket.ref} into ${target.ref}`);
    setFlash(c, 'success', `${ticket.ref} merged into ${target.ref}.`);
    return c.redirect(`/admin/support/${target.id}`, 302);
  });

  /* ---------------- AI assist ---------------- */

  app.post('/admin/support/:id/ai/summary', async (c) => {
    const db = c.get('db');
    const env = c.get('cfg') || {};
    const ticket = await ticketFor(c);
    if (!ticket) return notFound(c);
    if (!ai.aiConfig(env).assist) {
      setFlash(c, 'error', 'AI assist is not configured (set GEMINI_API_KEY).');
      return c.redirect(`/admin/support/${ticket.id}`, 302);
    }

    const verdict = await limits.check(db, 'aiassist', String(c.get('user').id), env);
    if (!verdict.ok) {
      setFlash(c, 'error', 'You have used the AI assist a lot in the last hour — give it a moment.');
      return c.redirect(`/admin/support/${ticket.id}`, 302);
    }

    const messages = await db.all(
      'SELECT author_role, body FROM ticket_messages WHERE ticket_id = ? ORDER BY id LIMIT 40', ticket.id
    );
    const result = await ai.summarizeTicket(env, { ticket, messages });
    if (!result.ok) return renderDetail(c, ticket, { aiError: `Could not summarise: ${result.error}` });

    const { ok, ...summary } = result;
    await db.run('UPDATE tickets SET ai_summary = ?, ai_summary_at = ? WHERE id = ?',
      JSON.stringify(summary), Date.now(), ticket.id);
    await addEvent(db, ticket.id, c.get('user').username, 'ai_summary', 'generated a thread summary');
    return c.redirect(`/admin/support/${ticket.id}`, 302);
  });

  app.post('/admin/support/:id/ai/drafts', async (c) => {
    const db = c.get('db');
    const env = c.get('cfg') || {};
    const ticket = await ticketFor(c);
    if (!ticket) return notFound(c);
    if (!ai.aiConfig(env).assist) {
      setFlash(c, 'error', 'AI assist is not configured (set GEMINI_API_KEY).');
      return c.redirect(`/admin/support/${ticket.id}`, 302);
    }

    const verdict = await limits.check(db, 'aiassist', String(c.get('user').id), env);
    if (!verdict.ok) {
      setFlash(c, 'error', 'You have used the AI assist a lot in the last hour — give it a moment.');
      return c.redirect(`/admin/support/${ticket.id}`, 302);
    }

    const messages = await db.all(
      'SELECT author_role, body FROM ticket_messages WHERE ticket_id = ? ORDER BY id LIMIT 40', ticket.id
    );
    const articles = await searchArticles(db, `${ticket.subject} ${messages.map((m) => m.body).join(' ')}`, { limit: 4 });
    const macros = await db.all('SELECT title, body FROM support_macros WHERE active = 1 ORDER BY uses DESC LIMIT 6');

    const result = await ai.draftReplies(env, { ticket, messages, articles, macros });
    if (!result.ok) return renderDetail(c, ticket, { aiError: `Could not draft replies: ${result.error}` });

    await addEvent(db, ticket.id, c.get('user').username, 'ai_drafts', `generated ${result.drafts.length} reply drafts`);
    // Drafts are never stored: they are a suggestion to the agent reading this
    // page right now, not a record of what the ticket said.
    return renderDetail(c, await fullTicket(db, ticket.id), { aiDrafts: result.drafts });
  });
}

export { register };
