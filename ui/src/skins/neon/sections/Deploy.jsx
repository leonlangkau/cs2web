import Stepper, { Step } from '../vendor/Stepper.jsx';
import { fmtInt } from '../lib/dom.js';

/** "Inject in three steps" — React Bits Stepper + the loader manifest. */
export default function Deploy({ d, env }) {
  const cta = d.cta || {};
  const isDownload = cta.kind === 'download' && d.links?.download;
  const finalHref = isDownload ? d.links.download : cta.href;
  const finalProps = isDownload ? { rel: 'nofollow', 'data-download': '' } : {};
  const sha = d.downloadMeta.sha256 || '';
  return (
    <section className="nl-section nl-deploy" id="inject">
      <div className="nl-container nl-deploy__grid">
        <div className="nl-deploy__steps nl-reveal">
          <p className="nl-kicker">// Section 03 — Deploy</p>
          <h2 className="nl-h2">Inject in <span className="nl-h2__accent">three steps.</span></h2>
          <Stepper initialStep={1} backButtonText="Back" nextButtonText="Next step" finalLabel={cta.label || 'Get started'} finalHref={finalHref} finalProps={finalProps} reduced={env.reduced} className="nl-stepper--deploy">
            <Step>
              <p className="nl-label nl-label--accent">Step 01 // Run the loader</p>
              <h3 className="nl-step__title">Download, run, follow the prompts.</h3>
              <p className="nl-step__copy">No installer, no bundled junk. The loader is a single {fmtInt(d.downloadMeta.sizeKb)} KB signed executable — drop it anywhere and launch it.</p>
              <ul className="nl-chips" aria-label="Details"><li>SIGNED BINARY</li><li>{fmtInt(d.downloadMeta.sizeKb)} KB</li><li>WIN 10/11 x64</li></ul>
            </Step>
            <Step>
              <p className="nl-label nl-label--accent">Step 02 // Sign in</p>
              <h3 className="nl-step__title">Use your GoyHub account.</h3>
              <p className="nl-step__copy">The loader fetches a signed 24-hour token automatically. Paid membership unlocks the download; the token is tied to your machine fingerprint.</p>
              <ul className="nl-chips" aria-label="Details"><li>24H TOKEN</li><li>HWID BOUND</li><li>ENCRYPTED</li></ul>
            </Step>
            <Step>
              <p className="nl-label nl-label--accent">Step 03 // Launch CS2</p>
              <h3 className="nl-step__title">The cheat injects itself.</h3>
              <p className="nl-step__copy">Start the game as usual. The menu appears in-game — press Insert to open it, tune your loadout and go.</p>
              <ul className="nl-chips" aria-label="Details"><li>KERNEL DRIVER</li><li>INSERT = MENU</li><li>STREAM-PROOF</li></ul>
            </Step>
          </Stepper>
        </div>
        <aside className="nl-manifest nl-spot nl-reveal" aria-label="Loader manifest">
          <div className="nl-manifest__head">
            <span className="nl-label nl-label--accent">Manifest // loader</span>
            <span className="nl-manifest__ok"><i className="nl-led" aria-hidden="true" />VERIFIED</span>
          </div>
          <dl className="nl-manifest__rows">
            <div><dt>file</dt><dd>{d.downloadMeta.name}</dd></div>
            <div><dt>version</dt><dd>v{d.appVersion || '—'}</dd></div>
            <div><dt>size</dt><dd>{fmtInt(d.downloadMeta.sizeKb)} KB</dd></div>
            <div><dt>platform</dt><dd>Windows 10/11 · x64</dd></div>
            <div><dt>driver</dt><dd>kernel · signed</dd></div>
            <div><dt>detections</dt><dd className="is-lime">0 · 3y+</dd></div>
          </dl>
          <div className="nl-manifest__sha">
            <span className="nl-label">SHA-256</span>
            <code>{sha ? sha : 'available after sign-in'}</code>
          </div>
          <div className="nl-manifest__foot">
            {d.canDownload
              ? <span>Ready for your account. <a href={d.links.downloadPage || '/download'}>Download page</a></span>
              : d.user
                ? <span>The loader is a Paid benefit. <a href={d.links.upgrade || '/upgrade'}>See upgrade options</a></span>
                : <span>The loader is a Paid benefit. Have an account? <a href={d.links.login || '/auth/login'}>Log in</a></span>}
          </div>
        </aside>
      </div>
    </section>
  );
}
