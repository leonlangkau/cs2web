/**
 * React Bits DotGrid — patched: only repaints when something changed (pointer
 * proximity or a dot still in flight), pauses when the tab is hidden, and has
 * a `static` mode (touch / reduced motion) that paints the grid once.
 */
import { useRef, useEffect, useCallback, useMemo } from 'react';
import { gsap } from 'gsap';
import { InertiaPlugin } from 'gsap/InertiaPlugin';
import './DotGrid.css';

gsap.registerPlugin(InertiaPlugin);

const throttle = (func, limit) => {
  let lastCall = 0;
  return function throttled(...args) {
    const now = performance.now();
    if (now - lastCall >= limit) { lastCall = now; func.apply(this, args); }
  };
};

function hexToRgb(hex) {
  const m = hex.match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i);
  if (!m) return { r: 0, g: 0, b: 0 };
  return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) };
}

export default function DotGrid({
  dotSize = 2,
  gap = 30,
  baseColor = '#0f2a33',
  activeColor = '#00f0ff',
  proximity = 140,
  speedTrigger = 120,
  shockRadius = 220,
  shockStrength = 4,
  maxSpeed = 4000,
  resistance = 700,
  returnDuration = 1.4,
  isStatic = false,
  className = '',
}) {
  const wrapperRef = useRef(null);
  const canvasRef = useRef(null);
  const dotsRef = useRef([]);
  const dirtyRef = useRef(true);
  const pointerRef = useRef({ x: -9999, y: -9999, vx: 0, vy: 0, speed: 0, lastTime: 0, lastX: 0, lastY: 0 });

  const baseRgb = useMemo(() => hexToRgb(baseColor), [baseColor]);
  const activeRgb = useMemo(() => hexToRgb(activeColor), [activeColor]);

  const circlePath = useMemo(() => {
    if (typeof window === 'undefined' || !window.Path2D) return null;
    const p = new window.Path2D();
    p.arc(0, 0, dotSize / 2, 0, Math.PI * 2);
    return p;
  }, [dotSize]);

  const buildGrid = useCallback(() => {
    const wrap = wrapperRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    const { width, height } = wrap.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    const ctx = canvas.getContext('2d');
    if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const cols = Math.floor((width + gap) / (dotSize + gap));
    const rows = Math.floor((height + gap) / (dotSize + gap));
    const cell = dotSize + gap;
    const startX = (width - (cell * cols - gap)) / 2 + dotSize / 2;
    const startY = (height - (cell * rows - gap)) / 2 + dotSize / 2;
    const dots = [];
    for (let y = 0; y < rows; y += 1) {
      for (let x = 0; x < cols; x += 1) dots.push({ cx: startX + x * cell, cy: startY + y * cell, xOffset: 0, yOffset: 0, _inertiaApplied: false });
    }
    dotsRef.current = dots;
    dirtyRef.current = true;
  }, [dotSize, gap]);

  useEffect(() => {
    if (!circlePath) return undefined;
    let rafId = 0;
    let running = true;
    const proxSq = proximity * proximity;
    const paint = () => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (!ctx) return false;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);
      const { x: px, y: py } = pointerRef.current;
      let anyMoving = false;
      for (const dot of dotsRef.current) {
        const ox = dot.cx + dot.xOffset;
        const oy = dot.cy + dot.yOffset;
        if (dot.xOffset !== 0 || dot.yOffset !== 0) anyMoving = true;
        const dx = dot.cx - px;
        const dy = dot.cy - py;
        const dsq = dx * dx + dy * dy;
        let style = baseColor;
        if (dsq <= proxSq) {
          const t = 1 - Math.sqrt(dsq) / proximity;
          style = `rgb(${Math.round(baseRgb.r + (activeRgb.r - baseRgb.r) * t)},${Math.round(baseRgb.g + (activeRgb.g - baseRgb.g) * t)},${Math.round(baseRgb.b + (activeRgb.b - baseRgb.b) * t)})`;
        }
        ctx.save();
        ctx.translate(ox, oy);
        ctx.fillStyle = style;
        ctx.fill(circlePath);
        ctx.restore();
      }
      return anyMoving;
    };
    const loop = () => {
      rafId = 0;
      if (!running) return;
      if (dirtyRef.current) {
        const moving = paint();
        dirtyRef.current = moving;
      }
      rafId = requestAnimationFrame(loop);
    };
    const onVis = () => {
      running = !document.hidden;
      if (running && !rafId) { dirtyRef.current = true; rafId = requestAnimationFrame(loop); }
    };
    document.addEventListener('visibilitychange', onVis);
    rafId = requestAnimationFrame(loop);
    return () => {
      running = false;
      if (rafId) cancelAnimationFrame(rafId);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [proximity, baseColor, activeRgb, baseRgb, circlePath]);

  useEffect(() => {
    buildGrid();
    let ro = null;
    if ('ResizeObserver' in window) {
      ro = new ResizeObserver(buildGrid);
      if (wrapperRef.current) ro.observe(wrapperRef.current);
    } else {
      window.addEventListener('resize', buildGrid);
    }
    return () => { if (ro) ro.disconnect(); else window.removeEventListener('resize', buildGrid); };
  }, [buildGrid]);

  useEffect(() => {
    if (isStatic) return undefined;
    const onMove = (e) => {
      const now = performance.now();
      const pr = pointerRef.current;
      const dt = pr.lastTime ? now - pr.lastTime : 16;
      const dx = e.clientX - pr.lastX;
      const dy = e.clientY - pr.lastY;
      let vx = (dx / dt) * 1000;
      let vy = (dy / dt) * 1000;
      let speed = Math.hypot(vx, vy);
      if (speed > maxSpeed) { const s = maxSpeed / speed; vx *= s; vy *= s; speed = maxSpeed; }
      pr.lastTime = now; pr.lastX = e.clientX; pr.lastY = e.clientY; pr.vx = vx; pr.vy = vy; pr.speed = speed;
      const rect = canvasRef.current.getBoundingClientRect();
      pr.x = e.clientX - rect.left;
      pr.y = e.clientY - rect.top;
      dirtyRef.current = true;
      for (const dot of dotsRef.current) {
        const dist = Math.hypot(dot.cx - pr.x, dot.cy - pr.y);
        if (speed > speedTrigger && dist < proximity && !dot._inertiaApplied) {
          dot._inertiaApplied = true;
          gsap.killTweensOf(dot);
          gsap.to(dot, {
            inertia: { xOffset: dot.cx - pr.x + vx * 0.005, yOffset: dot.cy - pr.y + vy * 0.005, resistance },
            onUpdate: () => { dirtyRef.current = true; },
            onComplete: () => {
              gsap.to(dot, { xOffset: 0, yOffset: 0, duration: returnDuration, ease: 'elastic.out(1,0.75)', onUpdate: () => { dirtyRef.current = true; } });
              dot._inertiaApplied = false;
            },
          });
        }
      }
    };
    const onClick = (e) => {
      const rect = canvasRef.current.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      for (const dot of dotsRef.current) {
        const dist = Math.hypot(dot.cx - cx, dot.cy - cy);
        if (dist < shockRadius && !dot._inertiaApplied) {
          dot._inertiaApplied = true;
          gsap.killTweensOf(dot);
          const falloff = Math.max(0, 1 - dist / shockRadius);
          gsap.to(dot, {
            inertia: { xOffset: (dot.cx - cx) * shockStrength * falloff, yOffset: (dot.cy - cy) * shockStrength * falloff, resistance },
            onUpdate: () => { dirtyRef.current = true; },
            onComplete: () => {
              gsap.to(dot, { xOffset: 0, yOffset: 0, duration: returnDuration, ease: 'elastic.out(1,0.75)', onUpdate: () => { dirtyRef.current = true; } });
              dot._inertiaApplied = false;
            },
          });
        }
      }
      dirtyRef.current = true;
    };
    const throttledMove = throttle(onMove, 40);
    window.addEventListener('mousemove', throttledMove, { passive: true });
    window.addEventListener('click', onClick);
    return () => {
      window.removeEventListener('mousemove', throttledMove);
      window.removeEventListener('click', onClick);
      dotsRef.current.forEach((d) => gsap.killTweensOf(d));
    };
  }, [isStatic, maxSpeed, speedTrigger, proximity, resistance, returnDuration, shockRadius, shockStrength]);

  return (
    <div className={`dot-grid ${className}`} ref={wrapperRef}>
      <canvas ref={canvasRef} className="dot-grid__canvas" />
    </div>
  );
}
