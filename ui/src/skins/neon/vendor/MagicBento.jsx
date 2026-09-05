/**
 * React Bits MagicBento — patched into composable pieces (the original ships
 * its own demo cards). Exports ParticleCard, GlobalSpotlight and BentoGrid;
 * the caller decides what goes inside. Particles/ripples are styled through
 * classes + CSS custom properties (no cssText), class names are namespaced
 * (`hb-`) so they cannot collide with the site sheet, and everything stands
 * down when `disableAnimations` is set (touch / reduced motion).
 */
import { useRef, useEffect, useCallback } from 'react';
import { gsap } from 'gsap';
import './MagicBento.css';

const DEFAULT_PARTICLE_COUNT = 10;
const DEFAULT_SPOTLIGHT_RADIUS = 320;

const makeParticle = (x, y) => {
  const el = document.createElement('i');
  el.className = 'hb-particle';
  el.style.setProperty('--px', `${x}px`);
  el.style.setProperty('--py', `${y}px`);
  return el;
};

const setGlow = (card, mouseX, mouseY, glow, radius) => {
  const rect = card.getBoundingClientRect();
  card.style.setProperty('--glow-x', `${((mouseX - rect.left) / rect.width) * 100}%`);
  card.style.setProperty('--glow-y', `${((mouseY - rect.top) / rect.height) * 100}%`);
  card.style.setProperty('--glow-intensity', String(glow));
  card.style.setProperty('--glow-radius', `${radius}px`);
};

export function ParticleCard({
  children,
  className = '',
  as: Tag = 'article',
  disableAnimations = false,
  particleCount = DEFAULT_PARTICLE_COUNT,
  enableTilt = true,
  clickEffect = true,
  enableMagnetism = true,
  ...rest
}) {
  const cardRef = useRef(null);
  const particlesRef = useRef([]);
  const timeoutsRef = useRef([]);
  const hovered = useRef(false);
  const pool = useRef([]);
  const magnetTween = useRef(null);

  const clearParticles = useCallback(() => {
    timeoutsRef.current.forEach(clearTimeout);
    timeoutsRef.current = [];
    magnetTween.current?.kill();
    particlesRef.current.forEach((p) => {
      gsap.to(p, { scale: 0, opacity: 0, duration: 0.3, ease: 'back.in(1.7)', onComplete: () => p.parentNode?.removeChild(p) });
    });
    particlesRef.current = [];
  }, []);

  const spawn = useCallback(() => {
    const el = cardRef.current;
    if (!el || !hovered.current) return;
    if (!pool.current.length) {
      const { width, height } = el.getBoundingClientRect();
      pool.current = Array.from({ length: particleCount }, () => makeParticle(Math.random() * width, Math.random() * height));
    }
    pool.current.forEach((particle, index) => {
      const id = setTimeout(() => {
        if (!hovered.current || !cardRef.current) return;
        const clone = particle.cloneNode(true);
        cardRef.current.appendChild(clone);
        particlesRef.current.push(clone);
        gsap.fromTo(clone, { scale: 0, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.3, ease: 'back.out(1.7)' });
        gsap.to(clone, { x: (Math.random() - 0.5) * 90, y: (Math.random() - 0.5) * 90, rotation: Math.random() * 360, duration: 2 + Math.random() * 2, ease: 'none', repeat: -1, yoyo: true });
        gsap.to(clone, { opacity: 0.3, duration: 1.5, ease: 'power2.inOut', repeat: -1, yoyo: true });
      }, index * 90);
      timeoutsRef.current.push(id);
    });
  }, [particleCount]);

  useEffect(() => {
    const el = cardRef.current;
    if (disableAnimations || !el) return undefined;
    const onEnter = () => {
      hovered.current = true;
      spawn();
      if (enableTilt) gsap.to(el, { rotateX: 4, rotateY: 4, duration: 0.3, ease: 'power2.out', transformPerspective: 1000 });
    };
    const onLeave = () => {
      hovered.current = false;
      clearParticles();
      if (enableTilt) gsap.to(el, { rotateX: 0, rotateY: 0, duration: 0.3, ease: 'power2.out' });
      if (enableMagnetism) gsap.to(el, { x: 0, y: 0, duration: 0.3, ease: 'power2.out' });
    };
    const onMove = (e) => {
      if (!enableTilt && !enableMagnetism) return;
      const rect = el.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const cx = rect.width / 2;
      const cy = rect.height / 2;
      if (enableTilt) gsap.to(el, { rotateX: ((y - cy) / cy) * -7, rotateY: ((x - cx) / cx) * 7, duration: 0.12, ease: 'power2.out', transformPerspective: 1000 });
      if (enableMagnetism) magnetTween.current = gsap.to(el, { x: (x - cx) * 0.04, y: (y - cy) * 0.04, duration: 0.3, ease: 'power2.out' });
    };
    const onClick = (e) => {
      if (!clickEffect) return;
      const rect = el.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const max = Math.max(Math.hypot(x, y), Math.hypot(x - rect.width, y), Math.hypot(x, y - rect.height), Math.hypot(x - rect.width, y - rect.height));
      const ripple = document.createElement('i');
      ripple.className = 'hb-ripple';
      ripple.style.setProperty('--size', `${max * 2}px`);
      ripple.style.setProperty('--rx', `${x - max}px`);
      ripple.style.setProperty('--ry', `${y - max}px`);
      el.appendChild(ripple);
      gsap.fromTo(ripple, { scale: 0, opacity: 1 }, { scale: 1, opacity: 0, duration: 0.8, ease: 'power2.out', onComplete: () => ripple.remove() });
    };
    el.addEventListener('mouseenter', onEnter);
    el.addEventListener('mouseleave', onLeave);
    el.addEventListener('mousemove', onMove);
    el.addEventListener('click', onClick);
    return () => {
      hovered.current = false;
      el.removeEventListener('mouseenter', onEnter);
      el.removeEventListener('mouseleave', onLeave);
      el.removeEventListener('mousemove', onMove);
      el.removeEventListener('click', onClick);
      clearParticles();
      gsap.killTweensOf(el);
    };
  }, [spawn, clearParticles, disableAnimations, enableTilt, enableMagnetism, clickEffect]);

  return (
    <Tag ref={cardRef} className={`hb-card ${className}`} {...rest}>
      {children}
    </Tag>
  );
}

