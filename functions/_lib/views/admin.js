import { page } from "./layout.js";
import { esc, timeAgo, map, pagination } from "./util.js";
import { TIER_LABELS, STAFF_TIERS, isFullAdmin } from "../tiers.js";

const tierTag = (tier) => tier && tier !== 'user'
  ? ` <span class="tag tag-tier tag-tier-${esc(tier)}">${esc(TIER_LABELS[tier] || tier)}</span>` : '';

function head(ctx, heading) {
  const tab = (href, label, active) => `<a href="${href}" class="${active ? 'active' : ''}">${label}</a>`;
  const p = ctx.path;
  return `<div class="page-head">
    <div><p class="section-kicker">// ADMIN BACKEND</p><h1 class="section-title">${esc(heading)}</h1></div>
  </div>
  <nav class="admin-tabs" aria-label="Admin sections">
    ${tab('/admin', 'Dashboard', p === '/admin')}
    ${tab('/admin/users', 'Users', p.startsWith('/admin/users'))}
    ${tab('/admin/logs', 'IP logs', p.startsWith('/admin/logs'))}
    ${tab('/admin/reports', 'Reports', p.startsWith('/admin/reports'))}
    ${tab('/admin/forum', 'Forum', p.startsWith('/admin/forum'))}
  </nav>`;
}

const logRow = (l) => `<tr>
  <td><span class="tag tag-event tag-${esc(l.event)}">${esc(l.event)}</span></td>
  <td>${esc(l.username || '—')}</td>
  <td class="mono">${esc(l.ip)}</td>
  <td class="muted">${esc(timeAgo(l.created_at))}</td></tr>`;

function dashboard(ctx, { stats, recentLogs, recentUsers }) {
  const card = (value, label, warn = false) =>
    `<div class="stat-card ${warn ? 'stat-card-warn' : ''}"><span class="stat-card-value">${esc(value)}</span><span class="stat-card-label">${esc(label)}</span></div>`;

  const body = `
<div class="section admin-page">
  <div class="container">
    ${head(ctx, 'Dashboard')}
    <div class="stat-cards">
      ${card(stats.users, 'Users')}
      ${card(stats.sessions, 'Active sessions')}
      ${card(stats.threads, 'Threads')}
      ${card(stats.posts, 'Posts')}
      ${card(stats.downloads, 'Downloads')}
      ${card(stats.signups24h, 'Signups (24h)')}
      ${card(stats.failedLogins24h, 'Failed logins (24h)', stats.failedLogins24h > 20)}
      ${card(stats.banned, 'Banned users', stats.banned > 0)}
      ${card(stats.ipBans, 'IP bans', stats.ipBans > 0)}
      ${card(stats.openReports, 'Open reports', stats.openReports > 0)}
    </div>
    <div class="admin-columns">
      <div class="panel">
        <div class="panel-head"><h2>Latest activity</h2><a class="muted" href="/admin/logs">All logs →</a></div>
        <div class="table-wrap"><table>
          <thead><tr><th>Event</th><th>User</th><th>IP</th><th>When</th></tr></thead>
          <tbody>${map(recentLogs, logRow)}</tbody></table></div>
      </div>
      <div class="panel">
        <div class="panel-head"><h2>Newest users</h2><a class="muted" href="/admin/users">All users →</a></div>
        <div class="table-wrap"><table>
          <thead><tr><th>User</th><th>Signup IP</th><th>Joined</th></tr></thead>
          <tbody>${map(recentUsers, (u) => `<tr>
            <td>${esc(u.username)}${tierTag(u.tier)}
              ${u.banned ? '<span class="tag tag-banned">BANNED</span>' : ''}</td>
            <td class="mono">${esc(u.signup_ip || '—')}</td>
            <td class="muted">${esc(timeAgo(u.created_at))}</td></tr>`)}
          </tbody></table></div>
      </div>
    </div>
  </div>
</div>`;
  return page(ctx, { title: 'Admin · Dashboard', body });
}

