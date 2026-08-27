import { page } from "./layout.js";
import { esc, timeAgo, map, pagination } from "./util.js";
import { TIER_LABELS, STAFF_TIERS, isFullAdmin } from "../tiers.js";

const tierTag = (tier) => tier && tier !== 'user'
  ? ` <span class="tag tag-tier tag-tier-${esc(tier)}">${esc(TIER_LABELS[tier] || tier)}</span>` : '';

function head(ctx, heading) {
  const tab = (href, label, active) => `<a href="${href}" class="${active ? 'active' : ''}">${label}</a>`;
  const p = ctx.path;
  return `<div class="page-head">
    <div><h1 class="section-title">${esc(heading)}</h1></div>
  </div>
  <nav class="admin-tabs" aria-label="Admin sections">
    ${tab('/admin', 'Dashboard', p === '/admin')}
    ${tab('/admin/users', 'Users', p.startsWith('/admin/users'))}
    ${tab('/admin/payments', 'Payments', p.startsWith('/admin/payments'))}
    ${tab('/admin/logs', 'IP logs', p.startsWith('/admin/logs'))}
    ${tab('/admin/fingerprints', 'Fingerprints', p.startsWith('/admin/fingerprints'))}
    ${tab('/admin/reports', 'Reports', p.startsWith('/admin/reports'))}
    ${tab('/admin/forum', 'Forum', p.startsWith('/admin/forum'))}
  </nav>`;
}

const logRow = (l) => `<tr>
  <td><span class="tag tag-event tag-${esc(l.event)}">${esc(l.event)}</span></td>
  <td>${esc(l.username || '-')}</td>
  <td class="mono">${esc(l.ip)}</td>
  <td class="muted">${esc(timeAgo(l.created_at))}</td></tr>`;

function dashboard(ctx, { stats, recentLogs, recentUsers }) {
  const card = (value, label, warn = false) =>
    `<div class="stat-card ${warn ? 'stat-card-warn' : ''}"><span class="stat-card-value">${esc(value)}</span><span class="stat-card-label">${esc(label)}</span></div>`;

  const announcementForm = isFullAdmin(ctx.user) ? `
      <div class="panel panel-spaced">
        <form method="post" action="/admin/announcement" class="stack panel-form">
          <h3>Site announcement</h3>
          <p class="muted">Shown as a banner on every page until a visitor dismisses it. Leave empty and save to clear.</p>
          <input type="hidden" name="_csrf" value="${esc(ctx.csrfToken)}">
          <label><span>Message</span>
            <input type="text" name="announcement" maxlength="500" value="${esc(ctx.announcement || '')}"
                   placeholder="e.g. v1.1 is out: restart GoyHub to update!"></label>
          <button class="btn btn-primary btn-sm" type="submit">${ctx.announcement ? 'Update' : 'Publish'}</button>
        </form>
      </div>` : '';

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
      ${card(stats.fingerprints, 'Fingerprints')}
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
            <td class="mono">${esc(u.signup_ip || '-')}</td>
            <td class="muted">${esc(timeAgo(u.created_at))}</td></tr>`)}
          </tbody></table></div>
      </div>
    </div>
    ${announcementForm}
  </div>
</div>`;
  return page(ctx, { title: 'Admin · Dashboard', body });
}

