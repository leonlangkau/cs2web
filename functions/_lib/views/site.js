import { page } from "./layout.js";
import { esc, timeAgo, map, emailLink } from "./util.js";
import { meetsTier, tierOf, TIER_LABELS } from "../tiers.js";

const DOWNLOAD_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12m0 0l-5-5m5 5l5-5M4 19h16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

/* The hero art: a reticle built from theme-colored strokes. Purely decorative
   (aria-hidden); main.js gives it a one-shot settle and a light pointer
   parallax, both skipped under prefers-reduced-motion. */
const RETICLE = `<svg class="reticle" viewBox="0 0 480 480" fill="none" aria-hidden="true">
  <circle cx="240" cy="240" r="216" class="rt-faint" stroke-width="1"/>
  <circle cx="240" cy="240" r="190" class="rt-faint" stroke-width="12" stroke-dasharray="1.5 10.4" opacity="0.35"/>
  <circle cx="240" cy="240" r="150" class="rt-soft" stroke-width="1"/>
  <circle cx="240" cy="240" r="150" class="rt-accent" stroke-width="2.5" stroke-dasharray="235 707" stroke-linecap="round" transform="rotate(-45 240 240)"/>
  <circle cx="240" cy="240" r="92" class="rt-faint" stroke-width="1"/>
  <path d="M240 24v52M240 404v52M24 240h52M404 240h52" class="rt-soft" stroke-width="1.5"/>
  <path d="M240 148v26M240 306v26M148 240h26M306 240h26" class="rt-accent" stroke-width="2" stroke-linecap="round"/>
  <path d="M240 196L286 276H194z" class="rt-accent" stroke-width="3" stroke-linejoin="round"/>
  <path d="M240 233l18.6 32H221.4z" class="rt-fill"/>
</svg>`;

const FEATURES = [
  {
    icon: '<path d="M4 20V10m6 10V4m6 16v-7m4 7H2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    title: 'Match stats &amp; heatmaps',
    copy: 'Automatic post-match breakdowns: K/D, ADR, utility damage and position heatmaps for every map you queue.',
    variant: ' feature-card--featured',
  },
  {
    icon: '<circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 2v5m0 10v5M2 12h5m10 0h5" stroke="currentColor" stroke-width="2"/>',
    title: 'Crosshair &amp; config manager',
    copy: "Save, preview and share crosshair codes and autoexecs. One click to apply a pro's full setup.",
    variant: '',
  },
  {
    icon: '<path d="M13 2L4 14h6l-1 8 9-12h-6l1-8z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
    title: 'FPS boost presets',
    copy: 'Curated video settings and launch options per GPU tier. Squeeze every frame out of your rig, safely.',
    variant: '',
  },
  {
    icon: '<rect x="3" y="5" width="18" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M3 10h18M8 15h4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    title: 'Skin inventory tracker',
    copy: 'Track your inventory value over time with price history charts and float details for every item.',
    variant: ' feature-card--tint',
  },
  {
    icon: '<path d="M17 21v-2a4 4 0 00-4-4H7a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zm12 10v-2a4 4 0 00-3-3.87M15 3.13a4 4 0 010 7.75" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    title: 'Community configs',
    copy: 'Browse setups shared on the forum, upvote what works and publish your own with one click.',
    variant: '',
  },
  {
    icon: '<path d="M12 3l7 4v5c0 4.4-3 8.5-7 9-4-.5-7-4.6-7-9V7l7-4z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M9 12l2 2 4-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
    title: 'Clean &amp; VAC-safe',
    copy: 'AimHub never touches game memory. No injectors, no overlays in ranked, no risk to your account.',
    variant: ' feature-card--band',
  },
];

