/**
 * React Bits ElectricBorder — patched: the canvas loop pauses while the card
 * is off-screen or the tab is hidden, and `reduced` draws a single static
 * frame. Colour is a CSS custom property so it can come from the tokens.
 */
import { useEffect, useRef, useCallback } from 'react';
import './ElectricBorder.css';

export default function ElectricBorder({ children, color = '#00f0ff', speed = 1, chaos = 0.1, borderRadius = 4, className, style, reduced = false }) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const rafRef = useRef(0);
  const timeRef = useRef(0);
  const lastRef = useRef(0);

  const random = useCallback((x) => (Math.sin(x * 12.9898) * 43758.5453) % 1, []);
  const noise2D = useCallback((x, y) => {
    const i = Math.floor(x); const j = Math.floor(y); const fx = x - i; const fy = y - j;
    const a = random(i + j * 57); const b = random(i + 1 + j * 57); const c = random(i + (j + 1) * 57); const d = random(i + 1 + (j + 1) * 57);
    const ux = fx * fx * (3 - 2 * fx); const uy = fy * fy * (3 - 2 * fy);
    return a * (1 - ux) * (1 - uy) + b * ux * (1 - uy) + c * (1 - ux) * uy + d * ux * uy;
  }, [random]);
  const octavedNoise = useCallback((x, octaves, lacunarity, gain, baseAmplitude, baseFrequency, time, seed, baseFlatness) => {
    let y = 0; let amplitude = baseAmplitude; let frequency = baseFrequency;
    for (let i = 0; i < octaves; i += 1) {
      let octaveAmplitude = amplitude;
      if (i === 0) octaveAmplitude *= baseFlatness;
      y += octaveAmplitude * noise2D(frequency * x + seed * 100, time * frequency * 0.3);
      frequency *= lacunarity; amplitude *= gain;
    }
    return y;
  }, [noise2D]);
  const cornerPoint = useCallback((cx, cy, r, startAngle, arc, p) => ({ x: cx + r * Math.cos(startAngle + p * arc), y: cy + r * Math.sin(startAngle + p * arc) }), []);
  const rectPoint = useCallback((t, left, top, width, height, radius) => {
    const sw = width - 2 * radius; const sh = height - 2 * radius; const ca = (Math.PI * radius) / 2;
    const total = 2 * sw + 2 * sh + 4 * ca; const dist = t * total; let acc = 0;
    if (dist <= acc + sw) return { x: left + radius + ((dist - acc) / sw) * sw, y: top };
    acc += sw;
    if (dist <= acc + ca) return cornerPoint(left + width - radius, top + radius, radius, -Math.PI / 2, Math.PI / 2, (dist - acc) / ca);
    acc += ca;
    if (dist <= acc + sh) return { x: left + width, y: top + radius + ((dist - acc) / sh) * sh };
    acc += sh;
    if (dist <= acc + ca) return cornerPoint(left + width - radius, top + height - radius, radius, 0, Math.PI / 2, (dist - acc) / ca);
    acc += ca;
    if (dist <= acc + sw) return { x: left + width - radius - ((dist - acc) / sw) * sw, y: top + height };
    acc += sw;
    if (dist <= acc + ca) return cornerPoint(left + radius, top + height - radius, radius, Math.PI / 2, Math.PI / 2, (dist - acc) / ca);
    acc += ca;
    if (dist <= acc + sh) return { x: left, y: top + height - radius - ((dist - acc) / sh) * sh };
    acc += sh;
    return cornerPoint(left + radius, top + radius, radius, Math.PI, Math.PI / 2, (dist - acc) / ca);
  }, [cornerPoint]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return undefined;
    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined;
    const octaves = 8; const lacunarity = 1.6; const gain = 0.7; const amplitude = chaos; const frequency = 10; const displacement = 60; const off = 40;
    let width = 0; let height = 0;
    const dpr = () => Math.min(window.devicePixelRatio || 1, 2);
    const updateSize = () => {
      const rect = container.getBoundingClientRect();
      width = rect.width + off * 2; height = rect.height + off * 2;
      const d = dpr();
      canvas.width = Math.floor(width * d); canvas.height = Math.floor(height * d);
      canvas.style.width = `${width}px`; canvas.style.height = `${height}px`;
    };
    updateSize();
    const draw = (now) => {
      const d = dpr();
      const dt = lastRef.current ? (now - lastRef.current) / 1000 : 0;
      timeRef.current += dt * speed; lastRef.current = now;
      ctx.setTransform(d, 0, 0, d, 0, 0);
      ctx.clearRect(0, 0, width, height);
      ctx.strokeStyle = color; ctx.lineWidth = 1; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      const bw = width - 2 * off; const bh = height - 2 * off;
      const radius = Math.min(borderRadius, Math.min(bw, bh) / 2);
      const samples = Math.floor((2 * (bw + bh) + 2 * Math.PI * radius) / 3);
      ctx.beginPath();
      for (let i = 0; i <= samples; i += 1) {
        const p = i / samples;
        const pt = rectPoint(p, off, off, bw, bh, radius);
        const xN = octavedNoise(p * 8, octaves, lacunarity, gain, amplitude, frequency, timeRef.current, 0, 0);
        const yN = octavedNoise(p * 8, octaves, lacunarity, gain, amplitude, frequency, timeRef.current, 1, 0);
        const x = pt.x + xN * displacement; const y = pt.y + yN * displacement;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.closePath(); ctx.stroke();
    };
    let running = false;
    const loop = (now) => { draw(now); rafRef.current = running ? requestAnimationFrame(loop) : 0; };
    const start = () => { if (running || reduced) return; running = true; lastRef.current = 0; rafRef.current = requestAnimationFrame(loop); };
    const stop = () => { running = false; if (rafRef.current) cancelAnimationFrame(rafRef.current); rafRef.current = 0; };
    let onScreen = true; let pageVisible = !document.hidden;
    const sync = () => { if (onScreen && pageVisible) start(); else stop(); };
    const io = new IntersectionObserver(([e]) => { onScreen = e.isIntersecting; sync(); }, { rootMargin: '80px' });
    io.observe(container);
    const onVis = () => { pageVisible = !document.hidden; sync(); };
    document.addEventListener('visibilitychange', onVis);
    const ro = new ResizeObserver(() => { updateSize(); if (reduced) draw(performance.now()); });
    ro.observe(container);
    if (reduced) draw(performance.now()); else sync();
    return () => { stop(); io.disconnect(); ro.disconnect(); document.removeEventListener('visibilitychange', onVis); };
  }, [color, speed, chaos, borderRadius, octavedNoise, rectPoint, reduced]);

  return (
    <div ref={containerRef} className={`electric-border ${className ?? ''}`} style={{ '--electric-border-color': color, borderRadius, ...style }}>
      <div className="eb-canvas-container"><canvas ref={canvasRef} className="eb-canvas" aria-hidden="true" /></div>
      <div className="eb-layers" aria-hidden="true"><div className="eb-glow-1" /><div className="eb-glow-2" /><div className="eb-background-glow" /></div>
      <div className="eb-content">{children}</div>
    </div>
  );
}
