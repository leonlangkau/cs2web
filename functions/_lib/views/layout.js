import { esc } from "./util.js";
import { asset } from "../asset-manifest.js";
import { isStaff, meetsTier } from "../tiers.js";
import { SKINS, skinIds } from "../ui-skins.js";
import { getSkin } from "./skins/index.js";
import { BRAND_MARK, FAVICON } from "./brand.js";

function termsGate(ctx) {
  return `<div class="terms-gate" role="dialog" aria-modal="true" aria-labelledby="terms-gate-title">
  <div class="terms-gate-card">
    <h2 id="terms-gate-title">Before you continue</h2>
    <p>To use ${esc(ctx.appName)} you need to accept our
      <a href="/terms">Terms &amp; Conditions</a> and <a href="/privacy">Privacy Policy</a>.</p>
    <form method="post" action="/legal/accept" class="terms-gate-actions">
      <input type="hidden" name="_csrf" value="${esc(ctx.csrfToken)}">
      <input type="hidden" name="next" value="${esc(ctx.path)}">
      <button type="submit" class="btn btn-primary" autofocus>I accept</button>
    </form>
  </div>
</div>`;
}

const THEME_TOGGLE = `<button type="button" class="theme-toggle" id="theme-toggle" aria-label="Toggle dark mode" title="Toggle dark mode">
  <svg class="icon-sun" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 2v2.5M12 19.5V22M4.2 4.2l1.8 1.8M18 18l1.8 1.8M2 12h2.5M19.5 12H22M4.2 19.8L6 18M18 6l1.8-1.8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
  <svg class="icon-moon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 14.5A8.5 8.5 0 119.5 4a7 7 0 0010.5 10.5z" fill="currentColor"/></svg>
</button>`;

function nav(ctx) {
  const link = (href, label, active) =>
    `<a href="${href}" class="${active ? 'active' : ''}">${label}</a>`;
  const authArea = ctx.user
    ? `<a class="nav-user" href="/profile" title="Your profile"><span class="avatar" aria-hidden="true">${esc(ctx.user.username[0].toUpperCase())}</span>${esc(ctx.user.username)}</a>
       <form method="post" action="/auth/logout" class="inline-form">
         <input type="hidden" name="_csrf" value="${esc(ctx.csrfToken)}">
         <button type="submit" class="btn btn-ghost btn-sm">Log out</button>
       </form>`
    : `<a href="/auth/login" class="btn btn-ghost btn-sm">Log in</a>
       <a href="/auth/signup" class="btn btn-primary btn-sm">Sign up</a>`;

  return `<header class="site-nav" id="site-nav">
  <div class="container nav-inner">
    <a class="brand" href="/" aria-label="${esc(ctx.appName)} home">${BRAND_MARK}<span>Goy<em>Hub</em></span></a>
    <nav class="nav-links" aria-label="Main">
      ${link('/', 'Home', ctx.path === '/')}
      ${link('/forum', 'Forum', ctx.path.startsWith('/forum'))}
      ${link('/download', 'Download', ctx.path.startsWith('/download'))}
      ${link('/help', 'Support', ctx.path.startsWith('/help') || ctx.path.startsWith('/support'))}
      ${meetsTier(ctx.user, 'paid') ? '' : link('/buy', 'Upgrade', ctx.path === '/buy' || ctx.path === '/upgrade')}
      ${isStaff(ctx.user) ? link('/admin', 'Admin', ctx.path.startsWith('/admin')) : ''}
    </nav>
    <div class="nav-auth">${THEME_TOGGLE}${authArea}</div>
  </div>
</header>`;
}

function footer(ctx) {
  const c = ctx.company;
  const accountLinks = ctx.user
    ? '<a href="/profile">Profile</a><a href="/upgrade">Upgrade</a><a href="/support">Support tickets</a>'
    : '<a href="/auth/signup">Sign up</a><a href="/auth/login">Log in</a><a href="/upgrade">Upgrade</a>';
  // Fall back to the trading name so an unfilled placeholder never ships site-wide.
  const operator = c.isPlaceholder ? c.tradingName : c.legalName;

  return `<footer class="site-footer">
  <div class="container footer-grid">
    <div>
      <a class="brand brand-footer" href="/">${BRAND_MARK}<span>Goy<em>Hub</em></span></a>
      <p class="footer-blurb">The all-in-one CS2 companion. Track your stats, manage your configs, and play at your peak.</p>
    </div>
    <nav aria-label="Product"><h3>Product</h3>
      <a href="/download">Download</a><a href="/#features">Features</a><a href="/changelog">Changelog</a><a href="/faq">FAQ</a></nav>
    <nav aria-label="Support"><h3>Support</h3>
      <a href="/help">Help centre</a><a href="/support/new">Contact support</a>
      <a href="/support">My tickets</a><a href="/status">Service status</a></nav>
    <nav aria-label="Community"><h3>Community</h3>
      <a href="/forum">Forum</a><a href="/forum/c/support">Support</a><a href="/forum/c/configs">Configs &amp; Setups</a></nav>
    <nav aria-label="Account"><h3>Account</h3>${accountLinks}</nav>
    <nav aria-label="Legal"><h3>Legal</h3>
      <a href="/terms">Terms &amp; Conditions</a><a href="/privacy">Privacy Policy</a></nav>
  </div>
  <div class="container footer-bottom">
    <span>© 2026 ${esc(c.tradingName)} · v${esc(ctx.appVersion)}</span>
    <span class="footer-legal-line">
      Operated by ${esc(operator)}, registered in the ${esc(c.jurisdiction)}.
      Fan-made companion app. Not affiliated with Valve Corporation. Counter-Strike and CS2 are trademarks of Valve.
    </span>
  </div>
</footer>`;
}

