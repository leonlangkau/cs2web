/**
 * "neon" skin — CYBERDECK. Server-rendered chrome for the operator-console
 * redesign (see ../skins/index.js for the contract and ui/SKINS.md for the
 * design brief).
 *
 * Everything here is complete, keyboard-usable HTML before any JS runs: the
 * header (with a CSS-only mobile toggle — a checkbox the label flips), the
 * footer, and a full landing page inside #rb-home that the React Bits bundle
 * replaces on mount. No inline styles, no inline scripts; every value that
 * comes from data goes through esc().
 */
import { esc, map } from "../util.js";
import { BRAND_MARK } from "../brand.js";
import { FEATURES, navLinks, footerColumns, footerLegal, homeData, homeDataScript } from "./common.js";

const pad2 = (n) => String(n).padStart(2, '0');

/** Wordmark + the console tag under it. */
const brandMark = (extra = '') => `${BRAND_MARK}<span class="brand-word">Goy<em>Hub</em></span>${extra}`;

/* ---------- Header ---------- */

function nav(ctx) {
  const links = map(navLinks(ctx), (l, i) =>
    `<a href="${l.href}"${l.active ? ' class="active" aria-current="page"' : ''}><span class="nav-idx" aria-hidden="true">${pad2(i + 1)}</span><span class="nav-txt">${esc(l.label)}</span></a>`);
  const auth = ctx.user
    ? `<a class="nav-user" href="/profile" title="Your profile"><span class="avatar" aria-hidden="true">${esc(ctx.user.username[0].toUpperCase())}</span><span class="nav-user-name">${esc(ctx.user.username)}</span></a>
       <form method="post" action="/auth/logout" class="inline-form">
         <input type="hidden" name="_csrf" value="${esc(ctx.csrfToken)}">
         <button type="submit" class="btn btn-ghost btn-sm">Log out</button>
       </form>`
    : `<a href="/auth/login" class="btn btn-ghost btn-sm">Log in</a>
       <a href="/auth/signup" class="btn btn-primary btn-sm">Sign up</a>`;
  return `<header class="site-nav" id="site-nav">
  <div class="nav-rail" aria-hidden="true">
    <span class="nav-rail-item"><i class="led led-ok"></i>SYS.ONLINE</span>
    <span class="nav-rail-item">NODE // ${esc(ctx.appName).toUpperCase()}</span>
    <span class="nav-rail-item">BUILD v${esc(ctx.appVersion)}</span>
    <span class="nav-rail-item nav-rail-right">SEC // ENCRYPTED</span>
  </div>
  <div class="container nav-inner">
    <a class="brand" href="/" aria-label="${esc(ctx.appName)} home">${brandMark('<span class="brand-tag" aria-hidden="true">Cyberdeck</span>')}</a>
    <input type="checkbox" id="nav-toggle" class="nav-toggle-check" aria-label="Toggle navigation menu">
    <label for="nav-toggle" class="nav-toggle" aria-hidden="true"><span class="nav-toggle-bars"><i></i><i></i><i></i></span><span class="nav-toggle-text">Menu</span></label>
    <nav class="nav-links" aria-label="Main">${links}</nav>
    <div class="nav-auth">${auth}</div>
  </div>
</header>`;
}

/* ---------- Footer ---------- */

function footer(ctx) {
  const cols = map(footerColumns(ctx), (col, i) =>
    `<nav aria-label="${esc(col.label)}"><h3><span class="kicker-idx" aria-hidden="true">${pad2(i + 1)}</span>${esc(col.label)}</h3>${map(col.links, (l) => `<a href="${l.href}">${esc(l.label)}</a>`)}</nav>`);
  const legal = footerLegal(ctx);
  const readouts = ['UPTIME 99.98%', `LOADER v${esc(ctx.appVersion)}`, 'VAC-SAFE 3Y+', 'KERNEL DRIVER', 'STREAM-PROOF', 'ENCRYPTED'];
  return `<footer class="site-footer">
  <div class="footer-ticker" aria-hidden="true"><div class="footer-ticker-track">${map([...readouts, ...readouts], (r) => `<span class="footer-ticker-item">${r}</span>`)}</div></div>
  <div class="container footer-grid">
    <div class="footer-brand">
      <a class="brand brand-footer" href="/">${brandMark()}</a>
      <p class="footer-blurb">The all-in-one CS2 companion. Track your stats, manage your configs, and play at your peak.</p>
      <p class="footer-status"><i class="led led-ok" aria-hidden="true"></i><span>All systems nominal</span> <a href="/status">Service status</a></p>
    </div>
    ${cols}
  </div>
  <div class="container footer-bottom">
    <span class="footer-copy">${esc(legal.copyright)}</span>
    <span class="footer-legal-line">${esc(legal.line)}</span>
  </div>
</footer>`;
}

