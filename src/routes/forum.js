'use strict';

const express = require('express');

const { db } = require('../db');
const { requireAuth } = require('../middleware');
const { limits, tooMany } = require('../limits');

const router = express.Router();

const THREADS_PER_PAGE = 20;
const POSTS_PER_PAGE = 20;
const MAX_TITLE = 120;
const MAX_BODY = 10000;

function notFound(res) {
  return res.status(404).render('error', { title: 'Not found', code: 404, message: 'This page does not exist.' });
}

router.get('/', (req, res) => {
  const categories = db.prepare(
    `SELECT c.*,
        (SELECT COUNT(*) FROM threads t WHERE t.category_id = c.id) AS thread_count,
        (SELECT COUNT(*) FROM posts p JOIN threads t ON t.id = p.thread_id WHERE t.category_id = c.id) AS post_count,
        (SELECT t.title FROM threads t WHERE t.category_id = c.id ORDER BY t.updated_at DESC LIMIT 1) AS latest_title,
        (SELECT t.id FROM threads t WHERE t.category_id = c.id ORDER BY t.updated_at DESC LIMIT 1) AS latest_id,
        (SELECT t.updated_at FROM threads t WHERE t.category_id = c.id ORDER BY t.updated_at DESC LIMIT 1) AS latest_at
     FROM categories c ORDER BY c.position, c.id`
  ).all();

  const recent = db.prepare(
    `SELECT t.id, t.title, t.updated_at, u.username, c.name AS category,
        (SELECT COUNT(*) FROM posts p WHERE p.thread_id = t.id) AS replies
     FROM threads t JOIN users u ON u.id = t.user_id JOIN categories c ON c.id = t.category_id
     ORDER BY t.updated_at DESC LIMIT 8`
  ).all();

  res.render('forum/index', { title: 'Forum', categories, recent });
});

router.get('/c/:slug', (req, res) => {
  const category = db.prepare('SELECT * FROM categories WHERE slug = ?').get(String(req.params.slug));
  if (!category) return notFound(res);

  const page = Math.max(1, Math.min(10000, parseInt(req.query.page, 10) || 1));
  const total = Number(db.prepare('SELECT COUNT(*) AS n FROM threads WHERE category_id = ?').get(category.id).n);
  const pages = Math.max(1, Math.ceil(total / THREADS_PER_PAGE));

  const threads = db.prepare(
    `SELECT t.*, u.username,
        (SELECT COUNT(*) - 1 FROM posts p WHERE p.thread_id = t.id) AS replies,
        (SELECT MAX(p.created_at) FROM posts p WHERE p.thread_id = t.id) AS last_post_at
     FROM threads t JOIN users u ON u.id = t.user_id
     WHERE t.category_id = ?
     ORDER BY t.pinned DESC, t.updated_at DESC
     LIMIT ? OFFSET ?`
  ).all(category.id, THREADS_PER_PAGE, (page - 1) * THREADS_PER_PAGE);

  res.render('forum/category', { title: category.name, category, threads, page, pages });
});

router.get('/t/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id) || id < 1) return notFound(res);

  const thread = db.prepare(
    `SELECT t.*, u.username, c.name AS category_name, c.slug AS category_slug
     FROM threads t JOIN users u ON u.id = t.user_id JOIN categories c ON c.id = t.category_id
     WHERE t.id = ?`
  ).get(id);
  if (!thread) return notFound(res);

  db.prepare('UPDATE threads SET views = views + 1 WHERE id = ?').run(id);

  const totalPosts = Number(db.prepare('SELECT COUNT(*) AS n FROM posts WHERE thread_id = ?').get(id).n);
  const pages = Math.max(1, Math.ceil(totalPosts / POSTS_PER_PAGE));
  const page = Math.max(1, Math.min(pages, parseInt(req.query.page, 10) || 1));

  const posts = db.prepare(
    `SELECT p.*, u.username, u.role AS author_role, u.created_at AS author_since,
        (SELECT COUNT(*) FROM posts x WHERE x.user_id = u.id) AS author_posts
     FROM posts p JOIN users u ON u.id = p.user_id
     WHERE p.thread_id = ? ORDER BY p.id LIMIT ? OFFSET ?`
  ).all(id, POSTS_PER_PAGE, (page - 1) * POSTS_PER_PAGE);

  const firstPostId = Number(db.prepare('SELECT MIN(id) AS m FROM posts WHERE thread_id = ?').get(id).m);
  res.render('forum/thread', {
    title: thread.title, thread, posts, firstPostId,
    page, pages, postOffset: (page - 1) * POSTS_PER_PAGE,
  });
});

