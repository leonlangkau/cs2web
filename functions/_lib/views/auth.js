import { page } from "./layout.js";
import { esc, map, emailLink } from "./util.js";

function errorList(errors) {
  if (!errors || errors.length === 0) return '';
  return `<div class="form-errors" role="alert"><ul>${map(errors, (e) => `<li>${esc(e)}</li>`)}</ul></div>`;
}

function login(ctx, { errors = [], values = {}, next = '/' } = {}) {
  const switchNote = ctx.user
    ? `<div class="switch-note">You are currently signed in as <strong>${esc(ctx.user.username)}</strong>.
        Logging in below switches this browser to the other account.
        <form method="post" action="/auth/logout" class="inline-form">
          <input type="hidden" name="_csrf" value="${esc(ctx.csrfToken)}">
          <button type="submit" class="btn btn-ghost btn-sm">Or just log out</button>
        </form></div>`
    : '';
  const body = `
<section class="section auth-page">
  <div class="container auth-card">
    <h1>Welcome back</h1>
    <p class="muted">Log in to post on the forum and sync your setup.</p>
    ${switchNote}
    ${errorList(errors)}
    <form method="post" action="/auth/login" class="stack">
      <input type="hidden" name="_csrf" value="${esc(ctx.csrfToken)}">
      <input type="hidden" name="next" value="${esc(next)}">
      <label><span>Username or email</span>
        <input type="text" name="identifier" required maxlength="254" autocomplete="username"
               value="${esc(values.identifier || '')}" autofocus></label>
      <label><span>Password</span>
        <input type="password" name="password" required autocomplete="current-password"></label>
      <button type="submit" class="btn btn-primary btn-block">Log in</button>
    </form>
    <p class="muted center">New here? <a href="/auth/signup">Create an account</a> · <a href="/auth/forgot">Forgot password?</a></p>
  </div>
</section>`;
  return page(ctx, { title: 'Log in', body });
}

function signup(ctx, { errors = [], values = {} } = {}) {
  const body = `
<section class="section auth-page">
  <div class="container auth-card">
    <h1>Create your account</h1>
    <p class="muted">Join the GoyHub community — it takes 20 seconds.</p>
    ${errorList(errors)}
    <form method="post" action="/auth/signup" class="stack">
      <input type="hidden" name="_csrf" value="${esc(ctx.csrfToken)}">
      <label><span>Username</span>
        <input type="text" name="username" required minlength="3" maxlength="20"
               pattern="[A-Za-z0-9_]+" title="Letters, numbers and underscores only"
               autocomplete="username" value="${esc(values.username || '')}" autofocus></label>
      <label><span>Email</span>
        <input type="email" name="email" required maxlength="254" autocomplete="email"
               value="${esc(values.email || '')}"></label>
      <label><span>Password <small class="muted">(min. 8 characters)</small></span>
        <input type="password" name="password" required minlength="8" maxlength="128" autocomplete="new-password"></label>
      <label><span>Confirm password</span>
        <input type="password" name="confirm" required minlength="8" maxlength="128" autocomplete="new-password"></label>

      <div class="honeypot" aria-hidden="true">
        <label>Leave this field empty<input type="text" name="website" tabindex="-1" autocomplete="off"></label>
      </div>
      <input type="hidden" name="captcha_token" value="">
      <input type="hidden" name="captcha_solution" value="">
      <div class="captcha-box" data-captcha></div>
      ${ctx.turnstileSiteKey ? `<div class="cf-turnstile" data-sitekey="${esc(ctx.turnstileSiteKey)}"></div>` : ''}
      <noscript><p class="form-errors">Sign-up needs JavaScript for the human-verification step. Please enable it and reload.</p></noscript>

      <button type="submit" class="btn btn-primary btn-block">Sign up</button>
    </form>
    <p class="muted center">Already have an account? <a href="/auth/login">Log in</a></p>
    <p class="fineprint">By signing up you agree to our <a href="/terms">Terms &amp; Conditions</a> and
      <a href="/privacy">Privacy Policy</a>. For security and anti-abuse, we record the IP address
      and browser of sign-ups, logins and downloads.</p>
  </div>
</section>`;
  const scripts = ['/js/captcha.js'];
  if (ctx.turnstileSiteKey) scripts.push('https://challenges.cloudflare.com/turnstile/v0/api.js');
  return page(ctx, { title: 'Sign up', body, scripts });
}

function forgot(ctx, { emailConfigured }) {
  const note = emailConfigured
    ? '<p class="muted">Enter your username or email and we\'ll send a one-hour reset link.</p>'
    : `<p class="form-errors">Email sending isn't configured on this site yet, so automatic resets are
        unavailable — contact ${emailLink(ctx.company.contactEmail)}
        instead.</p>`;
  const body = `
<section class="section auth-page">
  <div class="container auth-card">
    <h1>Reset your password</h1>
    ${note}
    <form method="post" action="/auth/forgot" class="stack">
      <input type="hidden" name="_csrf" value="${esc(ctx.csrfToken)}">
      <label><span>Username or email</span>
        <input type="text" name="identifier" required maxlength="254" autocomplete="username" autofocus></label>
      <button type="submit" class="btn btn-primary btn-block" ${emailConfigured ? '' : 'disabled'}>Send reset link</button>
    </form>
    <p class="muted center"><a href="/auth/login">Back to log in</a></p>
  </div>
</section>`;
  return page(ctx, { title: 'Reset password', body });
}

function resetPassword(ctx, { token, errors = [] }) {
  const body = `
<section class="section auth-page">
  <div class="container auth-card">
    <h1>Choose a new password</h1>
    ${errorList(errors)}
    <form method="post" action="/auth/reset/${esc(token)}" class="stack">
      <input type="hidden" name="_csrf" value="${esc(ctx.csrfToken)}">
      <label><span>New password <small class="muted">(min. 8 characters)</small></span>
        <input type="password" name="password" required minlength="8" maxlength="128" autocomplete="new-password" autofocus></label>
      <label><span>Confirm new password</span>
        <input type="password" name="confirm" required minlength="8" maxlength="128" autocomplete="new-password"></label>
      <button type="submit" class="btn btn-primary btn-block">Set new password</button>
    </form>
  </div>
</section>`;
  return page(ctx, { title: 'Choose a new password', body });
}

export { login, signup, forgot, resetPassword };
