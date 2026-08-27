import { page } from "./layout.js";
import { esc, timeAgo, map, emailLink } from "./util.js";
import { meetsTier, tierOf, TIER_LABELS } from "../tiers.js";

const DOWNLOAD_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12m0 0l-5-5m5 5l5-5M4 19h16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

const FEATURES = [
  ['<path d="M4 20V10m6 10V4m6 16v-7m4 7H2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    'Match stats &amp; heatmaps',
    'Automatic post-match breakdowns: K/D, ADR, utility damage and position heatmaps for every map you queue.'],
  ['<circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 2v5m0 10v5M2 12h5m10 0h5" stroke="currentColor" stroke-width="2"/>',
    'Crosshair &amp; config manager',
    "Save, preview and share crosshair codes and autoexecs. One click to apply a pro's full setup."],
  ['<path d="M13 2L4 14h6l-1 8 9-12h-6l1-8z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
    'FPS boost presets',
    'Curated video settings and launch options per GPU tier. Squeeze every frame out of your rig, safely.'],
  ['<rect x="3" y="5" width="18" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M3 10h18M8 15h4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    'Skin inventory tracker',
    'Track your inventory value over time with price history charts and float details for every item.'],
  ['<path d="M17 21v-2a4 4 0 00-4-4H7a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zm12 10v-2a4 4 0 00-3-3.87M15 3.13a4 4 0 010 7.75" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    'Community configs',
    'Browse setups shared on the forum, upvote what works and publish your own with one click.'],
  ['<path d="M12 3l7 4v5c0 4.4-3 8.5-7 9-4-.5-7-4.6-7-9V7l7-4z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M9 12l2 2 4-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
    'Clean &amp; VAC-safe',
    'GoyHub never touches game memory. No injectors, no overlays in ranked, no risk to your account.'],
];

function home(ctx, { stats, recentThreads, downloadMeta }) {
  const canDownload = meetsTier(ctx.user, 'paid');
  const canViewForum = meetsTier(ctx.user, 'paid');

  const heroCta = canDownload
    ? `<a class="btn btn-primary btn-lg btn-download" href="/download/file" rel="nofollow">${DOWNLOAD_ICON}Download for Windows</a>`
    : ctx.user
      ? '<a class="btn btn-primary btn-lg" href="/upgrade">Upgrade to download</a>'
      : '<a class="btn btn-primary btn-lg" href="/auth/signup">Create a free account</a>';

  const heroMeta = canDownload
    ? `v${esc(ctx.appVersion)} · ${esc(downloadMeta.sizeKb)} KB · <span class="mono">SHA-256 ${esc(downloadMeta.sha256.slice(0, 12))}…</span>`
    : ctx.user
      ? `v${esc(ctx.appVersion)} · Windows 10/11 · <a href="/upgrade">Paid members only — see upgrade options</a>`
      : `v${esc(ctx.appVersion)} · Windows 10/11 · <a href="/auth/login?next=%2Fdownload">Already a member? Log in</a>`;

  const bottomCta = canDownload
    ? `<p class="reveal"><a class="btn btn-primary btn-lg btn-download" href="/download/file" rel="nofollow">${DOWNLOAD_ICON}Download GoyHub v${esc(ctx.appVersion)}</a></p>
       <p class="fineprint mono reveal">SHA-256: ${esc(downloadMeta.sha256)}</p>`
    : ctx.user
      ? `<p class="reveal"><a class="btn btn-primary btn-lg" href="/upgrade">See upgrade options</a></p>
         <p class="fineprint reveal">The download is a Paid membership benefit.</p>`
      : `<p class="reveal"><a class="btn btn-primary btn-lg" href="/auth/signup">Sign up to download</a></p>
         <p class="fineprint reveal">Downloads are a Paid membership benefit. Already have an account? <a href="/auth/login?next=%2Fdownload">Log in</a>.</p>`;

  const recent = !canViewForum
    ? '<p class="muted reveal">The forum is a Paid membership benefit. <a href="/upgrade">See upgrade options</a>.</p>'
    : recentThreads.length === 0
      ? '<p class="muted reveal">No threads yet — <a href="/forum">be the first to post</a>.</p>'
      : map(recentThreads, (t) => `<a class="recent-thread reveal" href="/forum/t/${esc(t.id)}">
          <span class="recent-cat">${esc(t.category)}</span>
          <span class="recent-title">${esc(t.title)}</span>
          <span class="recent-meta">by ${esc(t.username)} · ${esc(timeAgo(t.updated_at))}</span></a>`);

  const body = `
<section class="hero" id="hero">
  <canvas id="hero-canvas" aria-hidden="true"></canvas>
  <div class="hero-grid-overlay" aria-hidden="true"></div>
  <div class="container hero-inner">
    <p class="hero-kicker reveal">// THE CS2 COMPANION APP</p>
    <h1 class="hero-title reveal">Play smarter.<br><span class="gradient-text">Aim harder.</span></h1>
    <p class="hero-sub reveal">GoyHub puts your match stats, crosshair codes, config manager and performance presets
      in one lightweight app — so you can stop tabbing out and start ranking up.</p>
    <div class="hero-cta reveal">
      ${heroCta}
      <a class="btn btn-outline btn-lg" href="/forum">Join the community</a>
    </div>
    <p class="hero-meta reveal">${heroMeta}</p>
  </div>
  <div class="hero-cards" aria-hidden="true">
    <div class="hud-card hud-card-1"><span class="hud-label">HEADSHOT %</span><span class="hud-value">61.4</span><span class="hud-trend up">▲ 4.2 this week</span></div>
    <div class="hud-card hud-card-2"><span class="hud-label">AVG FPS</span><span class="hud-value">387</span><span class="hud-trend up">▲ optimized</span></div>
    <div class="hud-card hud-card-3"><span class="hud-label">RATING</span><span class="hud-value">1.27</span><span class="hud-trend">last 20 matches</span></div>
  </div>
  <div class="hero-fade" aria-hidden="true"></div>
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
    <p class="section-kicker reveal">// FEATURES</p>
    <h2 class="section-title reveal">Everything you alt-tab for.<br>Now in one place.</h2>
    <div class="features-grid">
      ${map(FEATURES, ([icon, title, copy]) => `<article class="feature-card reveal">
        <div class="feature-icon" aria-hidden="true"><svg viewBox="0 0 24 24">${icon}</svg></div>
        <h3>${title}</h3><p>${copy}</p></article>`)}
    </div>
  </div>
</section>

<section class="section community-section">
  <div class="container">
    <p class="section-kicker reveal">// COMMUNITY</p>
    <h2 class="section-title reveal">Fresh from the forum</h2>
    <div class="recent-threads">${recent}</div>
    <p class="center reveal"><a class="btn btn-outline" href="/forum">Browse the forum</a></p>
  </div>
</section>

<section class="section download-cta" id="download">
  <div class="container center">
    <h2 class="section-title reveal">Ready to rank up?</h2>
    <p class="muted reveal">Windows 10/11 · 64-bit · ${esc(downloadMeta.sizeKb)} KB installer</p>
    ${bottomCta}
  </div>
</section>`;

  return page(ctx, { title: null, body, bodyClass: 'landing' });
}

