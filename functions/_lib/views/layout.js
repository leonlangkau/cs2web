import { esc } from "./util.js";
import { isStaff, meetsTier } from "../tiers.js";

// Two stacked triangles: an outlined peak with a solid core, the "rank up" mark.
const BRAND_MARK = `<svg class="brand-mark" viewBox="0 0 32 32" aria-hidden="true">
  <path d="M16 4L28 26H4z" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/>
  <path d="M16 14.2l5.1 8.8H10.9z" fill="currentColor"/>
</svg>`;

// White backing plate so the blue mark stays visible in dark browser tab strips.
const FAVICON = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='7' fill='%23ffffff'/%3E%3Cpath d='M16 5L27 25H5z' fill='none' stroke='%230137B7' stroke-width='2.6' stroke-linejoin='round'/%3E%3Cpath d='M16 14.5l4.7 8H11.3z' fill='%230137B7'/%3E%3C/svg%3E";

function termsGate(ctx) {
  return `<div class="terms-gate" role="dialog" aria-modal="true" aria-labelledby="terms-gate-title">
  <div class="terms-gate-card">
    <h2 id="terms-gate-title">Before you continue</h2>
    <p>To use ${esc(ctx.appName)} you need to accept our
      <a href="/terms">Terms &amp; Conditions</a> and <a href="/privacy">Privacy Policy</a>.</p>
    <ul class="terms-gate-points">
      <li>You may not tamper with, clone, copy, decompile or redistribute our software.</li>
      <li>Disputes are resolved by <strong>binding private arbitration</strong>, individually, not in court and not as a class action.</li>
      <li>We log the IP address, browser and device fingerprint of sign-ups, logins and downloads for security.</li>
    </ul>
    <form method="post" action="/legal/accept" class="terms-gate-actions">
      <input type="hidden" name="_csrf" value="${esc(ctx.csrfToken)}">
      <input type="hidden" name="next" value="${esc(ctx.path)}">
      <button type="submit" class="btn btn-primary" autofocus>I accept</button>
      <a class="btn btn-outline" href="/terms">Read the Terms</a>
    </form>
    <p class="terms-gate-note">Accepting records the date, your IP address and the version you agreed to
      (<span class="mono">${esc(ctx.termsVersion)}</span>). If you do not accept, please close this page.</p>
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
    <a class="brand" href="/" aria-label="${esc(ctx.appName)} home">${BRAND_MARK}<span>Aim<em>Hub</em></span></a>
    <nav class="nav-links" aria-label="Main">
      ${link('/', 'Home', ctx.path === '/')}
      ${link('/forum', 'Forum', ctx.path.startsWith('/forum'))}
      ${link('/download', 'Download', ctx.path.startsWith('/download'))}
      ${meetsTier(ctx.user, 'paid') ? '' : link('/buy', 'Buy', ctx.path === '/buy' || ctx.path === '/upgrade')}
      ${isStaff(ctx.user) ? link('/admin', 'Admin', ctx.path.startsWith('/admin')) : ''}
    </nav>
    <div class="nav-auth">${THEME_TOGGLE}${authArea}</div>
  </div>
</header>`;
}

function footer(ctx) {
  const c = ctx.company;
  const accountLinks = ctx.user
    ? '<a href="/profile">Profile</a><a href="/upgrade">Upgrade</a><a href="/forum/new">New thread</a>'
    : '<a href="/auth/signup">Sign up</a><a href="/auth/login">Log in</a><a href="/upgrade">Upgrade</a>';
  // Fall back to the trading name so an unfilled placeholder never ships site-wide.
  const operator = c.isPlaceholder ? c.tradingName : c.legalName;

  return `<footer class="site-footer">
  <div class="container footer-grid">
    <div>
      <a class="brand brand-footer" href="/">${BRAND_MARK}<span>Aim<em>Hub</em></span></a>
      <p class="footer-blurb">The all-in-one CS2 companion. Track your stats, manage your configs, and play at your peak.</p>
    </div>
    <nav aria-label="Product"><h3>Product</h3>
      <a href="/download">Download</a><a href="/#features">Features</a><a href="/changelog">Changelog</a><a href="/faq">FAQ</a></nav>
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
 * Wraps page body HTML in the full document.
 * `body` is trusted markup produced by a view; data inside it must already be escaped.
 */
function page(ctx, { title, body, bodyClass = '', scripts = [] } = {}) {
  const fullTitle = title ? `${title} · ${ctx.appName}` : `${ctx.appName} · The CS2 Companion`;
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
  const extraScripts = scripts.map((src) => `<script src="${esc(src)}" defer></script>`).join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(fullTitle)}</title>
<meta name="description" content="AimHub is the all-in-one CS2 companion app: match stats, crosshair &amp; config manager, skin tracker and performance presets for Counter-Strike 2.">
<link rel="icon" href="${FAVICON}">
<meta name="theme-color" content="#0137B7">
<link rel="stylesheet" href="/css/style.css">
<script src="/js/boot.js"></script>
</head>
<body class="${esc(bodyClass)}">
<a class="skip-link" href="#main">Skip to content</a>
${nav(ctx)}
${announcement}
${flash}
${ctx.needsTermsGate ? termsGate(ctx) : ''}
<main id="main">
${body}
</main>
${footer(ctx)}
<script src="/js/main.js" defer></script>
<script src="/js/fingerprint.js" defer></script>
${extraScripts}
</body>
</html>`;
}

export { page, BRAND_MARK };
