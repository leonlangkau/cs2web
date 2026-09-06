/**
 * Calls `fn(true)` the first time `el` genuinely scrolls into view, and
 * `fn(false)` when it became visible without anyone scrolling — a viewport
 * resize, a print/full-page capture, a tab restored at a large size — so a
 * caller can render its final state instead of playing an entrance that
 * nobody is watching. Elements already inside the initial viewport count as
 * genuine (the visitor is looking at them). Returns a disposer.
 */
export function onEnterView(el, fn, { threshold = 0.2, rootMargin = '0px' } = {}) {
  if (!el) return () => {};
  if (!('IntersectionObserver' in window)) { fn(false); return () => {}; }
  const foldAtMount = window.innerHeight;
  let scrolled = false;
  const onScroll = () => { scrolled = true; };
  window.addEventListener('scroll', onScroll, { passive: true, once: true });
  const io = new IntersectionObserver((entries) => {
    if (!entries.some((e) => e.isIntersecting)) return;
    io.disconnect();
    window.removeEventListener('scroll', onScroll);
    const top = el.getBoundingClientRect().top;
    fn(scrolled || window.scrollY > 0 || top < foldAtMount);
  }, { threshold, rootMargin });
  io.observe(el);
  return () => { io.disconnect(); window.removeEventListener('scroll', onScroll); };
}