function users(ctx, { users: rows, q, page: current, pages, total, tiers, tierLabels }) {
  const csrf = `<input type="hidden" name="_csrf" value="${esc(ctx.csrfToken)}">`;
  const canManageTiers = isFullAdmin(ctx.user);

  const actions = (u) => {
    if (u.id === ctx.user.id) return '<span class="muted">you</span>';
    const banBtn = u.banned
      ? `<form method="post" action="/admin/users/${esc(u.id)}/unban" class="inline-form">${csrf}<button class="btn btn-ghost btn-xs" type="submit">Unban</button></form>`
      : `<form method="post" action="/admin/users/${esc(u.id)}/ban" class="inline-form" data-confirm="Ban ${esc(u.username)}? They will be signed out everywhere.">${csrf}<button class="btn btn-warn btn-xs" type="submit">Ban</button></form>`;

    if (!canManageTiers) return banBtn;

    const tierSelect = `<form method="post" action="/admin/users/${esc(u.id)}/tier" class="inline-form"
          data-confirm="Set ${esc(u.username)}'s tier to the selected value?">${csrf}
        <select name="tier" aria-label="Tier for ${esc(u.username)}">
          ${map(tiers, (t) => `<option value="${esc(t)}" ${u.tier === t ? 'selected' : ''}>${esc(tierLabels[t] || t)}</option>`)}
        </select>
        <button class="btn btn-ghost btn-xs" type="submit">Set</button></form>`;

    return `${banBtn} ${tierSelect}
      <form method="post" action="/admin/users/${esc(u.id)}/delete" class="inline-form"
            data-confirm="Permanently delete ${esc(u.username)}? Their threads and posts stay on the forum, reattributed to [deleted].">${csrf}
        <button class="btn btn-danger btn-xs" type="submit">Delete</button></form>`;
  };

  const body = `
<div class="section admin-page">
  <div class="container">
    ${head(ctx, 'Users')}
    <form method="get" action="/admin/users" class="filter-bar">
      <input type="search" name="q" value="${esc(q)}" aria-label="Search users by username, email or IP"
             placeholder="Search username, email or IP…">
      <button class="btn btn-outline" type="submit">Search</button>
      ${q ? '<a class="btn btn-ghost" href="/admin/users">Clear</a>' : ''}
      <span class="muted">${esc(total)} user${total === 1 ? '' : 's'}</span>
    </form>
    ${!canManageTiers ? '<p class="muted">Tier changes and account deletion require full Admin access.</p>' : ''}
    <div class="panel"><div class="table-wrap"><table>
      <thead><tr><th>User</th><th>Email</th><th>Signup IP</th><th>Last login</th><th>Posts</th><th>Actions</th></tr></thead>
      <tbody>${map(rows, (u) => `<tr class="${u.banned ? 'row-banned' : ''}">
        <td><strong>${esc(u.username)}</strong>${tierTag(u.tier)}
          ${u.banned ? '<span class="tag tag-banned">BANNED</span>' : ''}
          <div class="muted">#${esc(u.id)} · joined ${esc(timeAgo(u.created_at))}</div></td>
        <td>${esc(u.email)}</td>
        <td class="mono">${esc(u.signup_ip || '—')}</td>
        <td><span class="mono">${esc(u.last_login_ip || '—')}</span><div class="muted">${esc(timeAgo(u.last_login_at))}</div></td>
        <td>${esc(u.post_count)}</td>
        <td class="actions-cell">${actions(u)}</td></tr>`)}
      </tbody></table></div></div>
    ${pagination(current, pages, (p) => `/admin/users?page=${p}&q=${encodeURIComponent(q)}`)}
  </div>
</div>`;
  return page(ctx, { title: 'Admin · Users', body });
}

