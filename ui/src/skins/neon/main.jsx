/**
 * NEON / CYBERDECK — the React Bits bundle entry.
 *
 * Runs on every skinned page: ambient background, HUD cursor + click sparks,
 * GooeyNav inside the header, the quick-nav Dock, selector-driven inner-page
 * enhancements (DecryptedText h1, GSAP reveals, pointer spotlight, magnet
 * buttons, download choreography) and — when #rb-home exists — the landing
 * app, preceded once per session by the boot overlay.
 *
 * Everything is gated by the environment (skin id, reduced motion, pointer
 * type, viewport) and cleans up after itself; nothing here touches style
 * attributes or injects <style>, so it stays CSP-clean.
 */
import './neon-tokens.css';
import './neon-global.css';
import { skinId, reducedMotion, finePointer, readJson, onReady } from '@shared/env';
import { mountInto } from '@shared/mount';
import { isDesktop } from './lib/dom.js';
import { mountBackground } from './fx/Background.jsx';
import { mountCursor } from './fx/Cursor.jsx';
import { enhanceNav } from './fx/NavFx.jsx';
import { mountDock } from './fx/QuickDock.jsx';
import { runBoot, shouldBoot } from './fx/Boot.jsx';
import { decryptHeading } from './fx/HeadingFx.jsx';
import { initReveals } from './fx/reveals.js';
import { initSpotlight } from './fx/spotlight.js';
import { initMagnet } from './fx/magnet.js';
import { initDownloads, setDownloadName } from './fx/download.js';
import { tagTargets } from './fx/targets.js';
import Landing from './Landing.jsx';

const disposers = [];
const keep = (fn) => { if (typeof fn === 'function') disposers.push(fn); };

function boot() {
  if (skinId() !== 'neon') return;
  const env = { reduced: reducedMotion(), fine: finePointer(), desktop: isDesktop() };
  const html = document.documentElement;
  html.classList.add('rb-neon', env.reduced ? 'rb-reduced' : 'rb-motion', env.fine ? 'rb-fine' : 'rb-coarse');

  // Chrome-level effects (every page)
  keep(mountBackground(env));
  if (env.fine && !env.reduced) keep(mountCursor());
  keep(enhanceNav(env));
  if (env.fine && env.desktop) keep(mountDock(env));
  keep(tagTargets());
  keep(initDownloads(document));

  const home = document.getElementById('rb-home');
  const main = document.getElementById('main');

  if (home) {
    const data = readJson('rb-home-data', null);
    if (data?.downloadMeta?.name) setDownloadName(data.downloadMeta.name);
    const ready = !env.reduced && shouldBoot() ? runBoot(data?.appVersion || '') : Promise.resolve();
    const root = mountInto(home, <Landing data={data} env={env} ready={ready} />);
    keep(() => root?.unmount());
    // chrome-only spotlight/magnet: the landing wires its own subtree after mount
    if (env.fine && !env.reduced) {
      keep(initSpotlight(document.getElementById('site-nav') || document));
    }
  } else {
    keep(decryptHeading(env));
    if (!env.reduced) keep(initReveals(main || document));
    if (env.fine && !env.reduced) {
      keep(initSpotlight(document));
      keep(initMagnet(document));
    }
  }

  window.addEventListener('pagehide', () => { disposers.splice(0).forEach((fn) => { try { fn(); } catch { /* already gone */ } }); }, { once: true });
}

onReady(boot);
