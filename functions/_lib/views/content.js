import { page } from "./layout.js";
import { esc, map, emailLink } from "./util.js";

const FAQ_ITEMS = [
  ['What is GoyHub?',
    `GoyHub is a companion app for Counter-Strike 2: automatic match stats and heatmaps, a crosshair and
     config manager, FPS presets and a skin inventory tracker. One lightweight Windows app instead of six
     browser tabs.`],
  ['Is it safe to use with VAC?',
    `Yes. GoyHub never touches game memory, injects code or draws overlays in ranked play. It reads the
     same public data the game client exposes to everyone. No VAC or trust-factor risk.`],
  ['What does a free account get me?',
    `A free account lets you sign in on the site and in the app. The community forum and the app download
     are Paid-member benefits; see the upgrade page for what's included.`],
  ['How do I upgrade to Paid?',
    `Head to the upgrade page while signed in. Crypto checkout is being set up; until it goes live the page
     shows exactly how to complete an upgrade with the support team.`],
  ['How does the app know I\'m a Paid member?',
    `The desktop app signs in with your website username and password and receives a short-lived signed
     license that proves your tier. Upgrades, downgrades and bans apply within one launch. There is no
     separate licence key to manage.`],
  ['I forgot my password.',
    `If you're still signed in somewhere, change it from your profile page. Otherwise contact support from
     the email address on your account and we'll verify it's you.`],
  ['I need help with something — where do I go?',
    `The help centre at /help has step-by-step fixes for the things that break most often, and every
     page ends with a way to reach a human. Support tickets are open to everyone: free accounts, paid
     members, and visitors with no account at all. Each ticket is a live chat thread, so you can
     keep talking to the same person in the same place.`],
  ['How do I report a rule-breaking post?',
    `Every forum post has a Report control underneath it. Reports go straight to the moderation queue,
     and you won't be named to the person you reported.`],
  ['Can I delete my account?',
    `Yes: contact support, or ask any admin on the forum. Your posts stay (attributed to [deleted]) so
     other members' conversations aren't destroyed; everything identifying you is removed. Details are in
     the Privacy Policy.`],
];

const CHANGELOG = [
  ['1.1.0', '2026-08-28', 'Help centre and support desk', [
    'New help centre at /help: browsable, searchable runbooks that solve the common problems before you have to ask.',
    'Support tickets for everyone — free accounts, paid members, and visitors with no account at all.',
    'Every ticket is a live chat thread with a real person, with screenshots and log files attached.',
    'Rate a ticket when it is done, and tell us whether a help article actually helped.',
    'Staff side: a full ticket queue with priorities, SLA timers, assignment, tags, canned replies, internal notes and optional AI summaries and reply drafts.',
  ]],
  ['1.0.0', '2026-08-24', 'Initial public release', [
    'Match stats and heatmaps, crosshair & config manager, FPS presets, skin tracker.',
    'Community forum with categories, search, member profiles and a live shoutbox.',
    'Membership tiers with signed loader licenses for the desktop app.',
    'Light and dark theme across the whole site.',
    'Security: proof-of-work signup verification, session hardening, IP audit logging and flood protection.',
  ]],
];

function faq(ctx) {
  const body = `
<div class="section content-page">
  <div class="container narrow">
    <h1 class="section-title">Frequently asked questions</h1>
    <div class="faq-list">
      ${map(FAQ_ITEMS, ([q, a]) => `<details class="faq-item">
        <summary>${esc(q)}</summary>
        <p>${esc(a).replace(/\s+/g, ' ')}</p>
      </details>`)}
    </div>
    <p class="muted">This page covers the basics. The <a href="/help">help centre</a> has the full
      runbooks, and if none of them fix it, <a href="/support/new">open a support ticket</a> — every
      account can, free ones included, and you can even do it without an account at all.</p>
    <p class="fineprint">Prefer email? ${emailLink(ctx.company.contactEmail)} — though a ticket gets
      you a live thread and a tracked reference.</p>
  </div>
</div>`;
  return page(ctx, { title: 'FAQ', body });
}

function changelog(ctx) {
  const body = `
<div class="section content-page">
  <div class="container narrow">
    <h1 class="section-title">Changelog</h1>
    ${map(CHANGELOG, ([version, date, title, items]) => `<article class="release">
      <h2><span class="mono">v${esc(version)}</span>: ${esc(title)}</h2>
      <p class="muted release-date">${esc(date)}</p>
      <ul>${map(items, (i) => `<li>${esc(i)}</li>`)}</ul>
    </article>`)}
    <p class="muted">Release announcements are pinned in
      <a href="/forum/c/announcements">Announcements</a> on the forum.</p>
  </div>
</div>`;
  return page(ctx, { title: 'Changelog', body });
}

export { faq, changelog };
