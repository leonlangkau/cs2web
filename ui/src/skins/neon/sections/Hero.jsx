import { useEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';
import { ScrambleTextPlugin } from 'gsap/ScrambleTextPlugin';
import TextType from '@rb/TextAnimations/TextType/TextType';
import FaultyTerminal from '../vendor/FaultyTerminal.jsx';
import NoiseOverlay from '../vendor/NoiseOverlay.jsx';
import DecryptedText from '../vendor/DecryptedText.jsx';
import GlitchText from '../vendor/GlitchText.jsx';
import ElectricBorder from '../vendor/ElectricBorder.jsx';
import useOnScreen from '../lib/useOnScreen.js';
import { fmtInt } from '../lib/dom.js';
import { PrimaryCta, SecondaryCta } from './Cta.jsx';

gsap.registerPlugin(ScrambleTextPlugin);

/* The pitch is static and readable at once; only the short tagline under it is typed. */
const SUB_MAIN = 'Aimbot, wallhack, ESP, skin changer and movement hacks in one lightweight loader.';
const TAGLINES = [
  'Stop grinding. Start winning.',
  'Kernel driver. Signed binaries. Zero VAC hits in 3+ years.',
  'Insert opens the menu. Everything else is automatic.',
];

function ConsolePanel({ d, env, go }) {
  const ref = useRef(null);
  const lines = [
    ['init loader', `v${d.appVersion || '—'}`, 'ok'],
    ['driver handshake', 'OK', 'ok'],
    ['module aimbot', 'ARMED', 'armed'],
    ['module esp', 'ARMED', 'armed'],
    ['module triggerbot', 'ARMED', 'armed'],
    ['vac heuristics', 'BYPASSED', 'ok'],
    ['operators online', fmtInt(d.stats.users), 'num'],
    ['status', 'UNDETECTED', 'lime'],
  ];
  useEffect(() => {
    const el = ref.current;
    if (!el || env.reduced) return undefined;
    const rows = el.querySelectorAll('.nl-console__row');
    gsap.set(rows, { opacity: 0, x: -8 });
    if (!go) return undefined;
    const tl = gsap.timeline({ delay: 0.2 });
    tl.to(rows, { opacity: 1, x: 0, duration: 0.22, stagger: 0.07, ease: 'power2.out' });
    return () => tl.kill();
  }, [go, env.reduced]);
  return (
    <ElectricBorder color="#00f0ff" speed={0.9} chaos={0.08} borderRadius={4} className="nl-console-eb" reduced={env.reduced}>
      <div className="nl-console nl-spot" ref={ref}>
        <div className="nl-console__head">
          <span className="nl-label nl-label--accent">Console // readout</span>
          <span className="nl-console__live"><i className="nl-led nl-led--pulse" aria-hidden="true" />LIVE</span>
        </div>
        <svg className="nl-console__reticle" viewBox="0 0 120 120" aria-hidden="true">
          <circle cx="60" cy="60" r="54" className="nl-reticle__ring nl-reticle__ring--outer" />
          <circle cx="60" cy="60" r="40" className="nl-reticle__ring nl-reticle__ring--mid" />
          <circle cx="60" cy="60" r="22" className="nl-reticle__ring" />
          <path d="M60 2v20M60 98v20M2 60h20M98 60h20" className="nl-reticle__tick" />
          <path d="M60 46v28M46 60h28" className="nl-reticle__cross" />
          <circle cx="60" cy="60" r="2.5" className="nl-reticle__dot" />
        </svg>
        <dl className="nl-console__rows">
          {lines.map(([k, v, kind]) => (
            <div className="nl-console__row" key={k}>
              <dt><span className="nl-console__prompt" aria-hidden="true">&gt;</span>{k}</dt>
              <dd className={`is-${kind}`}>{v}</dd>
            </div>
          ))}
        </dl>
        <div className="nl-console__foot">
          <span className="nl-label">SIG {String(d.downloadMeta.sha256 || '').slice(0, 14) || '—'}…</span>
          <span className="nl-console__cursor" aria-hidden="true">_</span>
        </div>
      </div>
    </ElectricBorder>
  );
}

export default function Hero({ d, env, ready }) {
  const sectionRef = useRef(null);
  const accentRef = useRef(null);
  const [go, setGo] = useState(env.reduced);
  const onScreen = useOnScreen(sectionRef, { rootMargin: '0px' });

  useEffect(() => {
    let alive = true;
    (ready || Promise.resolve()).then(() => { if (alive) setGo(true); });
    return () => { alive = false; };
  }, [ready]);

  // Entrance choreography once the boot overlay is gone: everything lands
  // within ~0.9s so the headline is readable at once.
  useEffect(() => {
    const el = sectionRef.current;
    if (!el || env.reduced) return undefined;
    const copy = el.querySelectorAll('.nl-hero__kicker, .nl-hero__title, .nl-hero__sub, .nl-hero__cta, .nl-hero__meta');
    gsap.set(copy, { opacity: 0, y: 14 });
    gsap.set(accentRef.current, { opacity: 0 });
    if (!go) return undefined;
    const tl = gsap.timeline();
    tl.to(copy, { opacity: 1, y: 0, duration: 0.5, stagger: 0.07, ease: 'power3.out' }, 0);
    tl.to(accentRef.current, { opacity: 1, duration: 0.01 }, 0.1);
    tl.to(accentRef.current, { duration: 0.7, scrambleText: { text: 'Never lose again.', chars: 'upperAndLowerCase', speed: 0.5, revealDelay: 0.08 }, ease: 'none' }, 0.1);
    return () => tl.kill();
  }, [go, env.reduced]);

  return (
    <section className="nl-hero" id="hero" ref={sectionRef}>
      <div className="nl-hero__bg" aria-hidden="true">
        {!env.reduced && onScreen && (
          <FaultyTerminal tint="#00f0ff" brightness={0.34} scale={1.5} gridMul={[2, 1]} digitSize={1.4} timeScale={0.32} scanlineIntensity={0.55} flickerAmount={0.7} curvature={0.1} mouseReact={env.fine} mouseStrength={0.22} dpr={env.fine ? 0.6 : 0.5} />
        )}
        <div className="nl-hero__veil" />
        <NoiseOverlay animate={!env.reduced} />
        <div className="nl-scanlines" />
      </div>
      <div className="nl-container nl-hero__inner">
        <div className="nl-hero__copy">
          <p className="nl-hero__kicker">
            <i className="nl-led nl-led--pulse" aria-hidden="true" />
            <DecryptedText text={`// PREMIUM CS2 CHEAT · BUILD v${d.appVersion || '1.0'}`} animateOn="mount" speed={20} duration={620} disabled={env.reduced || !go} encryptedClassName="nl-decrypting" />
          </p>
          <h1 className="nl-hero__title">
            <GlitchText as="span" mode={env.reduced || !env.fine ? 'off' : 'burst'} text="Dominate every match." className="nl-hero__line">Dominate every match.</GlitchText>
            <span className="nl-hero__line nl-hero__line--accent" ref={accentRef}>Never lose again.</span>
          </h1>
          <p className="nl-hero__sub">
            <span className="nl-hero__sub-main">{SUB_MAIN}</span>
            <span className="nl-hero__tagline">
              <span className="nl-sr">{TAGLINES[0]}</span>
              {env.reduced ? (
                <span aria-hidden="true">{TAGLINES[0]}</span>
              ) : (
                <TextType as="span" aria-hidden="true" text={TAGLINES} typingSpeed={24} deletingSpeed={10} pauseDuration={2800} initialDelay={go ? 420 : 999999} cursorCharacter="▌" cursorClassName="nl-hero__caret" loop />
              )}
            </span>
          </p>
          <div className="nl-hero__cta">
            <PrimaryCta d={d} env={env} />
            <SecondaryCta href={d.links.forum || '/forum'} env={env}>Join the community</SecondaryCta>
          </div>
          <ul className="nl-hero__meta" aria-label="Loader facts">
            <li>WIN 10/11 · x64</li>
            <li>{fmtInt(d.downloadMeta.sizeKb)} KB LOADER</li>
            <li>NO VAC DETECTIONS · 3Y+</li>
          </ul>
        </div>
        <aside className="nl-hero__console" aria-label="Live console readout">
          <ConsolePanel d={d} env={env} go={go} />
        </aside>
      </div>
      <div className="nl-hero__foot nl-container" aria-hidden="true">
        <span className="nl-label">SCROLL // <span className="nl-hero__scrollbar"><i /></span></span>
        <span className="nl-label">UPLINK OK · LATENCY 12 MS · NODE EU-WEST</span>
      </div>
    </section>
  );
}
