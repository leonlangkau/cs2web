import { page } from "./layout.js";
import { esc, timeAgo, map, emailLink } from "./util.js";
import { meetsTier, tierOf, TIER_LABELS } from "../tiers.js";
import { planDuration } from "../plans.js";

const DOWNLOAD_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12m0 0l-5-5m5 5l5-5M4 19h16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const DL_ARROW_ICON = '<svg class="dl-arrow" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12m0 0l-5-5m5 5l5-5M4 19h16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const DL_CHECK_ICON = '<svg class="dl-check" viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 12.6l4.8 4.9L19.5 6.5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';

function downloadBtn(label) {
  return `<a class="btn btn-primary btn-lg btn-download" href="/download/file" rel="nofollow" data-download`
    + `><span class="dl-icon" aria-hidden="true">${DL_ARROW_ICON}${DL_CHECK_ICON}</span>`
    + `<span class="dl-label">${label}</span>`
    + `<span class="dl-progress" aria-hidden="true"></span></a>`;
}

const FEATURES = [
  ['<path d="M4 20V10m6 10V4m6 16v-7m4 7H2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    'Precision aimbot',
    'Customizable smoothing, FOV, and target selection. Lock onto heads with humanized movement curves that bypass anti-cheat heuristics.'],
  ['<circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 2v5m0 10v5M2 12h5m10 0h5" stroke="currentColor" stroke-width="2"/>',
    'Wallhack &amp; ESP',
    'See enemies through walls with player boxes, health bars, weapon info, and skeleton ESP. Fully customizable colors and filters.'],
  ['<path d="M13 2L4 14h6l-1 8 9-12h-6l1-8z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
    'Triggerbot',
    'Auto-fire the millisecond your crosshair touches a hitbox. Adjustable delay and hitchance for maximum legitimacy.'],
  ['<rect x="3" y="5" width="18" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M3 10h18M8 15h4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    'Skin changer',
    'Equip any knife, glove, or weapon skin in your local inventory. StatTrak, stickers, and wear float fully customizable.'],
  ['<path d="M17 21v-2a4 4 0 00-4-4H7a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zm12 10v-2a4 4 0 00-3-3.87M15 3.13a4 4 0 010 7.75" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    'Movement hacks',
    'Auto-bunnyhop, auto-strafe, edge jump, and perfect jumpbug. Movement recorder for complex jumps and shortcuts.'],
  ['<path d="M12 3l7 4v5c0 4.4-3 8.5-7 9-4-.5-7-4.6-7-9V7l7-4z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M9 12l2 2 4-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
    'Undetected &amp; secure',
    'Kernel-level driver, signed binaries, and external rendering. No VAC detections in 3+ years. Stream-proof overlay options.'],
];