function home(ctx, { stats, recentThreads, downloadMeta }) {
  const canDownload = meetsTier(ctx.user, 'paid');
  const canViewForum = meetsTier(ctx.user, 'paid');

  const heroCta = canDownload
    ? `<a class="btn btn-primary btn-lg" href="/download/file" rel="nofollow">${DOWNLOAD_ICON}Download for Windows</a>`
    : ctx.user
      ? '<a class="btn btn-primary btn-lg" href="/upgrade">Upgrade to download</a>'
      : '<a class="btn btn-primary btn-lg" href="/auth/signup">Create a free account</a>';

  const heroMeta = canDownload
    ? `v${esc(ctx.appVersion)}, ${esc(downloadMeta.sizeKb)} KB · <span class="mono">SHA-256 ${esc(downloadMeta.sha256.slice(0, 12))}…</span>`
    : ctx.user
      ? `v${esc(ctx.appVersion)} for Windows 10/11 · the download is a Paid benefit`
      : `v${esc(ctx.appVersion)} for Windows 10/11 · <a href="/auth/login?next=%2Fdownload">Already a member? Log in</a>`;

  const bottomCta = canDownload
    ? `<p class="reveal"><a class="btn btn-primary btn-lg" href="/download/file" rel="nofollow">${DOWNLOAD_ICON}Download for Windows</a></p>
       <p class="fineprint mono reveal">SHA-256: ${esc(downloadMeta.sha256)}</p>`
    : ctx.user
      ? `<p class="reveal"><a class="btn btn-primary btn-lg" href="/upgrade">Upgrade to download</a></p>
         <p class="fineprint reveal">The download is a Paid membership benefit.</p>`
      : `<p class="reveal"><a class="btn btn-primary btn-lg" href="/auth/signup">Create a free account</a></p>
         <p class="fineprint reveal">Downloads are a Paid membership benefit. Already have an account? <a href="/auth/login?next=%2Fdownload">Log in</a>.</p>`;

  const recent = !canViewForum
    ? '<p class="muted reveal">The forum is a Paid membership benefit. <a href="/upgrade">See upgrade options</a>.</p>'
    : recentThreads.length === 0
      ? '<p class="muted reveal">No threads yet. <a href="/forum">Be the first to post</a>.</p>'
      : map(recentThreads, (t) => `<a class="recent-thread reveal" href="/forum/t/${esc(t.id)}">
          <span class="recent-cat">${esc(t.category)}</span>
          <span class="recent-title">${esc(t.title)}</span>
          <span class="recent-meta">by ${esc(t.username)} · ${esc(timeAgo(t.updated_at))}</span></a>`);

  const body = `
<section class="hero" id="hero">
  <div class="hero-grid-overlay" aria-hidden="true"></div>
  <div class="container hero-inner">
    <div class="hero-copy">
      <p class="hero-kicker reveal">CS2 COMPANION APP</p>
      <h1 class="hero-title reveal">Play smarter.<br><span class="accent-text">Aim harder.</span></h1>
      <p class="hero-sub reveal">Match stats, crosshair codes, configs and performance presets in one
        lightweight app. Stop tabbing out, start ranking up.</p>
      <div class="hero-cta reveal">
        ${heroCta}
        <a class="btn btn-outline btn-lg" href="/forum">Join the community</a>
      </div>
      <p class="hero-meta reveal">${heroMeta}</p>
    </div>
    <div class="hero-visual" id="hero-visual" aria-hidden="true">${RETICLE}</div>
  </div>
</section>

<section class="section stats-strip" id="stats">
  <div class="container stats-grid">
    <div class="stat reveal"><span class="stat-value" data-count="${esc(stats.users)}">${esc(stats.users)}</span><span class="stat-label">Registered players</span></div>
    <div class="stat reveal"><span class="stat-value" data-count="${esc(stats.downloads)}">${esc(stats.downloads)}</span><span class="stat-label">Downloads served</span></div>
    <div class="stat reveal"><span class="stat-value" data-count="${esc(stats.threads)}">${esc(stats.threads)}</span><span class="stat-label">Forum threads</span></div>
    <div class="stat reveal"><span class="stat-value" data-count="${esc(stats.posts)}">${esc(stats.posts)}</span><span class="stat-label">Posts &amp; replies</span></div>
  </div>
</section>

<section class="section" id="features">
  <div class="container">
    <h2 class="section-title reveal">Everything you alt-tab for.<br>Now in one place.</h2>
    <div class="features-grid">
      ${map(FEATURES, (f) => `<article class="feature-card${f.variant} reveal">
        <div class="feature-icon" aria-hidden="true"><svg viewBox="0 0 24 24">${f.icon}</svg></div>
        <div><h3>${f.title}</h3><p>${f.copy}</p></div></article>`)}
    </div>
  </div>
</section>

<section class="section community-section">
  <div class="container">
    <h2 class="section-title reveal">Fresh from the forum</h2>
    <div class="recent-threads">${recent}</div>
    <p class="center reveal"><a class="btn btn-outline" href="/forum">Browse the forum</a></p>
  </div>
</section>

<section class="section download-cta" id="download">
  <div class="container center">
    <h2 class="section-title reveal">Ready to rank up?</h2>
    <p class="muted reveal">Windows 10/11, 64-bit · ${esc(downloadMeta.sizeKb)} KB installer</p>
    ${bottomCta}
  </div>
</section>`;

  return page(ctx, { title: null, body, bodyClass: 'landing' });
}

