'use strict';

/**
 * Generates functions/_lib/installer-data.js from
 * artifacts/GoyHub-Setup-1.0.0.zip — published metadata only (name, sha256,
 * size), the numbers /download and the homepage show for the current build.
 *
 * The download route never serves this artifact's bytes: DOWNLOAD_URL is the
 * only source /download/file fetches from (see functions/_lib/routes-main.js),
 * with no fallback. When DOWNLOAD_URL points at a new build, replace this zip
 * and rerun `npm run build` too, so the published checksum stays honest.
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const NAME = 'GoyHub-Setup-1.0.0.zip';
const SRC = path.join(__dirname, '..', 'artifacts', NAME);
const OUT = path.join(__dirname, '..', 'functions', '_lib', 'installer-data.js');

/** Renders the module without writing, so build() and isInSync() never diverge. */
function render() {
  if (!fs.existsSync(SRC)) throw new Error(`missing installer at ${SRC}`);
  const buf = fs.readFileSync(SRC);
  const sha256 = crypto.createHash('sha256').update(buf).digest('hex');
  const sizeKb = Math.max(1, Math.round(buf.length / 1024));
  const text = `// GENERATED FROM artifacts/${NAME} by scripts/build-installer.js — do not edit by hand.
// Published metadata only — the download route serves DOWNLOAD_URL, not this file.

export default {
  name: ${JSON.stringify(NAME)},
  sha256: ${JSON.stringify(sha256)},
  sizeKb: ${sizeKb},
  bytes: ${buf.length},
};
`;
  return { text, sha256, sizeKb, bytes: buf.length };
}

function build() {
  const { text, sha256, sizeKb, bytes } = render();
  fs.writeFileSync(OUT, text);
  return { sha256, sizeKb, bytes };
}

function isInSync() {
  if (!fs.existsSync(OUT) || !fs.existsSync(SRC)) return false;
  return fs.readFileSync(OUT, "utf8") === render().text;
}

if (require.main === module) {
  const info = build();
  console.log(`installer metadata: ${info.bytes} bytes, sha256 ${info.sha256.slice(0, 16)}…`);
}

module.exports = { build, isInSync, NAME };
