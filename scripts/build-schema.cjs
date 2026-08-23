'use strict';

/**
 * Generates functions/_lib/schema-sql.js from schema.sql (repo root).
 *
 * schema.sql stays the source of truth (`wrangler d1 execute --file=schema.sql`
 * wants a real file), but the Pages runtime has no filesystem, so the DDL also
 * has to exist as a JS module. tests/smoke.test.mjs asserts the two are in sync.
 */
const fs = require('node:fs');
const path = require('node:path');

const SQL_PATH = path.join(__dirname, '..', 'schema.sql');
const JS_PATH = path.join(__dirname, '..', 'functions', '_lib', 'schema-sql.js');

function render(sql) {
  const escaped = sql.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${');
  return `// GENERATED FROM schema.sql by scripts/build-schema.js — do not edit by hand.\n\nexport default \`${escaped}\`;\n`;
}

function build() {
  fs.writeFileSync(JS_PATH, render(fs.readFileSync(SQL_PATH, 'utf8')));
}

function isInSync() {
  if (!fs.existsSync(JS_PATH)) return false;
  return fs.readFileSync(JS_PATH, 'utf8') === render(fs.readFileSync(SQL_PATH, 'utf8'));
}

if (require.main === module) {
  build();
  console.log('wrote functions/_lib/schema-sql.js from schema.sql');
}

module.exports = { build, isInSync };
