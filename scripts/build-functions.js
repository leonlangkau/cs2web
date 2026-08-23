'use strict';

/**
 * Bundles src/pages-entry.js into functions/[[path]].js with EVERYTHING inlined
 * — Hono, the views, the routes, the D1 adapter.
 *
 * Why commit a bundle: the Pages Git integration only runs `npm install` when a
 * build command is configured on the project. When it is not, Pages still
 * uploads the Functions directory and tries to bundle it, and any bare import
 * like require('hono') fails with "Could not resolve". A committed
 * self-contained bundle removes that failure mode entirely — the deploy works
 * with zero build configuration.
 *
 * esbuild is pinned to an exact version in package.json so the output is
 * byte-stable, letting `npm test` verify the committed bundle is in sync.
 */
const esbuild = require('esbuild');
const fs = require('node:fs');
const path = require('node:path');

const ENTRY = path.join(__dirname, '..', 'src', 'pages-entry.js');
const OUT = path.join(__dirname, '..', 'functions', '[[path]].js');

const BANNER = `// GENERATED from src/pages-entry.js by scripts/build-functions.js — do not edit by hand.
// Self-contained on purpose: the Pages Git integration skips npm install when no
// build command is set, so this file must not contain bare imports to resolve.
`;

function bundle() {
  const result = esbuild.buildSync({
    entryPoints: [ENTRY],
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    banner: { js: BANNER },
    legalComments: 'none',
    logLevel: 'silent',
  });
  return result.outputFiles[0].text;
}

function build() {
  const code = bundle();
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, code);
  return code;
}

function isInSync() {
  if (!fs.existsSync(OUT)) return false;
  return fs.readFileSync(OUT, 'utf8') === bundle();
}

if (require.main === module) {
  const code = build();
  // esbuild with bundle:true either inlines every import or fails the build, so
  // this is a belt-and-braces check for real top-level statements only (the
  // bundled Hono source mentions imports inside JSDoc comments, which is fine).
  const bare = code.match(/^(?:import|export)[^\n]*from\s*["'](?![./])[^"']+["']/gm) || [];
  if (bare.length) {
    console.error('bundle still contains bare imports:', bare);
    process.exit(1);
  }
  console.log(`wrote functions/[[path]].js — ${(code.length / 1024).toFixed(0)} KB, fully self-contained`);
}

module.exports = { build, isInSync };
