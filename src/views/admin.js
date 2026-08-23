'use strict';

const { page } = require('./layout');
const { esc, timeAgo, map, pagination } = require('./util');

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
            <td>${esc(u.username)}
              ${u.role === 'admin' ? '<span class="tag tag-admin">ADMIN</span>' : ''}
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

function users(ctx, { users: rows, q, page: current, pages, total }) {
  const csrf = `<input type="hidden" name="_csrf" value="${esc(ctx.csrfToken)}">`;

  const actions = (u) => {
    if (u.id === ctx.user.id) return '<span class="muted">you</span>';
    const banBtn = u.banned
      ? `<form method="post" action="/admin/users/${esc(u.id)}/unban" class="inline-form">${csrf}<button class="btn btn-ghost btn-xs" type="submit">Unban</button></form>`
      : `<form method="post" action="/admin/users/${esc(u.id)}/ban" class="inline-form" data-confirm="Ban ${esc(u.username)}? They will be signed out everywhere.">${csrf}<button class="btn btn-warn btn-xs" type="submit">Ban</button></form>`;
    const roleLabel = u.role === 'admin' ? 'Demote' : 'Promote';
    const roleConfirm = u.role === 'admin'
      ? `Remove admin rights from ${u.username}?`
      : `Make ${u.username} an admin?`;
    return `${banBtn}
      <form method="post" action="/admin/users/${esc(u.id)}/role" class="inline-form" data-confirm="${esc(roleConfirm)}">${csrf}
        <button class="btn btn-ghost btn-xs" type="submit">${roleLabel}</button></form>
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
    <div class="panel"><div class="table-wrap"><table>
      <thead><tr><th>User</th><th>Email</th><th>Signup IP</th><th>Last login</th><th>Posts</th><th>Actions</th></tr></thead>
      <tbody>${map(rows, (u) => `<tr class="${u.banned ? 'row-banned' : ''}">
        <td><strong>${esc(u.username)}</strong>
          ${u.role === 'admin' ? '<span class="tag tag-admin">ADMIN</span>' : ''}
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

function logs(ctx, { logs: rows, q, event, events, page: current, pages, total }) {
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
      <thead><tr><th>#</th><th>Event</th><th>User</th><th>IP address</th><th>Detail</th><th>User agent</th><th>When</th></tr></thead>
      <tbody>${rows.length === 0
        ? '<tr><td colspan="7" class="muted center">No log entries match.</td></tr>'
        : map(rows, (l) => `<tr>
            <td class="muted">${esc(l.id)}</td>
            <td><span class="tag tag-event tag-${esc(l.event)}">${esc(l.event)}</span></td>
            <td>${esc(l.username || '—')}</td>
            <td class="mono"><a href="/admin/logs?q=${encodeURIComponent(l.ip)}">${esc(l.ip)}</a></td>
            <td class="muted detail-cell">${esc(l.detail || '—')}</td>
            <td class="muted ua-cell" title="${esc(l.user_agent || '')}">${esc(String(l.user_agent || '—').slice(0, 60))}</td>
            <td class="muted nowrap">${esc(l.created_at)} UTC</td></tr>`)}
      </tbody></table></div></div>
    ${pagination(current, pages, (p) => `/admin/logs?page=${p}&event=${encodeURIComponent(event)}&q=${encodeURIComponent(q)}`)}
  </div>
</div>`;
  return page(ctx, { title: 'Admin · IP logs', body });
}

function forumAdmin(ctx, { categories, threads }) {
  const csrf = `<input type="hidden" name="_csrf" value="${esc(ctx.csrfToken)}">`;
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
            <td class="actions-cell">
              <form method="post" action="/admin/categories/${esc(c.id)}/delete" class="inline-form"
                    data-confirm="Delete category '${esc(c.name)}' and ALL ${esc(c.thread_count)} of its threads?">${csrf}
                <button class="btn btn-danger btn-xs" type="submit">Delete</button></form></td></tr>`)}
          </tbody></table></div>
        <form method="post" action="/admin/categories" class="stack panel-form">
          <h3>Add category</h3>${csrf}
          <label><span>Name</span><input type="text" name="name" required minlength="2" maxlength="50"></label>
          <label><span>Description</span><input type="text" name="description" maxlength="300"></label>
          <button class="btn btn-primary btn-sm" type="submit">Create</button>
        </form>
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

module.exports = { dashboard, users, logs, forumAdmin };
