import { useEffect, useRef, useState } from 'react';
import { mountOverlay } from '@shared/mount';
import { session } from '../lib/dom.js';

const KEY = 'gh-neon-booted';
const TOTAL = 900; // ms until the overlay starts leaving (<= 1s on screen)

export const shouldBoot = () => session.get(KEY) !== '1';

function BootOverlay({ version, onDone }) {
  const [leaving, setLeaving] = useState(false);
  const done = useRef(false);
  useEffect(() => {
    const finish = () => { if (done.current) return; done.current = true; setLeaving(true); window.setTimeout(onDone, 220); };
    const t = window.setTimeout(finish, TOTAL);
    const skip = () => finish();
    window.addEventListener('keydown', skip);
    window.addEventListener('pointerdown', skip);
    return () => { window.clearTimeout(t); window.removeEventListener('keydown', skip); window.removeEventListener('pointerdown', skip); };
  }, [onDone]);
  const lines = [
    ['kernel driver', 'OK'],
    ['anti-cheat shim', 'OK'],
    ['operator console', 'OK'],
    ['uplink // encrypted', 'OK'],
  ];
  return (
    <div className={`rb-boot ${leaving ? 'is-leaving' : ''}`} role="presentation" aria-hidden="true">
      <div className="rb-boot__frame">
        <div className="rb-boot__head"><span>GoyHub // Cyberdeck</span><span>build v{version}</span></div>
        {lines.map(([label, status], i) => (
          <div key={label} className="rb-boot__line" style={{ '--d': `${0.04 + i * 0.11}s` }}><span>{label}</span><b>{status}</b></div>
        ))}
        <div className="rb-boot__online">System online</div>
        <div className="rb-boot__skip">press any key to skip</div>
        <div className="rb-boot__bar" />
      </div>
    </div>
  );
}

/** Shows the boot overlay once per session; resolves when it is gone. */
export function runBoot(version = '') {
  session.set(KEY, '1');
  return new Promise((resolve) => {
    let mounted;
    const onDone = () => { mounted?.root.unmount(); mounted?.host.remove(); resolve(); };
    mounted = mountOverlay(<BootOverlay version={version} onDone={onDone} />, { id: 'rb-boot' });
  });
}
