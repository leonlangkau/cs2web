/**
 * Public status page.
 *
 * The whole page is driven by one derived verdict (see status.js): the worst
 * visible component decides the banner, the beacon colour and the pulse. There
 * is no separate "we say it's fine" field, so the headline can never contradict
 * the list under it.
 *
 * The animation is doing a job rather than decorating: a beacon pulses only
 * while something is actually wrong, so a glance at the tab tells you whether
 * to keep reading. Everything is CSS keyframes on classes the server already
 * decided, so it works before /js/status.js loads and it all collapses under
 * `prefers-reduced-motion`.
 */
import { page } from "./layout.js";
import { esc, timeAgo, map } from "./util.js";
import {
  COMPONENT_LABELS, COMPONENT_SHORT, COMPONENT_TONE, OVERALL_HEADLINE, OVERALL_BLURB,
  STATE_LABELS, IMPACT_LABELS, componentList,
} from "../status.js";

/** A pulsing dot. `live` adds the expanding ring — only when it means something. */
const beacon = (state, { live = true } = {}) => {
  const tone = COMPONENT_TONE[state] || 'ok';
  const animate = live && tone !== 'ok';
  return `<span class="beacon beacon-${esc(tone)}${animate ? ' beacon-live' : ''}" aria-hidden="true">
    <span class="beacon-dot"></span>${animate ? '<span class="beacon-ring"></span><span class="beacon-ring beacon-ring-2"></span>' : ''}
  </span>`;
};

const stateTag = (state) =>
  `<span class="tag tag-incident tag-incident-${esc(state)}">${esc(STATE_LABELS[state] || state)}</span>`;

const impactTag = (impact) => (impact && impact !== 'minor'
  ? `<span class="tag tag-impact tag-impact-${esc(impact)}">${esc(IMPACT_LABELS[impact] || impact)}</span>`
  : '');

/** "12 Mar, 14:05" in UTC — a status page that guesses a timezone is worse than one that states it. */
function stamp(ms) {
  if (!ms) return '—';
  const d = new Date(Number(ms));
  if (Number.isNaN(d.getTime())) return '—';
  return `${d.toISOString().slice(0, 10)} ${d.toISOString().slice(11, 16)} UTC`;
}

const componentNames = (incident, components) => componentList(incident.components)
  .map((slug) => (components.find((c) => c.slug === slug) || {}).name || slug);

/* ------------------------------------------------------------------ *
 * Incident card
 * ------------------------------------------------------------------ */

function incidentCard(incident, components, { compact = false } = {}) {
  const affected = componentNames(incident, components);
  const isMaintenance = incident.kind === 'maintenance';
  const updates = incident.updates || [];

  const window = isMaintenance && incident.scheduled_for
    ? `<p class="muted incident-window">Window: ${esc(stamp(incident.scheduled_for))}${
      incident.scheduled_until ? ` → ${esc(stamp(incident.scheduled_until))}` : ''}</p>`
    : '';

  return `<article class="incident ${incident.resolved_at ? 'incident-closed' : 'incident-open'}${
    isMaintenance ? ' incident-maintenance' : ''}" id="incident-${esc(incident.id)}">
    <header class="incident-head">
      <h3 class="incident-title">${esc(incident.title)}</h3>
      <div class="incident-tags">${stateTag(incident.state)}${impactTag(incident.impact)}
        ${isMaintenance ? '<span class="tag tag-lock">MAINTENANCE</span>' : ''}</div>
    </header>
    <p class="muted incident-meta">
      ${incident.resolved_at
        ? `${esc(stamp(incident.started_at))} → ${esc(stamp(incident.resolved_at))}`
        : `Started ${esc(stamp(incident.started_at))} · ${esc(timeAgo(new Date(Number(incident.started_at)).toISOString().replace('T', ' ').slice(0, 19)))}`}
      ${affected.length ? ` · affects ${esc(affected.join(', '))}` : ''}
    </p>
    ${window}
    ${updates.length ? `<ol class="incident-updates">${map(compact ? updates.slice(0, 2) : updates, (u) => `
      <li class="incident-update">
        <span class="incident-update-state">${esc(STATE_LABELS[u.state] || u.state)}</span>
        <span class="muted incident-update-time">${esc(timeAgo(u.created_at))}</span>
        <p class="post-text">${esc(u.body)}</p>
      </li>`)}</ol>` : '<p class="muted">No updates posted yet.</p>'}
    ${compact && updates.length > 2
      ? `<p class="fineprint"><a href="/status#incident-${esc(incident.id)}">${esc(updates.length - 2)} earlier update${updates.length - 2 === 1 ? '' : 's'} →</a></p>`
      : ''}
  </article>`;
}

/* ------------------------------------------------------------------ *
 * The page
 * ------------------------------------------------------------------ */

