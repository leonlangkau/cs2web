/**
 * React Bits GooeyNav — patched: items carry aria-current, the active pill is
 * picked from the server-rendered nav, particles/pill colours come from the
 * skin tokens, and `reduced` skips the particle burst. Links are real anchors
 * (navigation is never prevented).
 */
import { useRef, useEffect, useState } from 'react';
import './GooeyNav.css';

export default function GooeyNav({
  items,
  animationTime = 600,
  particleCount = 14,
  particleDistances = [80, 10],
  particleR = 90,
  timeVariance = 300,
  colors = [1, 2, 3, 1, 2, 3, 1, 4],
  initialActiveIndex = 0,
  reduced = false,
}) {
  const containerRef = useRef(null);
  const navRef = useRef(null);
  const filterRef = useRef(null);
  const textRef = useRef(null);
  const [activeIndex, setActiveIndex] = useState(initialActiveIndex);
  const timers = useRef([]);

  const noise = (n = 1) => n / 2 - Math.random() * n;
  const getXY = (distance, pointIndex, totalPoints) => {
    const angle = ((360 + noise(8)) / totalPoints) * pointIndex * (Math.PI / 180);
    return [distance * Math.cos(angle), distance * Math.sin(angle)];
  };
  const createParticle = (i, t, d, r) => {
    const rotate = noise(r / 10);
    return {
      start: getXY(d[0], particleCount - i, particleCount),
      end: getXY(d[1] + noise(7), particleCount - i, particleCount),
      time: t,
      scale: 1 + noise(0.2),
      color: colors[Math.floor(Math.random() * colors.length)],
      rotate: rotate > 0 ? (rotate + r / 20) * 10 : (rotate - r / 20) * 10,
    };
  };

  const makeParticles = (element) => {
    if (reduced) { element.classList.add('active'); return; }
    const d = particleDistances;
    const r = particleR;
    element.style.setProperty('--time', `${animationTime * 2 + timeVariance}ms`);
    for (let i = 0; i < particleCount; i += 1) {
      const t = animationTime * 2 + noise(timeVariance * 2);
      const p = createParticle(i, t, d, r);
      element.classList.remove('active');
      timers.current.push(setTimeout(() => {
        const particle = document.createElement('span');
        const point = document.createElement('span');
        particle.classList.add('gn-particle');
        particle.style.setProperty('--start-x', `${p.start[0]}px`);
        particle.style.setProperty('--start-y', `${p.start[1]}px`);
        particle.style.setProperty('--end-x', `${p.end[0]}px`);
        particle.style.setProperty('--end-y', `${p.end[1]}px`);
        particle.style.setProperty('--time', `${p.time}ms`);
        particle.style.setProperty('--scale', `${p.scale}`);
        particle.style.setProperty('--color', `var(--gn-color-${p.color}, white)`);
        particle.style.setProperty('--rotate', `${p.rotate}deg`);
        point.classList.add('gn-point');
        particle.appendChild(point);
        element.appendChild(particle);
        requestAnimationFrame(() => element.classList.add('active'));
        timers.current.push(setTimeout(() => { try { element.removeChild(particle); } catch { /* gone */ } }, t));
      }, 30));
    }
  };

  const updateEffectPosition = (element) => {
    if (!containerRef.current || !filterRef.current || !textRef.current) return;
    const containerRect = containerRef.current.getBoundingClientRect();
    const pos = element.getBoundingClientRect();
    const styles = { left: `${pos.x - containerRect.x}px`, top: `${pos.y - containerRect.y}px`, width: `${pos.width}px`, height: `${pos.height}px` };
    Object.assign(filterRef.current.style, styles);
    Object.assign(textRef.current.style, styles);
    textRef.current.textContent = element.textContent;
  };

  const handleClick = (e, index) => {
    const liEl = e.currentTarget;
    if (activeIndex === index) return;
    setActiveIndex(index);
    updateEffectPosition(liEl);
    if (filterRef.current) filterRef.current.querySelectorAll('.gn-particle').forEach((p) => filterRef.current.removeChild(p));
    if (textRef.current) {
      textRef.current.classList.remove('active');
      void textRef.current.offsetWidth; // eslint-disable-line no-void
      textRef.current.classList.add('active');
    }
    if (filterRef.current) makeParticles(filterRef.current);
  };

  useEffect(() => {
    if (!navRef.current || !containerRef.current) return undefined;
    const activeLi = navRef.current.querySelectorAll('li')[activeIndex];
    if (activeLi) { updateEffectPosition(activeLi); textRef.current?.classList.add('active'); }
    const ro = new ResizeObserver(() => {
      const li = navRef.current?.querySelectorAll('li')[activeIndex];
      if (li) updateEffectPosition(li);
    });
    ro.observe(containerRef.current);
    // fonts swapping in shifts the pill: re-measure once they land
    document.fonts?.ready?.then(() => { const li = navRef.current?.querySelectorAll('li')[activeIndex]; if (li) updateEffectPosition(li); });
    const timersNow = timers.current;
    return () => { ro.disconnect(); timersNow.forEach(clearTimeout); };
  }, [activeIndex]);

  return (
    <div className="gooey-nav-container" ref={containerRef}>
      <nav aria-label="Main">
        <ul ref={navRef}>
          {items.map((item, index) => (
            <li key={item.href} className={activeIndex === index ? 'active' : ''}>
              <a href={item.href} className="cursor-target" aria-current={activeIndex === index ? 'page' : undefined} onClick={(e) => handleClick({ currentTarget: e.currentTarget.parentElement }, index)}>
                <span className="gn-idx" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>{item.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>
      <span className="effect filter" ref={filterRef} aria-hidden="true" />
      <span className="effect text" ref={textRef} aria-hidden="true" />
    </div>
  );
}
