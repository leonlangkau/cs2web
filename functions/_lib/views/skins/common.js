/**
 * Pieces every redesign skin shares: the nav/footer link sets, the landing
 * page data block and a plain server-rendered landing fallback. A skin module
 * builds its own markup around these so the content, the access rules and the
 * JSON the React app reads stay identical across designs.
 */
import { esc, timeAgo, map, jsonScript } from "../util.js";
import { isStaff, meetsTier, tierOf } from "../../tiers.js";

/** The product pitch. `icon` is inline SVG inner markup (24x24 viewBox). */
const FEATURES = [
  { key: 'aimbot', title: 'Precision aimbot',
    copy: 'Customizable smoothing, FOV, and target selection. Lock onto heads with humanized movement curves that bypass anti-cheat heuristics.',
    icon: '<path d="M4 20V10m6 10V4m6 16v-7m4 7H2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>' },
  { key: 'esp', title: 'Wallhack & ESP',
    copy: 'See enemies through walls with player boxes, health bars, weapon info, and skeleton ESP. Fully customizable colors and filters.',
    icon: '<circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 2v5m0 10v5M2 12h5m10 0h5" stroke="currentColor" stroke-width="2"/>' },
  { key: 'trigger', title: 'Triggerbot',
    copy: 'Auto-fire the millisecond your crosshair touches a hitbox. Adjustable delay and hitchance for maximum legitimacy.',
    icon: '<path d="M13 2L4 14h6l-1 8 9-12h-6l1-8z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>' },
  { key: 'skins', title: 'Skin changer',
    copy: 'Equip any knife, glove, or weapon skin in your local inventory. StatTrak, stickers, and wear float fully customizable.',
    icon: '<rect x="3" y="5" width="18" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M3 10h18M8 15h4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>' },
  { key: 'movement', title: 'Movement hacks',
    copy: 'Auto-bunnyhop, auto-strafe, edge jump, and perfect jumpbug. Movement recorder for complex jumps and shortcuts.',
    icon: '<path d="M17 21v-2a4 4 0 00-4-4H7a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zm12 10v-2a4 4 0 00-3-3.87M15 3.13a4 4 0 010 7.75" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>' },
  { key: 'secure', title: 'Undetected & secure',
    copy: 'Kernel-level driver, signed binaries, and external rendering. No VAC detections in 3+ years. Stream-proof overlay options.',
    icon: '<path d="M12 3l7 4v5c0 4.4-3 8.5-7 9-4-.5-7-4.6-7-9V7l7-4z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M9 12l2 2 4-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' },
];

/** Main navigation entries with the same access rules as the classic nav. */
function navLinks(ctx) {
  const p = ctx.path;
  const links = [
    { href: '/', label: 'Home', active: p === '/' },
    { href: '/forum', label: 'Forum', active: p.startsWith('/forum') },
    { href: '/download', label: 'Download', active: p.startsWith('/download') },
    { href: '/help', label: 'Support', active: p.startsWith('/help') || p.startsWith('/support') },
  ];
  if (!meetsTier(ctx.user, 'paid')) links.push({ href: '/buy', label: 'Upgrade', active: p === '/buy' || p === '/upgrade' });
  if (isStaff(ctx.user)) links.push({ href: '/admin', label: 'Admin', active: p.startsWith('/admin') });
  return links;
}

/** Footer columns: [{ label, links: [{ href, label }] }]. */
function footerColumns(ctx) {
  const account = ctx.user
    ? [['/profile', 'Profile'], ['/upgrade', 'Upgrade'], ['/support', 'Support tickets']]
    : [['/auth/signup', 'Sign up'], ['/auth/login', 'Log in'], ['/upgrade', 'Upgrade']];
  const col = (label, pairs) => ({ label, links: pairs.map(([href, text]) => ({ href, label: text })) });
  return [
    col('Product', [['/download', 'Download'], ['/#features', 'Features'], ['/changelog', 'Changelog'], ['/faq', 'FAQ']]),
    col('Support', [['/help', 'Help centre'], ['/support/new', 'Contact support'], ['/support', 'My tickets'], ['/status', 'Service status']]),
    col('Community', [['/forum', 'Forum'], ['/forum/c/support', 'Support'], ['/forum/c/configs', 'Configs & Setups']]),
    col('Account', account),
    col('Legal', [['/terms', 'Terms & Conditions'], ['/privacy', 'Privacy Policy']]),
  ];
}

/** The operator line for the footer (never ships an unfilled placeholder). */
function footerLegal(ctx) {
  const c = ctx.company;
  const operator = c.isPlaceholder ? c.tradingName : c.legalName;
  return {
    copyright: `© 2026 ${c.tradingName} · v${ctx.appVersion}`,
    line: `Operated by ${operator}, registered in the ${c.jurisdiction}. Fan-made companion app. Not affiliated with Valve Corporation. Counter-Strike and CS2 are trademarks of Valve.`,
  };
}

/** The call to action the visitor's tier earns. Never a download link for non-Paid. */
function primaryCta(ctx, canDownload) {
  if (canDownload) return { href: '/download/file', label: 'Download loader', kind: 'download' };
  if (ctx.user) return { href: '/upgrade', label: 'Upgrade to download', kind: 'upgrade' };
  return { href: '/auth/signup', label: 'Create a free account', kind: 'signup' };
}

