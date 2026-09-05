import { mountOverlay } from '@shared/mount';
import Dock from '../vendor/Dock.jsx';
import { iconFor } from '../lib/icons.jsx';
import { qsa } from '../lib/dom.js';

/** Bottom-centre quick nav built from the header's links + the account entry. */
export function mountDock(env) {
  const header = document.getElementById('site-nav');
  if (!header) return null;
  const path = window.location.pathname;
  const items = qsa('.nav-links a[href]', header).map((a) => {
    const href = a.getAttribute('href');
    return { href, label: (a.querySelector('.nav-txt') || a).textContent.trim(), icon: iconFor(href), active: a.classList.contains('active') || a.getAttribute('aria-current') === 'page' };
  });
  const user = header.querySelector('.nav-user');
  if (user) items.push({ href: user.getAttribute('href') || '/profile', label: 'Profile', icon: iconFor('/profile'), active: path.startsWith('/profile') });
  else items.push({ href: '/auth/login', label: 'Log in', icon: iconFor('/auth'), active: path.startsWith('/auth') });
  if (!items.length) return null;
  const { host, root } = mountOverlay(<Dock items={items} reduced={env.reduced} />, { id: 'rb-dock' });
  document.body.classList.add('rb-has-dock');
  return () => { document.body.classList.remove('rb-has-dock'); root.unmount(); host.remove(); };
}
