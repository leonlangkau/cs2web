/**
 * React Bits CountUp — patched for the neon HUD cards:
 *  - the final value is rendered at once (crawlers, no-IO browsers, captures
 *    and reduced motion all see the real number; it is never stuck at 0)
 *  - the count-up plays from `from` the first time the card scrolls into
 *    view (lib/enterView.js), driven by GSAP so it finishes on time even
 *    when frames are scarce
 *  - `disabled` skips the animation entirely
 */
import { useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { onEnterView } from '../lib/enterView.js';

const format = (v, separator) => {
  const s = new Intl.NumberFormat('en-US', { useGrouping: !!separator, maximumFractionDigits: 0 }).format(Math.round(v));
  return separator && separator !== ',' ? s.replace(/,/g, separator) : s;
};

export default function CountUp({ to = 0, from = 0, duration = 1.4, delay = 0, separator = ',', className = '', disabled = false }) {
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    el.textContent = format(to, separator);
    if (disabled || to === from) return undefined;
    let tween = null;
    const off = onEnterView(el, (genuine) => {
      if (!genuine) return; // became visible without a scroll: keep the final value
      const n = { v: from };
      tween = gsap.to(n, {
        v: to,
        duration,
        delay,
        ease: 'power2.out',
        onStart: () => { el.textContent = format(from, separator); },
        onUpdate: () => { el.textContent = format(n.v, separator); },
        onComplete: () => { el.textContent = format(to, separator); },
      });
    }, { threshold: 0.35 });
    return () => { off(); tween?.kill(); el.textContent = format(to, separator); };
  }, [to, from, duration, delay, separator, disabled]);

  return <span ref={ref} className={className}>{format(to, separator)}</span>;
}
