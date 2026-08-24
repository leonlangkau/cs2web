import * as views from "./views/forum.js";
import * as site from "./views/site.js";
import * as limits from "./limits.js";
import { requireAuth, formBody, setFlash, clientIp } from "./middleware.js";
import { tooMany } from "./routes-main.js";

const THREADS_PER_PAGE = 20;
const POSTS_PER_PAGE = 20;
const MAX_TITLE = 120;
const MAX_BODY = 10000;
const SHOUT_MAX = 200;
const SHOUTS_PER_LOAD = 30;

function notFound(c) {
  return c.html(site.errorPage(c.get('view'), {
    code: 404, title: 'Not found', message: 'This page does not exist.',
  }), 404);
}

function intParam(value, fallback = 1) {
  const n = parseInt(value, 10);
  return Number.isInteger(n) ? n : fallback;
}

function register(app) {
  app.get('/forum', async (c) => {
    const db = c.get('db');
    const categories = await db.all(
      `SELECT c.*,
          (SELECT COUNT(*) FROM threads t WHERE t.category_id = c.id) AS thread_count,
          (SELECT COUNT(*) FROM posts p JOIN threads t ON t.id = p.thread_id WHERE t.category_id = c.id) AS post_count,
          (SELECT t.title FROM threads t WHERE t.category_id = c.id ORDER BY t.updated_at DESC LIMIT 1) AS latest_title,
          (SELECT t.id FROM threads t WHERE t.category_id = c.id ORDER BY t.updated_at DESC LIMIT 1) AS latest_id,
          (SELECT t.updated_at FROM threads t WHERE t.category_id = c.id ORDER BY t.updated_at DESC LIMIT 1) AS latest_at
       FROM categories c ORDER BY c.position, c.id`
    );
    const recent = await db.all(
      `SELECT t.id, t.title, t.updated_at, u.username, c.name AS category,
          (SELECT COUNT(*) FROM posts p WHERE p.thread_id = t.id) AS replies
       FROM threads t JOIN users u ON u.id = t.user_id JOIN categories c ON c.id = t.category_id
       ORDER BY t.updated_at DESC LIMIT 8`
    );
    const shouts = await db.all(
      `SELECT s.id, s.body, s.created_at, u.username, u.role AS author_role
       FROM shouts s JOIN users u ON u.id = s.user_id
       ORDER BY s.id DESC LIMIT ?`,
      SHOUTS_PER_LOAD
    );
    shouts.reverse();
    return c.html(views.index(c.get('view'), { categories, recent, shouts }));
  });

  app.get('/forum/c/:slug', async (c) => {
    const db = c.get('db');
    const category = await db.get('SELECT * FROM categories WHERE slug = ?', c.req.param('slug'));
    if (!category) return notFound(c);

    const url = new URL(c.req.url);
    const total = Number((await db.get('SELECT COUNT(*) AS n FROM threads WHERE category_id = ?', category.id)).n);
    const pages = Math.max(1, Math.ceil(total / THREADS_PER_PAGE));
    const page = Math.max(1, Math.min(pages, intParam(url.searchParams.get('page'))));

    const threads = await db.all(
      `SELECT t.*, u.username,
          (SELECT COUNT(*) - 1 FROM posts p WHERE p.thread_id = t.id) AS replies,
          (SELECT MAX(p.created_at) FROM posts p WHERE p.thread_id = t.id) AS last_post_at
       FROM threads t JOIN users u ON u.id = t.user_id
       WHERE t.category_id = ?
       ORDER BY t.pinned DESC, t.updated_at DESC
       LIMIT ? OFFSET ?`,
      category.id, THREADS_PER_PAGE, (page - 1) * THREADS_PER_PAGE
    );

    return c.html(views.category(c.get('view'), { category, threads, page, pages }));
  });

  app.get('/forum/new', async (c) => {
    const gate = requireAuth(c);
    if (gate) return gate;
    const categories = await c.get('db').all('SELECT * FROM categories ORDER BY position, id');
    const preset = new URL(c.req.url).searchParams.get('c') || '';
    return c.html(views.newThread(c.get('view'), { categories, errors: [], values: { category: preset } }));
  });

  app.post('/forum/new', async (c) => {
    const gate = requireAuth(c);
    if (gate) return gate;
    const db = c.get('db');
    const user = c.get('user');

    const verdict = await limits.check(db, 'post', String(user.id), c.get('cfg'));
    if (!verdict.ok) return tooMany(c, verdict.retryAfterSec);

    const categories = await db.all('SELECT * FROM categories ORDER BY position, id');
    const body = await formBody(c);
    const slug = String(body.category || '');
    const title = String(body.title || '').trim().replace(/\s+/g, ' ');
    const text = String(body.body || '').trim();

    const category = categories.find((cat) => cat.slug === slug);
    const errors = [];
    if (!category) errors.push('Pick a valid category.');
    if (title.length < 3 || title.length > MAX_TITLE) errors.push(`Title must be 3–${MAX_TITLE} characters.`);
    if (text.length < 1 || text.length > MAX_BODY) errors.push(`Post body must be 1–${MAX_BODY} characters.`);

    if (errors.length > 0) {
      return c.html(views.newThread(c.get('view'), {
        categories, errors, values: { category: slug, title, body: text },
      }), 400);
    }

    const thread = await db.run(
      'INSERT INTO threads (category_id, user_id, title) VALUES (?, ?, ?)',
      category.id, user.id, title
    );
    await db.run(
      'INSERT INTO posts (thread_id, user_id, body) VALUES (?, ?, ?)',
      thread.lastInsertRowid, user.id, text
    );

    setFlash(c, 'success', 'Thread created.');
    return c.redirect(`/forum/t/${thread.lastInsertRowid}`, 302);
  });

  app.get('/forum/t/:id', async (c) => {
    const db = c.get('db');
    const id = intParam(c.req.param('id'), 0);
    if (id < 1) return notFound(c);

    const thread = await db.get(
      `SELECT t.*, u.username, c.name AS category_name, c.slug AS category_slug
       FROM threads t JOIN users u ON u.id = t.user_id JOIN categories c ON c.id = t.category_id
       WHERE t.id = ?`, id
    );
    if (!thread) return notFound(c);

    await db.run('UPDATE threads SET views = views + 1 WHERE id = ?', id);

    const totalPosts = Number((await db.get('SELECT COUNT(*) AS n FROM posts WHERE thread_id = ?', id)).n);
    const pages = Math.max(1, Math.ceil(totalPosts / POSTS_PER_PAGE));
    const page = Math.max(1, Math.min(pages, intParam(new URL(c.req.url).searchParams.get('page'))));

    const posts = await db.all(
      `SELECT p.*, u.username, u.role AS author_role, u.created_at AS author_since,
          (SELECT COUNT(*) FROM posts x WHERE x.user_id = u.id) AS author_posts
       FROM posts p JOIN users u ON u.id = p.user_id
       WHERE p.thread_id = ? ORDER BY p.id LIMIT ? OFFSET ?`,
      id, POSTS_PER_PAGE, (page - 1) * POSTS_PER_PAGE
    );

    const first = await db.get('SELECT MIN(id) AS m FROM posts WHERE thread_id = ?', id);
    return c.html(views.thread(c.get('view'), {
      thread, posts, firstPostId: Number(first.m),
      page, pages, postOffset: (page - 1) * POSTS_PER_PAGE,
    }));
  });

  app.post('/forum/t/:id/reply', async (c) => {
    const gate = requireAuth(c);
    if (gate) return gate;
    const db = c.get('db');
    const user = c.get('user');
    const id = intParam(c.req.param('id'), 0);
    if (id < 1) return notFound(c);

    const thread = await db.get('SELECT * FROM threads WHERE id = ?', id);
    if (!thread) return notFound(c);

    if (thread.locked && user.role !== 'admin') {
      setFlash(c, 'error', 'This thread is locked.');
      return c.redirect(`/forum/t/${id}`, 302);
    }

    const verdict = await limits.check(db, 'post', String(user.id), c.get('cfg'));
    if (!verdict.ok) return tooMany(c, verdict.retryAfterSec);

    const body = await formBody(c);
    const text = String(body.body || '').trim();
    if (text.length < 1 || text.length > MAX_BODY) {
      setFlash(c, 'error', `Reply must be 1–${MAX_BODY} characters.`);
      return c.redirect(`/forum/t/${id}`, 302);
    }

    const post = await db.run(
      'INSERT INTO posts (thread_id, user_id, body) VALUES (?, ?, ?)', id, user.id, text
    );
    await db.run("UPDATE threads SET updated_at = datetime('now') WHERE id = ?", id);

    // Land the author on the page their new post actually lives on.
    const total = Number((await db.get('SELECT COUNT(*) AS n FROM posts WHERE thread_id = ?', id)).n);
    const lastPage = Math.max(1, Math.ceil(total / POSTS_PER_PAGE));
    const query = lastPage > 1 ? `?page=${lastPage}` : '';
    return c.redirect(`/forum/t/${id}${query}#post-${post.lastInsertRowid}`, 302);
  });

  // Self-serve delete: the thread's own author, or an admin, may remove it.
  // (The admin panel additionally exposes /admin/threads/:id/delete for
  // moderation from the Forum management tab.)
  app.post('/forum/t/:id/delete', async (c) => {
    const gate = requireAuth(c);
    if (gate) return gate;
    const db = c.get('db');
    const user = c.get('user');
    const id = intParam(c.req.param('id'), 0);
    const thread = id > 0 ? await db.get('SELECT * FROM threads WHERE id = ?', id) : null;
    if (!thread) return notFound(c);
    if (thread.user_id !== user.id && user.role !== 'admin') return notFound(c);

    await db.run('DELETE FROM threads WHERE id = ?', id);
    setFlash(c, 'success', 'Thread deleted.');
    return c.redirect('/forum', 302);
  });

  app.post('/forum/posts/:id/delete', async (c) => {
    const gate = requireAuth(c);
    if (gate) return gate;
    const db = c.get('db');
    const user = c.get('user');
    const id = intParam(c.req.param('id'), 0);
    const post = id > 0 ? await db.get('SELECT * FROM posts WHERE id = ?', id) : null;
    if (!post) return notFound(c);
    if (post.user_id !== user.id && user.role !== 'admin') return notFound(c);

    const first = await db.get('SELECT MIN(id) AS m FROM posts WHERE thread_id = ?', post.thread_id);
    if (Number(first.m) === post.id) {
      setFlash(c, 'error', 'That is the opening post — delete the whole thread instead.');
      return c.redirect(`/forum/t/${post.thread_id}`, 302);
    }
    await db.run('DELETE FROM posts WHERE id = ?', id);
    setFlash(c, 'success', 'Post deleted.');
    return c.redirect(`/forum/t/${post.thread_id}`, 302);
  });

  // Shoutbox: a short-lived, JS-polled chat strip on the forum index. The GET
  // endpoint is used by the client to pull anything newer than `after`; POST
  // is progressively enhanced — with JS it returns JSON, without it falls
  // back to a normal redirect+flash like every other form on the site.
  app.get('/forum/shoutbox', async (c) => {
    const db = c.get('db');
    const afterId = intParam(new URL(c.req.url).searchParams.get('after'), 0);
    const shouts = await db.all(
      `SELECT s.id, s.body, s.created_at, u.username, u.role AS author_role
       FROM shouts s JOIN users u ON u.id = s.user_id
       WHERE s.id > ? ORDER BY s.id DESC LIMIT ?`,
      afterId, SHOUTS_PER_LOAD
    );
    shouts.reverse();
    c.header('Cache-Control', 'no-store');
    return c.json({ shouts });
  });

  app.post('/forum/shoutbox', async (c) => {
    const wantsJson = c.req.header('x-requested-with') === 'fetch';
    if (wantsJson && !c.get('user')) return c.json({ ok: false, error: 'You need to sign in to do that.' }, 401);
    const gate = requireAuth(c);
    if (gate) return gate;

    const db = c.get('db');
    const user = c.get('user');

    const verdict = await limits.check(db, 'shout', String(user.id), c.get('cfg'));
    if (!verdict.ok) {
      if (wantsJson) return c.json({ ok: false, error: 'Slow down — try again shortly.' }, 429);
      return tooMany(c, verdict.retryAfterSec);
    }

    const body = await formBody(c);
    const text = String(body.body || '').trim().replace(/\s+/g, ' ');
    if (text.length < 1 || text.length > SHOUT_MAX) {
      const message = `Shout must be 1–${SHOUT_MAX} characters.`;
      if (wantsJson) return c.json({ ok: false, error: message }, 400);
      setFlash(c, 'error', message);
      return c.redirect('/forum', 302);
    }

    await db.run('INSERT INTO shouts (user_id, body) VALUES (?, ?)', user.id, text);
    if (wantsJson) return c.json({ ok: true });
    setFlash(c, 'success', 'Shout posted.');
    return c.redirect('/forum', 302);
  });
}

export { register };
