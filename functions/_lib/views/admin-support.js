/**
 * Staff support backend: the queue, the ticket workspace, macros and the
 * help-centre editor.
 *
 * The workspace is one page on purpose. Everything an agent needs to answer
 * without leaving — the live chat, internal notes, the member's history and
 * staff notes about them, canned replies and the AI assist — is on it, because
 * every tab away from the conversation is a reply that does not get written.
 */
import { page } from "./layout.js";
import { esc, timeAgo, map, pagination } from "./util.js";
import { head, tierTag } from "./admin.js";
import { isFullAdmin } from "../tiers.js";
import { renderArticle } from "../kb.js";
import { ACCEPT_ATTR } from "../attachments.js";
import {
  STATUSES, STATUS_LABELS, PRIORITIES, PRIORITY_LABELS, CATEGORIES, CATEGORY_LABELS,
  MAX_BODY, MAX_NOTE, tagList,
} from "../support.js";

const csrf = (ctx) => `<input type="hidden" name="_csrf" value="${esc(ctx.csrfToken)}">`;

const statusTag = (status) =>
  `<span class="tag tag-ticket tag-ticket-${esc(status)}">${esc(STATUS_LABELS[status] || status)}</span>`;

const priorityTag = (priority) =>
  `<span class="tag tag-prio tag-prio-${esc(priority)}">${esc(PRIORITY_LABELS[priority] || priority)}</span>`;

const tagChips = (raw) => map(tagList(raw), (t) =>
  `<a class="tag tag-lock ticket-tag" href="/admin/support?tag=${encodeURIComponent(t)}">${esc(t)}</a>`);

const DAY = 86_400_000;

/** "in 4h" / "3h overdue" / "—" for the first-response clock. */
function slaCell(ticket) {
  if (ticket.first_response_at) {
    const mins = Math.max(0, Math.round((Number(ticket.first_response_at)
      - new Date(`${String(ticket.created_at).replace(' ', 'T')}Z`).getTime()) / 60000));
    const label = mins < 60 ? `${mins}m` : (mins < 1440 ? `${Math.round(mins / 60)}h` : `${Math.round(mins / 1440)}d`);
    return `<span class="muted">answered in ${esc(label)}</span>`;
  }
  if (!ticket.sla_due_at) return '<span class="muted">—</span>';
  const left = Number(ticket.sla_due_at) - Date.now();
  if (left <= 0 || ticket.sla_breached) {
    const over = Math.max(1, Math.round(-left / 3_600_000));
    return `<span class="tag tag-report-open">${esc(over)}H OVER</span>`;
  }
  const hours = Math.max(1, Math.round(left / 3_600_000));
  return `<span class="${hours <= 2 ? 'tag tag-pay-new' : 'muted'}">${esc(hours)}h left</span>`;
}

const requesterCell = (t) => (t.username
  ? `<a class="member-link" href="/u/${encodeURIComponent(t.username)}">${esc(t.username)}</a>${tierTag(t.user_tier)}`
  : `<span title="No account">${esc(t.guest_name || t.guest_email || 'Guest')}</span>
     <span class="tag tag-lock">GUEST</span>`);

/* ------------------------------------------------------------------ *
 * Queue
 * ------------------------------------------------------------------ */

