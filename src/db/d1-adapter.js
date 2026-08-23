'use strict';

/**
 * Cloudflare D1 adapter.
 *
 * Exposes the same async surface as the node:sqlite adapter so routes and
 * queries are written once and run on either backend.
 */
function createD1Adapter(d1) {
  const bind = (sql, params) => (params.length ? d1.prepare(sql).bind(...params) : d1.prepare(sql));

  return {
    kind: 'd1',

    async all(sql, ...params) {
      const { results } = await bind(sql, params).all();
      return results || [];
    },

    async get(sql, ...params) {
      const row = await bind(sql, params).first();
      return row === null ? undefined : row;
    },

    async run(sql, ...params) {
      const { meta } = await bind(sql, params).run();
      return {
        lastInsertRowid: Number(meta?.last_row_id ?? 0),
        changes: Number(meta?.changes ?? 0),
      };
    },

    /**
     * D1 rejects multi-statement exec, so strip full-line comments and split on
     * semicolons. Safe only because the DDL contains no semicolons inside string
     * literals — keep it that way if you extend schema.sql.
     */
    async exec(sql) {
      const statements = sql
        .split('\n')
        .filter((line) => !line.trim().startsWith('--'))
        .join('\n')
        .split(';')
        .map((s) => s.trim())
        .filter(Boolean);
      for (const statement of statements) {
        await d1.prepare(statement).run();
      }
    },
  };
}

module.exports = { createD1Adapter };
