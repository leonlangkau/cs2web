/** Inline SVG icons (24x24 grid). Stroke inherits currentColor. */
const base = { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': 'true' };

export const Icon = {
  home: (p) => <svg {...base} {...p}><path d="M3 11.5 12 4l9 7.5" /><path d="M5.5 10.5V20h13v-9.5" /><path d="M10 20v-5h4v5" /></svg>,
  forum: (p) => <svg {...base} {...p}><path d="M4 5h16v10H9l-4 4v-4H4z" /><path d="M8 9h8M8 12h5" /></svg>,
  download: (p) => <svg {...base} {...p}><path d="M12 3v12m0 0-5-5m5 5 5-5" /><path d="M4 19h16" /></svg>,
  support: (p) => <svg {...base} {...p}><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="3.5" /><path d="m6 6 3.5 3.5M18 6l-3.5 3.5M6 18l3.5-3.5M18 18l-3.5-3.5" /></svg>,
  upgrade: (p) => <svg {...base} {...p}><path d="M13 2 4 14h6l-1 8 9-12h-6l1-8z" /></svg>,
  admin: (p) => <svg {...base} {...p}><path d="M12 3l7 4v5c0 4.4-3 8.5-7 9-4-.5-7-4.6-7-9V7l7-4z" /><path d="M9 12l2 2 4-4" /></svg>,
  user: (p) => <svg {...base} {...p}><circle cx="12" cy="8.5" r="3.5" /><path d="M5 20a7 7 0 0 1 14 0" /></svg>,
  login: (p) => <svg {...base} {...p}><path d="M10 7V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6a2 2 0 0 1-2-2v-2" /><path d="M3 12h11m0 0-3-3m3 3-3 3" /></svg>,
  arrow: (p) => <svg {...base} {...p}><path d="M5 12h14m0 0-5-5m5 5-5 5" /></svg>,
  check: (p) => <svg {...base} {...p}><path d="M5 12.5l4.5 4.5L19 7" /></svg>,
  lock: (p) => <svg {...base} {...p}><rect x="5" y="10" width="14" height="10" rx="1.5" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg>,
  reticle: (p) => <svg {...base} {...p}><circle cx="12" cy="12" r="8" /><path d="M12 2v5m0 10v5M2 12h5m10 0h5" /></svg>,
  chevron: (p) => <svg {...base} {...p}><path d="m9 6 6 6-6 6" /></svg>,
};

/** Icon for a nav destination, by href prefix. */
export function iconFor(href) {
  if (href === '/') return Icon.home;
  if (href.startsWith('/forum')) return Icon.forum;
  if (href.startsWith('/download')) return Icon.download;
  if (href.startsWith('/help') || href.startsWith('/support')) return Icon.support;
  if (href.startsWith('/buy') || href.startsWith('/upgrade')) return Icon.upgrade;
  if (href.startsWith('/admin')) return Icon.admin;
  if (href.startsWith('/profile')) return Icon.user;
  if (href.startsWith('/auth')) return Icon.login;
  return Icon.chevron;
}