export function GlobalSpotlight({ gridRef, disableAnimations = false, spotlightRadius = DEFAULT_SPOTLIGHT_RADIUS }) {
  const spotRef = useRef(null);
  useEffect(() => {
    if (disableAnimations || !gridRef?.current) return undefined;
    const spot = document.createElement('div');
    spot.className = 'hb-spotlight';
    document.body.appendChild(spot);
    spotRef.current = spot;
    const proximity = spotlightRadius * 0.5;
    const fadeDistance = spotlightRadius * 0.75;
    const onMove = (e) => {
      const grid = gridRef.current;
      if (!grid) return;
      const rect = grid.getBoundingClientRect();
      const inside = e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom;
      const cards = grid.querySelectorAll('.hb-card');
      if (!inside) {
        gsap.to(spot, { opacity: 0, duration: 0.3, ease: 'power2.out' });
        cards.forEach((c) => c.style.setProperty('--glow-intensity', '0'));
        return;
      }
      let minDistance = Infinity;
      cards.forEach((card) => {
        const r = card.getBoundingClientRect();
        const d = Math.max(0, Math.hypot(e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2)) - Math.max(r.width, r.height) / 2);
        minDistance = Math.min(minDistance, d);
        let glow = 0;
        if (d <= proximity) glow = 1;
        else if (d <= fadeDistance) glow = (fadeDistance - d) / (fadeDistance - proximity);
        setGlow(card, e.clientX, e.clientY, glow, spotlightRadius);
      });
      gsap.to(spot, { left: e.clientX, top: e.clientY, duration: 0.1, ease: 'power2.out' });
      const target = minDistance <= proximity ? 0.8 : minDistance <= fadeDistance ? ((fadeDistance - minDistance) / (fadeDistance - proximity)) * 0.8 : 0;
      gsap.to(spot, { opacity: target, duration: target > 0 ? 0.2 : 0.5, ease: 'power2.out' });
    };
    const onLeave = () => {
      gridRef.current?.querySelectorAll('.hb-card').forEach((c) => c.style.setProperty('--glow-intensity', '0'));
      gsap.to(spot, { opacity: 0, duration: 0.3, ease: 'power2.out' });
    };
    document.addEventListener('mousemove', onMove, { passive: true });
    document.addEventListener('mouseleave', onLeave);
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseleave', onLeave);
      gsap.killTweensOf(spot);
      spot.parentNode?.removeChild(spot);
    };
  }, [gridRef, disableAnimations, spotlightRadius]);
  return null;
}

export function BentoGrid({ children, gridRef, className = '' }) {
  return <div className={`hb-grid ${className}`} ref={gridRef}>{children}</div>;
}