function queue(ctx, { tickets, filters, page: current, pages, total, agents, savedViews, stats, swept }) {
  const card = (value, label, warn = false) =>
    `<div class="stat-card ${warn ? 'stat-card-warn' : ''}"><span class="stat-card-value">${esc(value)}</span><span class="stat-card-label">${esc(label)}</span></div>`;

  const opt = (value, label, selected) =>
    `<option value="${esc(value)}" ${selected === value ? 'selected' : ''}>${esc(label)}</option>`;

  const filterBar = `<form class="filter-bar" method="get" action="/admin/support">
    <select name="status" aria-label="Filter by status">
      ${opt('', 'Any status', filters.status)}
      ${opt('active', 'Active (open + pending + awaiting)', filters.status)}
      ${map(STATUSES, (s) => opt(s, STATUS_LABELS[s], filters.status))}
    </select>
    <select name="priority" aria-label="Filter by priority">
      ${opt('', 'Any priority', filters.priority)}
      ${map(PRIORITIES, (p) => opt(p, PRIORITY_LABELS[p], filters.priority))}
    </select>
    <select name="category" aria-label="Filter by category">
      ${opt('', 'Any topic', filters.category)}
      ${map(CATEGORIES, ([id, label]) => opt(id, label, filters.category))}
    </select>
    <select name="assignee" aria-label="Filter by agent">
      ${opt('', 'Anyone', filters.assignee)}
      ${opt('me', 'Mine', filters.assignee)}
      ${opt('none', 'Unassigned', filters.assignee)}
      ${map(agents, (a) => opt(String(a.id), a.username, filters.assignee))}
    </select>
    <input type="search" name="q" value="${esc(filters.q)}" maxlength="100"
           placeholder="Reference, subject, email…" aria-label="Search tickets">
    <label class="filter-check"><input type="checkbox" name="breached" value="1"
      ${filters.breached ? 'checked' : ''}> SLA breached</label>
    <label class="filter-check"><input type="checkbox" name="spam" value="1"
      ${filters.spam ? 'checked' : ''}> Spam-flagged</label>
    <button class="btn btn-outline btn-sm" type="submit">Filter</button>
    ${filters.dirty ? '<a class="btn btn-ghost btn-sm" href="/admin/support">Clear</a>' : ''}
    <span class="muted">${esc(total)} ticket${total === 1 ? '' : 's'}</span>
  </form>`;

  const viewChips = savedViews.length
    ? `<div class="saved-views">
        <span class="muted">Saved views:</span>
        ${map(savedViews, (v) => `<span class="saved-view">
          <a class="btn btn-ghost btn-xs" href="/admin/support?${esc(v.query)}">${esc(v.name)}</a>
          <form method="post" action="/admin/support/views/${esc(v.id)}/delete" class="inline-form"
                data-confirm="Delete the saved view “${esc(v.name)}”?">${csrf(ctx)}
            <button class="btn btn-ghost btn-xs" type="submit" aria-label="Delete view ${esc(v.name)}">✕</button>
          </form></span>`)}
      </div>`
    : '';

  const saveViewForm = `<form method="post" action="/admin/support/views" class="inline-form save-view-form">
    ${csrf(ctx)}
    <input type="hidden" name="query" value="${esc(filters.query)}">
    <input type="text" name="name" maxlength="40" required placeholder="Save this filter as…"
           aria-label="Name for the saved view">
    <label class="filter-check"><input type="checkbox" name="shared" value="1"> Share with staff</label>
    <button class="btn btn-ghost btn-sm" type="submit">Save view</button>
  </form>`;

  const rows = tickets.length
    ? map(tickets, (t) => `<tr class="${t.sla_breached && !t.first_response_at ? 'row-banned' : ''}${['solved', 'closed'].includes(t.status) ? ' row-resolved' : ''}">
        <td><a class="uid-badge" href="/admin/support/${esc(t.id)}">${esc(t.ref)}</a></td>
        <td><a class="thread-title" href="/admin/support/${esc(t.id)}">${esc(t.subject)}</a>
          ${t.spam ? '<span class="tag tag-banned">SPAM?</span>' : ''}
          ${Number(t.staff_unread) > 0 ? `<span class="tag tag-report-open">${esc(t.staff_unread)} NEW</span>` : ''}
          <div class="ticket-tags">${tagChips(t.tags)}</div></td>
        <td>${requesterCell(t)}</td>
        <td>${esc(CATEGORY_LABELS[t.category] || t.category)}</td>
        <td>${statusTag(t.status)}</td>
        <td>${priorityTag(t.priority)}</td>
        <td>${t.assignee_name ? esc(t.assignee_name) : '<span class="muted">—</span>'}</td>
        <td>${slaCell(t)}</td>
        <td class="muted nowrap">${esc(timeAgo(t.updated_at))}</td>
      </tr>`)
    : '<tr><td colspan="9" class="muted center">Nothing in the queue. Enjoy it.</td></tr>';

  const hrefFor = (n) => {
    const params = new URLSearchParams(filters.query);
    params.set('page', String(n));
    return `/admin/support?${params.toString()}`;
  };

  const body = `
<div class="section admin-page">
  <div class="container">
    ${head(ctx, 'Support')}
    <div class="stat-cards">
      ${card(stats.open, 'Open', stats.open > 0)}
      ${card(stats.pending, 'Pending on us')}
      ${card(stats.unassigned, 'Unassigned', stats.unassigned > 0)}
      ${card(stats.breached, 'SLA breached', stats.breached > 0)}
      ${card(stats.newToday, 'New (24h)')}
      ${card(stats.solved7d, 'Solved (7d)')}
      ${card(stats.medianFirstResponse, 'Median 1st reply')}
      ${card(stats.csat, 'CSAT')}
    </div>

    <div class="forum-head-actions support-toolbar">
      <a class="btn btn-ghost btn-sm" href="/admin/support/macros">Canned replies</a>
      <a class="btn btn-ghost btn-sm" href="/admin/support/articles">Help centre</a>
      <form method="post" action="/admin/support/sweep" class="inline-form">${csrf(ctx)}
        <button class="btn btn-ghost btn-sm" type="submit">Re-check SLA</button></form>
    </div>
    ${swept ? `<p class="switch-note">Swept the queue: ${esc(swept.breached)} SLA breach${swept.breached === 1 ? '' : 'es'} stamped, ${esc(swept.closed)} stale ticket${swept.closed === 1 ? '' : 's'} auto-closed.</p>` : ''}

    ${viewChips}
    ${filterBar}

    <div class="panel">
      <div class="table-wrap"><table>
        <thead><tr><th>Ref</th><th>Subject</th><th>From</th><th>Topic</th><th>Status</th>
          <th>Priority</th><th>Agent</th><th>1st reply</th><th>Updated</th></tr></thead>
        <tbody>${rows}</tbody></table></div>
      <div class="panel-form">${saveViewForm}</div>
    </div>
    ${pagination(current, pages, hrefFor, 'Ticket pages')}
  </div>
</div>`;
  return page(ctx, { title: 'Admin · Support', body });
}

/* ------------------------------------------------------------------ *
 * Ticket workspace
 * ------------------------------------------------------------------ */

