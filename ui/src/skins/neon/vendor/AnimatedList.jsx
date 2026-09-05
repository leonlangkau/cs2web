/**
 * React Bits AnimatedList — patched: renders whatever `renderItem` returns
 * (real links here), never hijacks Tab/arrow keys on the window, namespaced
 * classes (`nl-list*`), and respects `disableAnimations`.
 */
import { useRef, useState, useCallback } from 'react';
import { motion, useInView } from 'motion/react';
import './AnimatedList.css';

function AnimatedItem({ children, delay = 0, index, onMouseEnter, disableAnimations }) {
  const ref = useRef(null);
  const inView = useInView(ref, { amount: 0.4, once: true });
  const show = disableAnimations || inView;
  return (
    <motion.li
      ref={ref}
      data-index={index}
      onMouseEnter={onMouseEnter}
      initial={disableAnimations ? false : { opacity: 0, x: -18, scale: 0.98 }}
      animate={show ? { opacity: 1, x: 0, scale: 1 } : { opacity: 0, x: -18, scale: 0.98 }}
      transition={{ duration: 0.35, delay, ease: [0.22, 1, 0.36, 1] }}
      className="nl-list__item"
    >
      {children}
    </motion.li>
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
  const [bottom, setBottom] = useState(1);
  const onScroll = useCallback((e) => {
    const { scrollTop, scrollHeight, clientHeight } = e.target;
    setTop(Math.min(scrollTop / 40, 1));
    const rest = scrollHeight - (scrollTop + clientHeight);
    setBottom(scrollHeight <= clientHeight ? 0 : Math.min(rest / 40, 1));
  }, []);
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