function users(ctx, { users: rows, q, page: current, pages, total, tiers, tierLabels }) {
  const csrf = `<input type="hidden" name="_csrf" value="${esc(ctx.csrfToken)}">`;
  const canManageTiers = isFullAdmin(ctx.user);
  const DAY = 86_400_000;

  const subCell = (u) => {
    if (u.tier !== 'paid') return '<span class="muted">-</span>';
    let state;
    if (u.paid_until === null || u.paid_until === undefined) {
      state = '<strong>Lifetime</strong>';
    } else if (Number(u.paid_until) <= Date.now()) {
      state = '<span class="tag tag-banned">EXPIRED</span>';
    } else {
      const left = Math.ceil((Number(u.paid_until) - Date.now()) / DAY);
      state = `<strong>${esc(left)}d</strong> <span class="muted">left · ends ${esc(new Date(Number(u.paid_until)).toISOString().slice(0, 10))}</span>`;
    }
    const adjust = canManageTiers && u.id !== ctx.user.id ? `
      <form method="post" action="/admin/users/${esc(u.id)}/paid-days" class="inline-form sub-adjust">${csrf}
        <input type="number" name="delta_days" min="-3650" max="3650" required placeholder="±days"
               aria-label="Adjust days for ${esc(u.username)}">
        <button class="btn btn-ghost btn-xs" type="submit">Apply</button></form>` : '';
    return `${state}${adjust}`;
  };

  const actions = (u) => {
    const profileLink = `<a class="btn btn-ghost btn-xs" href="/u/${encodeURIComponent(u.username)}">Profile</a>`;
    const fpLink = `<a class="btn btn-ghost btn-xs" href="/admin/fingerprints?q=${encodeURIComponent(u.username)}">Fingerprints</a>`;
    if (u.id === ctx.user.id) return `<span class="muted">you</span> ${profileLink} ${fpLink}`;
    const banBtn = u.banned
      ? `<form method="post" action="/admin/users/${esc(u.id)}/unban" class="inline-form">${csrf}<button class="btn btn-ghost btn-xs" type="submit">Unban</button></form>`
      : `<form method="post" action="/admin/users/${esc(u.id)}/ban" class="inline-form" data-confirm="Ban ${esc(u.username)}? They will be signed out everywhere.">${csrf}<button class="btn btn-warn btn-xs" type="submit">Ban</button></form>`;

    if (!canManageTiers) return `${profileLink} ${fpLink} ${banBtn}`;

    const manage = `<details class="admin-user-tools"><summary class="muted">Manage</summary>
      <form method="post" action="/admin/users/${esc(u.id)}/tier" class="inline-form"
            data-confirm="Set ${esc(u.username)}'s tier to the selected value?">${csrf}
        <select name="tier" aria-label="Tier for ${esc(u.username)}">
          ${map(tiers, (t) => `<option value="${esc(t)}" ${u.tier === t ? 'selected' : ''}>${esc(tierLabels[t] || t)}</option>`)}
        </select>
        <input type="number" name="paid_days" min="1" max="3650" placeholder="days"
               title="Paid duration in days; leave empty for lifetime (Paid tier only)" class="paid-days-input">
        <button class="btn btn-ghost btn-xs" type="submit">Set tier</button></form>
      <form method="post" action="/admin/users/${esc(u.id)}/password" class="inline-form"
            data-confirm="Set a new password for ${esc(u.username)}? Their sessions will be signed out.">${csrf}
        <input type="password" name="password" minlength="8" maxlength="128" required
               placeholder="new password" aria-label="New password for ${esc(u.username)}" autocomplete="new-password">
        <button class="btn btn-warn btn-xs" type="submit">Set password</button></form>
      <form method="post" action="/admin/users/${esc(u.id)}/uid" class="inline-form"
            data-confirm="Move ${esc(u.username)} to the entered UID?">${csrf}
        <input type="number" name="uid" min="0" max="1001" required placeholder="UID 0–1001"
               aria-label="New UID for ${esc(u.username)}">
        <button class="btn btn-ghost btn-xs" type="submit">Set UID</button></form>
      <form method="post" action="/admin/users/${esc(u.id)}/delete" class="inline-form"
            data-confirm="Permanently delete ${esc(u.username)}? Their threads and posts stay on the forum, reattributed to [deleted].">${csrf}
        <button class="btn btn-danger btn-xs" type="submit">Delete</button></form>
    </details>`;

    return `${profileLink} ${fpLink} ${banBtn} ${manage}`;
  };

  const massPanel = canManageTiers ? `
    <div class="panel sub-mass-panel">
      <form method="post" action="/admin/subscriptions/adjust" class="filter-bar panel-form"
            data-confirm="Adjust EVERY dated Paid subscription by the entered number of days?">${csrf}
        <strong>All subscriptions:</strong>
        <input type="number" name="delta_days" min="-3650" max="3650" required placeholder="±days"
               aria-label="Days to add to every dated Paid subscription" class="paid-days-input">
        <button class="btn btn-outline btn-sm" type="submit">Apply to all Paid</button>
        <span class="muted">Positive extends, negative shortens. Lifetime subscriptions are untouched.</span>
      </form>
    </div>` : '';

  const body = `
<div class="section admin-page">
  <div class="container admin-narrow">
    ${head(ctx, 'Users')}
    <form method="get" action="/admin/users" class="filter-bar">
      <input type="search" name="q" value="${esc(q)}" aria-label="Search users by username, email or IP"
             placeholder="Search username, email or IP…">
      <button class="btn btn-outline" type="submit">Search</button>
      ${q ? '<a class="btn btn-ghost" href="/admin/users">Clear</a>' : ''}
      <span class="muted">${esc(total)} user${total === 1 ? '' : 's'}</span>
    </form>
    ${massPanel}
    ${!canManageTiers ? '<p class="muted">Tier changes, subscriptions and account tools require full Admin access.</p>' : ''}
    <div class="panel users-table"><div class="table-wrap"><table>
      <thead><tr><th>User</th><th>IPs</th><th>Subscription</th><th>Actions</th></tr></thead>
      <tbody>${map(rows, (u) => `<tr class="${u.banned ? 'row-banned' : ''}">
        <td><strong>${esc(u.username)}</strong>${tierTag(u.tier)}
          ${u.banned ? '<span class="tag tag-banned">BANNED</span>' : ''}
          <div class="muted"><span class="uid-badge${u.id <= 1001 ? ' uid-reserved' : ''}">UID ${esc(u.id)}</span>
            · joined ${esc(timeAgo(u.created_at))}</div>
          <div class="muted">${esc(u.email)} ${u.email_verified_at ? '✓' : '<span title="email unverified">✗</span>'}</div></td>
        <td><div class="mono">${esc(u.signup_ip || '-')}</div>
          <div class="mono muted">${esc(u.last_login_ip || '-')}</div>
          <div class="muted">${esc(timeAgo(u.last_login_at))}</div></td>
        <td class="sub-cell">${subCell(u)}</td>
        <td class="actions-cell">${actions(u)}</td></tr>`)}
      </tbody></table></div></div>
    ${pagination(current, pages, (p) => `/admin/users?page=${p}&q=${encodeURIComponent(q)}`)}
  </div>
</div>`;
  return page(ctx, { title: 'Admin · Users', body });
}

