'use strict';

/* End-to-end smoke test: boots the real app on a throwaway DB and drives it over HTTP. */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { serve } = require('@hono/node-server');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'goyhub-test-'));

const ENV = {
  ADMIN_USERNAME: 'admin',
  ADMIN_PASSWORD: 'admin-test-password-1',
  CAPTCHA_DIFFICULTY: '10',        // keep the proof of work quick under test
  CAPTCHA_SECRET: 'test-captcha-secret',
  PBKDF2_ITERATIONS: '10000',      // lower cost so the suite stays fast
  RATE_LIMIT_SIGNUP: '50',         // the suite registers more accounts than a real IP would
};

const { buildServer } = require('../server');
const { leadingZeroBits } = require('../src/captcha');
const { isInSync } = require('../scripts/build-schema');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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
  const { app, db } = await buildServer({
    dbPath: path.join(tmpDir, 'test.db'),
    env: ENV,
  });

  const server = await new Promise((resolve) => {
    const s = serve({ fetch: app.fetch, port: 0, hostname: '127.0.0.1' }, () => resolve(s));
  });
  const base = `http://127.0.0.1:${server.address().port}`;

  /** Fetches a CAPTCHA challenge and mines a valid proof of work for it. */
  async function solveCaptcha(client) {
    const challenge = await (await client.get('/captcha/challenge')).json();
    let counter = 0;
    for (;;) {
      const digest = crypto.createHash('sha256').update(`${challenge.nonce}:${counter}`).digest('hex');
      if (leadingZeroBits(digest) >= challenge.difficulty) break;
      counter += 1;
    }
    await sleep(850); // server enforces a minimum elapsed time
    return { captcha_token: challenge.token, captcha_solution: String(counter) };
  }

  const anon = new Client(base);
  const user = new Client(base);
  const admin = new Client(base);

  // --- Build artefacts stay in sync with their sources ---
  ok('generated schema module matches schema.sql', isInSync());
  ok('committed Pages bundle matches src/pages-entry.js',
    require('../scripts/build-functions').isInSync());

  // --- Public pages ---
  let res = await anon.get('/');
  let html = await res.text();
  ok('landing page renders', res.status === 200 && html.includes('Play smarter.') && html.includes('hero-canvas'));
  ok('landing has security headers', String(res.headers.get('content-security-policy')).includes("default-src 'self'"));

  res = await anon.get('/css/style.css');
  ok('static assets are served', res.status === 200 && String(res.headers.get('content-type')).includes('css'));
  await res.text();

  res = await anon.get('/forum');
  html = await res.text();
  ok('forum lists seeded categories', res.status === 200 && html.includes('Announcements') && html.includes('General Discussion'));

  res = await anon.get('/forum/t/1');
  html = await res.text();
  ok('seeded welcome thread renders', res.status === 200 && html.includes('Welcome to the GoyHub community forum!'));

  res = await anon.get('/nope/nothing');
  ok('unknown route is 404', res.status === 404);

  // --- Legal pages ---
  res = await anon.get('/terms');
  html = await res.text();
  ok('terms page renders with jurisdiction and new sections',
    res.status === 200 && html.includes('Autonomous Island of Anjouan')
      && html.includes('No tampering, cloning or copying') && html.includes('Binding arbitration'));
  ok('terms table of contents matches its anchors',
    ['s1', 's6', 's17', 's20'].every((id) => html.includes(`href="#${id}"`) && html.includes(`id="${id}"`)));

  res = await anon.get('/privacy');
  html = await res.text();
  ok('privacy page documents IP logging and cookies',
    res.status === 200 && html.includes('IP address logging') && html.includes('ghsession') && html.includes('PBKDF2'));

  // --- Terms acceptance gate ---
  const visitor = new Client(base);
  res = await visitor.get('/');
  html = await res.text();
  ok('terms gate shows on first visit', html.includes('class="terms-gate"') && html.includes('I accept'));

  res = await visitor.get('/terms');
  html = await res.text();
  ok('terms page itself is readable without the gate', !html.includes('class="terms-gate"'));

  res = await visitor.post('/legal/accept', { next: '/forum' });
  ok('accepting terms redirects and sets the cookie',
    res.status === 302 && res.headers.get('location') === '/forum' && !!visitor.jar.get('ghterms'));
  ok('terms acceptance is logged with a version',
    !!(await db.get("SELECT id FROM ip_logs WHERE event = 'terms_accepted' AND detail LIKE 'version %'")));

  res = await visitor.get('/');
  html = await res.text();
  ok('terms gate is gone after accepting', !html.includes('class="terms-gate"'));

  const redirector = new Client(base);
  await redirector.get('/');
  res = await redirector.post('/legal/accept', { next: '//evil.example' });
  ok('accept redirect is same-site only', res.headers.get('location') === '/');

  // --- CSRF ---
  res = await anon.request('POST', '/auth/signup', { username: 'csrfless', email: 'c@x.com', password: 'password123', confirm: 'password123' });
  ok('POST without CSRF token is rejected (403)', res.status === 403);

  // --- Signup + CAPTCHA ---
  await user.get('/auth/signup');
  res = await user.post('/auth/signup', {
    username: 'ab', email: 'bad', password: 'short', confirm: 'nope', ...(await solveCaptcha(user)),
  });
  ok('invalid signup is rejected (400)', res.status === 400);

  const challenge = await (await user.get('/captcha/challenge')).json();
  ok('captcha challenge is issued',
    typeof challenge.token === 'string' && /^[a-f0-9]{32}$/.test(challenge.nonce) && challenge.difficulty >= 8);

  res = await user.post('/auth/signup', {
    username: 'nocaptcha', email: 'nc@example.com', password: 'supersecret1', confirm: 'supersecret1',
  });
  html = await res.text();
  ok('signup without a captcha solution is rejected',
    res.status === 400 && html.includes('Human verification failed'));
  ok('rejected captcha attempt is logged',
    !!(await db.get("SELECT id FROM ip_logs WHERE event = 'captcha_failed'")));

  const honeypotSolution = await solveCaptcha(user);
  res = await user.post('/auth/signup', {
    username: 'trapped', email: 'trap@example.com', password: 'supersecret1', confirm: 'supersecret1',
    website: 'http://spam.example', ...honeypotSolution,
  });
  ok('filled honeypot is rejected', res.status === 400);
  ok('honeypot signup created no account', !(await db.get("SELECT id FROM users WHERE username = 'trapped'")));

  const goodSolution = await solveCaptcha(user);
  res = await user.post('/auth/signup', {
    username: 'player_one', email: 'player1@example.com', password: 'supersecret1', confirm: 'supersecret1',
    ...goodSolution,
  });
  ok('valid signup redirects and sets session', res.status === 302 && user.jar.has('ghsession'));

  const replayer = new Client(base);
  await replayer.get('/auth/signup');
  res = await replayer.post('/auth/signup', {
    username: 'replay_user', email: 'replay@example.com', password: 'supersecret1', confirm: 'supersecret1',
    ...goodSolution,
  });
  ok('replayed captcha token is rejected',
    res.status === 400 && !(await db.get("SELECT id FROM users WHERE username = 'replay_user'")));

  const signupLog = await db.get("SELECT * FROM ip_logs WHERE event = 'signup' AND username = 'player_one'");
  ok('signup IP was logged', !!signupLog && signupLog.ip.length > 0);

  const dbUser = await db.get("SELECT * FROM users WHERE username = 'player_one'");
  ok('signup IP stored on user row', !!dbUser && !!dbUser.signup_ip);
  ok('password is PBKDF2-hashed, not plaintext',
    dbUser.password_hash.startsWith('pbkdf2$') && !dbUser.password_hash.includes('supersecret1'));

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
  ok('thread shows post with HTML escaped',
    html.includes('My first thread') && html.includes('&lt;script&gt;') && !html.includes('<script>alert(1)'));

  res = await user.post(`${threadLoc}/reply`, { body: 'Replying to myself' });
  ok('reply posts and redirects to anchor', res.status === 302 && String(res.headers.get('location')).includes('#post-'));

  res = await anon.get(threadLoc);
  html = await res.text();
  ok('anon sees reply and login prompt instead of reply box',
    html.includes('Replying to myself') && html.includes('join the conversation'));

  // --- Auth edge cases ---
  res = await anon.get('/forum/new');
  ok('new-thread requires login (redirect)', res.status === 302 && String(res.headers.get('location')).startsWith('/auth/login'));

  await anon.get('/auth/login');
  res = await anon.post('/auth/login', { identifier: 'player_one', password: 'wrong-password', next: '/' });
  ok('wrong password rejected (401)', res.status === 401);
  ok('failed login IP was logged', !!(await db.get("SELECT id FROM ip_logs WHERE event = 'login_failed'")));

  res = await anon.post('/auth/login', { identifier: 'player_one', password: 'supersecret1', next: '//evil.example' });
  ok('open redirect neutralized on login', res.status === 302 && res.headers.get('location') === '/');
  const loggedIn = await db.get("SELECT last_login_ip FROM users WHERE username = 'player_one'");
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
  ok('IP log viewer shows signup with IP', res.status === 200 && html.includes('player_one'));

  res = await admin.get('/admin/users?q=player_one');
  html = await res.text();
  ok('user admin search finds user', res.status === 200 && html.includes('player1@example.com'));

  // --- Moderation: lock thread ---
  const threadId = threadLoc.split('/').pop();
  res = await admin.post(`/admin/threads/${threadId}/lock`);
  ok('admin can lock thread', res.status === 302);
  const before = Number((await db.get('SELECT COUNT(*) AS n FROM posts WHERE thread_id = ?', threadId)).n);
  await user.post(`${threadLoc}/reply`, { body: 'should be blocked' });
  const after = Number((await db.get('SELECT COUNT(*) AS n FROM posts WHERE thread_id = ?', threadId)).n);
  ok('locked thread rejects replies from users', after === before);
  res = await admin.post(`/admin/threads/${threadId}/lock`);
  ok('admin can unlock thread', res.status === 302);

  // --- Moderation: ban flow ---
  const target = await db.get("SELECT id FROM users WHERE username = 'player_one'");
  res = await admin.post(`/admin/users/${target.id}/ban`);
  ok('admin can ban user', res.status === 302);
  res = await user.get('/');
  html = await res.text();
  ok('banned user session is destroyed', !html.includes('nav-user') && !user.jar.has('ghsession'));
  await user.get('/auth/login');
  res = await user.post('/auth/login', { identifier: 'player_one', password: 'supersecret1', next: '/' });
  ok('banned user cannot log back in (403)', res.status === 403);
  ok('blocked login attempt logged', !!(await db.get("SELECT id FROM ip_logs WHERE event = 'login_blocked'")));
  res = await admin.post(`/admin/users/${target.id}/unban`);
  ok('admin can unban user', res.status === 302);

  const adminRow = await db.get("SELECT id FROM users WHERE username = 'admin'");
  await admin.post(`/admin/users/${adminRow.id}/ban`);
  ok('admin cannot ban themself', Number((await db.get('SELECT banned FROM users WHERE id = ?', adminRow.id)).banned) === 0);

  ok('admin actions were audited',
    Number((await db.get("SELECT COUNT(*) AS n FROM ip_logs WHERE event = 'admin_action'")).n) >= 4);

  // --- Deleting a user preserves the conversation (Privacy Policy s9/s11) ---
  const doomed = new Client(base);
  await doomed.get('/auth/signup');
  await doomed.post('/auth/signup', {
    username: 'doomed_user', email: 'doomed@example.com', password: 'supersecret1', confirm: 'supersecret1',
    ...(await solveCaptcha(doomed)),
  });
  res = await doomed.post('/forum/new', { category: 'general', title: 'Thread by a doomed user', body: 'Please survive me.' });
  const doomedThreadId = String(res.headers.get('location')).split('/').pop();
  const doomedId = (await db.get("SELECT id FROM users WHERE username = 'doomed_user'")).id;

  res = await admin.post(`/admin/users/${doomedId}/delete`);
  ok('admin can delete a user', res.status === 302 && !(await db.get('SELECT id FROM users WHERE id = ?', doomedId)));
  ok('their thread survives the deletion', !!(await db.get('SELECT id FROM threads WHERE id = ?', doomedThreadId)));

  res = await anon.get(`/forum/t/${doomedThreadId}`);
  html = await res.text();
  ok('surviving thread is reattributed to [deleted]',
    res.status === 200 && html.includes('Please survive me.') && html.includes('[deleted]') && !html.includes('doomed_user'));

  const placeholderId = (await db.get("SELECT id FROM users WHERE username = '[deleted]'")).id;
  await admin.post(`/admin/users/${placeholderId}/delete`);
  ok('the [deleted] placeholder cannot itself be deleted',
    !!(await db.get('SELECT id FROM users WHERE id = ?', placeholderId)));

  res = await admin.get('/admin/users');
  html = await res.text();
  ok('placeholder is hidden from the admin user list', !html.includes('>[deleted]<'));

  // --- Category management ---
  res = await admin.post('/admin/categories', { name: 'Trade Zone', description: 'Buy and sell skins' });
  ok('admin can create category',
    res.status === 302 && !!(await db.get("SELECT id FROM categories WHERE slug = 'trade-zone'")));

  // --- Download (members only) ---
  res = await anon.get('/download/file');
  ok('anonymous download redirects to login',
    res.status === 302 && String(res.headers.get('location')).startsWith('/auth/login'));
  ok('anonymous download is not logged',
    Number((await db.get("SELECT COUNT(*) AS n FROM ip_logs WHERE event = 'download'")).n) === 0);

  res = await admin.get('/download/file');
  ok('logged-in download serves zip',
    res.status === 200 && String(res.headers.get('content-disposition')).includes('GoyHub-Setup-1.0.0.zip'));
  const bytes = await res.arrayBuffer();
  ok('download body is the real artifact', bytes.byteLength > 0);
  ok('download logged against the account',
    !!(await db.get("SELECT id FROM ip_logs WHERE event = 'download' AND username = 'admin'")));

  res = await anon.get('/downloads/GoyHub-Setup-1.0.0.zip');
  ok('installer is not exposed as a static asset', res.status === 404);

  res = await anon.get('/');
  html = await res.text();
  ok('landing hides the download link when logged out',
    !html.includes('/download/file') && html.includes('Create a free account'));

  res = await admin.get('/');
  html = await res.text();
  ok('landing shows the download link when logged in', html.includes('/download/file'));

  res = await anon.get('/download');
  html = await res.text();
  ok('download page gates behind sign-up when logged out',
    res.status === 200 && !html.includes('/download/file') && html.includes('Sign up to download'));

  // --- Error handling: oversized body must not leak a stack trace ---
  res = await anon.request('POST', '/auth/login', { identifier: 'x', password: 'y'.repeat(300 * 1024) });
  html = await res.text();
  ok('oversized body returns a styled error without a stack trace',
    res.status === 413 && html.includes('Request too large') && !html.includes('/home/'));

  // --- Session-bound CSRF ---
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
  for (let i = 0; i < 25; i += 1) {
    await db.run('INSERT INTO posts (thread_id, user_id, body) VALUES (?, ?, ?)', threadId, target.id, `bulk reply ${i}`);
  }
  res = await user.get(`/forum/t/${threadId}?page=2`);
  html = await res.text();
  ok('thread paginates past 20 posts', res.status === 200 && html.includes('bulk reply') && html.includes('aria-current="page"'));
  res = await user.post(`/forum/t/${threadId}/reply`, { body: 'lands on the last page' });
  ok('reply redirects to its own page', res.status === 302 && String(res.headers.get('location')).includes('?page=2#post-'));

  // --- No-JS resilience ---
  res = await anon.get('/');
  html = await res.text();
  ok('landing gates animations on JS and server-renders stats',
    html.includes('/js/boot.js') && !html.includes('>0</span><span class="stat-label">Registered'));

  // --- Rate limiting ---
  const hammer = new Client(base);
  await hammer.get('/auth/login');
  let got429 = false;
  for (let i = 0; i < 14 && !got429; i += 1) {
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
