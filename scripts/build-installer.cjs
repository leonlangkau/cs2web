'use strict';

/**
 * Generates src/installer-data.js from artifacts/GoyHub-Setup-1.0.0.zip.
 *
 * Workers has no filesystem, so the download route needs the artifact from
 * somewhere else. Small builds are embedded directly in the bundle; anything
 * larger must live in R2 (bind it as INSTALLER) because Workers caps the
 * script bundle at 1 MB on the free plan / 10 MB on paid.
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const NAME = 'GoyHub-Setup-1.0.0.zip';
const SRC = path.join(__dirname, '..', 'artifacts', NAME);
const OUT = path.join(__dirname, '..', 'functions', '_lib', 'installer-data.js');

/** Above this, embedding would bloat the Worker bundle — use R2 instead. */
const EMBED_LIMIT = 256 * 1024;

/** Renders the module without writing, so build() and isInSync() never diverge. */
function render() {
  if (!fs.existsSync(SRC)) throw new Error(`missing installer at ${SRC}`);
  const buf = fs.readFileSync(SRC);
  const sha256 = crypto.createHash('sha256').update(buf).digest('hex');
  const sizeKb = Math.max(1, Math.round(buf.length / 1024));
  const embed = buf.length <= EMBED_LIMIT;
  const text = `// GENERATED FROM artifacts/${NAME} by scripts/build-installer.js — do not edit by hand.

export default {
  name: ${JSON.stringify(NAME)},
  sha256: ${JSON.stringify(sha256)},
  sizeKb: ${sizeKb},
  bytes: ${buf.length},
  // ${embed ? 'Embedded because the artifact is small.' : 'Too large to embed — bind an R2 bucket as INSTALLER.'}
  base64: ${embed ? JSON.stringify(buf.toString('base64')) : 'null'},
};
`;
  return { text, sha256, sizeKb, embed, bytes: buf.length };
}

function build() {
  const { text, sha256, sizeKb, embed, bytes } = render();
  fs.writeFileSync(OUT, text);
  return { sha256, sizeKb, embed, bytes };
}

function isInSync() {
  if (!fs.existsSync(OUT) || !fs.existsSync(SRC)) return false;
  return fs.readFileSync(OUT, "utf8") === render().text;
}

if (require.main === module) {
  const info = build();
  console.log(`installer: ${info.bytes} bytes, sha256 ${info.sha256.slice(0, 16)}…, embedded: ${info.embed}`);
}

module.exports = { build, isInSync, NAME };
