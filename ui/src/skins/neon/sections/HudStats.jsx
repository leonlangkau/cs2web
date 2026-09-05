import CountUp from '@rb/TextAnimations/CountUp/CountUp';
import ElectricBorder from '../vendor/ElectricBorder.jsx';
import { fmtInt } from '../lib/dom.js';

const STATS = [
  ['users', 'Cheaters registered', 'OPERATORS', '#00f0ff'],
  ['downloads', 'Loaders served', 'PAYLOADS', '#00f0ff'],
  ['threads', 'Forum threads', 'COMMS', '#ff2bd6'],
  ['posts', 'Posts & replies', 'SIGNALS', '#c6ff3d'],
];

/** Deterministic little bar-chart so every card has a distinct "trace". */
const bars = (seed) => Array.from({ length: 14 }, (_, i) => 30 + Math.round(((Math.sin((i + 1) * (seed + 3) * 1.7) + 1) / 2) * 65));

export default function HudStats({ d, env }) {
  return (
    <section className="nl-section nl-stats" id="stats">
      <div className="nl-container">
        <p className="nl-kicker nl-reveal">// Section 01 — Telemetry</p>
        <div className="nl-stats__grid">
          {STATS.map(([key, label, tag, color], i) => {
            const value = Number(d.stats[key]) || 0;
            return (
              <div className="nl-reveal" key={key}>
                <ElectricBorder color={color} speed={0.7 + i * 0.15} chaos={0.07} borderRadius={4} className="nl-stat-eb" reduced={env.reduced}>
                  <div className="nl-stat nl-spot cursor-target" style={{ '--stat-color': color }}>
                    <div className="nl-stat__head">
                      <span className="nl-label">{String(i + 1).padStart(2, '0')} // {tag}</span>
                      <i className="nl-led nl-led--pulse" aria-hidden="true" />
                    </div>
                    <div className="nl-stat__value">
                      {env.reduced ? <span>{fmtInt(value)}</span> : <CountUp to={value} from={0} duration={1.6} separator="," delay={0.1 + i * 0.1} />}
                    </div>
                    <div className="nl-stat__label">{label}</div>
                    <div className="nl-stat__bars" aria-hidden="true">
                      {bars(i).map((h, j) => <i key={j} style={{ '--h': `${h}%` }} />)}
                    </div>
                  </div>
                </ElectricBorder>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