function home(ctx, { stats, recentThreads, downloadMeta }) {
  const canDownload = meetsTier(ctx.user, 'paid');
  const canViewForum = meetsTier(ctx.user, 'paid');

  const heroCta = canDownload
    ? `<span class="star-border" data-magnet>${downloadBtn('Download Loader')}</span>`
    : ctx.user
      ? '<span class="star-border" data-magnet><a class="btn btn-primary btn-lg" href="/upgrade">Upgrade to download</a></span>'
      : '<span class="star-border" data-magnet><a class="btn btn-primary btn-lg" href="/auth/signup">Create a free account</a></span>';

  const bottomCta = canDownload
    ? `<p class="reveal">${downloadBtn('Download Loader')}</p>
       <p class="fineprint mono reveal">SHA-256: ${esc(downloadMeta.sha256)}</p>`
    : ctx.user
      ? `<p class="reveal"><a class="btn btn-primary btn-lg" href="/upgrade">Upgrade to download</a></p>
         <p class="fineprint reveal">The cheat loader is a Paid membership benefit.</p>`
      : `<p class="reveal"><a class="btn btn-primary btn-lg" href="/auth/signup">Create a free account</a></p>
         <p class="fineprint reveal">The cheat loader is a Paid membership benefit. Already have an account? <a href="/auth/login?next=%2Fdownload">Log in</a>.</p>`;

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
  <div class="hero-aurora" aria-hidden="true"><span class="aurora-blob"></span></div>
  <canvas id="aurora-canvas" aria-hidden="true"></canvas>
  <canvas id="hero-canvas" aria-hidden="true"></canvas>
  <div class="hero-grid-overlay" aria-hidden="true"></div>
  <div class="container hero-inner">
    <div class="hero-copy">
      <p class="hero-kicker" data-decrypt>// PREMIUM CS2 CHEAT</p>
      <h1 class="hero-title"><span data-split>Dominate every match.</span><br>
        <span class="hero-line2"><span class="gradient-text">Never lose again.</span></span></h1>
      <p class="hero-sub reveal">Aimbot, wallhack, ESP, skin changer and movement hacks in one lightweight loader. Stop grinding, start winning.</p>
      <div class="hero-cta reveal">
        ${heroCta}
        <a class="btn btn-outline btn-lg" href="/forum">Join the community</a>
      </div>
    </div>
    <div class="hero-cards" aria-hidden="true">
      <div class="hud-card hud-card-1"><span class="hud-label">HEADSHOT %</span><span class="hud-value">94.2</span><span class="hud-trend up">▲ 32.8 this week</span></div>
      <div class="hud-card hud-card-2"><span class="hud-label">WIN RATE</span><span class="hud-value">87%</span><span class="hud-trend up">▲ 41 this week</span></div>
      <div class="hud-card hud-card-3"><span class="hud-label">RANK</span><span class="hud-value">Global</span><span class="hud-trend">from Silver 2</span></div>
    </div>
  </div>
  <div class="hero-fade" aria-hidden="true"></div>
</section>

<section class="section stats-strip" id="stats">
  <div class="container stats-grid" data-stagger="90">
    <div class="stat reveal"><span class="stat-value" data-count="${esc(stats.users)}">${esc(stats.users)}</span><span class="stat-label">Cheaters registered</span></div>
    <div class="stat reveal"><span class="stat-value" data-count="${esc(stats.downloads)}">${esc(stats.downloads)}</span><span class="stat-label">Loaders served</span></div>
    <div class="stat reveal"><span class="stat-value" data-count="${esc(stats.threads)}">${esc(stats.threads)}</span><span class="stat-label">Forum threads</span></div>
    <div class="stat reveal"><span class="stat-value" data-count="${esc(stats.posts)}">${esc(stats.posts)}</span><span class="stat-label">Posts &amp; replies</span></div>
  </div>
</section>

<section class="section" id="features">
  <div class="container">
    <h2 class="section-title reveal">Everything you need to rage.<br>All in one place.</h2>
    <div class="features-grid" data-stagger="70">
      ${map(FEATURES, ([icon, title, copy], i) => `<article class="feature-card spotlight-card reveal${i === 0 || i === 5 ? ' feature-featured' : ''}">
        <div class="feature-icon" aria-hidden="true"><svg viewBox="0 0 24 24">${icon}</svg></div>
        <h3>${title}</h3><p>${copy}</p></article>`)}
    </div>
  </div>
</section>

<section class="section community-section">
  <div class="container">
    <h2 class="section-title reveal">Fresh from the forum</h2>
    <div class="recent-threads" data-stagger="80">${recent}</div>
  </div>
</section>

<section class="section download-cta" id="download">
  <div class="container center">
    <h2 class="section-title reveal">Ready to dominate?</h2>
    <p class="muted reveal">Windows 10/11 (64-bit) · ${esc(downloadMeta.sizeKb)} KB loader</p>
    ${bottomCta}
  </div>
</section>`;

  return page(ctx, { title: null, body, bodyClass: 'landing' });
}

function downloadPage(ctx, { downloadMeta }) {
  const canDownload = meetsTier(ctx.user, 'paid');

  const action = canDownload
    ? downloadBtn('Download now')
    : ctx.user
      ? `<span class="download-gate"><a class="btn btn-primary btn-lg" href="/upgrade">Upgrade to Paid</a></span>`
      : `<span class="download-gate">
           <a class="btn btn-primary btn-lg" href="/auth/signup">Sign up free</a>
           <a class="btn btn-outline btn-lg" href="/auth/login?next=%2Fdownload">Log in</a>
         </span>`;

  const gateNote = canDownload
    ? ''
    : ctx.user
      ? '<div class="muted">The cheat loader is a Paid-tier benefit. <a href="/upgrade">See upgrade options</a>.</div>'
      : '<div class="muted">The cheat loader is available to Paid members. Signing up is free; upgrading unlocks the download.</div>';

  const licenseBlock = canDownload ? `
    <h2>Loader license</h2>
    <p class="muted">The loader signs in with your username and password and receives a signed token
      proving your account is <strong>${esc(TIER_LABELS[tierOf(ctx.user)])}</strong>, with no separate key to manage.
      Tokens expire after 24 hours and the loader re-fetches them automatically. You can inspect yours on your
      <a href="/profile">profile page</a>.</p>` : '';

  const body = `
<div class="section download-page">
  <div class="container narrow">
    <h1 class="section-title">Get the Cheat Loader v${esc(ctx.appVersion)}</h1>
    <p class="muted">The loader is small, fast and undetected. No bundled junk, no data logging, no nonsense.</p>
    <div class="download-box reveal">
      <div>
        <strong>${esc(downloadMeta.name)}</strong>
        <span class="muted"> · Windows 10/11 (64-bit), ${esc(downloadMeta.sizeKb)} KB</span>
        ${gateNote}
      </div>
      ${action}
    </div>
    <h2>Verify your download</h2>
    <p class="muted">Always check the checksum before installing. If it does not match, delete the file.</p>
    <pre class="mono code-block">SHA-256  ${esc(downloadMeta.sha256)}</pre>
    ${licenseBlock}
    <h2>Inject in 3 steps</h2>
    <ol class="steps" data-stagger="90">
      <li class="reveal">Run the downloaded loader and follow the prompts.</li>
      <li class="reveal">Sign in with your account (or <a href="/auth/signup">create one free</a>).</li>
      <li class="reveal">Launch CS2. The cheat injects automatically and the menu appears.</li>
    </ol>
    <h2>System requirements</h2>
    <ul class="muted"><li>Windows 10 or 11, 64-bit</li><li>2 GB RAM · 200 MB disk space</li><li>Counter-Strike 2 installed via Steam</li></ul>
    <p class="fineprint">See our <a href="/privacy">Privacy Policy</a>. Using this cheat is subject to our
      <a href="/terms">Terms &amp; Conditions</a>. Trouble injecting? Ask in the
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

function upgradePage(ctx, { pay }) {
  const benefits = `
    <ul class="upgrade-benefits">
      <li><strong>Community forum</strong>: full access to configs, exploits, and the shoutbox.</li>
      <li><strong>Cheat loader</strong>: the desktop loader for Windows, with auto-updates.</li>
      <li><strong>Loader license</strong>: a signed token so the cheat knows your account is Paid.</li>
      <li><strong>Priority support</strong>: Paid member reports get looked at first.</li>
    </ul>`;

  const csrf = `<input type="hidden" name="_csrf" value="${esc(ctx.csrfToken)}">`;

  let payBlock;
  const catalogue = (pay.btcpay && pay.btcpay.plans) || [];
  if (pay.btcpay && pay.btcpay.configured && catalogue.length > 0) {
    const plans = catalogue;
    const currency = pay.btcpay.currency;

    const planCard = (plan) => `<article class="plan-card">
        <h3 class="plan-name">${esc(plan.name)}</h3>
        <p class="plan-price"><span class="plan-amount">${esc(plan.amount)}</span>
          <span class="plan-currency">${esc(currency)}</span></p>
        <p class="plan-term">${esc(planDuration(plan.periodDays))}</p>
        ${plan.description ? `<p class="plan-blurb">${esc(plan.description)}</p>` : ''}
        ${ctx.user
          ? `<form method="post" action="/upgrade/checkout">${csrf}
              <input type="hidden" name="plan" value="${esc(plan.id)}">
              <button class="btn btn-primary btn-block" type="submit">Pay with crypto</button>
            </form>`
          : `<a class="btn btn-outline btn-block" href="/auth/login?next=%2Fbuy">Sign in to buy</a>`}
      </article>`;

    payBlock = `
      <div class="plan-grid">${map(plans, planCard)}</div>
      <p class="fineprint">You'll be taken to our self-hosted <strong>BTCPay</strong> checkout to pay in
        Bitcoin (on-chain or Lightning). No card, no third-party processor, no personal details.
        Your account upgrades to <strong>Paid</strong> automatically once the payment confirms; usually a
        few minutes, and it does not depend on you staying on the page.
        ${ctx.user ? '' : 'Payments attach to your account, so sign in first — a free account takes a moment.'}</p>`;
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
        <span class="mono">${esc(ctx.user ? ctx.user.username : 'your-username')}</span>; an admin activates
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
          <strong>${esc(TIER_LABELS[tierOf(ctx.user)])}</strong>: everything below is unlocked.</div>`
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
      <h2>Choose a plan</h2>
      ${payBlock}
    </div>
    <p class="fineprint">Payments are subject to our <a href="/terms">Terms &amp; Conditions</a>.
      Tier changes are logged. Need help? ${emailLink(ctx.company.contactEmail)}.</p>
  </div>
</div>`;
  return page(ctx, { title: 'Upgrade', body });
}

function upgradeThanksPage(ctx, { payment }) {
  const credited = payment && payment.credited_at;
  const note = credited
    ? `<div class="flash flash-success upgrade-note">Payment confirmed. Your account is now
        <strong>Paid</strong>. Everything is unlocked. Thank you!</div>
       <p><a class="btn btn-primary" href="/profile">Go to your profile</a></p>`
    : `<p>Thanks! Your payment is being confirmed on the blockchain, which usually takes a few minutes.
        Your account upgrades to <strong>Paid</strong> automatically as soon as it confirms; you don't
        need to do anything else.</p>
       <p class="muted">You can safely close this page. Check your
        <a href="/profile">profile</a> again shortly to see your new tier.</p>`;
  const body = `
<div class="section upgrade-page">
  <div class="container narrow">
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
