import { gsap } from 'gsap';
import { qsa } from '../lib/dom.js';

const SELECTOR = '.btn-primary:not(.btn-sm):not(.btn-xs):not(.btn-block), .btn-lg, .rb-magnet';

/**
 * Magnet pull on primary buttons: within `padding` px of a button the button
 * leans toward the pointer (React Bits Magnet behaviour, applied to existing
 * server-rendered elements with gsap.quickTo).
 */
export function initMagnet(root = document, { padding = 44, strength = 7 } = {}) {
  const items = qsa(SELECTOR, root).filter((el) => !el.closest('[data-rb-root]')).map((el) => ({
    el,
    x: gsap.quickTo(el, 'x', { duration: 0.35, ease: 'power3.out' }),
    y: gsap.quickTo(el, 'y', { duration: 0.35, ease: 'power3.out' }),
    active: false,
  }));
  if (!items.length) return () => {};
  let raf = 0;
  let px = 0;
  let py = 0;
  const tick = () => {
    raf = 0;
    for (const it of items) {
      const r = it.el.getBoundingClientRect();
      if (r.bottom < -padding || r.top > window.innerHeight + padding) { if (it.active) { it.active = false; it.x(0); it.y(0); } continue; }
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const dx = px - cx;
      const dy = py - cy;
      if (Math.abs(dx) < r.width / 2 + padding && Math.abs(dy) < r.height / 2 + padding) {
        it.active = true;
        it.x(dx / strength);
        it.y(dy / strength);
      } else if (it.active) {
        it.active = false;
        it.x(0);
        it.y(0);
      }
    }
  };
  const onMove = (e) => { px = e.clientX; py = e.clientY; if (!raf) raf = requestAnimationFrame(tick); };
  window.addEventListener('pointermove', onMove, { passive: true });
  return () => {
    window.removeEventListener('pointermove', onMove);
    if (raf) cancelAnimationFrame(raf);
    items.forEach((it) => gsap.set(it.el, { clearProps: 'transform' }));
  };
}
