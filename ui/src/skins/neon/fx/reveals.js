import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { qsa } from '../lib/dom.js';

gsap.registerPlugin(ScrollTrigger);

/** Blocks the inner pages cascade in: one level under each section container. */
const INNER = [
  'main > .section > .container > *',
  'main > .container > *',
  'main > .section > .container .forum-layout > *',
  '.thread-list > *',
  '.features-grid > *',
  '.stat-cards > *',
  '.status-components > *',
  '.help-grid > *',
].join(', ');

/**
 * GSAP ScrollTrigger reveals. Elements stay in their natural (visible) state
 * until they enter the viewport, then a from() tween plays once — so nothing
 * is ever left invisible if a trigger misses, and full-page captures show
 * the real layout.
 */
export function initReveals(root = document, { selector = INNER, y = 22, stagger = 0.07 } = {}) {
  const els = qsa(selector, root).filter((el) => {
    if (el.matches('script, style, template, .rb-no-reveal')) return false;
    const h = el.getBoundingClientRect().height;
    return h > 0 && h < window.innerHeight * 1.4;
  });
  if (!els.length) return () => {};
  const seen = new Set(els);
  const targets = els.filter((el) => { let p = el.parentElement; while (p) { if (seen.has(p)) return false; p = p.parentElement; } return true; })
    .concat(els.filter((el) => { let p = el.parentElement; while (p) { if (seen.has(p)) return true; p = p.parentElement; } return false; }));
  const uniq = [...new Set(targets)];
  ScrollTrigger.batch(uniq, {
    start: 'top 94%',
    once: true,
    batchMax: 12,
    onEnter: (batch) => gsap.from(batch, { opacity: 0, y, duration: 0.7, ease: 'power3.out', stagger, overwrite: true, clearProps: 'transform,opacity' }),
  });
  const refresh = () => ScrollTrigger.refresh();
  window.addEventListener('load', refresh, { once: true });
  document.fonts?.ready?.then(refresh);
  return () => {
    ScrollTrigger.getAll().forEach((t) => { if (uniq.includes(t.trigger)) t.kill(); });
    window.removeEventListener('load', refresh);
  };
}

export { gsap, ScrollTrigger };
