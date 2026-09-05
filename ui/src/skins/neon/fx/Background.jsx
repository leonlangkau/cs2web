import { mountInto } from '@shared/mount';
import DotGrid from '../vendor/DotGrid.jsx';

/** Ambient dot grid in the #rb-bg host: reactive on fine pointers, still otherwise. */
export function mountBackground(env) {
  const host = document.getElementById('rb-bg');
  if (!host) return null;
  if (env.reduced || !env.fine) {
    const el = document.createElement('div');
    el.className = 'rb-bg-neon rb-bg-neon--static';
    host.appendChild(el);
    return () => el.remove();
  }
  const wrap = document.createElement('div');
  wrap.className = 'rb-bg-neon';
  host.appendChild(wrap);
  const root = mountInto(wrap, <DotGrid dotSize={2} gap={30} baseColor="#0d2730" activeColor="#00f0ff" proximity={140} shockRadius={220} shockStrength={4} />);
  return () => { root?.unmount(); wrap.remove(); };
}
