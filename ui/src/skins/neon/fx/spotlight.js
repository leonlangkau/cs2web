import { qsa, setVar } from '../lib/dom.js';

const SURFACES = [
  '.panel', '.feature-card', '.thread-row', '.post', '.stat-card', '.stat', '.recent-thread', '.forum-sidebar',
  '.download-box', '.auth-card', '.status-hero', '.status-component', '.terms-gate-card', '.help-card', '.support-step',
  '.inject-step', '.hero-hud', '.nl-spot',
].join(', ');

/**
 * Pointer-tracking spotlight: every surface gets --mx/--my (px, element
 * space) and a light layer that fades in on hover. One delegated listener.
 */
export function initSpotlight(root = document) {
  const prep = (el) => {
    if (el.classList.contains('rb-spot')) return;
    el.classList.add('rb-spot');
    const light = document.createElement('i');
    light.className = 'rb-spot-light';
    light.setAttribute('aria-hidden', 'true');
    el.appendChild(light);
  };
  qsa(SURFACES, root).forEach(prep);
  let raf = 0;
  let last = null;
  const flush = () => {
    raf = 0;
    if (!last) return;
    const { el, x, y } = last;
    const r = el.getBoundingClientRect();
    setVar(el, '--mx', `${x - r.left}px`);
    setVar(el, '--my', `${y - r.top}px`);
  };
  const onMove = (e) => {
    const el = e.target instanceof Element ? e.target.closest('.rb-spot') : null;
    if (!el) return;
    last = { el, x: e.clientX, y: e.clientY };
    if (!raf) raf = requestAnimationFrame(flush);
  };
  document.addEventListener('pointermove', onMove, { passive: true });
  return () => { document.removeEventListener('pointermove', onMove); if (raf) cancelAnimationFrame(raf); };
}

export const SPOT_SURFACES = SURFACES;