function statusPage(ctx, { snapshot, canEdit }) {
  const { overall, components, open, upcoming, recent = [], history = [] } = snapshot;

  const banner = `<div class="status-hero status-hero-${esc(COMPONENT_TONE[overall] || 'ok')}" id="status-hero"
       data-status="${esc(overall)}">
    <div class="status-hero-inner">
      ${beacon(overall)}
      <div>
        <h1 class="status-headline" id="status-headline">${esc(OVERALL_HEADLINE[overall])}</h1>
        <p class="status-blurb">${esc(OVERALL_BLURB[overall])}</p>
      </div>
    </div>
    <p class="status-checked">
      <span class="muted">Checked <time id="status-checked">just now</time></span>
      <span class="status-live" id="status-live" hidden>· live</span>
    </p>
  </div>`;

  const openBlock = open.length
    ? `<section class="status-section" aria-labelledby="open-incidents">
        <h2 class="search-group" id="open-incidents">Happening now</h2>
        ${map(open, (i) => incidentCard(i, components))}
      </section>`
    : '';

  const upcomingBlock = upcoming.length
    ? `<section class="status-section" aria-labelledby="upcoming">
        <h2 class="search-group" id="upcoming">Scheduled maintenance</h2>
        ${map(upcoming, (i) => incidentCard(i, components, { compact: true }))}
      </section>`
    : '';

  const historyFor = (slug) => history.find((h) => h.component.slug === slug);

  const componentRows = map(components, (c) => {
    const h = historyFor(c.slug);
    const bars = h
      ? `<div class="uptime-bars" role="img"
              aria-label="${esc(h.uptimePct)}% of the last ${esc(h.timeline.length)} days with no incident on ${esc(c.name)}">
          ${map(h.timeline, (d) => `<span class="uptime-bar uptime-${esc(COMPONENT_TONE[d.state] || 'ok')}"
            title="${esc(new Date(d.at).toISOString().slice(0, 10))}: ${esc(COMPONENT_SHORT[d.state] || d.state)}"></span>`)}
        </div>
        <div class="uptime-legend muted">
          <span>${esc(h.timeline.length)} days ago</span>
          <span class="uptime-pct">${esc(h.uptimePct)}% incident-free</span>
          <span>today</span>
        </div>`
      : '';

    return `<div class="status-component" data-component="${esc(c.slug)}">
      <div class="status-component-head">
        <span class="status-component-name">${beacon(c.status)}${esc(c.name)}</span>
        <span class="status-component-state status-state-${esc(COMPONENT_TONE[c.status] || 'ok')}"
              data-state="${esc(c.status)}">${esc(COMPONENT_SHORT[c.status] || c.status)}</span>
      </div>
      ${c.description ? `<p class="muted status-component-desc">${esc(c.description)}</p>` : ''}
      ${bars}
    </div>`;
  });

  const past = recent.filter((i) => i.resolved_at);
  const pastBlock = `<section class="status-section" aria-labelledby="past">
    <h2 class="search-group" id="past">Past 90 days</h2>
    ${past.length
      ? map(past, (i) => incidentCard(i, components, { compact: true }))
      : '<p class="muted empty-state">No incidents in the last 90 days.</p>'}
  </section>`;

  const body = `
<div class="section content-page status-page">
  <div class="container narrow">
    <div class="page-head status-head">
      <div><p class="hero-kicker">Service status</p></div>
      <div class="forum-head-actions">
        ${canEdit ? '<a class="btn btn-ghost btn-sm" href="/admin/status">Manage</a>' : ''}
        <a class="btn btn-ghost btn-sm" href="/status.json">JSON</a>
        <a class="btn btn-outline btn-sm" href="/help">Help centre</a>
        <a class="btn btn-primary btn-sm" href="/support/new">Contact support</a>
      </div>
    </div>

    ${banner}
    ${openBlock}
    ${upcomingBlock}

    <section class="status-section" aria-labelledby="components">
      <h2 class="search-group" id="components">Components</h2>
      <div class="status-components" id="status-components">${componentRows}</div>
    </section>

    ${pastBlock}

    <p class="fineprint">Times are UTC. This page updates itself while it is open, and
      <a href="/status.json">/status.json</a> is a machine-readable version of the same data —
      point an uptime monitor at it if you like. Something broken that is not listed here?
      <a href="/support/new">Tell us</a>.</p>
  </div>
</div>`;

  return page(ctx, {
    title: `${OVERALL_HEADLINE[overall]} · Status`,
    body,
    scripts: ['/js/status.js'],
  });
}

/**
 * The "we already know" strip for the help centre and the ticket form. Renders
 * nothing when everything is fine, so a healthy site carries no dead furniture.
 */
function statusNote(headsUp) {
  if (!headsUp) return '';
  const tone = COMPONENT_TONE[headsUp.overall] || 'warn';
  const list = headsUp.incidents.length
    ? ` We are already on it: ${headsUp.incidents.map((i) => esc(i.title)).join('; ')}.`
    : '';
  return `<p class="status-note status-note-${esc(tone)}">
    ${beacon(headsUp.overall)}
    <span><strong>${esc(headsUp.headline)}.</strong>${list}
      <a href="/status">See the status page →</a></span>
  </p>`;
}

export { statusPage, statusNote, beacon, incidentCard, stamp, stateTag, impactTag };
