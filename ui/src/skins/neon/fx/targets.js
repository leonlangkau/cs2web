import { tagAll } from '../lib/dom.js';

/** Everything the bracket cursor should lock onto. */
const TARGETS = [
  'a.btn', 'button.btn', 'button[type="submit"]', 'input[type="submit"]',
  '.nav-links a', '.nav-auth a', '.nav-auth button', '.brand', '.nav-toggle',
  '.feature-card', '.thread-row', '.recent-thread', '.stat-card', '.help-card', '.support-step', '.inject-step',
  '.site-footer .footer-grid a', '.ui-switch-item', '.pagination a', '.breadcrumbs a', '.thread-title',
  '.admin-tabs a', '.forum-sidebar a', '.tag a', '.announcement-dismiss', '.theme-toggle',
].join(', ');

export function tagTargets(root = document) {
  return tagAll(TARGETS, 'cursor-target');
}
