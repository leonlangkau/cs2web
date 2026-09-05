'use strict';

/**
 * Builds the React Bits skins (ui/) into public/js + public/css with Vite.
 *
 * Output is committed (the Cloudflare Pages project deploys public/ with no
 * build command), so this also removes the previous build's chunk files:
 * chunk names carry a content hash and would otherwise pile up in git.
 *
 * Run through `npm run build`, which regenerates the asset manifest afterwards
 * — the manifest test in tests/smoke.test.mjs fails if either is stale.
 */
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const PUBLIC = path.join(ROOT, 'public');

/** Files this build owns. Everything else under public/ is hand-written. */
const OWNED = [
  [path.join(PUBLIC, 'js'), /^(ui-[a-z0-9]+\.js|rb-.+\.js)$/],
  [path.join(PUBLIC, 'css'), /^ui-[a-z0-9]+\.css$/],
  [path.join(PUBLIC, 'fonts'), /^rb-.+-[A-Za-z0-9_-]{8}\.[a-z0-9]+$/],
];

function clean() {
  let removed = 0;
  for (const [dir, rx] of OWNED) {
    if (!fs.existsSync(dir)) continue;
    for (const name of fs.readdirSync(dir)) {
      if (rx.test(name)) {
        fs.unlinkSync(path.join(dir, name));
        removed += 1;
      }
    }
  }
  return removed;
}

/**
 * `only` builds a single skin without cleaning (chunks are content-hashed, so
 * a partial rebuild never breaks the other skin) — for iterating on one
 * design while the other is being worked on in parallel.
 */
function build(only = null) {
  if (!only) clean();
  const vite = path.join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js');
  const r = spawnSync(process.execPath, [vite, 'build', '--config', path.join(ROOT, 'ui', 'vite.config.js')], {
    stdio: 'inherit',
    cwd: ROOT,
    env: { ...process.env, UI_SKIN: only || '' },
  });
  if (r.status !== 0) {
    throw new Error(`vite build failed with status ${r.status}`);
  }
}

if (require.main === module) {
  const i = process.argv.indexOf('--only');
  build(i > -1 ? process.argv[i + 1] : null);
  const js = fs.readdirSync(path.join(PUBLIC, 'js')).filter((n) => /^(ui-|rb-)/.test(n));
  const css = fs.readdirSync(path.join(PUBLIC, 'css')).filter((n) => /^ui-/.test(n));
  console.log(`built ${js.length} js + ${css.length} css skin assets into public/`);
}

module.exports = { build, clean };
