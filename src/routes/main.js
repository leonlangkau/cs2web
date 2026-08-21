'use strict';

const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const express = require('express');

const { db } = require('../db');
const { audit, clientIp } = require('../middleware');
const { limits, tooMany } = require('../limits');

const router = express.Router();

// Stored OUTSIDE public/ so every download goes through this route (audit + rate limit).
const DOWNLOAD_FILE = path.join(__dirname, '..', '..', 'artifacts', 'GoyHub-Setup-1.0.0.zip');
const DOWNLOAD_NAME = 'GoyHub-Setup-1.0.0.zip';

// Computed once at boot so the landing page can show an integrity checksum.
let downloadMeta = { sha256: 'unavailable', sizeKb: 0 };
try {
  const buf = fs.readFileSync(DOWNLOAD_FILE);
  downloadMeta = {
    sha256: crypto.createHash('sha256').update(buf).digest('hex'),
    sizeKb: Math.max(1, Math.round(buf.length / 1024)),
  };
} catch {
  console.warn('Download artifact missing:', DOWNLOAD_FILE);
}

function siteStats() {
  const one = (sql) => Number(db.prepare(sql).get()?.n || 0);
  return {
    users: one('SELECT COUNT(*) AS n FROM users'),
    threads: one('SELECT COUNT(*) AS n FROM threads'),
    posts: one('SELECT COUNT(*) AS n FROM posts'),
    downloads: one("SELECT COUNT(*) AS n FROM ip_logs WHERE event = 'download'"),
  };
}

router.get('/', (req, res) => {
  const recentThreads = db.prepare(
    `SELECT t.id, t.title, t.updated_at, c.name AS category, u.username
     FROM threads t JOIN categories c ON c.id = t.category_id JOIN users u ON u.id = t.user_id
     ORDER BY t.updated_at DESC LIMIT 4`
  ).all();
  res.render('index', { title: null, stats: siteStats(), recentThreads, downloadMeta });
});

router.get('/terms', (req, res) => {
  res.render('legal/terms', { title: 'Terms & Conditions' });
});

router.get('/privacy', (req, res) => {
  res.render('legal/privacy', { title: 'Privacy Policy' });
});

router.get('/download', (req, res) => {
  res.render('download', { title: 'Download', stats: siteStats(), downloadMeta });
});

router.get('/download/file', (req, res) => {
  const verdict = limits.download.check(`dl:${clientIp(req)}`);
  if (!verdict.ok) return tooMany(res, verdict.retryAfterSec);

  if (!fs.existsSync(DOWNLOAD_FILE)) {
    return res.status(503).render('error', {
      title: 'Unavailable', code: 503, message: 'The download is being updated. Check back in a few minutes.',
    });
  }
  audit(req, 'download', {
    userId: req.user ? req.user.id : null,
    username: req.user ? req.user.username : null,
    detail: DOWNLOAD_NAME,
  });
  res.download(DOWNLOAD_FILE, DOWNLOAD_NAME);
});

module.exports = router;