function logs(ctx, { logs: rows, q, event, events, page: current, pages, total, ipBans }) {
  const csrf = `<input type="hidden" name="_csrf" value="${esc(ctx.csrfToken)}">`;
  const banForm = (ip) => `<form method="post" action="/admin/ip-bans/${encodeURIComponent(ip)}/unban" class="inline-form"
        data-confirm="Unban ${esc(ip)}?">${csrf}
      <button class="btn btn-ghost btn-xs" type="submit">Unban</button></form>`;

  const body = `
<div class="section admin-page">
  <div class="container">
    ${head(ctx, 'IP logs')}
    <form method="get" action="/admin/logs" class="filter-bar">
      <select name="event" aria-label="Filter by event type">
        <option value="">All events</option>
        ${map(events, (e) => `<option value="${esc(e)}" ${event === e ? 'selected' : ''}>${esc(e)}</option>`)}
      </select>
      <input type="search" name="q" value="${esc(q)}" aria-label="Filter logs by IP, username or detail"
             placeholder="Filter by IP, username or detail…">
      <button class="btn btn-outline" type="submit">Filter</button>
      ${q || event ? '<a class="btn btn-ghost" href="/admin/logs">Clear</a>' : ''}
      <span class="muted">${esc(total)} entr${total === 1 ? 'y' : 'ies'}</span>
    </form>
    <div class="panel"><div class="table-wrap"><table>
      <thead><tr><th>#</th><th>Event</th><th>User</th><th>IP address</th><th>Detail</th><th>User agent</th><th>When</th><th></th></tr></thead>
      <tbody>${rows.length === 0
        ? '<tr><td colspan="8" class="muted center">No log entries match.</td></tr>'
        : map(rows, (l) => `<tr>
            <td class="muted">${esc(l.id)}</td>
            <td><span class="tag tag-event tag-${esc(l.event)}">${esc(l.event)}</span></td>
            <td>${esc(l.username || '—')}</td>
            <td class="mono">${l.ipHidden
              ? `<span class="muted" title="Admin accounts' IPs are hidden from other staff">${esc(l.ip)}</span>`
              : `<a href="/admin/logs?q=${encodeURIComponent(l.ip)}">${esc(l.ip)}</a>`}</td>
            <td class="muted detail-cell">${esc(l.detail || '—')}</td>
            <td class="muted ua-cell" title="${esc(l.ipHidden ? '' : l.user_agent || '')}">${esc(String(l.user_agent || '—').slice(0, 60))}</td>
            <td class="muted nowrap">${esc(l.created_at)} UTC</td>
            <td class="actions-cell">${l.ipHidden ? '' : `<form method="post" action="/admin/ip-bans" class="inline-form"
                  data-confirm="Ban ${esc(l.ip)} from GoyHub entirely?">${csrf}
                <input type="hidden" name="ip" value="${esc(l.ip)}">
                <button class="btn btn-warn btn-xs" type="submit">Ban IP</button></form>`}</td></tr>`)}
      </tbody></table></div></div>
    ${pagination(current, pages, (p) => `/admin/logs?page=${p}&event=${encodeURIComponent(event)}&q=${encodeURIComponent(q)}`)}

    <div class="panel panel-spaced">
      <div class="panel-head"><h2>IP bans</h2></div>
      <div class="table-wrap"><table>
        <thead><tr><th>IP</th><th>Reason</th><th>Banned by</th><th>Type</th><th>Since</th><th></th></tr></thead>
        <tbody>${ipBans.length === 0
          ? '<tr><td colspan="6" class="muted center">No IPs currently banned.</td></tr>'
          : map(ipBans, (b) => `<tr>
              <td class="mono">${esc(b.ip)}</td>
              <td class="muted detail-cell">${esc(b.reason || '—')}</td>
              <td class="muted">${esc(b.banned_by || '—')}</td>
              <td class="muted nowrap">${b.expires_at
                ? `auto · lifts in ${esc(Math.max(1, Math.ceil((Number(b.expires_at) - Date.now()) / 60000)))}m`
                : 'permanent'}</td>
              <td class="muted nowrap">${esc(timeAgo(b.created_at))}</td>
              <td class="actions-cell">${banForm(b.ip)}</td></tr>`)}
        </tbody></table></div>
      <form method="post" action="/admin/ip-bans" class="stack panel-form">
        <h3>Ban an IP manually</h3>${csrf}
        <label><span>IP address</span><input type="text" name="ip" required maxlength="64" placeholder="203.0.113.42"></label>
        <label><span>Reason (optional)</span><input type="text" name="reason" maxlength="300"></label>
        <button class="btn btn-warn btn-sm" type="submit">Ban</button>
      </form>
    </div>
  </div>
</div>`;
  return page(ctx, { title: 'Admin · IP logs', body });
}

function reports(ctx, { reports: rows }) {
  const csrf = `<input type="hidden" name="_csrf" value="${esc(ctx.csrfToken)}">`;
  const row = (r) => {
    const postCell = r.post_body === null || r.post_body === undefined
      ? '<span class="muted">(post has been deleted)</span>'
      : `<a href="/forum/t/${esc(r.thread_id)}#post-${esc(r.post_id)}">${esc(r.thread_title || 'thread')}</a>
         <div class="muted detail-cell" title="${esc(String(r.post_body).slice(0, 500))}">${esc(String(r.post_body).slice(0, 100))}${String(r.post_body).length > 100 ? '…' : ''}</div>
         <div class="muted">by ${esc(r.author || '—')}</div>`;
    const actions = r.status === 'open'
      ? `<form method="post" action="/admin/reports/${esc(r.id)}/resolve" class="inline-form">${csrf}
           <button class="btn btn-ghost btn-xs" type="submit">Resolve</button></form>
         ${r.post_body !== null && r.post_body !== undefined
          ? `<form method="post" action="/admin/posts/${esc(r.post_id)}/delete" class="inline-form"
                data-confirm="Delete the reported post?">${csrf}
              <button class="btn btn-danger btn-xs" type="submit">Delete post</button></form>` : ''}`
      : `<span class="muted">by ${esc(r.resolved_by || '—')} · ${esc(timeAgo(r.resolved_at))}</span>`;
    return `<tr class="${r.status === 'open' ? '' : 'row-resolved'}">
      <td class="muted">${esc(r.id)}</td>
      <td><span class="tag ${r.status === 'open' ? 'tag-report-open' : 'tag-report-resolved'}">${esc(r.status.toUpperCase())}</span></td>
      <td>${postCell}</td>
      <td class="detail-cell" title="${esc(r.reason)}">${esc(r.reason)}</td>
      <td>${esc(r.reporter)}</td>
      <td class="muted nowrap">${esc(timeAgo(r.created_at))}</td>
      <td class="actions-cell">${actions}</td></tr>`;
  };

  const body = `
<div class="section admin-page">
  <div class="container">
    ${head(ctx, 'Reports')}
    <p class="muted">Member reports on forum posts. Resolve once handled — deleting the reported post
      does not auto-resolve the report, so the paper trail stays intact.</p>
    <div class="panel"><div class="table-wrap"><table>
      <thead><tr><th>#</th><th>Status</th><th>Reported post</th><th>Reason</th><th>Reporter</th><th>When</th><th>Actions</th></tr></thead>
      <tbody>${rows.length === 0
        ? '<tr><td colspan="7" class="muted center">No reports. Quiet day.</td></tr>'
        : map(rows, row)}
      </tbody></table></div></div>
  </div>
</div>`;
  return page(ctx, { title: 'Admin · Reports', body });
}

