import { useEffect, useState } from 'react';

/**
 * True while the referenced element is within `rootMargin` of the viewport
 * and the tab is visible. Heavy canvases are only mounted while this holds,
 * so at most one WebGL context lives on a page at a time in practice.
 */
export default function useOnScreen(ref, { rootMargin = '25% 0px', once = false } = {}) {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    if (!('IntersectionObserver' in window)) { setOn(true); return undefined; }
    let intersecting = false;
    let visible = !document.hidden;
    const sync = () => setOn((prev) => {
      const next = intersecting && visible;
      return once && prev ? prev : next;
    });
    const io = new IntersectionObserver(([entry]) => { intersecting = entry.isIntersecting; sync(); }, { rootMargin, threshold: 0 });
    io.observe(el);
    const onVis = () => { visible = !document.hidden; sync(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { io.disconnect(); document.removeEventListener('visibilitychange', onVis); };
  }, [ref, rootMargin, once]);
  return on;
}