function downloadPage(ctx, { downloadMeta }) {
  const canDownload = meetsTier(ctx.user, 'paid');

  const action = canDownload
    ? `<a class="btn btn-primary btn-lg" href="/download/file" rel="nofollow">${DOWNLOAD_ICON}Download now</a>`
    : ctx.user
      ? `<span class="download-gate"><a class="btn btn-primary btn-lg" href="/upgrade">Upgrade to download</a></span>`
      : `<span class="download-gate">
           <a class="btn btn-primary btn-lg" href="/auth/signup">Create a free account</a>
           <a class="btn btn-outline btn-lg" href="/auth/login?next=%2Fdownload">Log in</a>
         </span>`;

  const gateNote = canDownload
    ? ''
    : ctx.user
      ? '<div class="muted">The download is a Paid-tier benefit. <a href="/upgrade">See upgrade options</a>.</div>'
      : '<div class="muted">Downloads are available to Paid members. Signing up is free; upgrading unlocks the download.</div>';

  const licenseBlock = canDownload ? `
    <h2>Loader license</h2>
    <p class="muted">The loader signs in with your ${esc(ctx.appName)} username and password and receives a signed token
      proving your account is <strong>${esc(TIER_LABELS[tierOf(ctx.user)])}</strong>, with no separate key to manage.
      Tokens expire after 24 hours and the loader re-fetches them automatically. You can inspect yours on your
      <a href="/profile">profile page</a>.</p>` : '';

  const body = `
<div class="section download-page">
  <div class="container narrow">
    <h1 class="section-title">Get ${esc(ctx.appName)} v${esc(ctx.appVersion)}</h1>
    <p class="muted">The installer is small, fast and clean. No bundled junk, no background miners, no nonsense.</p>
    <div class="download-box">
      <div>
        <strong>AimHub-Setup-1.0.0.zip</strong>
        <span class="muted"> · Windows 10/11 (64-bit), ${esc(downloadMeta.sizeKb)} KB</span>
        ${gateNote}
      </div>
      ${action}
    </div>
    <h2>Verify your download</h2>
    <p class="muted">Always check the checksum before installing. If it does not match, delete the file.</p>
    <pre class="mono code-block">SHA-256  ${esc(downloadMeta.sha256)}</pre>
    ${licenseBlock}
    <h2>Install in 3 steps</h2>
    <ol class="steps">
      <li>Unzip the archive and run <span class="mono">AimHubSetup.exe</span>.</li>
      <li>Sign in with your ${esc(ctx.appName)} account (or <a href="/auth/signup">create one free</a>).</li>
      <li>Launch CS2. ${esc(ctx.appName)} picks up your matches automatically.</li>
    </ol>
    <h2>System requirements</h2>
    <ul class="muted"><li>Windows 10 or 11, 64-bit</li><li>2 GB RAM · 200 MB disk space</li><li>Counter-Strike 2 installed via Steam</li></ul>
    <p class="fineprint">Downloads are logged (IP address, browser and timestamp) for security and abuse prevention;
      see our <a href="/privacy">Privacy Policy</a>. Installing ${esc(ctx.appName)} is subject to our
      <a href="/terms">Terms &amp; Conditions</a>. Trouble installing? Ask in the
      <a href="/forum/c/support">Support forum</a>.</p>
  </div>
</div>`;

  return page(ctx, { title: 'Download', body });
}

