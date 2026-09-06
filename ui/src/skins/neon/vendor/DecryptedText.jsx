/**
 * React Bits DecryptedText — patched for accessibility and control:
 *  - the readable copy is visually hidden with the clip pattern (the original
 *    used visibility:hidden, which hides it from assistive tech too)
 *  - once decrypted the plain text is rendered without aria-hidden
 *  - `disabled` renders the final text at once (reduced motion)
 *  - `onComplete` fires when the reveal finishes
 *  - `duration` (ms) makes the sequential reveal time-based, so the line lands
 *    on schedule even when the main thread is busy and ticks arrive late
 * Supports animateOn: 'view' | 'mount' | 'hover'.
 */
import { useEffect, useState, useRef, useMemo, useCallback } from 'react';

const SR = { position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap', border: 0 };

export default function DecryptedText({
  text,
  speed = 40,
  maxIterations = 12,
  sequential = true,
  revealDirection = 'start',
  characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#$%&*<>/\\|=+',
  className = '',
  parentClassName = '',
  encryptedClassName = '',
  animateOn = 'view',
  disabled = false,
  delay = 0,
  duration = 0,
  onComplete,
  as: Tag = 'span',
}) {
  const [display, setDisplay] = useState(text);
  const [revealed, setRevealed] = useState(() => new Set());
  const [animating, setAnimating] = useState(false);
  const [done, setDone] = useState(disabled);
  const hasRun = useRef(false);
  const ref = useRef(null);
  const timer = useRef(null);
  const chars = useMemo(() => characters.split(''), [characters]);

  const shuffle = useCallback((set) => text.split('').map((ch, i) => {
    if (ch === ' ' || ch === '\n') return ch;
    if (set.has(i)) return text[i];
    return chars[Math.floor(Math.random() * chars.length)];
  }).join(''), [text, chars]);

  const start = useCallback(() => {
    if (disabled) return;
    setDone(false);
    setRevealed(new Set());
    setAnimating(true);
  }, [disabled]);

  useEffect(() => {
    if (!animating) return undefined;
    let iteration = 0;
    let t0 = 0;
    const len = text.length;
    const nextIndex = (set) => {
      if (revealDirection === 'end') return len - 1 - set.size;
      if (revealDirection === 'center') {
        const mid = Math.floor(len / 2);
        const off = Math.floor(set.size / 2);
        const idx = set.size % 2 === 0 ? mid + off : mid - off - 1;
        if (idx >= 0 && idx < len && !set.has(idx)) return idx;
        for (let i = 0; i < len; i += 1) if (!set.has(i)) return i;
        return 0;
      }
      return set.size;
    };
    const finish = () => {
      window.clearInterval(timer.current);
      setAnimating(false);
      setDisplay(text);
      setDone(true);
      onComplete?.();
    };
    const tick = () => {
      setRevealed((prev) => {
        if (sequential) {
          if (prev.size >= len) { finish(); return prev; }
          const next = new Set(prev);
          // reveal ~2 chars per tick on long strings so the whole line lands quickly;
          // with a duration the reveal follows the clock instead of the tick count
          const per = len > 24 ? 2 : 1;
          const target = duration > 0
            ? Math.max(next.size + 1, Math.min(len, Math.ceil((len * (performance.now() - t0)) / duration)))
            : next.size + per;
          while (next.size < target && next.size < len) next.add(nextIndex(next));
          setDisplay(shuffle(next));
          return next;
        }
        setDisplay(shuffle(prev));
        iteration += 1;
        if (iteration >= maxIterations) finish();
        return prev;
      });
    };
    timer.current = window.setTimeout(() => {
      t0 = performance.now();
      tick();
      timer.current = window.setInterval(tick, speed);
    }, delay);
    return () => { window.clearTimeout(timer.current); window.clearInterval(timer.current); };
  }, [animating, text, speed, maxIterations, sequential, revealDirection, shuffle, delay, duration, onComplete]);

  useEffect(() => {
    if (disabled) { setDisplay(text); setDone(true); return undefined; }
    if (animateOn === 'mount') { if (!hasRun.current) { hasRun.current = true; start(); } return undefined; }
    if (animateOn !== 'view') return undefined;
    const el = ref.current;
    if (!el || !('IntersectionObserver' in window)) { start(); return undefined; }
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting && !hasRun.current) { hasRun.current = true; start(); io.disconnect(); }
      });
    }, { threshold: 0.1 });
    io.observe(el);
    return () => io.disconnect();
  }, [animateOn, disabled, start, text]);

  const hoverProps = animateOn === 'hover' && !disabled
    ? { onMouseEnter: () => { if (!animating) start(); } }
    : {};

  if (done) {
    return <Tag ref={ref} className={`${parentClassName} ${className}`.trim()} {...hoverProps}>{text}</Tag>;
  }
  return (
    <Tag ref={ref} className={parentClassName} {...hoverProps}>
      <span style={SR}>{text}</span>
      <span aria-hidden="true">
        {display.split('').map((ch, i) => (
          <span key={i} className={revealed.has(i) ? className : encryptedClassName}>{ch}</span>
        ))}
      </span>
    </Tag>
  );
}