/**
 * Crypto payments queue. Read-only for staff; the "Credit" button is full admin
 * only, because it grants a paid membership without a confirmed payment.
 * "Re-check" is staff-level — it only ever applies BTCPay's own verdict.
 */
function payments(ctx, { rows, status, statuses, page: current, pages, total, live, swept }) {
  const csrf = `<input type="hidden" name="_csrf" value="${esc(ctx.csrfToken)}">`;
  const canCredit = isFullAdmin(ctx.user);

  const row = (p) => `<tr class="${p.credited_at ? 'row-resolved' : ''}">
    <td class="mono detail-cell" title="${esc(p.order_id)}">${esc(String(p.order_id).slice(0, 10))}…</td>
    <td>${p.username ? esc(p.username) : '<span class="muted">(gone)</span>'}</td>
    <td>${esc(p.plan_name || 'Paid membership')}
      <div class="muted">${esc(p.period_days ? `${p.period_days} days` : 'lifetime')}</div></td>
    <td class="nowrap">${esc(p.amount)} ${esc(p.currency)}</td>
    <td><span class="tag tag-pay tag-pay-${esc(p.status)}">${esc(p.status)}</span>
      ${p.credited_at ? '<span class="tag tag-report-resolved">CREDITED</span>' : ''}</td>
    <td class="mono detail-cell" title="${esc(p.invoice_id || '')}">${esc(p.invoice_id || '—')}</td>
    <td class="muted nowrap">${esc(timeAgo(p.created_at))}</td>
    <td class="actions-cell">
      ${live && p.invoice_id && !p.credited_at ? `<form method="post" action="/admin/payments/${esc(p.id)}/recheck" class="inline-form">${csrf}
        <button class="btn btn-ghost btn-xs" type="submit">Re-check</button></form>` : ''}
      ${canCredit && !p.credited_at ? `<form method="post" action="/admin/payments/${esc(p.id)}/credit" class="inline-form"
        data-confirm="Grant this membership without a confirmed payment?">${csrf}
        <button class="btn btn-warn btn-xs" type="submit">Credit</button></form>` : ''}
    </td></tr>`;

  const body = `
<div class="section admin-page">
  <div class="container">
    ${head(ctx, 'Payments')}
    ${live
      ? `<p class="muted">Unfinished payments are re-checked against BTCPay automatically — when a buyer
          opens the store or their profile, when they return from checkout, and in a small sweep each time
          this page loads${swept ? ` (${esc(swept)} re-checked just now)` : ''}. Nothing here needs a human
          unless a payment is stuck.</p>`
      : '<p class="muted">BTCPay is not configured, so no invoices can be created or re-checked.</p>'}
    <form class="filter-bar" method="get" action="/admin/payments">
      <select name="status" aria-label="Filter by status">
        <option value="">All statuses</option>
        ${map(statuses, (st) => `<option value="${esc(st)}" ${status === st ? 'selected' : ''}>${esc(st)}</option>`)}
      </select>
      <button class="btn btn-outline btn-sm" type="submit">Filter</button>
      ${status ? '<a class="btn btn-ghost btn-sm" href="/admin/payments">Clear</a>' : ''}
      <span class="muted">${esc(total)} payment${total === 1 ? '' : 's'}</span>
    </form>
    <div class="panel"><div class="table-wrap"><table>
      <thead><tr><th>Order</th><th>User</th><th>Plan</th><th>Amount</th><th>Status</th><th>Invoice</th><th>Started</th><th></th></tr></thead>
      <tbody>${rows.length ? map(rows, row) : '<tr><td colspan="8" class="muted center">No payments yet.</td></tr>'}</tbody>
    </table></div></div>
    ${pagination(current, pages, (n) => `/admin/payments?${new URLSearchParams({ ...(status ? { status } : {}), page: String(n) })}`)}
  </div>
</div>`;
  return page(ctx, { title: 'Admin · Payments', body });
}

