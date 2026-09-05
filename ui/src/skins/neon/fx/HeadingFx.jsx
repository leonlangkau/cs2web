import { mountInto } from '@shared/mount';
import DecryptedText from '../vendor/DecryptedText.jsx';

/**
 * DecryptedText on the page's first <h1>: only plain-text headings, never the
 * live status headline, and the React root is removed again once the reveal
 * finishes so other scripts can keep treating the h1 as plain DOM.
 */
export function decryptHeading(env) {
  const h1 = document.querySelector('main h1');
  if (!h1 || h1.id === 'status-headline' || h1.children.length > 0) return null;
  const text = h1.textContent.trim();
  if (!text || text.length > 90) return null;
  if (env.reduced) return null;
  let root = null;
  let finished = false;
  const restore = () => {
    if (finished) return;
    finished = true;
    window.setTimeout(() => { root?.unmount(); root = null; h1.textContent = text; }, 0);
  };
  root = mountInto(h1, <DecryptedText text={text} animateOn="mount" speed={26} sequential revealDirection="start" encryptedClassName="rb-decrypting" onComplete={restore} />);
  h1.removeAttribute('data-rb-root');
  return () => { if (!finished) { finished = true; root?.unmount(); h1.textContent = text; } };
}
