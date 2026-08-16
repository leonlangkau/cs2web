'use strict';

const express = require('express');

const { db } = require('../db');
const { hashPassword, hashPasswordAsync, verifyPasswordAsync } = require('../security');
const { createSession, destroySession, audit, clientIp } = require('../middleware');
const { limits, tooMany } = require('../limits');

const router = express.Router();

const USERNAME_RE = /^[A-Za-z0-9_]{3,20}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const RESERVED_USERNAMES = new Set(['admin', 'administrator', 'moderator', 'system', 'goyhub', 'root', 'support', 'staff']);

// Constant-cost comparison target for unknown accounts (prevents user-enumeration timing).
const DUMMY_HASH = hashPassword('dummy-password-for-timing');

/** Only allow same-site relative redirect targets. */
function safeNext(raw) {
  if (typeof raw !== 'string') return '/';
  if (!raw.startsWith('/') || raw.startsWith('//') || raw.includes('\\')) return '/';
  return raw;
}

router.get('/signup', (req, res) => {
  if (req.user) return res.redirect('/');
  res.render('auth/signup', { title: 'Sign up', errors: [], values: {} });
});

router.post('/signup', async (req, res) => {
  if (req.user) return res.redirect('/');
  const verdict = limits.signup.check(`su:${clientIp(req)}`);
  if (!verdict.ok) return tooMany(res, verdict.retryAfterSec);

  const username = String(req.body.username || '').trim();
  const email = String(req.body.email || '').trim();
  const password = String(req.body.password || '');
  const confirm = String(req.body.confirm || '');

  const errors = [];
  if (!USERNAME_RE.test(username)) errors.push('Username must be 3–20 characters: letters, numbers and underscores only.');
  else if (RESERVED_USERNAMES.has(username.toLowerCase())) errors.push('That username is reserved.');
  if (!EMAIL_RE.test(email) || email.length > 254) errors.push('Enter a valid email address.');
  if (password.length < 8 || password.length > 128) errors.push('Password must be 8–128 characters.');
  if (password !== confirm) errors.push('Passwords do not match.');

  if (errors.length === 0) {
    const taken = db.prepare('SELECT id FROM users WHERE username = ? OR email = ?').get(username, email);
    if (taken) errors.push('That username or email is already registered.');
  }

  if (errors.length > 0) {
    return res.status(400).render('auth/signup', { title: 'Sign up', errors, values: { username, email } });
  }

  const result = db.prepare(
    'INSERT INTO users (username, email, password_hash, signup_ip) VALUES (?, ?, ?, ?)'
  ).run(username, email, await hashPasswordAsync(password), clientIp(req));
  const userId = Number(result.lastInsertRowid);

  audit(req, 'signup', { userId, username });
  db.prepare("UPDATE users SET last_login_ip = ?, last_login_at = datetime('now') WHERE id = ?")
    .run(clientIp(req), userId);
  createSession(req, res, userId);
  res.setFlash('success', `Welcome to GoyHub, ${username}! Your account is ready.`);
  res.redirect('/');
});

router.get('/login', (req, res) => {
  if (req.user) return res.redirect('/');
  res.render('auth/login', { title: 'Log in', errors: [], values: {}, next: safeNext(req.query.next) });
});

router.post('/login', async (req, res) => {
  if (req.user) return res.redirect('/');
  const verdict = limits.login.check(`li:${clientIp(req)}`);
  if (!verdict.ok) return tooMany(res, verdict.retryAfterSec);

  const identifier = String(req.body.identifier || '').trim().slice(0, 254);
  const password = String(req.body.password || '');
  const next = safeNext(req.body.next);

  const user = identifier
    ? db.prepare('SELECT * FROM users WHERE username = ? OR email = ?').get(identifier, identifier)
    : null;

  const valid = await verifyPasswordAsync(password, user ? user.password_hash : DUMMY_HASH);

  if (!user || !valid) {
    audit(req, 'login_failed', {
      userId: user ? user.id : null,
      username: identifier.slice(0, 60),
      detail: user ? 'wrong password' : 'unknown account',
    });
    return res.status(401).render('auth/login', {
      title: 'Log in',
      errors: ['Invalid username/email or password.'],
      values: { identifier },
      next,
    });
  }

  if (user.banned) {
    audit(req, 'login_blocked', { userId: user.id, username: user.username, detail: 'account banned' });
    return res.status(403).render('auth/login', {
      title: 'Log in',
      errors: ['This account has been banned. Contact support if you believe this is a mistake.'],
      values: { identifier },
      next,
    });
  }

  limits.login.forgive(`li:${clientIp(req)}`);
  db.prepare("UPDATE users SET last_login_ip = ?, last_login_at = datetime('now') WHERE id = ?")
    .run(clientIp(req), user.id);
  audit(req, 'login', { userId: user.id, username: user.username });
  createSession(req, res, user.id);
  res.setFlash('success', `Welcome back, ${user.username}!`);
  res.redirect(next);
});

router.post('/logout', (req, res) => {
  if (req.user) {
    audit(req, 'logout', { userId: req.user.id, username: req.user.username });
  }
  destroySession(req, res);
  res.setFlash('success', 'You have been signed out.');
  res.redirect('/');
});

module.exports = router;
