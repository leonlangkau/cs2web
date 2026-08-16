'use strict';

/* End-to-end smoke test: boots the real app on a throwaway DB and drives it over HTTP. */

const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'goyhub-test-'));
process.env.GOYHUB_DB = path.join(tmpDir, 'test.db');
process.env.ADMIN_USERNAME = 'admin';
process.env.ADMIN_PASSWORD = 'admin-test-password-1';

const { createApp } = require('../src/app');
const { db } = require('../src/db');

/** Minimal cookie-jar HTTP client around fetch. */
class Client {
  constructor(base) {
    this.base = base;
    this.jar = new Map();
  }

  cookieHeader() {
    return [...this.jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
  }

  storeCookies(res) {
    for (const line of res.headers.getSetCookie()) {
      const [pair] = line.split(';');
      const eq = pair.indexOf('=');
      const name = pair.slice(0, eq).trim();
      const value = pair.slice(eq + 1).trim();
      if (value === '') this.jar.delete(name);
      else this.jar.set(name, value);
    }
  }

  async request(method, url, body) {
    const headers = { cookie: this.cookieHeader() };
    let payload;
    if (body) {
      headers['content-type'] = 'application/x-www-form-urlencoded';
      payload = new URLSearchParams(body).toString();
    }
    const res = await fetch(this.base + url, { method, headers, body: payload, redirect: 'manual' });
    this.storeCookies(res);
    return res;
  }

  get(url) { return this.request('GET', url); }

  /** POST with the CSRF token from the jar automatically attached. */
  post(url, body = {}) {
    return this.request('POST', url, { _csrf: this.jar.get('ghcsrf') || '', ...body });
  }
}

let passed = 0;
function ok(name, cond) {
  if (!cond) {
    console.error(`✗ FAIL: ${name}`);
    process.exitCode = 1;
    throw new Error(`assertion failed: ${name}`);
  }
  passed += 1;
  console.log(`✓ ${name}`);
}

async function main() {
  const app = createApp();
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const base = `http://127.0.0.1:${server.address().port}`;

  const anon = new Client(base);
  const user = new Client(base);
  const admin = new Client(base);

  // --- Public pages ---
  let res = await anon.get('/');
  let html = await res.text();
  ok('landing page renders', res.status === 200 && html.includes('Download for Windows') && html.includes('hero-canvas'));
  ok('landing has security headers', String(res.headers.get('content-security-policy')).includes("default-src 'self'"));

  res = await anon.get('/forum');
  html = await res.text();
  ok('forum lists seeded categories', res.status === 200 && html.includes('Announcements') && html.includes('General Discussion'));

  res = await anon.get('/forum/t/1');
  html = await res.text();
  ok('seeded welcome thread renders', res.status === 200 && html.includes('Welcome to the GoyHub community forum!'));

  res = await anon.get('/nope/nothing');
  ok('unknown route is 404', res.status === 404);

  // --- CSRF ---
  res = await anon.request('POST', '/auth/signup', { username: 'csrfless', email: 'c@x.com', password: 'password123', confirm: 'password123' });
  ok('POST without CSRF token is rejected (403)', res.status === 403);

  // --- Signup ---
  await user.get('/auth/signup'); // pick up csrf cookie
  res = await user.post('/auth/signup', { username: 'ab', email: 'bad', password: 'short', confirm: 'nope' });
  ok('invalid signup is rejected (400)', res.status === 400);

  res = await user.post('/auth/signup', {
    username: 'player_one', email: 'player1@example.com', password: 'supersecret1', confirm: 'supersecret1',
  });
  ok('valid signup redirects and sets session', res.status === 302 && user.jar.has('ghsession'));

  const signupLog = db.prepare("SELECT * FROM ip_logs WHERE event = 'signup' AND username = 'player_one'").get();
  ok('signup IP was logged', !!signupLog && signupLog.ip.length > 0 && !!signupLog.user_agent !== null);

  const dbUser = db.prepare("SELECT * FROM users WHERE username = 'player_one'").get();
  ok('signup IP stored on user row', !!dbUser && !!dbUser.signup_ip);
  ok('password is scrypt-hashed, not plaintext', dbUser.password_hash.startsWith('scrypt$') && !dbUser.password_hash.includes('supersecret1'));

  res = await user.get('/');
  html = await res.text();
  ok('logged-in nav shows username', html.includes('player_one'));

  res = await user.post('/auth/signup', { username: 'player_two', email: 'p2@example.com', password: 'supersecret1', confirm: 'supersecret1' });
  ok('signup while logged in redirects away', res.status === 302);

  // --- Forum posting ---
  res = await user.post('/forum/new', { category: 'general', title: 'My first thread', body: 'Hello GoyHub <script>alert(1)</script>' });
  const threadLoc = res.headers.get('location');
  ok('thread created and redirected', res.status === 302 && /^\/forum\/t\/\d+$/.test(threadLoc));

  res = await user.get(threadLoc);
  html = await res.text();
  ok('thread shows post with HTML escaped', html.includes('My first thread') && html.includes('&lt;script&gt;') && !html.includes('<script>alert(1)'));

  res = await user.post(`${threadLoc}/reply`, { body: 'Replying to myself' });
  ok('reply posts and redirects to anchor', res.status === 302 && String(res.headers.get('location')).includes('#post-'));

  res = await anon.get(threadLoc);
  html = await res.text();
  ok('anon sees reply and login prompt instead of reply box', html.includes('Replying to myself') && html.includes('join the conversation'));

  // --- Auth edge cases ---
  res = await anon.get('/forum/new');
  ok('new-thread requires login (redirect)', res.status === 302 && String(res.headers.get('location')).startsWith('/auth/login'));

  await anon.get('/auth/login');
  res = await anon.post('/auth/login', { identifier: 'player_one', password: 'wrong-password', next: '/' });
  ok('wrong password rejected (401)', res.status === 401);
  ok('failed login IP was logged', !!db.prepare("SELECT id FROM ip_logs WHERE event = 'login_failed'").get());

  res = await anon.post('/auth/login', { identifier: 'player_one', password: 'supersecret1', next: '//evil.example' });
  ok('open redirect neutralized on login', res.status === 302 && res.headers.get('location') === '/');
  const loggedIn = db.prepare("SELECT last_login_ip FROM users WHERE username = 'player_one'").get();
  ok('last login IP recorded', !!loggedIn.last_login_ip);
  await anon.post('/auth/logout');
  ok('logout clears session cookie', !anon.jar.has('ghsession'));

  // --- Admin gating ---
  res = await user.get('/admin');
  ok('admin area hidden from regular users (404)', res.status === 404);

  await admin.get('/auth/login');
  res = await admin.post('/auth/login', { identifier: 'admin', password: 'admin-test-password-1', next: '/admin' });
  ok('admin login works', res.status === 302 && res.headers.get('location') === '/admin');

  res = await admin.get('/admin');
  html = await res.text();
  ok('admin dashboard renders stats', res.status === 200 && html.includes('Failed logins (24h)') && html.includes('Active sessions'));

  res = await admin.get('/admin/logs?event=signup');
  html = await res.text();
  ok('IP log viewer shows signup with IP', res.status === 200 && html.includes('player_one') && html.includes(signupLog.ip));

  res = await admin.get('/admin/users?q=player_one');
  html = await res.text();
  ok('user admin search finds user', res.status === 200 && html.includes('player1@example.com'));

  // --- Moderation: lock thread ---
  const threadId = threadLoc.split('/').pop();
  res = await admin.post(`/admin/threads/${threadId}/lock`);
  ok('admin can lock thread', res.status === 302);
  const beforePosts = db.prepare('SELECT COUNT(*) AS n FROM posts WHERE thread_id = ?').get(threadId).n;
  res = await user.post(`${threadLoc}/reply`, { body: 'should be blocked' });
  const afterPosts = db.prepare('SELECT COUNT(*) AS n FROM posts WHERE thread_id = ?').get(threadId).n;
  ok('locked thread rejects replies from users', res.status === 302 && Number(afterPosts) === Number(beforePosts));
  res = await admin.post(`/admin/threads/${threadId}/lock`); // unlock
  ok('admin can unlock thread', res.status === 302);

  // --- Moderation: ban flow ---
  const target = db.prepare("SELECT id FROM users WHERE username = 'player_one'").get();
  res = await admin.post(`/admin/users/${target.id}/ban`);
  ok('admin can ban user', res.status === 302);
  res = await user.get('/');
  html = await res.text();
  ok('banned user session is destroyed', !html.includes('nav-user') && !user.jar.has('ghsession'));
  await user.get('/auth/login');
  res = await user.post('/auth/login', { identifier: 'player_one', password: 'supersecret1', next: '/' });
  ok('banned user cannot log back in (403)', res.status === 403);
  ok('blocked login attempt logged', !!db.prepare("SELECT id FROM ip_logs WHERE event = 'login_blocked'").get());
  res = await admin.post(`/admin/users/${target.id}/unban`);
  ok('admin can unban user', res.status === 302);

  const adminRow = db.prepare("SELECT id FROM users WHERE username = 'admin'").get();
  await admin.post(`/admin/users/${adminRow.id}/ban`);
  ok('admin cannot ban themself', db.prepare('SELECT banned FROM users WHERE id = ?').get(adminRow.id).banned === 0);

  ok('admin actions were audited', Number(db.prepare("SELECT COUNT(*) AS n FROM ip_logs WHERE event = 'admin_action'").get().n) >= 4);

  // --- Category management ---
  res = await admin.post('/admin/categories', { name: 'Trade Zone', description: 'Buy and sell skins' });
  ok('admin can create category', res.status === 302 && !!db.prepare("SELECT id FROM categories WHERE slug = 'trade-zone'").get());

  // --- Download ---
  res = await anon.get('/download/file');
  ok('download serves zip', res.status === 200 && String(res.headers.get('content-disposition')).includes('GoyHub-Setup-1.0.0.zip'));
  await res.arrayBuffer();
  ok('download IP was logged', !!db.prepare("SELECT id FROM ip_logs WHERE event = 'download'").get());

  res = await anon.get('/downloads/GoyHub-Setup-1.0.0.zip');
  ok('static download bypass is closed (404)', res.status === 404);

  // --- Error handling: oversized body must give a styled 413, never a stack trace ---
  res = await anon.request('POST', '/auth/login', { identifier: 'x', password: 'y'.repeat(300 * 1024) });
  html = await res.text();
  ok('oversized body returns styled 413 without stack trace',
    res.status === 413 && html.includes('Request too large') && !html.includes('ReferenceError') && !html.includes('/home/'));

  // --- Session-bound CSRF: a planted cookie must not pass for a logged-in user ---
  await user.get('/auth/login');
  await user.post('/auth/login', { identifier: 'player_one', password: 'supersecret1', next: '/' });
  user.jar.set('ghcsrf', 'a'.repeat(32)); // attacker-planted value
  res = await user.request('POST', '/forum/new', {
    _csrf: 'a'.repeat(32), category: 'general', title: 'planted cookie', body: 'should fail',
  });
  ok('planted CSRF cookie rejected for logged-in user (403)', res.status === 403);
  await user.get('/'); // the mismatch rotated the token; pick up the fresh session-bound one
  res = await user.post('/forum/new', { category: 'general', title: 'Real token thread', body: 'works' });
  ok('rotated CSRF token accepted after planted-cookie attempt', res.status === 302);

  // --- Thread post pagination ---
  const insertPost = db.prepare('INSERT INTO posts (thread_id, user_id, body) VALUES (?, ?, ?)');
  for (let i = 0; i < 25; i++) insertPost.run(threadId, target.id, `bulk reply ${i}`);
  res = await user.get(`/forum/t/${threadId}?page=2`);
  html = await res.text();
  ok('thread paginates past 20 posts', res.status === 200 && html.includes('bulk reply') && html.includes('aria-current="page"'));
  res = await user.post(`/forum/t/${threadId}/reply`, { body: 'lands on the last page' });
  ok('reply redirects to its own page', res.status === 302 && String(res.headers.get('location')).includes('?page=2#post-'));

  // --- No-JS resilience: reveal-hiding is gated on the js class ---
  res = await anon.get('/');
  html = await res.text();
  ok('landing gates animations on JS and server-renders stats', html.includes('/js/boot.js') && !html.includes('>0</span><span class="stat-label">Registered'));

  // --- Rate limiting ---
  const hammer = new Client(base);
  await hammer.get('/auth/login');
  let got429 = false;
  for (let i = 0; i < 14 && !got429; i++) {
    const r = await hammer.post('/auth/login', { identifier: 'nobody', password: 'nope', next: '/' });
    if (r.status === 429) got429 = true;
    await r.arrayBuffer();
  }
  ok('login rate limit kicks in (429)', got429);

  server.close();
  console.log(`\nAll ${passed} checks passed.`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
  process.exit(1);
});
