import StarBorder from '../vendor/StarBorder.jsx';
import Magnet from '@rb/Animations/Magnet/Magnet';
import { Icon } from '../lib/icons.jsx';

/**
 * The tier-appropriate primary call to action. Paid+ gets the download link
 * (rel=nofollow, data-download, honest choreography); logged-in non-paid ->
 * upgrade; visitors -> signup. Never renders /download/file otherwise.
 * Solid cyan with dark text (the skin's primary), a magenta StarBorder streak
 * running round the rim, and a Magnet pull on fine pointers.
 */
export function PrimaryCta({ d, env, size = 'lg', className = '' }) {
  const cta = d.cta || {};
  const isDownload = cta.kind === 'download' && d.links?.download;
  const href = isDownload ? d.links.download : cta.href;
  const IconEl = isDownload ? Icon.download : cta.kind === 'upgrade' ? Icon.upgrade : Icon.arrow;
  const extra = isDownload ? { rel: 'nofollow', 'data-download': '' } : {};
  const button = (
    <StarBorder as="a" href={href} className={`nl-star nl-star--${size} cursor-target ${className}`} color="#ff2bd6" speed="4s" thickness={1} {...extra}>
      <span className="nl-star__label">
        <IconEl />
        <span className="nl-btn__label">{cta.label}</span>
      </span>
    </StarBorder>
  );
  if (!env.fine || env.reduced) return button;
  return <Magnet padding={60} magnetStrength={5} wrapperClassName="nl-magnet-wrap">{button}</Magnet>;
}

export function SecondaryCta({ href, children, env, className = '' }) {
  const button = (
    <a href={href} className={`nl-btn nl-btn--outline cursor-target ${className}`}>
      <span className="nl-btn__inner">{children}</span>
    </a>
  );
  if (!env.fine || env.reduced) return button;
  return <Magnet padding={50} magnetStrength={6} wrapperClassName="nl-magnet-wrap">{button}</Magnet>;
}
