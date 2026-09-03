/**
 * Admin → Status. One page: set every component's state, open or schedule an
 * incident, and post updates to the ones that are running.
 *
 * The design bias is speed under pressure. The most common action during an
 * outage is "mark this component broken and say something", so that is a
 * two-click path at the top of the page rather than a form buried behind a
 * detail view — and posting an update on an incident that names components
 * moves those components with it, so the public page cannot lag behind what
 * staff just said.
 */
import { page } from "./layout.js";
import { esc, timeAgo, map } from "./util.js";
import { head } from "./admin.js";
import { isFullAdmin } from "../tiers.js";
import { beacon, stamp } from "./status.js";
import {
  COMPONENT_STATES, COMPONENT_LABELS, COMPONENT_SHORT, COMPONENT_TONE,
  OVERALL_HEADLINE, INCIDENT_STATES, MAINTENANCE_STATES, STATE_LABELS,
  IMPACTS, IMPACT_LABELS, MAX_TITLE, MAX_UPDATE, componentList,
} from "../status.js";

const csrf = (ctx) => `<input type="hidden" name="_csrf" value="${esc(ctx.csrfToken)}">`;

const stateOptions = (selected) => map(COMPONENT_STATES, (s) =>
  `<option value="${esc(s)}" ${selected === s ? 'selected' : ''}>${esc(COMPONENT_LABELS[s])}</option>`);

/** Checkbox per component — an incident names what it affects. */
const componentPicker = (components, checked = []) => `<fieldset class="component-picker">
  <legend class="muted">Affected components</legend>
  ${map(components, (c) => `<label class="filter-check">
    <input type="checkbox" name="components" value="${esc(c.slug)}"
      ${checked.includes(c.slug) ? 'checked' : ''}> ${esc(c.name)}</label>`)}
</fieldset>`;

