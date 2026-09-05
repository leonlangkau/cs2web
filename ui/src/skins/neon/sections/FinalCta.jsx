import { useRef } from 'react';
import ShinyText from '@rb/TextAnimations/ShinyText/ShinyText';
import LetterGlitch from '../vendor/LetterGlitch.jsx';
import useOnScreen from '../lib/useOnScreen.js';
import { fmtInt } from '../lib/dom.js';
import { PrimaryCta } from './Cta.jsx';

/** The closing call to action over a glitching letter field. */
export default function FinalCta({ d, env }) {
  const ref = useRef(null);
  const onScreen = useOnScreen(ref);
  return (
    <section className="nl-section nl-final" id="download" ref={ref}>
      <div className="nl-final__bg" aria-hidden="true">
        {onScreen && <LetterGlitch glitchColors={['#08202a', '#0b4a57', '#00c4d2']} glitchSpeed={70} outerVignette centerVignette={false} smooth reduced={env.reduced} />}
        <div className="nl-final__veil" />
        <div className="nl-scanlines" />
      </div>
      <div className="nl-container nl-final__inner">
        <p className="nl-kicker nl-reveal">// Section 05 — Execute</p>
        <h2 className="nl-final__title nl-reveal">
          <ShinyText text="Ready to dominate?" speed={3} color="#dfe7ff" shineColor="#00f0ff" disabled={env.reduced} />
        </h2>
        <p className="nl-final__meta nl-reveal">Windows 10/11 (64-bit) · {fmtInt(d.downloadMeta.sizeKb)} KB loader · v{d.appVersion || '—'}</p>
        <div className="nl-final__cta nl-reveal">
          <PrimaryCta d={d} env={env} size="xl" />
        </div>
        <p className="nl-final__note nl-reveal">
          {d.canDownload
            ? <span className="nl-final__sha">SHA-256: <code>{d.downloadMeta.sha256}</code></span>
            : d.user
              ? 'The cheat loader is a Paid membership benefit.'
              : <>The cheat loader is a Paid membership benefit. Already have an account? <a href={d.links.login || '/auth/login'}>Log in</a>.</>}
        </p>
      </div>
    </section>
  );
}
