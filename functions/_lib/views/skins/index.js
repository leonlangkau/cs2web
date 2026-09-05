/**
 * Registry of the redesign skins' server-rendered chrome.
 *
 * A skin module exports one object:
 *   id            'neon' | 'prism'            (must match ui-skins.js)
 *   stylesheets   ['/css/skin-<id>.css', '/css/ui-<id>.css']  site-wide sheet first, then the bundle's
 *   modules       ['/js/ui-<id>.js']          the React Bits bundle (ES module)
 *   bodyClass     extra class(es) on <body>   (optional)
 *   head(ctx)     extra <head> markup: theme-color, font preloads (optional)
 *   chrome(ctx)   markup right after <body>: background/cursor hosts (optional)
 *   nav(ctx)      the site header — complete, keyboard-usable SSR markup
 *   footer(ctx)   the site footer
 *   home(ctx, data)  { body, bodyClass } for the landing page (see views/site.js for `data`);
 *                    site.js wraps it in page() so skin modules never import layout.js back
 *
 * Everything a skin renders must obey the site CSP: no inline style attributes,
 * no inline scripts. Data for the bundle goes in <script type="application/json">.
 */
import neon from "./neon.js";
import prism from "./prism.js";

const REGISTRY = { neon, prism };

/** The skin module for an id, or null for "classic" / unknown ids. */
function getSkin(id) {
  return Object.prototype.hasOwnProperty.call(REGISTRY, id) ? REGISTRY[id] : null;
}

export { getSkin, REGISTRY };