function errorPage(ctx, { code, title, message, action }) {
  const actionBtn = action
    ? `<a class="btn btn-primary" href="${esc(action.href)}">${esc(action.label)}</a>
       <a class="btn btn-outline" href="/">Back to home</a>`
    : '<a class="btn btn-primary" href="/">Back to home</a>';
  const body = `
<section class="section error-page">
  <div class="container narrow center">
    <div class="error-code" aria-hidden="true">${esc(code)}</div>
    <h1>${esc(title)}</h1>
    <p class="muted">${esc(message)}</p>
    <p class="error-actions">${actionBtn}</p>
  </div>
</section>`;
  return page(ctx, { title, body });
}

/**
 * Paid-membership upgrade page. There is no automated checkout yet - the
 * `pay` config (from env vars) decides what this shows: a hosted checkout
 * link, manual crypto addresses, or a "coming soon" note. Never fakes a
 * payment flow that doesn't exist.
 */
function upgradePage(ctx, { pay }) {
  const benefits = `
    <ul class="upgrade-benefits">
      <li><strong>Community forum</strong>: full access to every category, threads, replies and the shoutbox.</li>
      <li><strong>App download</strong>: the ${esc(ctx.appName)} desktop app for Windows, with updates.</li>
      <li><strong>Loader license</strong>: a signed token so the app knows your account is Paid.</li>
      <li><strong>Priority support</strong>: Paid member reports get looked at first.</li>
    </ul>`;

  let payBlock;
  if (pay.url) {
    payBlock = `
      <a class="btn btn-primary btn-lg" href="${esc(pay.url)}" rel="noopener nofollow">Pay with crypto</a>
      <p class="fineprint">Checkout is handled by our payment processor. Your account upgrades
        automatically once the payment confirms. Paying from a different service? Include your
        username <span class="mono">${esc(ctx.user ? ctx.user.username : 'your-username')}</span> in the memo.</p>`;
  } else if (pay.addresses.length > 0) {
    payBlock = `
      <p>Send the payment in any listed coin, then email
        ${emailLink(ctx.company.contactEmail)} with the
        <strong>transaction ID</strong> and your username
        <span class="mono">${esc(ctx.user ? ctx.user.username : 'your-username')}</span>. An admin activates
        Paid on your account after confirmation. Automatic activation is coming soon.</p>
      <div class="pay-addresses">${map(pay.addresses, (a) => `
        <div class="pay-address"><span class="pay-coin">${esc(a.coin)}</span>
          <span class="mono">${esc(a.address)}</span></div>`)}
      </div>`;
  } else {
    payBlock = `
      <p class="muted">Automatic crypto payments are being set up and will appear here soon.
        Until then, contact ${emailLink(ctx.company.contactEmail)}
        ${ctx.user ? `from your account email with your username <span class="mono">${esc(ctx.user.username)}</span>` : ''}
        to upgrade.</p>`;
  }

  const accountNote = ctx.user
    ? (meetsTier(ctx.user, 'paid')
      ? `<div class="flash flash-success upgrade-note">Your account is already
          <strong>${esc(TIER_LABELS[tierOf(ctx.user)])}</strong>. Everything below is unlocked.</div>`
      : '')
    : `<p class="muted"><a href="/auth/signup">Create a free account</a> first; upgrades attach to your username.</p>`;

  const body = `
<div class="section upgrade-page">
  <div class="container narrow">
    <h1 class="section-title">Upgrade to Paid</h1>
    ${accountNote}
    <div class="panel profile-card">
      <h2>What you get</h2>
      ${benefits}
      ${pay.price ? `<p class="upgrade-price"><strong>${esc(pay.price)}</strong></p>` : ''}
    </div>
    <div class="panel profile-card">
      <h2>Pay with crypto</h2>
      ${payBlock}
    </div>
    <p class="fineprint">Payments are subject to our <a href="/terms">Terms &amp; Conditions</a>.
      Tier changes are logged. Need help? ${emailLink(ctx.company.contactEmail)}.</p>
  </div>
</div>`;
  return page(ctx, { title: 'Upgrade', body });
}

export { home, downloadPage, errorPage, upgradePage, DOWNLOAD_ICON };
