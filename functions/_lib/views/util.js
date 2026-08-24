/**
 * View helpers.
 *
 * EJS compiles templates with `new Function`, which the Workers runtime blocks,
 * so views are plain functions returning HTML strings. Everything interpolated
 * from data goes through esc() — the one rule that keeps this safe.
 */

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** HTML-escape a value for interpolation into markup or an attribute. */
function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ESCAPES[c]);
}

/** Formats an SQLite UTC timestamp as a short relative-time string. */
function timeAgo(sqliteUtc) {
  if (!sqliteUtc) return 'never';
  const then = new Date(`${String(sqliteUtc).replace(' ', 'T')}Z`).getTime();
  if (Number.isNaN(then)) return String(sqliteUtc);
  const s = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.floor(mo / 12)}y ago`;
}

/** Windowed page list for pagination: [1, '…', 5, 6, 7, '…', 42]. */
function pageWindow(page, pages) {
  if (pages <= 9) return Array.from({ length: pages }, (_, i) => i + 1);
  const keep = [...new Set([1, 2, page - 1, page, page + 1, pages - 1, pages])]
    .filter((p) => p >= 1 && p <= pages)
    .sort((a, b) => a - b);
  const out = [];
  let prev = 0;
  for (const p of keep) {
    if (p - prev > 1) out.push('…');
    out.push(p);
    prev = p;
  }
  return out;
}

/** Renders a pagination strip; hrefFor(page) returns the target URL. */
function pagination(page, pages, hrefFor, label = 'Pages') {
  if (pages <= 1) return '';
  const items = pageWindow(page, pages).map((p) => {
    if (p === '…') return '<span class="page gap" aria-hidden="true">…</span>';
    if (p === page) return `<span class="page current" aria-current="page">${p}</span>`;
    return `<a class="page" href="${esc(hrefFor(p))}">${p}</a>`;
  }).join('\n');
  return `<nav class="pagination" aria-label="${esc(label)}">${items}</nav>`;
}

/** Joins a list through a render function. */
const map = (items, fn) => items.map(fn).join('');

/**
 * Scraper-resistant contact-email link. The address never appears joined in
 * the HTML source: user and domain sit in separate data attributes and
 * main.js assembles the real mailto link client-side. No-JS visitors see a
 * human-readable "user [at] domain".
 */
function emailLink(email) {
  const at = String(email ?? '').indexOf('@');
  if (at < 1) return esc(email);
  const user = String(email).slice(0, at);
  const domain = String(email).slice(at + 1);
  return `<a class="email-protect" data-u="${esc(user)}" data-d="${esc(domain)}">${esc(user)}&#8203;&nbsp;[at]&nbsp;${esc(domain)}</a>`;
}

export { esc, timeAgo, pageWindow, pagination, map, emailLink };
