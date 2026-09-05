/**
 * Small DOM helpers shared by the neon bundle. Everything is CSP-clean:
 * styles go through classes or CSSOM custom properties, never attributes.
 */

export const qs = (sel, root = document) => root.querySelector(sel);
export const qsa = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export const mq = (query) => {
  try { return window.matchMedia(query); } catch { return { matches: false, addEventListener() {}, removeEventListener() {} }; }
};

export const isDesktop = () => mq('(min-width: 960px)').matches;

/** Runs `fn` when the browser is idle (or soon), with cleanup. */
export function onIdle(fn, timeout = 600) {
  if ('requestIdleCallback' in window) {
    const id = window.requestIdleCallback(fn, { timeout });
    return () => window.cancelIdleCallback(id);
  }
  const id = window.setTimeout(fn, 32);
  return () => window.clearTimeout(id);
}

/** Session flag helpers that survive storage being blocked. */
export const session = {
  get(key) { try { return window.sessionStorage.getItem(key); } catch { return null; } },
  set(key, value) { try { window.sessionStorage.setItem(key, value); } catch { /* private mode */ } },
};

/**
 * Pauses/resumes a loop when its element scrolls off-screen or the tab is
 * hidden. `start`/`stop` must be idempotent. Returns a disposer.
 */
export function whenVisible(el, { start, stop, rootMargin = '120px' } = {}) {
  let onScreen = true;
  let pageVisible = !document.hidden;
  const sync = () => { if (onScreen && pageVisible) start(); else stop(); };
  const io = 'IntersectionObserver' in window
    ? new IntersectionObserver(([entry]) => { onScreen = entry.isIntersecting; sync(); }, { rootMargin, threshold: 0 })
    : null;
  if (io && el) io.observe(el);
  const onVis = () => { pageVisible = !document.hidden; sync(); };
  document.addEventListener('visibilitychange', onVis);
  sync();
  return () => {
    io?.disconnect();
    document.removeEventListener('visibilitychange', onVis);
    stop();
  };
}

/** Adds a class to every element matching a selector list; returns a remover. */
export function tagAll(selectors, className) {
  const els = qsa(selectors);
  els.forEach((el) => el.classList.add(className));
  return () => els.forEach((el) => el.classList.remove(className));
}

/** `--name: value` on an element (CSSOM — allowed under style-src 'self'). */
export const setVar = (el, name, value) => el.style.setProperty(name, value);

export const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

export const fmtInt = (n) => Number(n || 0).toLocaleString('en-US');
