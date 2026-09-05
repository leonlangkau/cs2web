/**
 * React Bits Noise — patched: instead of filling a 1024² ImageData every other
 * frame, a small grain tile is rendered once to a data: URI (img-src data: is
 * allowed) and jittered with a CSS steps() animation. Effectively free.
 */
import { useEffect, useRef } from 'react';
import './NoiseOverlay.css';

let cachedTile = null;

function grainTile(size = 160, alpha = 26) {
  if (cachedTile) return cachedTile;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d');
  if (!ctx) return '';
  const img = ctx.createImageData(size, size);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const v = Math.random() * 255;
    d[i] = v; d[i + 1] = v; d[i + 2] = v; d[i + 3] = alpha;
  }
  ctx.putImageData(img, 0, 0);
  try { cachedTile = c.toDataURL('image/png'); } catch { cachedTile = ''; }
  return cachedTile;
}

export default function NoiseOverlay({ animate = true, className = '' }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const url = grainTile();
    if (url) el.style.backgroundImage = `url("${url}")`;
    return () => { el.style.backgroundImage = ''; };
  }, []);
  return <div ref={ref} className={`rb-noise ${animate ? 'rb-noise--live' : ''} ${className}`} aria-hidden="true" />;
}
