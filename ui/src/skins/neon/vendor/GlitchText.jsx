/**
 * React Bits GlitchText — patched: multi-line safe (the ghost copies share the
 * element's width), namespaced classes, and a `burst` mode that glitches in
 * short bursts every few seconds instead of running forever. Renders as any
 * element (`as`) so it can be the page's real <h1>.
 */
import { useEffect, useRef, useState } from 'react';
import './GlitchText.css';

export default function GlitchText({
  as: Tag = 'span',
  children,
  text,
  speed = 1,
  mode = 'burst', // 'burst' | 'always' | 'hover' | 'off'
  burstEvery = 4200,
  burstLength = 620,
  className = '',
}) {
  const ref = useRef(null);
  const [live, setLive] = useState(mode === 'always');
  const dataText = text ?? (typeof children === 'string' ? children : '');

  useEffect(() => {
    if (mode !== 'burst') { setLive(mode === 'always'); return undefined; }
    let onTimer = 0;
    let offTimer = 0;
    let stopped = false;
    const schedule = () => {
      onTimer = window.setTimeout(() => {
        if (stopped || document.hidden) { schedule(); return; }
        setLive(true);
        offTimer = window.setTimeout(() => { setLive(false); schedule(); }, burstLength + Math.random() * 220);
      }, burstEvery * (0.7 + Math.random() * 0.6));
    };
    schedule();
    return () => { stopped = true; window.clearTimeout(onTimer); window.clearTimeout(offTimer); };
  }, [mode, burstEvery, burstLength]);

  const style = { '--after-duration': `${speed * 3}s`, '--before-duration': `${speed * 2}s` };
  const cls = ['nl-glitch', live ? 'is-live' : '', mode === 'hover' ? 'nl-glitch--hover' : '', className].filter(Boolean).join(' ');
  return (
    <Tag ref={ref} className={cls} style={style} data-text={dataText}>
      {children}
    </Tag>
  );
}