function downloadPage(ctx, { downloadMeta }) {
  const canDownload = meetsTier(ctx.user, 'paid');

  const action = canDownload
    ? `<a class="btn btn-primary btn-lg btn-download" href="/download/file" rel="nofollow">${DOWNLOAD_ICON}Download now</a>`
    : ctx.user
      ? `<span class="download-gate"><a class="btn btn-primary btn-lg" href="/upgrade">Upgrade to Paid</a></span>`
      : `<span class="download-gate">
           <a class="btn btn-primary btn-lg" href="/auth/signup">Sign up free</a>
           <a class="btn btn-outline btn-lg" href="/auth/login?next=%2Fdownload">Log in</a>
         </span>`;

  const gateNote = canDownload
    ? ''
    : ctx.user
      ? '<div class="muted">The download is a Paid-tier benefit. <a href="/upgrade">See upgrade options</a>.</div>'
      : '<div class="muted">Downloads are available to Paid members. Signing up is free — upgrading unlocks the download.</div>';

  const licenseBlock = canDownload ? `
    <h2>Loader license</h2>
    <p class="muted">The loader signs in with your GoyHub username and password and receives a signed token
      proving your account is <strong>${esc(TIER_LABELS[tierOf(ctx.user)])}</strong> — no separate key to manage.
      Tokens expire after 24 hours and the loader re-fetches them automatically. You can inspect yours on your
      <a href="/profile">profile page</a>.</p>` : '';

  const body = `
<div class="section download-page">
  <div class="container narrow">
    <p class="section-kicker">// DOWNLOAD</p>
    <h1 class="section-title">Get GoyHub v${esc(ctx.appVersion)}</h1>
    <p class="muted">The installer is small, fast and clean. No bundled junk, no background miners, no nonsense.</p>
    <div class="download-box">
      <div>
        <strong>GoyHub-Setup-1.0.0.zip</strong>
        <span class="muted"> · Windows 10/11 (64-bit) · ${esc(downloadMeta.sizeKb)} KB</span>
        ${gateNote}
      </div>
      ${action}
    </div>
    <h2>Verify your download</h2>
    <p class="muted">Always check the checksum before installing — if it does not match, delete the file.</p>
    <pre class="mono code-block">SHA-256  ${esc(downloadMeta.sha256)}</pre>
    ${licenseBlock}
    <h2>Install in 3 steps</h2>
    <ol class="steps">
      <li>Unzip the archive and run <span class="mono">GoyHubSetup.exe</span>.</li>
      <li>Sign in with your GoyHub account (or <a href="/auth/signup">create one free</a>).</li>
      <li>Launch CS2 — GoyHub picks up your matches automatically.</li>
    </ol>
    <h2>System requirements</h2>
    <ul class="muted"><li>Windows 10 or 11, 64-bit</li><li>2 GB RAM · 200 MB disk space</li><li>Counter-Strike 2 installed via Steam</li></ul>
    <p class="fineprint">Downloads are logged (IP address, browser and timestamp) for security and abuse prevention —
      see our <a href="/privacy">Privacy Policy</a>. Installing GoyHub is subject to our
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
 * Paid-membership upgrade page. There is no automated checkout yet — the
 * `pay` config (from env vars) decides what this shows: a hosted checkout
 * link, manual crypto addresses, or a "coming soon" note. Never fakes a
 * payment flow that doesn't exist.
 */
function upgradePage(ctx, { pay }) {
  const benefits = `
    <ul class="upgrade-benefits">
      <li><strong>Community forum</strong> — full access to every category, threads, replies and the shoutbox.</li>
      <li><strong>App download</strong> — the GoyHub desktop app for Windows, with updates.</li>
      <li><strong>Loader license</strong> — a signed token so the app knows your account is Paid.</li>
      <li><strong>Priority support</strong> — Paid member reports get looked at first.</li>
    </ul>`;

  const csrf = `<input type="hidden" name="_csrf" value="${esc(ctx.csrfToken)}">`;

  let payBlock;
  if (pay.btcpay && pay.btcpay.configured) {
    // Automated, self-hosted BTCPay checkout — the account upgrades itself once
    // the on-chain payment confirms (verified by a signed webhook server-side).
    const periodText = pay.btcpay.periodDays
      ? `${pay.btcpay.periodDays} days of Paid access`
      : 'lifetime Paid access';
    if (ctx.user) {
      payBlock = `
        <form method="post" action="/upgrade/checkout" class="stack">${csrf}
          <button class="btn btn-primary btn-lg" type="submit">Pay with crypto${pay.price ? ` — ${esc(pay.price)}` : ''}</button>
        </form>
        <p class="fineprint">You'll be taken to our self-hosted <strong>BTCPay</strong> checkout to pay in
          Bitcoin (on-chain or Lightning). No card, no third-party processor, no personal details.
          Your account upgrades to <strong>Paid</strong> automatically once the payment confirms —
          usually a few minutes. This buys ${esc(periodText)}.</p>`;
    } else {
      payBlock = `
        <a class="btn btn-primary btn-lg" href="/auth/login?next=%2Fupgrade">Log in to pay</a>
        <p class="fineprint">Payments attach to your account, so you need to be signed in first —
          it only takes a moment to <a href="/auth/signup">create a free account</a>.</p>`;
    }
  } else if (pay.url) {
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
        <span class="mono">${esc(ctx.user ? ctx.user.username : 'your-username')}</span> — an admin activates
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
          <strong>${esc(TIER_LABELS[tierOf(ctx.user)])}</strong> — everything below is unlocked.</div>`
      : '')
    : `<p class="muted"><a href="/auth/signup">Create a free account</a> first — upgrades attach to your username.</p>`;

  const body = `
<div class="section upgrade-page">
  <div class="container narrow">
    <p class="section-kicker">// MEMBERSHIP</p>
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

/**
 * Landing page BTCPay redirects back to after a member pays. The upgrade is
 * applied by the signed webhook, not here — this page only reflects the current
 * state of the member's most recent order.
 */
function upgradeThanksPage(ctx, { payment }) {
  const credited = payment && payment.credited_at;
  const note = credited
    ? `<div class="flash flash-success upgrade-note">Payment confirmed — your account is now
        <strong>Paid</strong>. Everything is unlocked. Thank you!</div>
       <p><a class="btn btn-primary" href="/profile">Go to your profile</a></p>`
    : `<p>Thanks! Your payment is being confirmed on the blockchain — this usually takes a few minutes.
        Your account upgrades to <strong>Paid</strong> automatically as soon as it confirms; you don't
        need to do anything else.</p>
       <p class="muted">You can safely close this page. Check your
        <a href="/profile">profile</a> again shortly to see your new tier.</p>`;
  const body = `
<div class="section upgrade-page">
  <div class="container narrow">
    <p class="section-kicker">// MEMBERSHIP</p>
    <h1 class="section-title">Payment received</h1>
    <div class="panel profile-card">
      ${note}
    </div>
    <p class="fineprint">Questions about a payment? ${emailLink(ctx.company.contactEmail)}.</p>
  </div>
</div>`;
  return page(ctx, { title: 'Thank you', body });
}

export { home, downloadPage, errorPage, upgradePage, upgradeThanksPage, DOWNLOAD_ICON };
