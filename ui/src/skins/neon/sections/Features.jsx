import { useRef } from 'react';
import { ParticleCard, GlobalSpotlight, BentoGrid } from '../vendor/MagicBento.jsx';

const SPAN = { aimbot: 'nl-bento--wide', secure: 'nl-bento--wide' };
const STATUS = { aimbot: 'ARMED', esp: 'ARMED', trigger: 'ARMED', skins: 'LOADED', movement: 'ARMED', secure: 'SECURE' };

/** The loadout: MagicBento cards (spotlight, particles, tilt, magnetism, click ripple). */
export default function Features({ d, env }) {
  const gridRef = useRef(null);
  const still = env.reduced || !env.fine;
  return (
    <section className="nl-section nl-features" id="features">
      <div className="nl-container">
        <div className="nl-section__head nl-reveal">
          <p className="nl-kicker">// Section 02 — Loadout</p>
          <h2 className="nl-h2">Everything you need to rage. <span className="nl-h2__accent">All in one place.</span></h2>
          <p className="nl-lede">Six modules, one loader. Every one of them configurable from the in-game menu, every one of them running behind a signed kernel driver.</p>
        </div>
        {!still && <GlobalSpotlight gridRef={gridRef} spotlightRadius={340} />}
        <BentoGrid gridRef={gridRef} className="nl-bento">
          {d.features.map((f, i) => (
            <ParticleCard key={f.key} className={`nl-bento__card nl-reveal cursor-target ${SPAN[f.key] || ''}`} disableAnimations={still} particleCount={9} enableTilt clickEffect enableMagnetism>
              <div className="nl-bento__head">
                <span className="nl-bento__icon" aria-hidden="true">
                  {/* server-authored, trusted SVG path markup from views/skins/common.js */}
                  <svg viewBox="0 0 24 24" dangerouslySetInnerHTML={{ __html: f.icon }} />
                </span>
                <span className="nl-label">MOD.{String(i + 1).padStart(2, '0')}</span>
              </div>
              <div className="nl-bento__body">
                <h3 className="nl-bento__title">{f.title}</h3>
                <p className="nl-bento__copy">{f.copy}</p>
              </div>
              <div className="nl-bento__foot">
                <span className="nl-bento__status"><i className="nl-led" aria-hidden="true" />{STATUS[f.key] || 'ARMED'}</span>
                <span className="nl-bento__meter" aria-hidden="true"><i /><i /><i /><i /><i /><i /><i /><i /></span>
              </div>
            </ParticleCard>
          ))}
        </BentoGrid>
      </div>
    </section>
  );
}