/* ---------- Landing page ---------- */

const DL_ARROW = '<svg class="dl-arrow" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12m0 0l-5-5m5 5l5-5M4 19h16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const DL_CHECK = '<svg class="dl-check" viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 12.6l4.8 4.9L19.5 6.5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';

/** The tier-appropriate primary CTA (never a download link for non-Paid). */
function ctaLink(cta, cls) {
  if (cta.kind === 'download') {
    return `<a class="${cls} btn-download" href="${cta.href}" rel="nofollow" data-download><span class="dl-icon" aria-hidden="true">${DL_ARROW}${DL_CHECK}</span><span class="dl-label">${esc(cta.label)}</span><span class="dl-progress" aria-hidden="true"></span></a>`;
  }
  return `<a class="${cls}" href="${cta.href}">${esc(cta.label)}</a>`;
}

/** A ten-segment HUD meter with `on` of them lit. */
function meter(on) {
  return `<span class="hud-meter" aria-hidden="true">${Array.from({ length: 10 }, (_, i) => `<i${i < on ? ' class="on"' : ''}></i>`).join('')}</span>`;
}

const fmt = (n) => Number(n || 0).toLocaleString('en-US');

function home(ctx, data) {
  const d = homeData(ctx, data);
  const version = esc(d.appVersion);
  const stats = [
    ['users', 'Cheaters registered'],
    ['downloads', 'Loaders served'],
    ['threads', 'Forum threads'],
    ['posts', 'Posts & replies'],
  ];

  const recent = !d.canViewForum
    ? `<div class="empty-state recent-locked">
        <p class="hud-label">// ACCESS RESTRICTED</p>
        <p>The forum is a Paid membership benefit. <a href="/upgrade">See upgrade options</a>.</p>
      </div>`
    : d.recentThreads.length === 0
      ? `<div class="empty-state"><p class="muted">No threads yet. <a href="/forum">Be the first to post</a>.</p></div>`
      : `<div class="recent-threads">${map(d.recentThreads, (t, i) => `<a class="recent-thread" href="/forum/t/${esc(t.id)}">
          <span class="recent-idx mono" aria-hidden="true">${pad2(i + 1)}</span>
          <span class="recent-cat">${esc(t.category)}</span>
          <span class="recent-title">${esc(t.title)}</span>
          <span class="recent-meta">by ${esc(t.username)} · ${esc(t.updated)}</span></a>`)}</div>`;

  const gateNote = d.canDownload
    ? `<p class="fineprint mono">SHA-256: ${esc(d.downloadMeta.sha256)}</p>`
    : ctx.user
      ? '<p class="fineprint">The cheat loader is a Paid membership benefit.</p>'
      : `<p class="fineprint">The cheat loader is a Paid membership benefit. Already have an account? <a href="${esc(d.links.login)}">Log in</a>.</p>`;

  const ticker = ['AIMBOT', 'WALLHACK', 'ESP', 'TRIGGERBOT', 'SKIN CHANGER', 'BHOP', 'UNDETECTED', 'STREAM-PROOF', 'KERNEL DRIVER'];

  const body = `
<section class="hero" id="hero">
  <div class="container hero-inner">
    <div class="hero-copy">
      <p class="hero-kicker"><i class="led led-ok" aria-hidden="true"></i>// PREMIUM CS2 CHEAT · BUILD v${version}</p>
      <h1 class="hero-title">Dominate every match. <span class="gradient-text">Never lose again.</span></h1>
      <p class="hero-sub">Aimbot, wallhack, ESP, skin changer and movement hacks in one lightweight loader. Stop grinding, start winning.</p>
      <div class="hero-cta">
        ${ctaLink(d.cta, 'btn btn-primary btn-lg')}
        <a class="btn btn-outline btn-lg" href="/forum">Join the community</a>
      </div>
      <ul class="hero-meta mono" aria-label="Loader facts">
        <li>WIN 10/11 · x64</li>
        <li>${esc(d.downloadMeta.sizeKb)} KB LOADER</li>
        <li>NO VAC DETECTIONS · 3Y+</li>
      </ul>
    </div>
    <aside class="hero-hud" aria-label="Live console readout">
      <div class="hud-corner hud-corner-tl" aria-hidden="true"></div><div class="hud-corner hud-corner-tr" aria-hidden="true"></div>
      <div class="hud-corner hud-corner-bl" aria-hidden="true"></div><div class="hud-corner hud-corner-br" aria-hidden="true"></div>
      <div class="hud-head"><span class="hud-label">CONSOLE // READOUT</span><span class="hud-live"><i class="led led-ok" aria-hidden="true"></i>LIVE</span></div>
      <dl class="hud-rows">
        <div class="hud-row"><dt>Status</dt><dd class="hud-ok">UNDETECTED</dd></div>
        <div class="hud-row"><dt>Build</dt><dd>v${version}</dd></div>
        <div class="hud-row"><dt>Operators</dt><dd>${esc(fmt(d.stats.users))}</dd></div>
        <div class="hud-row"><dt>Loaders served</dt><dd>${esc(fmt(d.stats.downloads))}</dd></div>
        <div class="hud-row"><dt>Aim assist</dt><dd>${meter(9)}<span class="sr-only">90%</span></dd></div>
        <div class="hud-row"><dt>ESP coverage</dt><dd>${meter(10)}<span class="sr-only">100%</span></dd></div>
        <div class="hud-row"><dt>Detection risk</dt><dd>${meter(1)}<span class="sr-only">10%</span></dd></div>
      </dl>
      <p class="hud-foot mono">SIG ${esc(d.downloadMeta.sha256).slice(0, 16)}… · OK</p>
    </aside>
  </div>
  <div class="hero-scan" aria-hidden="true"></div>
</section>
<div class="ticker" aria-hidden="true"><div class="ticker-track">${map([...ticker, ...ticker], (t) => `<span class="ticker-item">${t}</span>`)}</div></div>
<section class="section stats-strip" id="stats">
  <div class="container">
    <p class="section-kicker">// SECTION 01 — TELEMETRY</p>
    <div class="stats-grid">
      ${map(stats, ([key, label], i) => `<div class="stat">
        <span class="stat-idx mono" aria-hidden="true">${pad2(i + 1)}</span>
        <span class="stat-value" data-count="${esc(d.stats[key])}">${esc(fmt(d.stats[key]))}</span>
        <span class="stat-label">${esc(label)}</span>
      </div>`)}
    </div>
  </div>
</section>
<section class="section features-section" id="features">
  <div class="container">
    <p class="section-kicker">// SECTION 02 — LOADOUT</p>
    <h2 class="section-title">Everything you need to rage. All in one place.</h2>
    <div class="features-grid">
      ${map(FEATURES, (f, i) => `<article class="feature-card">
        <div class="feature-head"><div class="feature-icon" aria-hidden="true"><svg viewBox="0 0 24 24">${f.icon}</svg></div><span class="feature-idx mono" aria-hidden="true">MOD.${pad2(i + 1)}</span></div>
        <h3>${esc(f.title)}</h3><p>${esc(f.copy)}</p></article>`)}
    </div>
  </div>
</section>
<section class="section inject-section" id="inject">
  <div class="container">
    <p class="section-kicker">// SECTION 03 — DEPLOY</p>
    <h2 class="section-title">Inject in three steps.</h2>
    <ol class="inject-steps">
      <li class="inject-step"><span class="inject-step-n mono">01</span><strong>Run the loader</strong><span>Download, run, follow the prompts. No installer, no bundled junk.</span></li>
      <li class="inject-step"><span class="inject-step-n mono">02</span><strong>Sign in</strong><span>Use your ${esc(ctx.appName)} account — the loader fetches a signed 24h token automatically.</span></li>
      <li class="inject-step"><span class="inject-step-n mono">03</span><strong>Launch CS2</strong><span>The cheat injects itself and the menu appears. Insert opens it in-game.</span></li>
    </ol>
  </div>
</section>
<section class="section community-section" id="community">
  <div class="container">
    <p class="section-kicker">// SECTION 04 — COMMS</p>
    <h2 class="section-title">Fresh from the forum</h2>
    ${recent}
  </div>
</section>
<section class="section download-cta" id="download">
  <div class="container center">
    <p class="section-kicker">// SECTION 05 — EXECUTE</p>
    <h2 class="section-title">Ready to dominate?</h2>
    <p class="muted">Windows 10/11 (64-bit) · ${esc(d.downloadMeta.sizeKb)} KB loader</p>
    <p class="download-cta-actions">${ctaLink(d.cta, 'btn btn-primary btn-lg')}</p>
    ${gateNote}
  </div>
</section>`;

  return {
    bodyClass: 'landing',
    body: `<div id="rb-home" class="rb-home">${body}\n</div>\n${homeDataScript(ctx, data)}`,
  };
}

export default {
  id: 'neon',
  stylesheets: ['/css/skin-neon.css', '/css/ui-neon.css'],
  modules: ['/js/ui-neon.js'],
  bodyClass: '',
  head() {
    return `<meta name="theme-color" content="#05070c">
<link rel="preload" href="/fonts/chakra-petch-latin-700-normal.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/fonts/ibm-plex-sans-latin-400-normal.woff2" as="font" type="font/woff2" crossorigin>`;
  },
  chrome() {
    return `<div id="rb-bg" class="rb-bg" aria-hidden="true"></div>
<div class="neon-scan" aria-hidden="true"></div>
<div class="neon-sweep" aria-hidden="true"></div>`;
  },
  nav,
  footer,
  home,
};
