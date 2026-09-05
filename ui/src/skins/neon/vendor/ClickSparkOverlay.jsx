/**
 * React Bits ClickSpark — patched into a page-wide overlay: a fixed canvas
 * that listens for pointerdown on the window (so it never wraps the page or
 * steals clicks) and only runs its RAF loop while sparks are alive.
 */
import { useEffect, useRef } from 'react';
import './ClickSparkOverlay.css';

export default function ClickSparkOverlay({
  sparkColor = '#00f0ff',
  altColor = '#ff2bd6',
  sparkSize = 12,
  sparkRadius = 22,
  sparkCount = 8,
  duration = 420,
}) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined;
    let sparks = [];
    let raf = 0;
    let dpr = 1;

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(window.innerWidth * dpr);
      canvas.height = Math.floor(window.innerHeight * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);

    const ease = (t) => t * (2 - t);
    const draw = (now) => {
      ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);
      sparks = sparks.filter((s) => {
        const elapsed = now - s.start;
        if (elapsed >= duration) return false;
        const p = ease(elapsed / duration);
        const dist = p * sparkRadius;
        const len = sparkSize * (1 - p);
        const x1 = s.x + dist * Math.cos(s.angle);
        const y1 = s.y + dist * Math.sin(s.angle);
        const x2 = s.x + (dist + len) * Math.cos(s.angle);
        const y2 = s.y + (dist + len) * Math.sin(s.angle);
        ctx.strokeStyle = s.color;
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
        return true;
      });
      raf = sparks.length ? requestAnimationFrame(draw) : 0;
      if (!sparks.length) ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);
    };

    const onDown = (e) => {
      if (e.button !== undefined && e.button !== 0) return;
      const now = performance.now();
      for (let i = 0; i < sparkCount; i += 1) {
        sparks.push({ x: e.clientX, y: e.clientY, angle: (2 * Math.PI * i) / sparkCount + Math.random() * 0.2, start: now, color: i % 3 === 0 ? altColor : sparkColor });
      }
      if (!raf) raf = requestAnimationFrame(draw);
    };
    window.addEventListener('pointerdown', onDown, { passive: true });

    return () => {
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('resize', resize);
      if (raf) cancelAnimationFrame(raf);
      sparks = [];
    };
  }, [sparkColor, altColor, sparkSize, sparkRadius, sparkCount, duration]);

  return <canvas ref={canvasRef} className="rb-clickspark" aria-hidden="true" />;
}