function timelineEntry(item, ctx) {
  if (item.kind === 'message') {
    const m = item.row;
    const role = m.author_role === 'staff' ? 'staff' : (m.author_role === 'system' ? 'system' : 'user');
    return `<div class="chat-msg chat-msg-${role}" data-id="${esc(m.id)}" id="msg-${esc(m.id)}">
      <div class="chat-head">
        <span class="chat-who">${esc(m.author_name)}${role === 'staff' ? ' <span class="tag tag-admin">STAFF</span>' : ''}
          ${m.ai_assisted ? '<span class="tag tag-lock">AI-DRAFTED</span>' : ''}</span>
        <span class="chat-time muted">${esc(timeAgo(m.created_at))}</span>
      </div>
      <div class="chat-body post-text">${esc(m.body)}</div>
      ${item.files.length ? `<div class="attach-list">${map(item.files, (a) => `
        <a class="attach-item${String(a.mime).startsWith('image/') ? ' attach-image' : ''}"
           href="/support/attachments/${esc(a.id)}"${String(a.mime).startsWith('image/') ? '' : ' download'}>
          <span class="attach-icon" aria-hidden="true">${String(a.mime).startsWith('image/') ? '🖼' : '📄'}</span>
          <span class="attach-name">${esc(a.filename)}</span>
          <span class="muted attach-size">${esc(Math.max(1, Math.round(a.bytes / 1024)))} KB</span></a>`)}</div>` : ''}
    </div>`;
  }
  if (item.kind === 'note') {
    const n = item.row;
    return `<div class="chat-msg chat-msg-note" data-note="${esc(n.id)}">
      <div class="chat-head">
        <span class="chat-who">${esc(n.author_name)} <span class="tag tag-lock">INTERNAL NOTE</span></span>
        <span class="chat-time muted">${esc(timeAgo(n.created_at))}</span>
      </div>
      <div class="chat-body post-text">${esc(n.body)}</div>
      <form method="post" action="/admin/support/notes/${esc(n.id)}/delete" class="inline-form note-del"
            data-confirm="Delete this internal note?">${csrf(ctx)}
        <button class="btn btn-ghost btn-xs" type="submit">Delete</button></form>
    </div>`;
  }
  const e = item.row;
  return `<div class="ticket-event"><span class="muted">${esc(timeAgo(e.created_at))}</span>
    <strong>${esc(e.actor_name)}</strong> <span>${esc(e.kind.replace(/_/g, ' '))}</span>
    ${e.detail ? `<span class="muted">— ${esc(e.detail)}</span>` : ''}</div>`;
}

function aiPanel(ctx, { ticket, aiEnabled, aiDrafts, aiError }) {
  if (!aiEnabled) {
    return `<div class="panel-form ai-panel">
      <h3>AI assist</h3>
      <p class="muted">Set <code>GEMINI_API_KEY</code> to get a one-click thread summary and reply drafts
        here. Everything else on this page works without it.</p></div>`;
  }

  const summary = ticket.ai_summary ? JSON.parse(ticket.ai_summary) : null;
  const summaryBlock = summary
    ? `<div class="ai-summary">
        <p class="ai-summary-text">${esc(summary.summary)}</p>
        <p class="muted"><strong>Problem:</strong> ${esc(summary.problem)}</p>
        ${summary.tried && summary.tried.length ? `<p class="muted"><strong>Already tried:</strong></p>
          <ul>${map(summary.tried, (t) => `<li>${esc(t)}</li>`)}</ul>` : ''}
        ${summary.nextSteps && summary.nextSteps.length ? `<p class="muted"><strong>Next steps:</strong></p>
          <ul>${map(summary.nextSteps, (t) => `<li>${esc(t)}</li>`)}</ul>` : ''}
        <p class="fineprint">
          <span class="tag tag-lock">${esc(String(summary.sentiment || '').toUpperCase())}</span>
          <span class="tag tag-prio tag-prio-${esc(summary.urgency || 'normal')}">${esc(String(summary.urgency || '').toUpperCase())}</span>
          waiting on ${esc(summary.waitingOn)} · generated ${esc(timeAgo(new Date(Number(ticket.ai_summary_at)).toISOString().replace('T', ' ').slice(0, 19)))}
          · AI-generated, verify before acting</p>
      </div>`
    : '<p class="muted">No summary yet.</p>';

  const draftBlock = aiDrafts && aiDrafts.length
    ? `<div class="ai-drafts">${map(aiDrafts, (d, i) => `<details class="ai-draft" ${i === 0 ? 'open' : ''}>
        <summary>${esc(d.label)}</summary>
        <p class="post-text ai-draft-body">${esc(d.body)}</p>
        <button type="button" class="btn btn-outline btn-xs"
                data-macro-body="${esc(d.body)}" data-macro-target="#staff-reply">Use this draft</button>
      </details>`)}
      <p class="fineprint">Drafts are written by a model and are not saved. Read them, edit them, then send —
        nothing here reaches the customer on its own.</p></div>`
    : '';

  return `<div class="panel-form ai-panel">
    <h3>AI assist</h3>
    ${aiError ? `<p class="form-errors">${esc(aiError)}</p>` : ''}
    ${summaryBlock}
    ${draftBlock}
    <div class="ai-actions">
      <form method="post" action="/admin/support/${esc(ticket.id)}/ai/summary" class="inline-form">${csrf(ctx)}
        <button class="btn btn-ghost btn-sm" type="submit">${ticket.ai_summary ? 'Re-summarise' : 'Summarise thread'}</button></form>
      <form method="post" action="/admin/support/${esc(ticket.id)}/ai/drafts" class="inline-form">${csrf(ctx)}
        <button class="btn btn-ghost btn-sm" type="submit">Suggest replies</button></form>
    </div>
  </div>`;
}

