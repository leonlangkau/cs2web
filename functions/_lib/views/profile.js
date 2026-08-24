import { page } from "./layout.js";
import { esc, timeAgo } from "./util.js";
import { TIER_LABELS, normalizeTier } from "../tiers.js";

function profile(ctx, { account, stats, license, isPaid }) {
  const csrf = `<input type="hidden" name="_csrf" value="${esc(ctx.csrfToken)}">`;
  const tier = normalizeTier(account.tier);

  const upgradeNote = isPaid
    ? ''
    : `<p class="muted">You are on the Free tier — the forum and app download are Paid benefits.
        <a href="/upgrade">See upgrade options</a>.</p>`;

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
            <span class="tag tag-tier tag-tier-${esc(tier)}">${esc(TIER_LABELS[tier])}</span></div>
          <div class="muted">${esc(account.email)}</div>
        </div>
      </div>
      <dl class="profile-facts">
        <div><dt>Member since</dt><dd>${esc(timeAgo(account.created_at))}</dd></div>
        <div><dt>Last login</dt><dd>${esc(timeAgo(account.last_login_at))} · <span class="mono">${esc(account.last_login_ip || '—')}</span></dd></div>
        <div><dt>Threads</dt><dd>${esc(stats.threads)}</dd></div>
        <div><dt>Posts</dt><dd>${esc(stats.posts)}</dd></div>
        <div><dt>Active sessions</dt><dd>${esc(stats.sessions)}</dd></div>
      </dl>
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
      <h2>Security</h2>
      <p class="muted">Lost a device or suspect someone else has your session? Sign out everywhere —
        every device including this one gets logged out.</p>
      <form method="post" action="/profile/logout-all" class="inline-form"
            data-confirm="Sign out on every device, including this one?">${csrf}
        <button class="btn btn-warn" type="submit">Sign out everywhere</button>
      </form>
    </div>
  </div>
</div>`;
  return page(ctx, { title: 'Profile', body });
}

export { profile };
