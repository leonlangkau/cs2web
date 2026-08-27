import { page } from "./layout.js";
import { esc, timeAgo } from "./util.js";
import { TIER_LABELS, normalizeTier } from "../tiers.js";

function profile(ctx, { account, stats, license, isPaid, sessions = [], currentSessionId, isAdminAccount = false, emailConfigured = false }) {
  const csrf = `<input type="hidden" name="_csrf" value="${esc(ctx.csrfToken)}">`;
  const tier = normalizeTier(account.tier);

  const sessionRows = sessions.map((s) => {
    const current = s.id === currentSessionId;
    return `<tr>
      <td>${current ? '<span class="tag tag-tier-paid">THIS DEVICE</span>' : ''}</td>
      <td class="mono">${esc(s.ip || '—')}</td>
      <td class="muted ua-cell" title="${esc(s.user_agent || '')}">${esc(String(s.user_agent || '—').slice(0, 60))}</td>
      <td class="muted nowrap">${esc(timeAgo(s.created_at))}</td>
      <td class="actions-cell">
        <form method="post" action="/profile/sessions/${esc(s.id)}/revoke" class="inline-form"
              ${current ? 'data-confirm="This is the session you are using — revoking it signs you out here. Continue?"' : ''}>${csrf}
          <button class="btn btn-ghost btn-xs" type="submit">${current ? 'Sign out' : 'Revoke'}</button></form>
      </td></tr>`;
  }).join('');

  const upgradeNote = isPaid
    ? ''
    : `<p class="muted">You are on the Free tier — the forum and app download are Paid benefits.
        <a href="/store">See membership plans</a>.</p>`;

  const body = `
<div class="section profile-page">
  <div class="container narrow">
    <p class="section-kicker">// YOUR ACCOUNT</p>
    <h1 class="section-title">Profile</h1>

    <div class="panel profile-card">
      <div class="profile-identity">
        <span class="avatar avatar-lg" aria-hidden="true">${esc(account.username[0].toUpperCase())}</span>
        <div>
          <div class="profile-name">${esc(account.username)}
            <span class="uid-badge${account.id <= 1001 ? ' uid-reserved' : ''}">UID ${esc(account.id)}</span>
            <span class="tag tag-tier tag-tier-${esc(tier)}">${esc(TIER_LABELS[tier])}</span></div>
          <div class="muted">${esc(account.email)}
            ${account.email_verified_at
              ? '<span class="tag tag-report-resolved">VERIFIED</span>'
              : '<span class="tag tag-banned">UNVERIFIED</span>'}</div>
          ${tier === 'paid' && account.paid_until
            ? `<div class="muted">Paid until ${esc(new Date(Number(account.paid_until)).toISOString().slice(0, 10))}</div>` : ''}
        </div>
      </div>
      <dl class="profile-facts">
        <div><dt>Member since</dt><dd>${esc(timeAgo(account.created_at))}</dd></div>
        <div><dt>Last login</dt><dd>${esc(timeAgo(account.last_login_at))} · <span class="mono">${esc(account.last_login_ip || '—')}</span></dd></div>
        <div><dt>Threads</dt><dd>${esc(stats.threads)}</dd></div>
        <div><dt>Posts</dt><dd>${esc(stats.posts)}</dd></div>
        <div><dt>Active sessions</dt><dd>${esc(stats.sessions)}</dd></div>
      </dl>
      ${!account.email_verified_at && emailConfigured ? `
        <form method="post" action="/profile/verify-email" class="inline-form">${csrf}
          <button class="btn btn-outline btn-sm" type="submit">Resend verification email</button>
        </form>
        <p class="fineprint">Posting on the forum requires a verified email.</p>` : ''}
      ${upgradeNote}
    </div>

    <div class="panel profile-card">
      <h2>Loader license</h2>
      <p class="muted">The desktop loader signs in with your GoyHub username and password and receives a signed
        token like this one, proving your tier (<strong>${esc(TIER_LABELS[tier])}</strong>) without trusting the
        client. Tokens expire after 24 hours; the loader re-fetches automatically. You never need to copy this
        by hand — it is shown for transparency.</p>
      <pre class="mono code-block license-block">${esc(license.token)}</pre>
    </div>

    <div class="panel profile-card">
      <h2>Change password</h2>
      <form method="post" action="/profile/password" class="stack">${csrf}
        <label><span>Current password</span>
          <input type="password" name="current" required autocomplete="current-password"></label>
        <label><span>New password <small class="muted">(min. 8 characters)</small></span>
          <input type="password" name="password" required minlength="8" maxlength="128" autocomplete="new-password"></label>
        <label><span>Confirm new password</span>
          <input type="password" name="confirm" required minlength="8" maxlength="128" autocomplete="new-password"></label>
        <button class="btn btn-primary" type="submit">Update password</button>
      </form>
      <p class="fineprint">Changing your password signs you out on every other device.</p>
    </div>

    <div class="panel profile-card">
      <h2>Change email</h2>
      <form method="post" action="/profile/email" class="stack">${csrf}
        <label><span>New email</span>
          <input type="email" name="email" required maxlength="254" autocomplete="email"
                 placeholder="${esc(account.email)}"></label>
        <label><span>Your password</span>
          <input type="password" name="password" required autocomplete="current-password"></label>
        <button class="btn btn-primary" type="submit">Update email</button>
      </form>
    </div>

    <div class="panel profile-card">
      <h2>Active sessions</h2>
      <p class="muted">Every device currently signed in to your account. Revoke anything you don't recognise.</p>
      <div class="table-wrap"><table>
        <thead><tr><th></th><th>IP</th><th>Browser</th><th>Signed in</th><th></th></tr></thead>
        <tbody>${sessionRows || '<tr><td colspan="5" class="muted center">No active sessions.</td></tr>'}</tbody>
      </table></div>
      <form method="post" action="/profile/logout-all" class="inline-form panel-form-inline"
            data-confirm="Sign out on every device, including this one?">${csrf}
        <button class="btn btn-warn btn-sm" type="submit">Sign out everywhere</button>
      </form>
    </div>

    ${isAdminAccount ? '' : `<div class="panel profile-card danger-zone">
      <h2>Delete account</h2>
      <p class="muted">Deleting your account is permanent. Your forum posts stay so conversations survive,
        reattributed to <span class="mono">[deleted]</span> — everything identifying you is removed
        (see the <a href="/privacy">Privacy Policy</a>).</p>
      <form method="post" action="/profile/delete" class="stack"
            data-confirm="Permanently delete your account? This cannot be undone.">${csrf}
        <label><span>Your password</span>
          <input type="password" name="password" required autocomplete="current-password"></label>
        <label><span>Type <strong>DELETE</strong> to confirm</span>
          <input type="text" name="confirm_phrase" required autocomplete="off" placeholder="DELETE"></label>
        <button class="btn btn-danger" type="submit">Delete my account forever</button>
      </form>
    </div>`}
  </div>
</div>`;
  return page(ctx, { title: 'Profile', body });
}

export { profile };