function detail(ctx, {
  ticket, timeline, macros, agents, userNotes, relatedTickets, aiEnabled, aiDrafts, aiError, cfg,
}) {
  const actionForm = (action, inner, extraClass = '') =>
    `<form method="post" action="/admin/support/${esc(ticket.id)}/${action}" class="inline-form ${extraClass}">${csrf(ctx)}${inner}</form>`;

  const controls = `<div class="ticket-controls">
    ${actionForm('status', `<select name="status" aria-label="Status">
      ${map(STATUSES, (s) => `<option value="${esc(s)}" ${ticket.status === s ? 'selected' : ''}>${esc(STATUS_LABELS[s])}</option>`)}
    </select><button class="btn btn-ghost btn-xs" type="submit">Set</button>`)}
    ${actionForm('priority', `<select name="priority" aria-label="Priority">
      ${map(PRIORITIES, (p) => `<option value="${esc(p)}" ${ticket.priority === p ? 'selected' : ''}>${esc(PRIORITY_LABELS[p])}</option>`)}
    </select><button class="btn btn-ghost btn-xs" type="submit">Set</button>`)}
    ${actionForm('assign', `<select name="assignee" aria-label="Assign to">
      <option value="">Unassigned</option>
      <option value="me">Me</option>
      ${map(agents, (a) => `<option value="${esc(a.id)}" ${Number(ticket.assignee_id) === Number(a.id) ? 'selected' : ''}>${esc(a.username)}</option>`)}
    </select><button class="btn btn-ghost btn-xs" type="submit">Assign</button>`)}
    ${actionForm('category', `<select name="category" aria-label="Topic">
      ${map(CATEGORIES, ([id, label]) => `<option value="${esc(id)}" ${ticket.category === id ? 'selected' : ''}>${esc(label)}</option>`)}
    </select><button class="btn btn-ghost btn-xs" type="submit">Move</button>`)}
  </div>`;

  const requesterPanel = `<div class="forum-sidebar ticket-rail">
    <h2>Requester</h2>
    <p class="ticket-rail-name">${ticket.username
      ? `<a class="member-link" href="/u/${encodeURIComponent(ticket.username)}">${esc(ticket.username)}</a>${tierTag(ticket.user_tier)}`
      : `${esc(ticket.guest_name || 'Guest')} <span class="tag tag-lock">NO ACCOUNT</span>`}</p>
    <p class="muted mono">${esc(ticket.user_email || ticket.guest_email || 'no address')}</p>
    ${ticket.user_id ? `<p class="muted">Member since ${esc(timeAgo(ticket.user_created_at))} ·
      <a href="/admin/users?q=${encodeURIComponent(ticket.username || '')}">Manage</a></p>` : ''}
    ${ticket.paid_until !== null && ticket.paid_until !== undefined
      ? `<p class="muted">Membership ends ${esc(new Date(Number(ticket.paid_until)).toISOString().slice(0, 10))}
         (${esc(Math.max(0, Math.ceil((Number(ticket.paid_until) - Date.now()) / DAY)))}d left)</p>`
      : (ticket.user_tier === 'paid' ? '<p class="muted">Lifetime membership</p>' : '')}
    <p class="muted mono ip-addr">${esc(ticket.ip || 'unknown')}</p>
    ${relatedTickets.length ? `<h2 class="rail-sub">Their other tickets</h2>
      ${map(relatedTickets, (r) => `<a class="sidebar-thread" href="/admin/support/${esc(r.id)}">
        <span class="sidebar-title">${esc(r.subject)}</span>
        <span class="muted">${esc(r.ref)} · ${esc(STATUS_LABELS[r.status] || r.status)} · ${esc(timeAgo(r.updated_at))}</span>
      </a>`)}` : ''}
  </div>`;

  const userNotesPanel = ticket.user_id
    ? `<div class="forum-sidebar ticket-rail">
        <h2>Notes on this member</h2>
        <p class="fineprint">Follows the account across every ticket. Never shown to them.</p>
        ${userNotes.length ? map(userNotes, (n) => `<div class="note-item">
            <p class="post-text">${esc(n.body)}</p>
            <p class="fineprint">${esc(n.author_name)} · ${esc(timeAgo(n.created_at))}
              <form method="post" action="/admin/support/user-notes/${esc(n.id)}/delete" class="inline-form"
                    data-confirm="Delete this note?">${csrf(ctx)}
                <button class="btn btn-ghost btn-xs" type="submit">Delete</button></form></p>
          </div>`) : '<p class="muted">No notes on this member yet.</p>'}
        <form method="post" action="/admin/support/${esc(ticket.id)}/user-note" class="stack cat-edit-form">
          ${csrf(ctx)}
          <textarea name="body" rows="3" maxlength="${MAX_NOTE}" required
                    placeholder="e.g. refunded once in March; verified Steam ownership"></textarea>
          <button class="btn btn-ghost btn-sm" type="submit">Add note</button>
        </form>
      </div>`
    : '';

  const macroRail = `<div class="forum-sidebar ticket-rail">
    <h2>Canned replies</h2>
    ${macros.length ? map(macros, (m) => `<div class="macro-item">
        <button type="button" class="macro-insert" data-macro-body="${esc(m.body)}" data-macro-target="#staff-reply">
          ${esc(m.title)}</button>
        ${m.category ? `<span class="muted">${esc(CATEGORY_LABELS[m.category] || m.category)}</span>` : ''}
        <form method="post" action="/admin/support/${esc(ticket.id)}/macro" class="inline-form">
          ${csrf(ctx)}<input type="hidden" name="macro_id" value="${esc(m.id)}">
          <button class="btn btn-ghost btn-xs" type="submit"
            title="Send this reply and apply its status/priority">Send now</button></form>
      </div>`) : '<p class="muted">No canned replies yet.</p>'}
    <a class="btn btn-ghost btn-sm btn-block" href="/admin/support/macros">Manage canned replies</a>
  </div>`;

  const replyBox = `<form method="post" action="/admin/support/${esc(ticket.id)}/reply"
        class="chat-composer staff-composer" enctype="multipart/form-data">
    ${csrf(ctx)}
    <textarea id="staff-reply" name="body" rows="6" maxlength="${MAX_BODY}"
              placeholder="Reply to the customer. This is sent to them."></textarea>
    <div class="chat-composer-actions">
      <label class="chat-attach"><span class="btn btn-ghost btn-sm">Attach</span>
        <input type="file" name="files" multiple class="sr-only" accept="${esc(ACCEPT_ATTR)}">
        <span class="muted chat-attach-name"></span></label>
      <span class="composer-right">
        <label class="filter-check"><input type="checkbox" name="solve" value="1"> Mark solved</label>
        <label class="filter-check"><input type="checkbox" name="ai_assisted" value="1"> AI-drafted</label>
        <button class="btn btn-primary btn-sm" type="submit">Send reply</button>
      </span>
    </div>
  </form>
  <form method="post" action="/admin/support/${esc(ticket.id)}/note" class="chat-composer note-composer">
    ${csrf(ctx)}
    <textarea name="body" rows="3" maxlength="${MAX_NOTE}" required
              placeholder="Internal note — the customer never sees this."></textarea>
    <div class="chat-composer-actions"><span></span>
      <button class="btn btn-warn btn-sm" type="submit">Add internal note</button></div>
  </form>`;

  const mergeWarning = ticket.user_id
    ? `<p class="fineprint">Merging moves this conversation onto the other ticket. It only does that
        between tickets on the <strong>same account</strong>; anything else is recorded as a link for the
        queue and nothing moves.</p>`
    : `<p class="fineprint">This ticket has no account behind it. A guest is identified only by an email
        address they typed, which nobody has verified, so merging here <strong>records a link</strong> for
        the queue rather than moving anything — the two requesters hold different keys, and moving
        messages between them would hand one of them the other's conversation.</p>`;

  const dangerRow = `<div class="panel-form ticket-danger">
    <h3>Housekeeping</h3>
    ${mergeWarning}
    <div class="ticket-controls">
      ${actionForm('tags', `<input type="text" name="tags" maxlength="200" value="${esc(ticket.tags)}"
        placeholder="tags, comma separated" aria-label="Tags">
        <button class="btn btn-ghost btn-xs" type="submit">Save tags</button>`)}
      ${actionForm('merge', `<input type="text" name="into" maxlength="20"
        placeholder="${ticket.user_id ? 'Merge into GH-…' : 'Link to GH-…'}"
        aria-label="${ticket.user_id ? 'Merge into ticket reference' : 'Link to ticket reference'}">
        <button class="btn btn-warn btn-xs" type="submit">${ticket.user_id ? 'Merge' : 'Link'}</button>`, 'merge-form')}
      ${actionForm('spam', `<button class="btn btn-warn btn-xs" type="submit">
        ${ticket.spam ? 'Not spam' : 'Flag as spam'}</button>`)}
    </div>
  </div>`;

  const ratingRow = ticket.rating
    ? `<p class="switch-note">Rated <strong>${esc(ticket.rating)}/5</strong> by the requester
        ${ticket.rating_comment ? `— “${esc(ticket.rating_comment)}”` : ''}</p>`
    : '';

  const body = `
<div class="section admin-page">
  <div class="container">
    ${head(ctx, `Ticket ${ticket.ref}`)}
    <nav class="breadcrumbs" aria-label="Breadcrumb">
      <a href="/admin/support">Support queue</a><span aria-hidden="true">/</span><span>${esc(ticket.ref)}</span>
    </nav>

    <div class="page-head">
      <div>
        <p class="section-title thread-heading ticket-subject">
          <span class="uid-badge">${esc(ticket.ref)}</span>
          ${statusTag(ticket.status)}${priorityTag(ticket.priority)}
          ${ticket.spam ? '<span class="tag tag-banned">SPAM?</span>' : ''}
          ${esc(ticket.subject)}
        </p>
        <p class="muted">${esc(CATEGORY_LABELS[ticket.category] || ticket.category)} ·
          opened ${esc(timeAgo(ticket.created_at))} ·
          ${ticket.assignee_name ? `assigned to ${esc(ticket.assignee_name)}` : 'unassigned'} ·
          ${slaCell(ticket)}
          ${ticket.article_slug ? ` · came from <a href="/help/a/${encodeURIComponent(ticket.article_slug)}">${esc(ticket.article_slug)}</a>` : ''}
          ${ticket.locale ? ` · written in ${esc(ticket.locale)}` : ''}</p>
        <div class="ticket-tags">${tagChips(ticket.tags)}</div>
      </div>
      <div class="forum-head-actions">
        <a class="btn btn-ghost btn-sm" href="/support/t/${encodeURIComponent(ticket.ref)}">Customer view</a>
      </div>
    </div>
    ${ratingRow}
    ${controls}

    <div class="forum-layout ticket-workspace">
      <div class="panel ticket-thread" id="ticket-chat"
           data-ref="${esc(ticket.ref)}" data-last-id="${esc(timeline.lastMessageId)}"
           data-poll="/admin/support/${esc(ticket.id)}/messages">
        <div class="panel-head"><h2>Conversation</h2>
          <span class="muted chat-live" id="chat-live" hidden>Live</span></div>
        <div class="chat-log" id="chat-log">${timeline.items.length
          ? map(timeline.items, (item) => timelineEntry(item, ctx))
          : '<p class="muted chat-empty">Nothing here yet.</p>'}</div>
        ${replyBox}
        ${aiPanel(ctx, { ticket, aiEnabled, aiDrafts, aiError })}
        ${dangerRow}
      </div>
      <div class="ticket-rails">
        ${requesterPanel}
        ${macroRail}
        ${userNotesPanel}
      </div>
    </div>
  </div>
</div>`;
  return page(ctx, { title: `Support · ${ticket.ref}`, body, scripts: ['/js/support.js'] });
}

