/**
 * React Bits LetterGlitch — patched: uses the skin's mono font, pauses while
 * off-screen or hidden, `reduced` paints once, vignettes via classes, and the
 * colour interpolation bug (rgb() strings fed back into a hex parser) is fixed
 * by keeping RGB tuples.
 */
import { useRef, useEffect } from 'react';
import './LetterGlitch.css';

const hexToRgb = (hex) => {
  const h = hex.replace(/^#?([a-f\d])([a-f\d])([a-f\d])$/i, (m, r, g, b) => r + r + g + g + b + b);
  const res = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(h);
  return res ? { r: parseInt(res[1], 16), g: parseInt(res[2], 16), b: parseInt(res[3], 16) } : { r: 255, g: 255, b: 255 };
};
const lerp = (a, b, f) => ({ r: Math.round(a.r + (b.r - a.r) * f), g: Math.round(a.g + (b.g - a.g) * f), b: Math.round(a.b + (b.b - a.b) * f) });
const css = (c) => `rgb(${c.r},${c.g},${c.b})`;

export default function LetterGlitch({
  glitchColors = ['#0b2a33', '#0e5966', '#00f0ff'],
  glitchSpeed = 60,
  centerVignette = false,
  outerVignette = true,
  smooth = true,
  reduced = false,
  className = '',
  characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ!@#$&*()-_+=/[]{};:<>.,0123456789',
}) {
  const canvasRef = useRef(null);
  const wrapRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return undefined;
    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined;
    const palette = glitchColors.map(hexToRgb);
    const chars = Array.from(characters);
    const fontSize = 15; const cw = 11; const ch = 20;
    let letters = []; let cols = 0; let rows = 0;
    let raf = 0; let running = false; let last = 0;
    const rc = () => chars[Math.floor(Math.random() * chars.length)];
    const rcol = () => palette[Math.floor(Math.random() * palette.length)];
    const font = getComputedStyle(wrap).getPropertyValue('--nl-mono').trim() || 'monospace';

    const drawAll = () => {
      const { width, height } = wrap.getBoundingClientRect();
      ctx.clearRect(0, 0, width, height);
      ctx.font = `${fontSize}px ${font}`;
      ctx.textBaseline = 'top';
      for (let i = 0; i < letters.length; i += 1) {
        const l = letters[i];
        ctx.fillStyle = css(l.color);
        ctx.fillText(l.char, (i % cols) * cw, Math.floor(i / cols) * ch);
      }
    };
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = wrap.getBoundingClientRect();
      canvas.width = Math.floor(rect.width * dpr); canvas.height = Math.floor(rect.height * dpr);
      canvas.style.width = `${rect.width}px`; canvas.style.height = `${rect.height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      cols = Math.ceil(rect.width / cw); rows = Math.ceil(rect.height / ch);
      letters = Array.from({ length: cols * rows }, () => { const c = rcol(); return { char: rc(), color: c, target: c, p: 1 }; });
      drawAll();
    };
    const update = () => {
      const n = Math.max(1, Math.floor(letters.length * 0.04));
      for (let i = 0; i < n; i += 1) {
        const idx = Math.floor(Math.random() * letters.length);
        const l = letters[idx]; if (!l) continue;
        l.char = rc(); l.target = rcol();
        if (!smooth) { l.color = l.target; l.p = 1; } else { l.p = 0; }
      }
    };
    const smoothStep = () => {
      let changed = false;
      for (const l of letters) {
        if (l.p < 1) { l.p = Math.min(1, l.p + 0.06); l.color = lerp(l.color, l.target, l.p); changed = true; }
      }
      return changed;
    };
    const loop = (now) => {
      if (!running) return;
      let dirty = false;
      if (now - last >= glitchSpeed) { update(); last = now; dirty = true; }
      if (smooth && smoothStep()) dirty = true;
      if (dirty) drawAll();
      raf = requestAnimationFrame(loop);
    };
    const start = () => { if (running || reduced) return; running = true; raf = requestAnimationFrame(loop); };
    const stop = () => { running = false; if (raf) cancelAnimationFrame(raf); raf = 0; };
    let onScreen = true; let pageVisible = !document.hidden;
    const sync = () => { if (onScreen && pageVisible) start(); else stop(); };
    const io = new IntersectionObserver(([e]) => { onScreen = e.isIntersecting; sync(); }, { rootMargin: '60px' });
    io.observe(wrap);
    const onVis = () => { pageVisible = !document.hidden; sync(); };
    document.addEventListener('visibilitychange', onVis);
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);
    resize();
    sync();
    return () => { stop(); io.disconnect(); ro.disconnect(); document.removeEventListener('visibilitychange', onVis); };
  }, [glitchSpeed, smooth, reduced, glitchColors, characters]);

  return (
    <div ref={wrapRef} className={`nl-lglitch ${className}`} aria-hidden="true">
      <canvas ref={canvasRef} className="nl-lglitch__canvas" />
      {outerVignette && <div className="nl-lglitch__vig nl-lglitch__vig--outer" />}
      {centerVignette && <div className="nl-lglitch__vig nl-lglitch__vig--center" />}
    </div>
  );
}