function logs(ctx, { logs: rows, q, event, events, important, page: current, pages, total, ipBans }) {
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
      <label class="filter-check" title="Hide routine/high-volume events (logins, downloads, shout deletions…)">
        <input type="checkbox" name="important" value="1" ${important ? 'checked' : ''}> Important only
      </label>
      <button class="btn btn-outline" type="submit">Filter</button>
      ${q || event || important ? '<a class="btn btn-ghost" href="/admin/logs">Clear</a>' : ''}
      <span class="muted">${esc(total)} entr${total === 1 ? 'y' : 'ies'}</span>
    </form>
    <div class="panel"><div class="table-wrap"><table>
      <thead><tr><th>#</th><th>Event</th><th>User</th><th>IP address</th><th>Detail</th><th>User agent</th><th>When</th><th></th></tr></thead>
      <tbody>${rows.length === 0
        ? '<tr><td colspan="8" class="muted center">No log entries match.</td></tr>'
        : map(rows, (l) => `<tr>
            <td class="muted">${esc(l.id)}</td>
            <td><span class="tag tag-event tag-${esc(l.event)}">${esc(l.event)}</span></td>
            <td>${esc(l.username || '-')}</td>
            <td class="mono">${l.ipHidden
              ? `<span class="muted" title="Admin accounts' IPs are hidden from other staff">${esc(l.ip)}</span>`
              : `<a href="/admin/logs?q=${encodeURIComponent(l.ip)}">${esc(l.ip)}</a>`}</td>
            <td class="muted detail-cell">${esc(l.detail || '-')}</td>
            <td class="muted ua-cell" title="${esc(l.ipHidden ? '' : l.user_agent || '')}">${esc(String(l.user_agent || '-').slice(0, 60))}</td>
            <td class="muted nowrap">${esc(l.created_at)} UTC</td>
            <td class="actions-cell">${l.ipHidden ? '' : `<form method="post" action="/admin/ip-bans" class="inline-form"
                  data-confirm="Ban ${esc(l.ip)} from GoyHub entirely?">${csrf}
                <input type="hidden" name="ip" value="${esc(l.ip)}">
                <button class="btn btn-warn btn-xs" type="submit">Ban IP</button></form>`}</td></tr>`)}
      </tbody></table></div></div>
    ${pagination(current, pages, (p) => `/admin/logs?page=${p}&event=${encodeURIComponent(event)}&q=${encodeURIComponent(q)}${important ? '&important=1' : ''}`)}

    <div class="panel panel-spaced">
      <div class="panel-head"><h2>IP bans</h2></div>
      <div class="table-wrap"><table>
        <thead><tr><th>IP</th><th>Reason</th><th>Banned by</th><th>Type</th><th>Since</th><th></th></tr></thead>
        <tbody>${ipBans.length === 0
          ? '<tr><td colspan="6" class="muted center">No IPs currently banned.</td></tr>'
          : map(ipBans, (b) => `<tr>
              <td class="mono">${esc(b.ip)}</td>
              <td class="muted detail-cell">${esc(b.reason || '-')}</td>
              <td class="muted">${esc(b.banned_by || '-')}</td>
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

const fpBadge = (device) => `<span class="tag tag-device">${esc(device || 'Unknown')}</span>`;

function fingerprintRow(f) {
  const shortHash = String(f.fp_hash).slice(0, 12);
  return `<tr>
    <td><a class="mono" href="/admin/fingerprints/${encodeURIComponent(f.fp_hash)}">${esc(shortHash)}</a>
      <div class="muted">${esc(f.sightings)} sighting${Number(f.sightings) === 1 ? '' : 's'}${Number(f.user_count) > 0 ? ` · ${esc(f.user_count)} account${Number(f.user_count) === 1 ? '' : 's'}` : ''}</div></td>
    <td>${fpBadge(f.device)}</td>
    <td>${esc(f.browser || '-')}</td>
    <td>${esc(f.os || '-')}</td>
    <td class="mono">${esc(f.screen || '-')}</td>
    <td class="muted">${esc(f.language || '-')} · ${esc(f.timezone || '-')}</td>
    <td>${f.username ? esc(f.username) : '<span class="muted">anonymous</span>'}
      ${f.email ? `<div class="muted">${esc(f.email)}</div>` : ''}</td>
    <td class="mono">${f.ipHidden
      ? `<span class="muted" title="Admin accounts' IPs are hidden from other staff">${esc(f.ip)}</span>`
      : `<a href="/admin/fingerprints?q=${encodeURIComponent(f.ip)}">${esc(f.ip)}</a>`}</td>
    <td class="muted nowrap">${esc(timeAgo(f.last_seen))}</td>
    <td class="actions-cell"><a class="btn btn-ghost btn-xs" href="/admin/fingerprints/${encodeURIComponent(f.fp_hash)}">View log</a></td></tr>`;
}

function fingerprints(ctx, { rows, q, page: current, pages, total }) {
  const body = `
<div class="section admin-page">
  <div class="container">
    ${head(ctx, 'Fingerprints')}
    <p class="muted">Every visitor's browser reports a device fingerprint (device type, browser, OS, screen,
      language, timezone and a canvas-rendering signature) once per session. The same fingerprint returning under
      a different account or IP can reveal ban evasion or multi-accounting; open a row for its full log.</p>
    <form method="get" action="/admin/fingerprints" class="filter-bar">
      <input type="search" name="q" value="${esc(q)}" aria-label="Search fingerprints by hash, IP, user, email, device, browser or OS"
             placeholder="Search hash, IP, user, email, device, browser or OS…">
      <button class="btn btn-outline" type="submit">Search</button>
      ${q ? '<a class="btn btn-ghost" href="/admin/fingerprints">Clear</a>' : ''}
      <span class="muted">${esc(total)} distinct fingerprint${total === 1 ? '' : 's'}</span>
    </form>
    <div class="panel"><div class="table-wrap"><table>
      <thead><tr><th>Fingerprint</th><th>Device</th><th>Browser</th><th>OS</th><th>Screen</th><th>Language / TZ</th><th>Last user</th><th>Last IP</th><th>Last seen</th><th></th></tr></thead>
      <tbody>${rows.length === 0
        ? '<tr><td colspan="10" class="muted center">No fingerprints captured yet.</td></tr>'
        : map(rows, fingerprintRow)}
      </tbody></table></div></div>
    ${pagination(current, pages, (p) => `/admin/fingerprints?page=${p}&q=${encodeURIComponent(q)}`)}
  </div>
</div>`;
  return page(ctx, { title: 'Admin · Fingerprints', body });
}

function fingerprintDetail(ctx, { hash, sightings }) {
  const csrf = `<input type="hidden" name="_csrf" value="${esc(ctx.csrfToken)}">`;
  const users = [...new Set(sightings.filter((s) => s.username).map((s) => s.username))];
  const ips = [...new Set(sightings.map((s) => s.ip))];

  const row = (s) => `<tr>
    <td class="muted nowrap">${esc(s.created_at)} UTC</td>
    <td class="mono">${s.ipHidden
      ? `<span class="muted" title="Admin accounts' IPs are hidden from other staff">${esc(s.ip)}</span>`
      : esc(s.ip)}</td>
    <td>${s.username ? esc(s.username) : '<span class="muted">anonymous</span>'}</td>
    <td class="muted">${esc(s.email || '-')}</td>
    <td>${fpBadge(s.device)}</td>
    <td>${esc(s.browser || '-')}</td>
    <td>${esc(s.os || '-')}</td>
    <td class="mono">${esc(s.screen || '-')}</td>
    <td class="muted">${esc(s.language || '-')}</td>
    <td class="muted">${esc(s.timezone || '-')}</td>
    <td class="actions-cell">${s.ipHidden ? '' : `<form method="post" action="/admin/ip-bans" class="inline-form"
          data-confirm="Ban ${esc(s.ip)} from GoyHub entirely?">${csrf}
        <input type="hidden" name="ip" value="${esc(s.ip)}">
        <button class="btn btn-warn btn-xs" type="submit">Ban IP</button></form>`}</td></tr>`;

  const body = `
<div class="section admin-page">
  <div class="container">
    ${head(ctx, 'Fingerprint log')}
    <div class="page-head">
      <div><p class="mono muted">${esc(hash)}</p>
        <p class="muted">${esc(sightings.length)} sighting${sightings.length === 1 ? '' : 's'} across
          ${esc(ips.length)} IP${ips.length === 1 ? '' : 's'}
          ${users.length ? `and ${esc(users.length)} account${users.length === 1 ? '' : 's'}: ${esc(users.join(', '))}` : ', seen only while signed out'}.</p></div>
      <a class="btn btn-ghost btn-sm" href="/admin/fingerprints">← All fingerprints</a>
    </div>
    <div class="panel"><div class="table-wrap"><table>
      <thead><tr><th>When</th><th>IP</th><th>User</th><th>Email</th><th>Device</th><th>Browser</th><th>OS</th><th>Screen</th><th>Language</th><th>Timezone</th><th></th></tr></thead>
      <tbody>${map(sightings, row)}</tbody></table></div></div>
  </div>
</div>`;
  return page(ctx, { title: `Admin · Fingerprint ${hash.slice(0, 12)}`, body });
}

function reports(ctx, { reports: rows }) {
  const csrf = `<input type="hidden" name="_csrf" value="${esc(ctx.csrfToken)}">`;
  const row = (r) => {
    const postCell = r.post_body === null || r.post_body === undefined
      ? '<span class="muted">(post has been deleted)</span>'
      : `<a href="/forum/t/${esc(r.thread_id)}#post-${esc(r.post_id)}">${esc(r.thread_title || 'thread')}</a>
         <div class="muted detail-cell" title="${esc(String(r.post_body).slice(0, 500))}">${esc(String(r.post_body).slice(0, 100))}${String(r.post_body).length > 100 ? '…' : ''}</div>
         <div class="muted">by ${esc(r.author || '-')}</div>`;
    const actions = r.status === 'open'
      ? `<form method="post" action="/admin/reports/${esc(r.id)}/resolve" class="inline-form">${csrf}
           <button class="btn btn-ghost btn-xs" type="submit">Resolve</button></form>
         ${r.post_body !== null && r.post_body !== undefined
          ? `<form method="post" action="/admin/posts/${esc(r.post_id)}/delete" class="inline-form"
                data-confirm="Delete the reported post?">${csrf}
              <button class="btn btn-danger btn-xs" type="submit">Delete post</button></form>` : ''}`
      : `<span class="muted">by ${esc(r.resolved_by || '-')} · ${esc(timeAgo(r.resolved_at))}</span>`;
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
    <p class="muted">Member reports on forum posts. Resolve once handled; deleting the reported post
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
            <td><strong>${esc(c.name)}</strong><div class="muted">${esc(c.description)}</div>
              ${canManageCategories ? `<details class="admin-user-tools"><summary class="muted">Edit</summary>
                <form method="post" action="/admin/categories/${esc(c.id)}/edit" class="stack cat-edit-form">${csrf}
                  <input type="text" name="name" required minlength="2" maxlength="50" value="${esc(c.name)}" aria-label="Category name">
                  <input type="text" name="description" maxlength="300" value="${esc(c.description)}" aria-label="Category description">
                  <button class="btn btn-primary btn-xs" type="submit">Save</button>
                </form></details>` : ''}</td>
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

export { dashboard, users, payments, logs, fingerprints, fingerprintDetail, reports, forumAdmin };
