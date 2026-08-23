'use strict';

const { page } = require('./layout');
const { esc, map } = require('./util');

function errorList(errors) {
  if (!errors || errors.length === 0) return '';
  return `<div class="form-errors" role="alert"><ul>${map(errors, (e) => `<li>${esc(e)}</li>`)}</ul></div>`;
}

function login(ctx, { errors = [], values = {}, next = '/' } = {}) {
  const body = `
<section class="section auth-page">
  <div class="container auth-card">
    <h1>Welcome back</h1>
    <p class="muted">Log in to post on the forum and sync your setup.</p>
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
    <p class="muted center">New here? <a href="/auth/signup">Create an account</a></p>
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
      <noscript><p class="form-errors">Sign-up needs JavaScript for the human-verification step. Please enable it and reload.</p></noscript>

      <button type="submit" class="btn btn-primary btn-block">Sign up</button>
    </form>
    <p class="muted center">Already have an account? <a href="/auth/login">Log in</a></p>
    <p class="fineprint">By signing up you agree to our <a href="/terms">Terms &amp; Conditions</a> and
      <a href="/privacy">Privacy Policy</a>. For security and anti-abuse, we record the IP address
      and browser of sign-ups, logins and downloads.</p>
  </div>
</section>`;
  return page(ctx, { title: 'Sign up', body, scripts: ['/js/captcha.js'] });
}

module.exports = { login, signup };
