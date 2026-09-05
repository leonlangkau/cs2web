import ScrollVelocity from '@rb/TextAnimations/ScrollVelocity/ScrollVelocity';

const ROW_A = 'AIMBOT // WALLHACK // ESP // TRIGGERBOT // SKIN CHANGER // BHOP // ';
const ROW_B = 'UNDETECTED // STREAM-PROOF // KERNEL DRIVER // 24H TOKENS // SIGNED BINARIES // ';

/** Scroll-velocity marquee between the telemetry strip and the loadout grid. */
export default function Ticker({ env }) {
  if (env.reduced) {
    return (
      <div className="nl-tick nl-tick--static" aria-hidden="true">
        <div className="nl-tick__row"><span className="nl-tick__item">{ROW_A}{ROW_A}</span></div>
      </div>
    );
  }
  return (
    <div className="nl-tick" aria-hidden="true">
      <ScrollVelocity texts={[ROW_A, ROW_B]} velocity={55} numCopies={5} className="nl-tick__item" parallaxClassName="nl-tick__row" scrollerClassName="nl-tick__scroller" damping={40} stiffness={300} />
    </div>
  );
}