/* ------------------------------------------------------------------ *
 * Macros
 * ------------------------------------------------------------------ */

function macrosPage(ctx, { macros }) {
  const statusOptions = (selected) => `<option value="">Leave status</option>${
    map(STATUSES, (s) => `<option value="${esc(s)}" ${selected === s ? 'selected' : ''}>${esc(STATUS_LABELS[s])}</option>`)}`;
  const priorityOptions = (selected) => `<option value="">Leave priority</option>${
    map(PRIORITIES, (p) => `<option value="${esc(p)}" ${selected === p ? 'selected' : ''}>${esc(PRIORITY_LABELS[p])}</option>`)}`;
  const categoryOptions = (selected) => `<option value="">Any topic</option>${
    map(CATEGORIES, ([id, label]) => `<option value="${esc(id)}" ${selected === id ? 'selected' : ''}>${esc(label)}</option>`)}`;

  const rows = macros.length ? map(macros, (m) => `<tr class="${m.active ? '' : 'row-resolved'}">
      <td><strong>${esc(m.title)}</strong>
        ${m.active ? '' : '<span class="tag tag-lock">HIDDEN</span>'}
        <details class="admin-user-tools"><summary class="muted">Edit</summary>
          <form method="post" action="/admin/support/macros/${esc(m.id)}/edit" class="stack cat-edit-form">
            ${csrf(ctx)}
            <input type="text" name="title" maxlength="60" required value="${esc(m.title)}" aria-label="Title">
            <textarea name="body" rows="6" maxlength="${MAX_BODY}" required aria-label="Body">${esc(m.body)}</textarea>
            <select name="category" aria-label="Topic">${categoryOptions(m.category)}</select>
            <select name="set_status" aria-label="Set status">${statusOptions(m.set_status)}</select>
            <select name="set_priority" aria-label="Set priority">${priorityOptions(m.set_priority)}</select>
            <input type="text" name="set_tags" maxlength="200" value="${esc(m.set_tags || '')}"
                   placeholder="tags to add" aria-label="Tags to add">
            <input type="number" name="position" value="${esc(m.position)}" aria-label="Position">
            <button class="btn btn-primary btn-sm" type="submit">Save</button>
          </form></details></td>
      <td class="detail-cell muted">${esc(String(m.body).replace(/\s+/g, ' ').slice(0, 90))}…</td>
      <td>${m.category ? esc(CATEGORY_LABELS[m.category] || m.category) : '<span class="muted">any</span>'}</td>
      <td>${m.set_status ? statusTag(m.set_status) : '<span class="muted">—</span>'}
          ${m.set_priority ? priorityTag(m.set_priority) : ''}</td>
      <td class="muted">${esc(m.uses)}</td>
      <td class="actions-cell">
        <form method="post" action="/admin/support/macros/${esc(m.id)}/toggle" class="inline-form">${csrf(ctx)}
          <button class="btn btn-ghost btn-xs" type="submit">${m.active ? 'Hide' : 'Show'}</button></form>
        <form method="post" action="/admin/support/macros/${esc(m.id)}/delete" class="inline-form"
              data-confirm="Delete the canned reply “${esc(m.title)}”?">${csrf(ctx)}
          <button class="btn btn-danger btn-xs" type="submit">Delete</button></form>
      </td></tr>`)
    : '<tr><td colspan="6" class="muted center">No canned replies yet.</td></tr>';

  const body = `
<div class="section admin-page">
  <div class="container">
    ${head(ctx, 'Canned replies')}
    <nav class="breadcrumbs" aria-label="Breadcrumb">
      <a href="/admin/support">Support queue</a><span aria-hidden="true">/</span><span>Canned replies</span></nav>
    <p class="muted">A macro can write the reply <em>and</em> move the ticket, which is what makes it worth
      more than copy-paste. Anything left blank is left alone.</p>

    <div class="panel">
      <div class="table-wrap"><table>
        <thead><tr><th>Title</th><th>Preview</th><th>Topic</th><th>Applies</th><th>Used</th><th></th></tr></thead>
        <tbody>${rows}</tbody></table></div>
      <div class="panel-form">
        <form method="post" action="/admin/support/macros" class="stack">
          ${csrf(ctx)}
          <h3>New canned reply</h3>
          <label><span>Title</span><input type="text" name="title" maxlength="60" required
            placeholder="e.g. Ask for the app log"></label>
          <label><span>Body</span><textarea name="body" rows="6" maxlength="${MAX_BODY}" required
            placeholder="What gets inserted into the reply box."></textarea></label>
          <div class="form-row">
            <label><span>Topic</span><select name="category">${categoryOptions('')}</select></label>
            <label><span>Also set status</span><select name="set_status">${statusOptions('')}</select></label>
            <label><span>Also set priority</span><select name="set_priority">${priorityOptions('')}</select></label>
          </div>
          <label><span>Also add tags</span><input type="text" name="set_tags" maxlength="200"
            placeholder="needs-info, billing"></label>
          <button class="btn btn-primary btn-sm" type="submit">Add canned reply</button>
        </form>
      </div>
    </div>
  </div>
</div>`;
  return page(ctx, { title: 'Admin · Canned replies', body });
}

