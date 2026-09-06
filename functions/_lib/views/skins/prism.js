/**
 * "prism" skin — HOLO-GLASS. Server-rendered chrome for the luminous-glass
 * redesign (see ../skins/index.js for the contract and ui/SKINS.md for the
 * design brief).
 *
 * Everything here is complete, keyboard-usable HTML before any JS runs: the
 * header (with a CSS-only mobile toggle — a checkbox the label flips), the
 * footer, and a full landing page inside #rb-home that the React Bits bundle
 * replaces on mount. No inline styles, no inline scripts; every value that
 * comes from data goes through esc().
 *
 * Hosts the bundle relies on: #rb-bg (fixed, behind everything) for the
 * WebGL ambient, #site-nav for the PillNav, #rb-home for the landing app.
 */
import { esc, map } from "../util.js";
import { BRAND_MARK } from "../brand.js";
import { FEATURES, navLinks, footerColumns, footerLegal, homeData, homeDataScript } from "./common.js";

const pad2 = (n) => String(n).padStart(2, '0');
const fmt = (n) => Number(n || 0).toLocaleString('en-US');

/** Wordmark: the mark plus "GoyHub" with a holographic "Hub". */
const brandMark = () => `${BRAND_MARK}<span class="brand-word">Goy<em>Hub</em></span>`;

/* ---------- Header ---------- */

function nav(ctx) {
  const links = map(navLinks(ctx), (l) =>
    `<a href="${l.href}"${l.active ? ' class="active" aria-current="page"' : ''}>${esc(l.label)}</a>`);
  const auth = ctx.user
    ? `<a class="nav-user" href="/profile" title="Your profile"><span class="avatar" aria-hidden="true">${esc(ctx.user.username[0].toUpperCase())}</span><span class="nav-user-name">${esc(ctx.user.username)}</span></a>
       <form method="post" action="/auth/logout" class="inline-form">
         <input type="hidden" name="_csrf" value="${esc(ctx.csrfToken)}">
         <button type="submit" class="btn btn-ghost btn-sm">Log out</button>
       </form>`
    : `<a href="/auth/login" class="btn btn-ghost btn-sm">Log in</a>
       <a href="/auth/signup" class="btn btn-primary btn-sm">Sign up</a>`;
  return `<header class="site-nav" id="site-nav">
  <div class="container nav-inner">
    <a class="brand" href="/" aria-label="${esc(ctx.appName)} home">${brandMark()}</a>
    <input type="checkbox" id="nav-toggle" class="nav-toggle-check" aria-label="Toggle navigation menu">
    <label for="nav-toggle" class="nav-toggle" aria-hidden="true"><span class="nav-toggle-bars"><i></i><i></i><i></i></span><span class="nav-toggle-text">Menu</span></label>
    <nav class="nav-links" aria-label="Main">${links}</nav>
    <div class="nav-auth">${auth}</div>
  </div>
</header>`;
}

/* ---------- Footer ---------- */

