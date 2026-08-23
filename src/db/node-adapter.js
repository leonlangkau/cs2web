'use strict';

/**
 * node:sqlite adapter — used by the local Node server and the test suite.
 *
 * node:sqlite is synchronous; the methods are async only so that callers share
 * one interface with the D1 adapter.
 */
const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
const fs = require('node:fs');

function createNodeAdapter(dbPath) {
  const resolved = dbPath || path.join(__dirname, '..', '..', 'data', 'goyhub.db');
  if (resolved !== ':memory:') {
    fs.mkdirSync(path.dirname(resolved), { recursive: true });
  }

  const db = new DatabaseSync(resolved);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');

  return {
    kind: 'node',
    raw: db,

    async all(sql, ...params) {
      return db.prepare(sql).all(...params);
    },

    async get(sql, ...params) {
      return db.prepare(sql).get(...params);
    },

    async run(sql, ...params) {
      const result = db.prepare(sql).run(...params);
      return {
        lastInsertRowid: Number(result.lastInsertRowid),
        changes: Number(result.changes),
      };
    },

    async exec(sql) {
      db.exec(sql);
    },
  };
}

module.exports = { createNodeAdapter };