/** Everything the React landing app needs, as one JSON-safe object. */
function homeData(ctx, { stats, recentThreads, downloadMeta, canDownload, canViewForum }) {
  const cta = primaryCta(ctx, canDownload);
  return {
    user: ctx.user ? { username: ctx.user.username, tier: tierOf(ctx.user) } : null,
    canDownload, canViewForum,
    stats: { users: Number(stats.users) || 0, downloads: Number(stats.downloads) || 0, threads: Number(stats.threads) || 0, posts: Number(stats.posts) || 0 },
    recentThreads: (canViewForum ? recentThreads : []).map((t) => ({
      id: t.id, title: t.title, category: t.category, username: t.username, updated: timeAgo(t.updated_at),
    })),
    downloadMeta: { name: downloadMeta.name, sha256: downloadMeta.sha256, sizeKb: downloadMeta.sizeKb },
    appVersion: ctx.appVersion,
    features: FEATURES,
    cta,
    links: {
      download: canDownload ? '/download/file' : null,
      signup: '/auth/signup', login: '/auth/login?next=%2Fdownload', upgrade: '/upgrade', forum: '/forum', help: '/help', downloadPage: '/download',
    },
  };
}

/** The data block for the landing app. */
function homeDataScript(ctx, data) {
  return jsonScript('rb-home-data', homeData(ctx, data));
}

/**
 * Plain server-rendered landing content: what crawlers and no-JS visitors
 * get, and what the React app replaces on mount. Skins wrap or restyle it;
 * the ids are shared so in-page links (/#features, /#download) keep working.
 */
function fallbackHome(ctx, data) {
  const d = homeData(ctx, data);
  const ctaLink = (cta, cls) => cta.kind === 'download'
    ? `<a class="${cls}" href="${cta.href}" rel="nofollow" data-download>${esc(cta.label)}</a>`
    : `<a class="${cls}" href="${cta.href}">${esc(cta.label)}</a>`;
  const recent = !d.canViewForum
    ? '<p class="muted">The forum is a Paid membership benefit. <a href="/upgrade">See upgrade options</a>.</p>'
    : d.recentThreads.length === 0
      ? '<p class="muted">No threads yet. <a href="/forum">Be the first to post</a>.</p>'
      : `<div class="recent-threads">${map(d.recentThreads, (t) => `<a class="recent-thread" href="/forum/t/${esc(t.id)}">
          <span class="recent-cat">${esc(t.category)}</span>
          <span class="recent-title">${esc(t.title)}</span>
          <span class="recent-meta">by ${esc(t.username)} · ${esc(t.updated)}</span></a>`)}</div>`;
  const gateNote = d.canDownload
    ? `<p class="fineprint mono">SHA-256: ${esc(d.downloadMeta.sha256)}</p>`
    : ctx.user
      ? '<p class="fineprint">The cheat loader is a Paid membership benefit.</p>'
      : `<p class="fineprint">The cheat loader is a Paid membership benefit. Already have an account? <a href="${esc(d.links.login)}">Log in</a>.</p>`;

  return `
<section class="hero" id="hero">
  <div class="container hero-inner">
    <div class="hero-copy">
      <p class="hero-kicker">// PREMIUM CS2 CHEAT</p>
      <h1 class="hero-title">Dominate every match. <span class="gradient-text">Never lose again.</span></h1>
      <p class="hero-sub">Aimbot, wallhack, ESP, skin changer and movement hacks in one lightweight loader. Stop grinding, start winning.</p>
      <div class="hero-cta">
        ${ctaLink(d.cta, 'btn btn-primary btn-lg')}
        <a class="btn btn-outline btn-lg" href="/forum">Join the community</a>
      </div>
    </div>
  </div>
</section>
<section class="section stats-strip" id="stats">
  <div class="container stats-grid">
    <div class="stat"><span class="stat-value" data-count="${d.stats.users}">${d.stats.users}</span><span class="stat-label">Cheaters registered</span></div>
    <div class="stat"><span class="stat-value" data-count="${d.stats.downloads}">${d.stats.downloads}</span><span class="stat-label">Loaders served</span></div>
    <div class="stat"><span class="stat-value" data-count="${d.stats.threads}">${d.stats.threads}</span><span class="stat-label">Forum threads</span></div>
    <div class="stat"><span class="stat-value" data-count="${d.stats.posts}">${d.stats.posts}</span><span class="stat-label">Posts &amp; replies</span></div>
  </div>
</section>
<section class="section" id="features">
  <div class="container">
    <h2 class="section-title">Everything you need to rage. All in one place.</h2>
    <div class="features-grid">
      ${map(FEATURES, (f) => `<article class="feature-card">
        <div class="feature-icon" aria-hidden="true"><svg viewBox="0 0 24 24">${f.icon}</svg></div>
        <h3>${esc(f.title)}</h3><p>${esc(f.copy)}</p></article>`)}
    </div>
  </div>
</section>
<section class="section community-section" id="community">
  <div class="container">
    <h2 class="section-title">Fresh from the forum</h2>
    ${recent}
  </div>
</section>
<section class="section download-cta" id="download">
  <div class="container center">
    <h2 class="section-title">Ready to dominate?</h2>
    <p class="muted">Windows 10/11 (64-bit) · ${esc(d.downloadMeta.sizeKb)} KB loader</p>
    <p>${ctaLink(d.cta, 'btn btn-primary btn-lg')}</p>
    ${gateNote}
  </div>
</section>`;
}

export { FEATURES, navLinks, footerColumns, footerLegal, primaryCta, homeData, homeDataScript, fallbackHome };
