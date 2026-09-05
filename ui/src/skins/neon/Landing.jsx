/**
 * The neon landing page, rendered from the #rb-home-data block in place of
 * the server-rendered fallback. Section ids match the fallback so in-page
 * links (/#features, /#download) keep working.
 */
import { useEffect, useRef } from 'react';
import './neon-landing.css';
import Hero from './sections/Hero.jsx';
import HudStats from './sections/HudStats.jsx';
import Ticker from './sections/Ticker.jsx';
import Features from './sections/Features.jsx';
import Deploy from './sections/Deploy.jsx';
import Community from './sections/Community.jsx';
import FinalCta from './sections/FinalCta.jsx';
import { initReveals } from './fx/reveals.js';
import { initSpotlight } from './fx/spotlight.js';
import { initMagnet } from './fx/magnet.js';
import { tagTargets } from './fx/targets.js';

const FALLBACK = {
  user: null, canDownload: false, canViewForum: false,
  stats: { users: 0, downloads: 0, threads: 0, posts: 0 },
  recentThreads: [], downloadMeta: { name: 'GoyHub-Loader.exe', sha256: '', sizeKb: 0 }, appVersion: '',
  features: [], cta: { href: '/auth/signup', label: 'Create a free account', kind: 'signup' },
  links: { download: null, signup: '/auth/signup', login: '/auth/login', upgrade: '/upgrade', forum: '/forum', help: '/help', downloadPage: '/download' },
};

export default function Landing({ data, env, ready }) {
  const d = { ...FALLBACK, ...(data || {}) };
  const rootRef = useRef(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;
    const offs = [tagTargets(root)];
    if (!env.reduced) {
      offs.push(initReveals(root, { selector: '.nl-reveal', y: 26, stagger: 0.08 }));
    }
    if (env.fine && !env.reduced) {
      offs.push(initSpotlight(root));
      offs.push(initMagnet(root, { padding: 40, strength: 8 }));
    }
    return () => offs.forEach((off) => off && off());
  }, [env.reduced, env.fine]);

  return (
    <div className="nl" ref={rootRef}>
      <Hero d={d} env={env} ready={ready} />
      <HudStats d={d} env={env} />
      <Ticker env={env} />
      <Features d={d} env={env} />
      <Deploy d={d} env={env} />
      <Community d={d} env={env} />
      <FinalCta d={d} env={env} />
    </div>
  );
}
