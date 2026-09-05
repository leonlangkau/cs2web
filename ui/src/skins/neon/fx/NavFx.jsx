import { mountInto } from '@shared/mount';
import GooeyNav from '../vendor/GooeyNav.jsx';
import { qsa } from '../lib/dom.js';

/**
 * Reads the server-rendered main links (the source of truth) and renders the
 * GooeyNav from them inside the header. The plain links are hidden by CSS only
 * after mount, and only on desktop widths; mobile keeps the SSR nav + toggle.
 */
export function enhanceNav(env) {
  const header = document.getElementById('site-nav');
  const plain = header?.querySelector('.nav-links');
  if (!header || !plain || !env.desktop) return null;
  const links = qsa('a[href]', plain).map((a) => ({
    href: a.getAttribute('href'),
    label: (a.querySelector('.nav-txt') || a).textContent.trim(),
    active: a.classList.contains('active') || a.getAttribute('aria-current') === 'page',
  })).filter((l) => l.label);
  if (!links.length) return null;
  const activeIndex = Math.max(0, links.findIndex((l) => l.active));
  const host = document.createElement('div');
  host.className = 'rb-gooey';
  plain.insertAdjacentElement('afterend', host);
  const root = mountInto(host, <GooeyNav items={links} initialActiveIndex={activeIndex} reduced={env.reduced} particleCount={12} />);
  header.classList.add('rb-gooey-on');
  return () => { header.classList.remove('rb-gooey-on'); root?.unmount(); host.remove(); };
}
