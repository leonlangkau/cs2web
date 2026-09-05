#!/usr/bin/env node
/**
 * Prints the class names a skin's stylesheets must cover, and which are still
 * missing. Usage: node tests/skin-inventory.mjs <neon|prism> [--all]
 */
import { buildScenario, renderPages, coverage } from "./skin-scenario.mjs";

const skin = process.argv[2];
if (!skin) {
  console.error("usage: node tests/skin-inventory.mjs <skin> [--all]");
  process.exit(2);
}
const scenario = await buildScenario();
const rendered = await renderPages(scenario, skin);
const { required, missing } = coverage(rendered, skin);
if (process.argv.includes("--all")) {
  console.log(`# ${required.length} classes used across ${rendered.length} rendered pages + behaviour scripts`);
  for (const cls of required) console.log(cls);
} else {
  console.log(`# ${required.length} required, ${missing.length} missing from public/css/skin-${skin}.css + ui-${skin}.css`);
  for (const cls of missing) console.log(cls);
}
const broken = rendered.filter((p) => p.status >= 500);
if (broken.length) {
  console.log(`# ${broken.length} page(s) returned 5xx under ${skin}:`);
  for (const p of broken) console.log(`  ${p.as} ${p.path} -> ${p.status}`);
}
