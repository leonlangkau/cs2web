import { useRef } from 'react';
import AnimatedList from '../vendor/AnimatedList.jsx';
import Radar from '../vendor/Radar.jsx';
import useOnScreen from '../lib/useOnScreen.js';
import { fmtInt } from '../lib/dom.js';
import { Icon } from '../lib/icons.jsx';
import { SecondaryCta } from './Cta.jsx';

/** Recent threads (Paid+) over a radar sweep; a locked note otherwise. */
export default function Community({ d, env }) {
  const radarRef = useRef(null);
  const onScreen = useOnScreen(radarRef);
  const threads = d.recentThreads || [];
  return (
    <section className="nl-section nl-community" id="community">
      <div className="nl-container nl-community__grid">
        <div className="nl-community__list">
          <div className="nl-section__head nl-reveal">
            <p className="nl-kicker">// Section 04 — Comms</p>
            <h2 className="nl-h2">Fresh from <span className="nl-h2__accent">the forum.</span></h2>
          </div>
          {!d.canViewForum ? (
            <div className="nl-locked nl-spot nl-reveal">
              <span className="nl-locked__icon" aria-hidden="true"><Icon.lock /></span>
              <p className="nl-label nl-label--accent">// Access restricted</p>
              <p className="nl-locked__copy">The forum is a Paid membership benefit. Configs, setups and support threads open up with your upgrade.</p>
              <a className="nl-btn nl-btn--primary cursor-target" href={d.links.upgrade || '/upgrade'}>See upgrade options<Icon.arrow /></a>
            </div>
          ) : threads.length === 0 ? (
            <div className="nl-locked nl-spot nl-reveal">
              <p className="nl-label nl-label--accent">// No signal yet</p>
              <p className="nl-locked__copy">No threads yet. Be the first to post.</p>
              <a className="nl-btn nl-btn--primary cursor-target" href={d.links.forum || '/forum'}>Open the forum<Icon.arrow /></a>
            </div>
          ) : (
            <div className="nl-reveal">
              <AnimatedList
                items={threads}
                ariaLabel="Recent forum threads"
                disableAnimations={env.reduced}
                maxHeight={440}
                renderItem={(t, i, selected) => (
                  <a className={`nl-thread cursor-target ${selected ? 'is-selected' : ''}`} href={`/forum/t/${encodeURIComponent(t.id)}`}>
                    <span className="nl-thread__idx" aria-hidden="true">{String(i + 1).padStart(2, '0')}</span>
                    <span className="nl-thread__main">
                      <span className="nl-thread__cat">{t.category}</span>
                      <span className="nl-thread__title">{t.title}</span>
                      <span className="nl-thread__meta">by {t.username} · {t.updated}</span>
                    </span>
                    <span className="nl-thread__go" aria-hidden="true"><Icon.chevron /></span>
                  </a>
                )}
              />
            </div>
          )}
          {d.canViewForum && threads.length > 0 && (
            <div className="nl-community__actions nl-reveal">
              <SecondaryCta href={d.links.forum || '/forum'} env={env}>Enter the forum</SecondaryCta>
            </div>
          )}
        </div>
        <div className="nl-community__radar nl-reveal" ref={radarRef}>
          <div className="nl-radar">
            <div className="nl-radar__bg" aria-hidden="true">
              {!env.reduced && onScreen && <Radar color="#00f0ff" speed={0.45} scale={0.6} ringCount={7} spokeCount={12} sweepSpeed={1.1} sweepWidth={3} brightness={0.85} enableMouseInteraction={env.fine} />}
              <div className="nl-radar__rings" />
            </div>
            <div className="nl-radar__hud">
              <div className="nl-radar__corner nl-radar__corner--tl">
                <span className="nl-label nl-label--accent">Signal // forum</span>
                <span className="nl-radar__live"><i className="nl-led nl-led--pulse" aria-hidden="true" />SWEEP</span>
              </div>
              <div className="nl-radar__corner nl-radar__corner--br">
                <div className="nl-radar__stat"><b>{fmtInt(d.stats.threads)}</b><span className="nl-label">threads</span></div>
                <div className="nl-radar__stat"><b>{fmtInt(d.stats.posts)}</b><span className="nl-label">posts</span></div>
              </div>
              <div className="nl-radar__blip nl-radar__blip--1" aria-hidden="true" />
              <div className="nl-radar__blip nl-radar__blip--2" aria-hidden="true" />
              <div className="nl-radar__blip nl-radar__blip--3" aria-hidden="true" />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