function statusAdmin(ctx, { snapshot, components, open, recent }) {
  const overall = snapshot.overall;
  const canDelete = isFullAdmin(ctx.user);

  const overview = `<div class="panel status-overview">
    <div class="panel-head">
      <h2>${beacon(overall)}${esc(OVERALL_HEADLINE[overall])}</h2>
      <a class="muted" href="/status">Public page →</a>
    </div>
    <div class="panel-form">
      <p class="muted">The headline above is not a setting — it is whatever the worst visible component
        below says it is, so it can never disagree with the list customers see.</p>
      ${overall !== 'operational' ? `
      <form method="post" action="/admin/status/components/reset" class="inline-form"
            data-confirm="Set every component back to Operational? Open incidents are left alone.">
        ${csrf(ctx)}
        <button class="btn btn-outline btn-sm" type="submit">All clear — everything operational</button>
      </form>` : ''}
    </div>
  </div>`;

  const componentRows = components.length ? map(components, (c) => `<tr class="${c.visible ? '' : 'row-resolved'}">
    <td>
      <strong>${beacon(c.status, { live: false })}${esc(c.name)}</strong>
      ${c.visible ? '' : '<span class="tag tag-lock">HIDDEN</span>'}
      <div class="muted mono">${esc(c.slug)}</div>
      <details class="admin-user-tools"><summary class="muted">Edit</summary>
        <form method="post" action="/admin/status/components/${esc(c.id)}/edit" class="stack cat-edit-form">
          ${csrf(ctx)}
          <input type="text" name="name" maxlength="60" required value="${esc(c.name)}" aria-label="Name">
          <input type="text" name="description" maxlength="200" value="${esc(c.description)}"
                 aria-label="Description" placeholder="What this covers, in one line">
          <input type="number" name="position" value="${esc(c.position)}" aria-label="Position">
          <label class="filter-check"><input type="checkbox" name="visible" value="1"
            ${c.visible ? 'checked' : ''}> Show on the public page</label>
          <button class="btn btn-primary btn-sm" type="submit">Save</button>
        </form></details>
    </td>
    <td class="muted">${esc(c.description || '—')}</td>
    <td>
      <form method="post" action="/admin/status/components/${esc(c.id)}/state" class="inline-form">
        ${csrf(ctx)}
        <select name="status" aria-label="Status for ${esc(c.name)}">${stateOptions(c.status)}</select>
        <button class="btn btn-ghost btn-xs" type="submit">Set</button>
      </form>
      ${c.changed_at ? `<div class="fineprint">changed ${esc(timeAgo(new Date(Number(c.changed_at)).toISOString().replace('T', ' ').slice(0, 19)))}</div>` : ''}
    </td>
    <td class="actions-cell">${canDelete ? `
      <form method="post" action="/admin/status/components/${esc(c.id)}/delete" class="inline-form"
            data-confirm="Delete the “${esc(c.name)}” component? Past incidents keep naming it.">
        ${csrf(ctx)}<button class="btn btn-danger btn-xs" type="submit">Delete</button></form>`
      : '<span class="muted">admin only</span>'}</td>
  </tr>`) : '<tr><td colspan="4" class="muted center">No components yet — add one below.</td></tr>';

  const openBlock = open.length ? map(open, (incident) => {
    const affected = componentList(incident.components);
    const states = incident.kind === 'maintenance' ? MAINTENANCE_STATES : INCIDENT_STATES;
    return `<div class="panel panel-spaced">
      <div class="panel-head">
        <h2>${esc(incident.title)}</h2>
        <span class="tag tag-incident tag-incident-${esc(incident.state)}">${esc(STATE_LABELS[incident.state])}</span>
      </div>
      <div class="panel-form">
        <p class="muted">Started ${esc(stamp(incident.started_at))}
          ${affected.length ? `· affects ${esc(affected.join(', '))}` : '· no components named'}
          · impact ${esc(IMPACT_LABELS[incident.impact] || incident.impact)}</p>
        ${incident.updates && incident.updates.length ? `<ol class="incident-updates">${
          map(incident.updates, (u) => `<li class="incident-update">
            <span class="incident-update-state">${esc(STATE_LABELS[u.state] || u.state)}</span>
            <span class="muted incident-update-time">${esc(u.author_name)} · ${esc(timeAgo(u.created_at))}</span>
            <p class="post-text">${esc(u.body)}</p></li>`)}</ol>`
          : '<p class="muted">Nothing posted yet — customers are looking at an empty incident.</p>'}

        <form method="post" action="/admin/status/incidents/${esc(incident.id)}/update" class="stack">
          ${csrf(ctx)}
          <label><span>Post an update</span>
            <textarea name="body" rows="3" maxlength="${MAX_UPDATE}" required
              placeholder="What you know now, in plain words. This is public."></textarea></label>
          <div class="form-row">
            <label><span>State</span><select name="state">
              ${map(states, (s) => `<option value="${esc(s)}" ${incident.state === s ? 'selected' : ''}>${esc(STATE_LABELS[s])}</option>`)}
            </select></label>
            <label><span>Set components to</span><select name="component_status">
              <option value="">Leave as they are</option>
              ${stateOptions(null)}
            </select></label>
          </div>
          <button class="btn btn-primary btn-sm" type="submit">Post update</button>
          <p class="fineprint">Choosing <strong>${esc(STATE_LABELS[states[states.length - 1]])}</strong> closes
            the incident and returns its components to Operational — unless another open incident still
            claims them.</p>
        </form>
        ${canDelete ? `<form method="post" action="/admin/status/incidents/${esc(incident.id)}/delete"
          class="inline-form" data-confirm="Delete this incident and every update on it? Resolving it is almost always the right thing instead.">
          ${csrf(ctx)}<button class="btn btn-danger btn-xs" type="submit">Delete incident</button></form>` : ''}
      </div>
    </div>`;
  }) : '<p class="muted empty-state">Nothing open. The public page says everything is fine.</p>';

  const pastRows = recent.filter((i) => i.resolved_at).slice(0, 15);

  const body = `
<div class="section admin-page">
  <div class="container">
    ${head(ctx, 'Status')}
    <p class="muted">What you set here is live on <a href="/status">/status</a> immediately, and shows on
      the help centre and the ticket form — so someone about to report a known outage sees it first.</p>

    ${overview}

    <div class="panel panel-spaced">
      <div class="panel-head"><h2>Components</h2></div>
      <div class="table-wrap"><table>
        <thead><tr><th>Component</th><th>Description</th><th>Status</th><th></th></tr></thead>
        <tbody>${componentRows}</tbody></table></div>
      <div class="panel-form">
        <form method="post" action="/admin/status/components" class="stack">
          ${csrf(ctx)}
          <h3>Add a component</h3>
          <div class="form-row">
            <label><span>Name</span><input type="text" name="name" maxlength="60" required
              placeholder="e.g. Match tracking"></label>
            <label><span>Position</span><input type="number" name="position" value="${esc(components.length)}"></label>
          </div>
          <label><span>Description</span><input type="text" name="description" maxlength="200"
            placeholder="What this covers, in one line"></label>
          <button class="btn btn-primary btn-sm" type="submit">Add component</button>
        </form>
      </div>
    </div>

    <h2 class="search-group">Open incidents</h2>
    ${openBlock}

    <div class="panel panel-spaced">
      <div class="panel-head"><h2>Report something</h2></div>
      <div class="panel-form">
        <form method="post" action="/admin/status/incidents" class="stack">
          ${csrf(ctx)}
          <label><span>Title</span>
            <input type="text" name="title" maxlength="${MAX_TITLE}" required
              placeholder="e.g. Match tracking is delayed"></label>
          <label><span>First update <small class="muted">(public — say what you know)</small></span>
            <textarea name="body" rows="3" maxlength="${MAX_UPDATE}" required
              placeholder="We are seeing delays in match tracking and are looking into it."></textarea></label>
          <div class="form-row">
            <label><span>Type</span><select name="kind">
              <option value="incident">Incident (happening now)</option>
              <option value="maintenance">Planned maintenance</option>
            </select></label>
            <label><span>Impact</span><select name="impact">
              ${map(IMPACTS, (i) => `<option value="${esc(i)}" ${i === 'minor' ? 'selected' : ''}>${esc(IMPACT_LABELS[i])}</option>`)}
            </select></label>
            <label><span>Set components to</span><select name="component_status">
              <option value="">Leave as they are</option>
              ${stateOptions('degraded')}
            </select></label>
          </div>
          ${componentPicker(components)}
          <div class="form-row">
            <label><span>Maintenance starts <small class="muted">(UTC, maintenance only)</small></span>
              <input type="datetime-local" name="scheduled_for"></label>
            <label><span>…and ends</span>
              <input type="datetime-local" name="scheduled_until"></label>
          </div>
          <button class="btn btn-primary" type="submit">Publish</button>
          <p class="fineprint">This appears on the public status page the moment you press it, and
            (where a webhook is configured) pings your staff channel.</p>
        </form>
      </div>
    </div>

    <div class="panel panel-spaced">
      <div class="panel-head"><h2>Recently closed</h2><a class="muted" href="/status#past">Public history →</a></div>
      <div class="table-wrap"><table>
        <thead><tr><th>Incident</th><th>Impact</th><th>Started</th><th>Resolved</th><th>Updates</th></tr></thead>
        <tbody>${pastRows.length ? map(pastRows, (i) => `<tr class="row-resolved">
          <td><a href="/status#incident-${esc(i.id)}">${esc(i.title)}</a>
            ${i.kind === 'maintenance' ? '<span class="tag tag-lock">MAINTENANCE</span>' : ''}</td>
          <td>${esc(IMPACT_LABELS[i.impact] || i.impact)}</td>
          <td class="muted nowrap">${esc(stamp(i.started_at))}</td>
          <td class="muted nowrap">${esc(stamp(i.resolved_at))}</td>
          <td class="muted">${esc((i.updates || []).length)}</td>
        </tr>`) : '<tr><td colspan="5" class="muted center">Nothing closed in the last 90 days.</td></tr>'}
        </tbody></table></div>
    </div>
  </div>
</div>`;
  return page(ctx, { title: 'Admin · Status', body });
}

export { statusAdmin };