/**
 * The floating "which design?" pill. Rendered under every skin (its stylesheet
 * is skin-neutral) so the redesigns can be compared on any page; UI_SWITCHER=0
 * removes it. Links re-request the current path with ?ui=<id>, which also
 * remembers the choice in a cookie (see middleware.js).
 */
function uiSwitcher(ctx) {
  if (!ctx.uiSwitcher) return '';
  const items = skinIds().map((id) => {
    const skin = SKINS[id];
    const active = ctx.ui === id;
    return `<a href="${esc(ctx.path)}?ui=${id}" class="ui-switch-item${active ? ' is-active' : ''}"${active ? ' aria-current="true"' : ''}>`
      + `<span class="ui-switch-dot" aria-hidden="true"></span>`
      + `<span class="ui-switch-label">${esc(skin.label)}</span>`
      + `<span class="ui-switch-tag">${esc(skin.tagline)}</span></a>`;
  }).join('');
  return `<nav class="ui-switch" id="ui-switch" aria-label="Choose a site design" data-ui="${esc(ctx.ui)}">
  <span class="ui-switch-title">UI</span>${items}
</nav>`;
}

/** Shared status strips: announcement banner, flash message, terms gate. */
function notices(ctx) {
  const announcement = ctx.announcement
    ? `<div class="announcement" id="announcement" role="status">
        <div class="container announcement-inner">
          <span>${esc(ctx.announcement)}</span>
          <button type="button" class="announcement-dismiss" id="announcement-dismiss" aria-label="Dismiss announcement">✕</button>
        </div>
      </div>`
    : '';
  const flash = ctx.flash
    ? `<div class="flash flash-${ctx.flash.type === 'error' ? 'error' : 'success'}" role="status"><div class="container">${esc(ctx.flash.message)}</div></div>`
    : '';
  return `${announcement}\n${flash}\n${ctx.needsTermsGate ? termsGate(ctx) : ''}`;
}

/**
 * Wraps page body HTML in the full document.
 * `body` is trusted markup produced by a view; data inside it must already be escaped.
 *
 * With a redesign skin active (ctx.ui !== 'classic') the document is built from
 * that skin's chrome instead: its stylesheets, its nav and footer, and its
 * React Bits module. The classic effects script (fx.js) is not loaded there —
 * the skin bundle owns every animation — while boot.js, main.js and the
 * page-specific scripts (forms, captcha, live chat, status) stay, since they
 * carry behaviour rather than decoration.
 */
function page(ctx, { title, body, bodyClass = '', scripts = [] } = {}) {
  const fullTitle = title ? `${title} · ${ctx.appName}` : `${ctx.appName} · The Ultimate CS2 Companion`;
  const extraScripts = scripts.map((src) => `<script src="${esc(asset(src))}" defer></script>`).join('\n');
  const skin = getSkin(ctx.ui);

  if (skin) {
    const styles = [...skin.stylesheets, '/css/ui-switch.css']
      .map((href) => `<link rel="stylesheet" href="${esc(asset(href))}">`).join('\n');
    const modules = (skin.modules || [])
      .map((src) => `<script type="module" src="${esc(asset(src))}"></script>`).join('\n');
    const classes = [`skin-${skin.id}`, skin.bodyClass || '', bodyClass].filter(Boolean).join(' ');
    return `<!DOCTYPE html>
<html lang="en" data-skin="${esc(skin.id)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(fullTitle)}</title>
<meta name="description" content="GoyHub is the all-in-one CS2 companion app: match stats, crosshair &amp; config manager, skin tracker and performance presets for Counter-Strike 2.">
<link rel="icon" href="${FAVICON}">
${skin.head ? skin.head(ctx) : ''}
${styles}
<script src="${asset('/js/boot.js')}"></script>
</head>
<body class="${esc(classes)}">
<a class="skip-link" href="#main">Skip to content</a>
${skin.chrome ? skin.chrome(ctx) : ''}
${skin.nav(ctx)}
${notices(ctx)}
<main id="main">
${body}
</main>
${skin.footer(ctx)}
${uiSwitcher(ctx)}
<script src="${asset('/js/main.js')}" defer></script>
<script src="${asset('/js/fingerprint.js')}" defer></script>
${extraScripts}
${modules}
</body>
</html>`;
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(fullTitle)}</title>
<meta name="description" content="GoyHub is the all-in-one CS2 companion app: match stats, crosshair &amp; config manager, skin tracker and performance presets for Counter-Strike 2.">
<link rel="icon" href="${FAVICON}">
<meta name="theme-color" content="#0137B7">
<link rel="preload" href="${asset('/fonts/space-grotesk-var.woff2')}" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="${asset('/css/style.css')}">
${ctx.uiSwitcher ? `<link rel="stylesheet" href="${esc(asset('/css/ui-switch.css'))}">` : ''}
<script src="${asset('/js/boot.js')}"></script>
</head>
<body class="${esc(bodyClass)}">
<a class="skip-link" href="#main">Skip to content</a>
${nav(ctx)}
${notices(ctx)}
<main id="main">
${body}
</main>
${footer(ctx)}
${uiSwitcher(ctx)}
<script src="${asset('/js/main.js')}" defer></script>
<script src="${asset('/js/fx.js')}" defer></script>
<script src="${asset('/js/fingerprint.js')}" defer></script>
${extraScripts}
</body>
</html>`;
}

export { page, BRAND_MARK, FAVICON, termsGate, notices };