/* ------------------------------------------------------------------ *
 * Help-centre editor
 * ------------------------------------------------------------------ */

function articlesPage(ctx, { sections, articles }) {
  const rows = articles.length ? map(articles, (a) => `<tr class="${a.published ? '' : 'row-resolved'}">
      <td><a class="thread-title" href="/admin/support/articles/${esc(a.id)}">${esc(a.title)}</a>
        ${a.pinned ? '<span class="tag tag-pin">PINNED</span>' : ''}
        ${a.published ? '' : '<span class="tag tag-lock">DRAFT</span>'}
        <div class="muted mono">/help/a/${esc(a.slug)}</div></td>
      <td>${esc(a.section_name)}</td>
      <td class="muted">${esc(a.views)}</td>
      <td>${a.helpful_yes + a.helpful_no > 0
        ? `<strong>${esc(Math.round((a.helpful_yes / (a.helpful_yes + a.helpful_no)) * 100))}%</strong>
           <span class="muted">of ${esc(a.helpful_yes + a.helpful_no)}</span>`
        : '<span class="muted">no votes</span>'}</td>
      <td class="muted">${esc(a.ticket_count || 0)}</td>
      <td class="actions-cell">
        <a class="btn btn-ghost btn-xs" href="/help/a/${encodeURIComponent(a.slug)}">View</a>
        <a class="btn btn-ghost btn-xs" href="/admin/support/articles/${esc(a.id)}">Edit</a>
        <form method="post" action="/admin/support/articles/${esc(a.id)}/publish" class="inline-form">${csrf(ctx)}
          <button class="btn btn-ghost btn-xs" type="submit">${a.published ? 'Unpublish' : 'Publish'}</button></form>
      </td></tr>`)
    : '<tr><td colspan="6" class="muted center">No articles yet.</td></tr>';

  const sectionRows = map(sections, (s) => `<tr>
    <td><strong>${esc(s.icon)} ${esc(s.name)}</strong><div class="muted mono">/help/s/${esc(s.slug)}</div>
      <details class="admin-user-tools"><summary class="muted">Edit</summary>
        <form method="post" action="/admin/support/sections/${esc(s.id)}/edit" class="stack cat-edit-form">
          ${csrf(ctx)}
          <input type="text" name="name" maxlength="60" required value="${esc(s.name)}" aria-label="Name">
          <input type="text" name="description" maxlength="200" value="${esc(s.description)}" aria-label="Description">
          <input type="text" name="icon" maxlength="8" value="${esc(s.icon)}" aria-label="Icon">
          <input type="number" name="position" value="${esc(s.position)}" aria-label="Position">
          <button class="btn btn-primary btn-sm" type="submit">Save</button></form></details></td>
    <td class="muted">${esc(s.description)}</td>
    <td class="muted">${esc(s.article_count || 0)}</td>
    <td class="actions-cell">${isFullAdmin(ctx.user) ? `
      <form method="post" action="/admin/support/sections/${esc(s.id)}/delete" class="inline-form"
            data-confirm="Delete “${esc(s.name)}” and every article in it?">${csrf(ctx)}
        <button class="btn btn-danger btn-xs" type="submit">Delete</button></form>`
      : '<span class="muted">admin only</span>'}</td></tr>`);

  const body = `
<div class="section admin-page">
  <div class="container">
    ${head(ctx, 'Help centre')}
    <nav class="breadcrumbs" aria-label="Breadcrumb">
      <a href="/admin/support">Support queue</a><span aria-hidden="true">/</span><span>Help centre</span></nav>
    <p class="muted">The "try this first" layer. The column that matters is <strong>Tickets after</strong> —
      articles people read and then open a ticket anyway are the ones to rewrite.</p>

    <div class="panel">
      <div class="panel-head"><h2>Articles</h2><a class="btn btn-primary btn-sm" href="/admin/support/articles/new">New article</a></div>
      <div class="table-wrap"><table>
        <thead><tr><th>Title</th><th>Section</th><th>Reads</th><th>Helpful</th><th>Tickets after</th><th></th></tr></thead>
        <tbody>${rows}</tbody></table></div>
    </div>

    <div class="panel panel-spaced">
      <div class="panel-head"><h2>Sections</h2></div>
      <div class="table-wrap"><table>
        <thead><tr><th>Section</th><th>Description</th><th>Articles</th><th></th></tr></thead>
        <tbody>${sectionRows}</tbody></table></div>
      <div class="panel-form">
        <form method="post" action="/admin/support/sections" class="stack">
          ${csrf(ctx)}
          <h3>New section</h3>
          <div class="form-row">
            <label><span>Name</span><input type="text" name="name" maxlength="60" required></label>
            <label><span>Icon</span><input type="text" name="icon" maxlength="8" placeholder="🛠️"></label>
            <label><span>Position</span><input type="number" name="position" value="${esc(sections.length)}"></label>
          </div>
          <label><span>Description</span><input type="text" name="description" maxlength="200"></label>
          <button class="btn btn-primary btn-sm" type="submit">Add section</button>
        </form>
      </div>
    </div>
  </div>
</div>`;
  return page(ctx, { title: 'Admin · Help centre', body });
}

