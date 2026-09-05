/**
 * Runtime environment helpers shared by the skin bundles.
 * Everything here is safe under the site CSP (no inline styles/scripts).
 */

/** The active skin id, stamped on <html data-skin> by the server. */
export const skinId = () => document.documentElement.getAttribute('data-skin') || 'classic';

const mq = (q) => {
  try { return window.matchMedia(q).matches; } catch { return false; }
};

/** Honour the OS motion preference: effects stand down, content stays. */
export const reducedMotion = () => mq('(prefers-reduced-motion: reduce)');

/** Custom cursors and hover choreography only make sense with a real pointer. */
export const finePointer = () => mq('(hover: hover) and (pointer: fine)');

/** Reads a server-rendered <script type="application/json" id="..."> block. */
export function readJson(id, fallback = null) {
  const el = document.getElementById(id);
  if (!el) return fallback;
  try { return JSON.parse(el.textContent || 'null') ?? fallback; } catch { return fallback; }
}

/** Runs once the DOM is parsed (module scripts are deferred, but be explicit). */
export function onReady(fn) {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn, { once: true });
  else fn();
}

/** Whether the page has a real, non-hidden hero-sized viewport to animate in. */
export const isTouch = () => mq('(hover: none)');