function footer(ctx) {
  const cols = map(footerColumns(ctx), (col) =>
    `<nav aria-label="${esc(col.label)}"><h3>${esc(col.label)}</h3>${map(col.links, (l) => `<a href="${l.href}">${esc(l.label)}</a>`)}</nav>`);
  const legal = footerLegal(ctx);
  return `<footer class="site-footer">
  <div class="footer-glow" aria-hidden="true"></div>
  <div class="container footer-grid">
    <div class="footer-brand">
      <a class="brand brand-footer" href="/">${brandMark()}</a>
      <p class="footer-blurb">The all-in-one CS2 companion. Track your stats, manage your configs, and play at your peak.</p>
      <p class="footer-facts">
        <span class="footer-pill"><i class="holo-dot" aria-hidden="true"></i>Build v${esc(ctx.appVersion)}</span>
        <a class="footer-pill" href="/status">Service status</a>
      </p>
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

/** The three floating "screens" beside the headline (decorative; CardSwap replaces them). */
function heroStack() {
  return `<div class="hero-stack" aria-hidden="true">
      <div class="holo-card holo-card-1">
        <div class="holo-card-head"><span class="holo-label">Match HUD</span><span class="holo-live"><i class="holo-dot"></i>Live</span></div>
        <div class="holo-stat-row">
          <span class="holo-stat"><b>4.8</b><small>K/D</small></span>
          <span class="holo-stat"><b>94%</b><small>HS</small></span>
          <span class="holo-stat"><b>87%</b><small>Win</small></span>
        </div>
        <div class="holo-meter"><span class="holo-meter-fill holo-meter-a"></span></div>
        <div class="holo-meter"><span class="holo-meter-fill holo-meter-b"></span></div>
        <p class="holo-foot">Aim assist · humanized curve · 0.6 smoothing</p>
      </div>
      <div class="holo-card holo-card-2">
        <div class="holo-card-head"><span class="holo-label">ESP view</span><span class="holo-tag">Walls</span></div>
        <svg class="holo-esp" viewBox="0 0 240 132">
          <path d="M0 96h240M48 0v132M120 0v132M192 0v132M0 48h240" stroke="rgba(255,255,255,0.08)" stroke-width="1"/>
          <rect x="56" y="30" width="42" height="70" rx="7" fill="rgba(94,234,212,0.08)" stroke="#5eead4" stroke-width="1.5"/>
          <rect x="49" y="30" width="3" height="70" rx="1.5" fill="#5eead4"/>
          <path d="M77 42v20m0 0l-11 16m11-16l11 16m-11-16l-9 8m9-8l9 8" fill="none" stroke="#5eead4" stroke-width="1.5" stroke-linecap="round"/>
          <circle cx="77" cy="38" r="4" fill="none" stroke="#5eead4" stroke-width="1.5"/>
          <rect x="150" y="46" width="34" height="56" rx="6" fill="rgba(255,106,213,0.1)" stroke="#ff6ad5" stroke-width="1.5"/>
          <rect x="143" y="46" width="3" height="56" rx="1.5" fill="rgba(255,106,213,0.25)"/>
          <rect x="143" y="66" width="3" height="36" rx="1.5" fill="#ff6ad5"/>
          <circle cx="167" cy="54" r="3.5" fill="none" stroke="#ff6ad5" stroke-width="1.5"/>
          <path d="M167 58v16m0 0l-8 12m8-12l8 12" fill="none" stroke="#ff6ad5" stroke-width="1.5" stroke-linecap="round"/>
          <path d="M120 66h-9m18 0h-9m0-9v-9m0 18v9" fill="none" stroke="#ffd166" stroke-width="1.6" stroke-linecap="round"/>
          <circle cx="120" cy="66" r="1.6" fill="#ffd166"/>
        </svg>
        <p class="holo-foot">2 enemies · 34m · 12m</p>
      </div>
      <div class="holo-card holo-card-3">
        <div class="holo-card-head"><span class="holo-label">Skin changer</span><span class="holo-tag">Equipped</span></div>
        <ul class="holo-skins">
          <li><i class="holo-swatch holo-swatch-1"></i><span>Karambit · Fade</span><b>FN</b></li>
          <li><i class="holo-swatch holo-swatch-2"></i><span>AK-47 · Neon Rider</span><b>MW</b></li>
          <li><i class="holo-swatch holo-swatch-3"></i><span>AWP · Dragon Lore</span><b>FT</b></li>
        </ul>
      </div>
    </div>`;
}

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
        <p class="section-kicker">Members only</p>
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

  const ticker = ['Aimbot', 'Wallhack', 'ESP', 'Triggerbot', 'Skin changer', 'Bunnyhop', 'Undetected', 'Stream-proof', 'Kernel driver'];
  const marquee = map([...ticker, ...ticker], (t) => `<span class="holo-marquee-item">${t}</span><i class="holo-marquee-sep"></i>`);

  const body = `
<section class="hero" id="hero">
  <div class="hero-halo" aria-hidden="true"></div>
  <div class="container hero-inner">
    <div class="hero-copy">
      <p class="hero-kicker"><i class="holo-dot" aria-hidden="true"></i>Premium CS2 cheat · Build v${version}</p>
      <h1 class="hero-title">Dominate every match. <span class="gradient-text">Never lose again.</span></h1>
      <p class="hero-sub">Aimbot, wallhack, ESP, skin changer and movement hacks in one lightweight loader. Stop grinding, start winning.</p>
      <div class="hero-cta">
        ${ctaLink(d.cta, 'btn btn-primary btn-lg')}
        <a class="btn btn-outline btn-lg" href="/forum">Join the community</a>
      </div>
      <ul class="hero-meta" aria-label="Loader facts">
        <li>Windows 10/11 · x64</li>
        <li>${esc(d.downloadMeta.sizeKb)} KB loader</li>
        <li>No VAC detections · 3y+</li>
      </ul>
    </div>
    ${heroStack()}
  </div>
</section>
<div class="holo-marquee" aria-hidden="true"><div class="holo-marquee-track">${marquee}</div></div>
<section class="section stats-strip" id="stats">
  <div class="container">
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
    <div class="section-head">
      <p class="section-kicker">01 — The loadout</p>
      <h2 class="section-title">Everything you need to rage. All in one place.</h2>
      <p class="section-lede">Six modules, one loader, zero setup. Every feature is tuned to look human and stay invisible.</p>
    </div>
    <div class="features-grid">
      ${map(FEATURES, (f, i) => `<article class="feature-card">
        <div class="feature-head"><div class="feature-icon" aria-hidden="true"><svg viewBox="0 0 24 24">${f.icon}</svg></div><span class="feature-idx mono" aria-hidden="true">${pad2(i + 1)}</span></div>
        <h3>${esc(f.title)}</h3><p>${esc(f.copy)}</p></article>`)}
    </div>
  </div>
</section>
<section class="section install-section" id="install">
  <div class="container">
    <div class="section-head">
      <p class="section-kicker">02 — First blood in minutes</p>
      <h2 class="section-title">Inject in three steps.</h2>
    </div>
    <ol class="install-steps">
      <li class="install-step"><span class="install-step-n" aria-hidden="true">1</span><strong>Run the loader</strong><span>Download, run, follow the prompts. No installer, no bundled junk.</span></li>
      <li class="install-step"><span class="install-step-n" aria-hidden="true">2</span><strong>Sign in</strong><span>Use your ${esc(ctx.appName)} account — the loader fetches a signed 24h token automatically.</span></li>
      <li class="install-step"><span class="install-step-n" aria-hidden="true">3</span><strong>Launch CS2</strong><span>The cheat injects itself and the menu appears. Insert opens it in-game.</span></li>
    </ol>
  </div>
</section>
<section class="section community-section" id="community">
  <div class="container">
    <div class="section-head">
      <p class="section-kicker">03 — The community</p>
      <h2 class="section-title">Fresh from the forum</h2>
    </div>
    ${recent}
  </div>
</section>
<section class="section download-cta" id="download">
  <div class="cta-orb" aria-hidden="true"></div>
  <div class="container center">
    <p class="section-kicker">04 — Ready when you are</p>
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
  id: 'prism',
  stylesheets: ['/css/skin-prism.css', '/css/ui-prism.css'],
  modules: ['/js/ui-prism.js'],
  bodyClass: '',
  head() {
    return `<meta name="theme-color" content="#07061a">
<link rel="preload" href="/fonts/syne-latin-800-normal.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/fonts/manrope-latin-wght-normal.woff2" as="font" type="font/woff2" crossorigin>`;
  },
  chrome() {
    return `<div id="rb-bg" class="rb-bg" aria-hidden="true"></div>
<div class="prism-beam" aria-hidden="true"></div>`;
  },
  nav,
  footer,
  home,
};
