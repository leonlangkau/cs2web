/**
 * UI skins — the site's selectable front-end designs.
 *
 * "classic" is the original liquid-glass design (public/css/style.css +
 * public/js/fx.js). The other entries are complete redesigns: each one is a
 * server-rendered chrome (functions/_lib/views/skins/<id>.js), its own
 * site-wide stylesheet (public/css/skin-<id>.css) and a React Bits bundle
 * (ui/src/skins/<id> -> public/js/ui-<id>.js + public/css/ui-<id>.css).
 *
 * Resolution order for a request: `?ui=<id>` (also remembered in a cookie),
 * then the cookie, then the UI_THEME variable, then "classic". The switcher
 * pill in the page corner is how the designs are compared side by side; set
 * UI_SWITCHER = "0" to hide it once a design is chosen.
 */

const SKINS = {
  classic: { id: 'classic', label: 'Classic', tagline: 'Liquid glass' },
  neon: { id: 'neon', label: 'Neon', tagline: 'Cyberdeck' },
  prism: { id: 'prism', label: 'Prism', tagline: 'Holo-glass' },
};

const DEFAULT_SKIN = 'classic';
const UI_COOKIE = 'ghui';
const UI_COOKIE_DAYS = 365;

function isSkin(id) {
  return typeof id === 'string' && Object.prototype.hasOwnProperty.call(SKINS, id);
}

/** Skin ids in display order for the switcher. */
function skinIds() {
  return Object.keys(SKINS);
}

/** The deployment's default skin from env, or "classic" when unset/invalid. */
function defaultSkin(env = {}) {
  const v = String(env.UI_THEME || '').trim().toLowerCase();
  return isSkin(v) ? v : DEFAULT_SKIN;
}

function switcherEnabled(env = {}) {
  return String(env.UI_SWITCHER ?? '1').trim() !== '0';
}

export { SKINS, DEFAULT_SKIN, UI_COOKIE, UI_COOKIE_DAYS, isSkin, skinIds, defaultSkin, switcherEnabled };
