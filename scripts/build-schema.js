'use strict';

/**
 * Generates src/db/schema-sql.js from src/db/schema.sql.
 *
 * schema.sql stays the source of truth (wrangler d1 execute --file wants a real
 * file), but the Workers runtime has no filesystem, so the DDL also has to exist
 * as a JS string. `npm test` asserts the two are in sync.
 */
const fs = require('node:fs');
const path = require('node:path');

const SQL_PATH = path.join(__dirname, '..', 'src', 'db', 'schema.sql');
const JS_PATH = path.join(__dirname, '..', 'src', 'db', 'schema-sql.js');

function render(sql) {
  const escaped = sql.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${');
  return `'use strict';\n\n// GENERATED FROM schema.sql by scripts/build-schema.js — do not edit by hand.\n\nmodule.exports = \`${escaped}\`;\n`;
}

function build() {
  const sql = fs.readFileSync(SQL_PATH, 'utf8');
  fs.writeFileSync(JS_PATH, render(sql));
  return sql;
}

function isInSync() {
  const sql = fs.readFileSync(SQL_PATH, 'utf8');
  if (!fs.existsSync(JS_PATH)) return false;
  return fs.readFileSync(JS_PATH, 'utf8') === render(sql);
}

if (require.main === module) {
  build();
  console.log('wrote src/db/schema-sql.js from schema.sql');
}

module.exports = { build, isInSync };
