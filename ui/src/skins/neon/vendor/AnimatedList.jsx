/**
 * React Bits AnimatedList — patched: renders whatever `renderItem` returns
 * (real links here), never hijacks Tab/arrow keys on the window, namespaced
 * classes (`nl-list*`), respects `disableAnimations`, and items are visible
 * by default — the slide-in plays the first time an item genuinely scrolls
 * into view (lib/enterView.js), so nothing is ever left invisible.
 */
import { useRef, useState, useCallback, useEffect } from 'react';
import { gsap } from 'gsap';
import { onEnterView } from '../lib/enterView.js';
import './AnimatedList.css';

function AnimatedItem({ children, delay = 0, index, onMouseEnter, disableAnimations }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || disableAnimations) return undefined;
    let tween = null;
    const off = onEnterView(el, (genuine) => {
      if (!genuine) return;
      tween = gsap.from(el, { opacity: 0, x: -18, duration: 0.4, delay, ease: 'power3.out', clearProps: 'opacity,transform' });
    }, { threshold: 0.4 });
    return () => { off(); tween?.kill(); gsap.set(el, { clearProps: 'opacity,transform' }); };
  }, [disableAnimations, delay]);
  return (
    <li ref={ref} data-index={index} onMouseEnter={onMouseEnter} className="nl-list__item">
      {children}
    </li>
  );
}

export default function AnimatedList({
  items = [],
  renderItem,
  className = '',
  showGradients = true,
  disableAnimations = false,
  maxHeight,
  ariaLabel = 'List',
}) {
  const listRef = useRef(null);
  const [selected, setSelected] = useState(-1);
  const [top, setTop] = useState(0);
  const [bottom, setBottom] = useState(0);
  const measure = useCallback((el) => {
    if (!el) return;
    const { scrollTop, scrollHeight, clientHeight } = el;
    setTop(Math.min(scrollTop / 40, 1));
    const rest = scrollHeight - (scrollTop + clientHeight);
    setBottom(scrollHeight <= clientHeight + 1 ? 0 : Math.min(rest / 40, 1));
  }, []);
  useEffect(() => { measure(listRef.current); }, [measure, items.length]);
  const onScroll = useCallback((e) => measure(e.target), [measure]);
  const style = maxHeight ? { maxHeight } : undefined;
  return (
    <div className={`nl-list ${className}`}>
      <ul ref={listRef} className="nl-list__scroll" onScroll={onScroll} style={style} aria-label={ariaLabel}>
        {items.map((item, index) => (
          <AnimatedItem key={item.id ?? index} index={index} delay={disableAnimations ? 0 : Math.min(index * 0.07, 0.5)} onMouseEnter={() => setSelected(index)} disableAnimations={disableAnimations}>
            {renderItem(item, index, selected === index)}
          </AnimatedItem>
        ))}
      </ul>
      {showGradients && (
        <>
          <div className="nl-list__fade nl-list__fade--top" style={{ opacity: top }} aria-hidden="true" />
          <div className="nl-list__fade nl-list__fade--bottom" style={{ opacity: bottom }} aria-hidden="true" />
        </>
      )}
    </div>
  );
}
