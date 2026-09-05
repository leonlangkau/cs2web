/**
 * "neon" skin — server-rendered chrome (see ../skins/index.js for the contract
 * and ui/SKINS.md for the design brief). Minimal contract-complete version;
 * the design pass replaces the markup while keeping every hook documented there.
 */
import { esc, map } from "../util.js";
import { BRAND_MARK } from "../brand.js";
import { navLinks, footerColumns, footerLegal, homeDataScript, fallbackHome } from "./common.js";

function nav(ctx) {
  const links = map(navLinks(ctx), (l) => `<a href="${l.href}" class="${l.active ? 'active' : ''}">${esc(l.label)}</a>`);
  const auth = ctx.user
    ? `<a class="nav-user" href="/profile" title="Your profile"><span class="avatar" aria-hidden="true">${esc(ctx.user.username[0].toUpperCase())}</span>${esc(ctx.user.username)}</a>
       <form method="post" action="/auth/logout" class="inline-form">
         <input type="hidden" name="_csrf" value="${esc(ctx.csrfToken)}">
         <button type="submit" class="btn btn-ghost btn-sm">Log out</button>
       </form>`
    : `<a href="/auth/login" class="btn btn-ghost btn-sm">Log in</a>
       <a href="/auth/signup" class="btn btn-primary btn-sm">Sign up</a>`;
  return `<header class="site-nav" id="site-nav">
  <div class="container nav-inner">
    <a class="brand" href="/" aria-label="${esc(ctx.appName)} home">${BRAND_MARK}<span>Goy<em>Hub</em></span></a>
    <nav class="nav-links" aria-label="Main">${links}</nav>
    <div class="nav-auth">${auth}</div>
  </div>
</header>`;
}

function footer(ctx) {
  const cols = map(footerColumns(ctx), (col) => `<nav aria-label="${esc(col.label)}"><h3>${esc(col.label)}</h3>${map(col.links, (l) => `<a href="${l.href}">${esc(l.label)}</a>`)}</nav>`);
  const legal = footerLegal(ctx);
  return `<footer class="site-footer">
  <div class="container footer-grid">
    <div>
      <a class="brand brand-footer" href="/">${BRAND_MARK}<span>Goy<em>Hub</em></span></a>
      <p class="footer-blurb">The all-in-one CS2 companion. Track your stats, manage your configs, and play at your peak.</p>
    </div>
    ${cols}
  </div>
  <div class="container footer-bottom">
    <span>${esc(legal.copyright)}</span>
    <span class="footer-legal-line">${esc(legal.line)}</span>
  </div>
</footer>`;
}

export default {
  id: 'neon',
  stylesheets: ['/css/skin-neon.css', '/css/ui-neon.css'],
  modules: ['/js/ui-neon.js'],
  bodyClass: '',
  head() {
    return '<meta name="theme-color" content="#05070c">';
  },
  chrome() {
    return '<div id="rb-bg" class="rb-bg" aria-hidden="true"></div>';
  },
  nav,
  footer,
  home(ctx, data) {
    return {
      bodyClass: 'landing',
      body: `<div id="rb-home" class="rb-home">${fallbackHome(ctx, data)}</div>\n${homeDataScript(ctx, data)}`,
    };
  },
};
