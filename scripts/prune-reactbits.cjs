'use strict';

/**
 * Removes vendored React Bits components that no skin imports.
 *
 * ui/src/reactbits/ starts as the full catalogue so a design can reach for
 * anything; what ships is only what the skins use (the library's licence
 * allows use in a site, not redistributing the catalogue). Run after the
 * skins are final:  node scripts/prune-reactbits.cjs [--dry-run]
 *
 * Usage is found by following imports from ui/src/skins and ui/src/shared
 * (any '@rb/<Category>/<Name>/…' or relative path into reactbits), then
 * transitively through the kept components' own relative imports.
 */
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const RB = path.join(ROOT, 'ui', 'src', 'reactbits');
const SOURCES = [path.join(ROOT, 'ui', 'src', 'skins'), path.join(ROOT, 'ui', 'src', 'shared')];
const CATEGORIES = ['Animations', 'Backgrounds', 'Components', 'TextAnimations'];

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    if (fs.statSync(p).isDirectory()) walk(p, out);
    else if (/\.(jsx?|tsx?|mjs|css)$/.test(name)) out.push(p);
  }
  return out;
}

const IMPORT_RX = /(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g;

/** "<Category>/<Name>" for an import specifier that points into reactbits, else null. */
function componentOf(spec, fromFile) {
  let rel = null;
  if (spec.startsWith('@rb/')) rel = spec.slice(4);
  else if (spec.startsWith('.')) {
    const abs = path.resolve(path.dirname(fromFile), spec);
    if (abs.startsWith(RB + path.sep)) rel = path.relative(RB, abs);
  }
  if (!rel) return null;
  const [cat, name] = rel.split(/[\\/]/);
  return CATEGORIES.includes(cat) && name ? `${cat}/${name}` : null;
}

function usedComponents() {
  const used = new Set();
  const queue = [];
  for (const dir of SOURCES) for (const f of walk(dir)) queue.push(f);
  const seen = new Set();
  while (queue.length) {
    const file = queue.pop();
    if (seen.has(file)) continue;
    seen.add(file);
    const src = fs.readFileSync(file, 'utf8');
    for (const m of src.matchAll(IMPORT_RX)) {
      const comp = componentOf(m[1], file);
      if (comp && !used.has(comp)) {
        used.add(comp);
        for (const f of walk(path.join(RB, comp))) queue.push(f);
      }
    }
  }
  return used;
}

function prune(dryRun) {
  const used = usedComponents();
  const removed = [];
  for (const cat of CATEGORIES) {
    const dir = path.join(RB, cat);
    if (!fs.existsSync(dir)) continue;
    for (const name of fs.readdirSync(dir)) {
      const comp = `${cat}/${name}`;
      if (used.has(comp)) continue;
      removed.push(comp);
      if (!dryRun) fs.rmSync(path.join(dir, name), { recursive: true, force: true });
    }
  }
  return { used: [...used].sort(), removed: removed.sort() };
}

if (require.main === module) {
  const dryRun = process.argv.includes('--dry-run');
  const { used, removed } = prune(dryRun);
  console.log(`${used.length} components in use:\n  ${used.join('\n  ')}`);
  console.log(`${dryRun ? 'would remove' : 'removed'} ${removed.length} unused components`);
}

module.exports = { prune, usedComponents };