function articleEdit(ctx, { article, sections, errors = [] }) {
  const isNew = !article.id;
  const body = `
<div class="section admin-page">
  <div class="container narrow">
    ${head(ctx, isNew ? 'New help article' : 'Edit help article')}
    <nav class="breadcrumbs" aria-label="Breadcrumb">
      <a href="/admin/support">Support</a><span aria-hidden="true">/</span>
      <a href="/admin/support/articles">Help centre</a><span aria-hidden="true">/</span>
      <span>${esc(isNew ? 'New article' : article.title)}</span></nav>

    ${errors.length ? `<div class="form-errors" role="alert"><ul>${map(errors, (e) => `<li>${esc(e)}</li>`)}</ul></div>` : ''}

    <form method="post" action="${isNew ? '/admin/support/articles' : `/admin/support/articles/${esc(article.id)}`}" class="stack">
      ${csrf(ctx)}
      <label><span>Title</span>
        <input type="text" name="title" maxlength="120" required value="${esc(article.title || '')}"></label>
      <label><span>Section</span>
        <select name="section_id" required>${map(sections, (s) =>
          `<option value="${esc(s.id)}" ${Number(article.section_id) === Number(s.id) ? 'selected' : ''}>${esc(s.name)}</option>`)}</select></label>
      <label><span>One-line summary</span>
        <input type="text" name="summary" maxlength="200" value="${esc(article.summary || '')}"
               placeholder="Shown on cards and used by the AI matcher."></label>
      <label><span>Search keywords</span>
        <input type="text" name="keywords" maxlength="300" value="${esc(article.keywords || '')}"
               placeholder="crash crashing wont start launch error — the words people actually type"></label>
      <label><span>Body</span>
        <textarea name="body" rows="22" maxlength="20000" required class="mono"
          placeholder="## Try this first&#10;&#10;1. Do the thing&#10;2. Then the other thing&#10;&#10;> A callout&#10;&#10;\`\`\`&#10;a code block&#10;\`\`\`"
        >${esc(article.body || '')}</textarea></label>
      <p class="fineprint">Markup: <code>## heading</code>, <code>- bullet</code>, <code>1. step</code>,
        <code>&gt; callout</code>, <code>\`code\`</code>, <code>**bold**</code>,
        <code>[label](/path)</code>, <code>\`\`\`</code> fences. Raw HTML is escaped, never rendered.</p>
      <div class="form-row">
        <label><span>Position</span><input type="number" name="position" value="${esc(article.position || 0)}"></label>
        <label class="filter-check"><input type="checkbox" name="pinned" value="1"
          ${article.pinned ? 'checked' : ''}> Pin to the top ("start here")</label>
        <label class="filter-check"><input type="checkbox" name="published" value="1"
          ${isNew || article.published ? 'checked' : ''}> Published</label>
      </div>
      <button class="btn btn-primary" type="submit">${isNew ? 'Create article' : 'Save article'}</button>
    </form>

    ${isNew ? '' : `
    <div class="panel panel-spaced">
      <div class="panel-head"><h2>Preview</h2>
        <a class="muted" href="/help/a/${encodeURIComponent(article.slug)}">Open the live page →</a></div>
      <div class="panel-form kb-body">${renderArticle(article.body || '')}</div>
    </div>
    ${isFullAdmin(ctx.user) ? `
    <form method="post" action="/admin/support/articles/${esc(article.id)}/delete" class="danger-zone"
          data-confirm="Delete “${esc(article.title)}” permanently?">
      ${csrf(ctx)}
      <button class="btn btn-danger btn-sm" type="submit">Delete this article</button>
    </form>` : '<p class="fineprint">Only a full admin can delete an article. Unpublish it instead.</p>'}`}
  </div>
</div>`;
  return page(ctx, { title: isNew ? 'New article' : `Edit · ${article.title}`, body });
}

export { queue, detail, macrosPage, articlesPage, articleEdit, statusTag, priorityTag, slaCell };