router.get('/new', requireAuth, (req, res) => {
  const categories = db.prepare('SELECT * FROM categories ORDER BY position, id').all();
  res.render('forum/new', {
    title: 'New thread', categories, errors: [], values: { category: String(req.query.c || '') },
  });
});

router.post('/new', requireAuth, (req, res) => {
  const verdict = limits.post.check(`post:${req.user.id}`);
  if (!verdict.ok) return tooMany(res, verdict.retryAfterSec);

  const categories = db.prepare('SELECT * FROM categories ORDER BY position, id').all();
  const slug = String(req.body.category || '');
  const title = String(req.body.title || '').trim().replace(/\s+/g, ' ');
  const body = String(req.body.body || '').trim();

  const category = categories.find((c) => c.slug === slug);
  const errors = [];
  if (!category) errors.push('Pick a valid category.');
  if (title.length < 3 || title.length > MAX_TITLE) errors.push(`Title must be 3–${MAX_TITLE} characters.`);
  if (body.length < 1 || body.length > MAX_BODY) errors.push(`Post body must be 1–${MAX_BODY} characters.`);

  if (errors.length > 0) {
    return res.status(400).render('forum/new', {
      title: 'New thread', categories, errors, values: { category: slug, title, body },
    });
  }

  const thread = db.prepare('INSERT INTO threads (category_id, user_id, title) VALUES (?, ?, ?)')
    .run(category.id, req.user.id, title);
  db.prepare('INSERT INTO posts (thread_id, user_id, body) VALUES (?, ?, ?)')
    .run(thread.lastInsertRowid, req.user.id, body);

  res.setFlash('success', 'Thread created.');
  res.redirect(`/forum/t/${thread.lastInsertRowid}`);
});

router.post('/t/:id/reply', requireAuth, (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id) || id < 1) return notFound(res);

  const thread = db.prepare('SELECT * FROM threads WHERE id = ?').get(id);
  if (!thread) return notFound(res);

  if (thread.locked && req.user.role !== 'admin') {
    res.setFlash('error', 'This thread is locked.');
    return res.redirect(`/forum/t/${id}`);
  }

  const verdict = limits.post.check(`post:${req.user.id}`);
  if (!verdict.ok) return tooMany(res, verdict.retryAfterSec);

  const body = String(req.body.body || '').trim();
  if (body.length < 1 || body.length > MAX_BODY) {
    res.setFlash('error', `Reply must be 1–${MAX_BODY} characters.`);
    return res.redirect(`/forum/t/${id}`);
  }

  const post = db.prepare('INSERT INTO posts (thread_id, user_id, body) VALUES (?, ?, ?)')
    .run(id, req.user.id, body);
  db.prepare("UPDATE threads SET updated_at = datetime('now') WHERE id = ?").run(id);

  // Land the author on the page their new post actually lives on.
  const total = Number(db.prepare('SELECT COUNT(*) AS n FROM posts WHERE thread_id = ?').get(id).n);
  const lastPage = Math.max(1, Math.ceil(total / POSTS_PER_PAGE));
  const pageQuery = lastPage > 1 ? `?page=${lastPage}` : '';
  res.redirect(`/forum/t/${id}${pageQuery}#post-${post.lastInsertRowid}`);
});

module.exports = router;