function forumAdmin(ctx, { categories, threads }) {
  const csrf = `<input type="hidden" name="_csrf" value="${esc(ctx.csrfToken)}">`;
  const canManageCategories = isFullAdmin(ctx.user);
  const body = `
<div class="section admin-page">
  <div class="container">
    ${head(ctx, 'Forum management')}
    <div class="admin-columns">
      <div class="panel">
        <div class="panel-head"><h2>Categories</h2></div>
        <div class="table-wrap"><table>
          <thead><tr><th>Name</th><th>Slug</th><th>Threads</th><th></th></tr></thead>
          <tbody>${map(categories, (c) => `<tr>
            <td><strong>${esc(c.name)}</strong><div class="muted">${esc(c.description)}</div></td>
            <td class="mono">${esc(c.slug)}</td>
            <td>${esc(c.thread_count)}</td>
            <td class="actions-cell">${canManageCategories ? `
              <form method="post" action="/admin/categories/${esc(c.id)}/delete" class="inline-form"
                    data-confirm="Delete category '${esc(c.name)}' and ALL ${esc(c.thread_count)} of its threads?">${csrf}
                <button class="btn btn-danger btn-xs" type="submit">Delete</button></form>` : ''}</td></tr>`)}
          </tbody></table></div>
        ${canManageCategories ? `
        <form method="post" action="/admin/categories" class="stack panel-form">
          <h3>Add category</h3>${csrf}
          <label><span>Name</span><input type="text" name="name" required minlength="2" maxlength="50"></label>
          <label><span>Description</span><input type="text" name="description" maxlength="300"></label>
          <button class="btn btn-primary btn-sm" type="submit">Create</button>
        </form>` : '<p class="muted panel-form">Creating and deleting categories requires full Admin access.</p>'}
      </div>
      <div class="panel">
        <div class="panel-head"><h2>Latest threads</h2></div>
        <div class="table-wrap"><table>
          <thead><tr><th>Thread</th><th>Posts</th><th>Actions</th></tr></thead>
          <tbody>${map(threads, (t) => `<tr>
            <td><a href="/forum/t/${esc(t.id)}">${esc(t.title)}</a>
              ${t.pinned ? '<span class="tag tag-pin">PIN</span>' : ''}
              ${t.locked ? '<span class="tag tag-lock">LOCK</span>' : ''}
              <div class="muted">${esc(t.category_name)} · ${esc(t.username)} · ${esc(timeAgo(t.updated_at))}</div></td>
            <td>${esc(t.post_count)}</td>
            <td class="actions-cell">
              <form method="post" action="/admin/threads/${esc(t.id)}/pin" class="inline-form">${csrf}
                <button class="btn btn-ghost btn-xs" type="submit">${t.pinned ? 'Unpin' : 'Pin'}</button></form>
              <form method="post" action="/admin/threads/${esc(t.id)}/lock" class="inline-form">${csrf}
                <button class="btn btn-ghost btn-xs" type="submit">${t.locked ? 'Unlock' : 'Lock'}</button></form>
              <form method="post" action="/admin/threads/${esc(t.id)}/delete" class="inline-form"
                    data-confirm="Delete thread '${esc(t.title)}' and all replies?">${csrf}
                <button class="btn btn-danger btn-xs" type="submit">Delete</button></form></td></tr>`)}
          </tbody></table></div>
      </div>
    </div>
  </div>
</div>`;
  return page(ctx, { title: 'Admin · Forum', body });
}

export { dashboard, users, logs, reports, forumAdmin };
