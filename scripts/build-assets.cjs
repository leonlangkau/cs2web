'use strict';

/**
 * Generates functions/_lib/asset-manifest.js — a content hash per static asset
 * under public/css, public/js and public/fonts.
 *
 * Why this exists: the asset filenames are not fingerprinted, so a returning
 * visitor's browser can keep serving an old style.css after a deploy. The
 * `_headers` rule asks for revalidation, but Cloudflare *overrides* a
 * Cache-Control weaker than the zone's Browser Cache TTL (4 hours by default),
 * so `max-age=0` does not actually protect us on a proxied custom domain — and
 * purging Cloudflare's cache never clears a browser's. Stamping the URL with a
 * content hash sidesteps every cache: when the bytes change, the URL changes.
 *
 * The Pages runtime has no filesystem, so the map ships as a JS module.
 * tests/smoke.test.mjs asserts it is in sync with the files on disk.
 */
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const PUBLIC = path.join(ROOT, 'public');
const DIRS = ['css', 'js', 'fonts'];
const JS_PATH = path.join(ROOT, 'functions', '_lib', 'asset-manifest.js');

/** Short content hash — 8 hex chars is ample for cache busting. */
const hash = (buf) => crypto.createHash('sha256').update(buf).digest('hex').slice(0, 8);

function collect() {
  const out = {};
  for (const dir of DIRS) {
    const abs = path.join(PUBLIC, dir);
    if (!fs.existsSync(abs)) continue;
    for (const name of fs.readdirSync(abs).sort()) {
      const file = path.join(abs, name);
      if (!fs.statSync(file).isFile()) continue;
      // LICENSE.txt and friends are never referenced from markup.
      if (!/\.(css|js|woff2?)$/.test(name)) continue;
      out[`/${dir}/${name}`] = hash(fs.readFileSync(file));
    }
  }
  return out;
}

function render(manifest) {
  const entries = Object.entries(manifest)
    .map(([p, h]) => `  ${JSON.stringify(p)}: ${JSON.stringify(h)},`)
    .join('\n');
  return `// GENERATED FROM public/{css,js,fonts} by scripts/build-assets.cjs — do not edit by hand.

const MANIFEST = {
${entries}
};

/**
 * Cache-busting URL for a static asset. Unknown paths (external scripts, or
 * anything not under the hashed directories) are returned untouched.
 */
function asset(urlPath) {
  const version = MANIFEST[urlPath];
  return version ? \`\${urlPath}?v=\${version}\` : urlPath;
}

export { asset, MANIFEST };
`;
}

function build() {
  fs.writeFileSync(JS_PATH, render(collect()));
}

function isInSync() {
  if (!fs.existsSync(JS_PATH)) return false;
  return fs.readFileSync(JS_PATH, 'utf8') === render(collect());
}

if (require.main === module) {
  build();
  const n = Object.keys(collect()).length;
  console.log(`wrote functions/_lib/asset-manifest.js (${n} assets)`);
}

module.exports = { build, isInSync };
