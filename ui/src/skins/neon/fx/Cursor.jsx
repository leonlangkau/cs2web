import { mountOverlay } from '@shared/mount';
import TargetCursor from '../vendor/TargetCursor.jsx';
import ClickSparkOverlay from '../vendor/ClickSparkOverlay.jsx';

/** Corner-bracket cursor + click sparks. Caller gates on fine pointer + motion. */
export function mountCursor() {
  const { host, root } = mountOverlay(
    <>
      <TargetCursor targetSelector=".cursor-target" spinDuration={2.6} hoverDuration={0.18} />
      <ClickSparkOverlay sparkColor="#00f0ff" altColor="#ff2bd6" sparkSize={12} sparkRadius={24} sparkCount={8} duration={420} />
    </>,
    { id: 'rb-cursor' },
  );
  return () => { root.unmount(); host.remove(); };
}
