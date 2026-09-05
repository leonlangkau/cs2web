/**
 * React Bits TargetCursor — patched for the neon skin:
 *  - stays hidden until the pointer first moves (no cursor parked mid-screen)
 *  - hides itself over text fields so the native I-beam can do its job, and
 *    when the pointer leaves the window
 *  - colours come from CSS tokens (see TargetCursor.css), not inline props
 *  - mounting is gated by the caller (fine pointer + motion allowed)
 */
import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { gsap } from 'gsap';
import './TargetCursor.css';

const TEXT_FIELDS = 'input:not([type="button"]):not([type="submit"]):not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="file"]), textarea, select, [contenteditable=""], [contenteditable="true"]';

const getContainingBlock = (element) => {
  let node = element?.parentElement;
  while (node && node !== document.documentElement) {
    const style = getComputedStyle(node);
    if (
      style.transform !== 'none' || style.perspective !== 'none' || style.filter !== 'none' ||
      style.willChange.includes('transform') || style.willChange.includes('perspective') || style.willChange.includes('filter') ||
      /paint|layout|strict|content/.test(style.contain)
    ) return node;
    node = node.parentElement;
  }
  return null;
};

const getContainingBlockOffset = (block) => {
  if (!block) return { x: 0, y: 0 };
  const rect = block.getBoundingClientRect();
  return { x: rect.left + block.clientLeft, y: rect.top + block.clientTop };
};

export default function TargetCursor({
  targetSelector = '.cursor-target',
  spinDuration = 2.4,
  hideDefaultCursor = true,
  hoverDuration = 0.2,
  parallaxOn = true,
}) {
  const cursorRef = useRef(null);
  const cornersRef = useRef(null);
  const spinTl = useRef(null);
  const dotRef = useRef(null);
  const containingBlockRef = useRef(null);
  const targetCornerPositionsRef = useRef(null);
  const tickerFnRef = useRef(null);
  const activeStrengthRef = useRef(0);

  useEffect(() => {
    if (!cursorRef.current) return undefined;
    const cursor = cursorRef.current;
    cornersRef.current = cursor.querySelectorAll('.target-cursor-corner');
    containingBlockRef.current = getContainingBlock(cursor);
    const getOffset = () => getContainingBlockOffset(containingBlockRef.current);
    const constants = { borderWidth: 2, cornerSize: 12 };

    if (hideDefaultCursor) document.documentElement.classList.add('rb-hud-cursor');

    let activeTarget = null;
    let currentLeaveHandler = null;
    let resumeTimeout = null;
    let shown = false;
    let overField = false;

    const setVisible = (v) => {
      if (!shown) return;
      cursor.classList.toggle('is-hidden', !v);
    };

    const cleanupTarget = (target) => {
      if (currentLeaveHandler) target.removeEventListener('mouseleave', currentLeaveHandler);
      currentLeaveHandler = null;
    };

    gsap.set(cursor, { xPercent: -50, yPercent: -50, x: -200, y: -200 });

    const createSpinTimeline = () => {
      spinTl.current?.kill();
      spinTl.current = gsap.timeline({ repeat: -1 }).to(cursor, { rotation: '+=360', duration: spinDuration, ease: 'none' });
    };
    createSpinTimeline();

    const tickerFn = () => {
      if (!targetCornerPositionsRef.current || !cornersRef.current) return;
      const strength = activeStrengthRef.current;
      if (strength === 0) return;
      const cursorX = gsap.getProperty(cursor, 'x');
      const cursorY = gsap.getProperty(cursor, 'y');
      Array.from(cornersRef.current).forEach((corner, i) => {
        const currentX = gsap.getProperty(corner, 'x');
        const currentY = gsap.getProperty(corner, 'y');
        const targetX = targetCornerPositionsRef.current[i].x - cursorX;
        const targetY = targetCornerPositionsRef.current[i].y - cursorY;
        const finalX = currentX + (targetX - currentX) * strength;
        const finalY = currentY + (targetY - currentY) * strength;
        const duration = strength >= 0.99 ? (parallaxOn ? 0.2 : 0) : 0.05;
        gsap.to(corner, { x: finalX, y: finalY, duration, ease: duration === 0 ? 'none' : 'power1.out', overwrite: 'auto' });
      });
    };
    tickerFnRef.current = tickerFn;

    const moveHandler = (e) => {
      if (!shown) { shown = true; cursor.classList.add('is-shown'); }
      const { x: offsetX, y: offsetY } = getOffset();
      gsap.to(cursor, { x: e.clientX - offsetX, y: e.clientY - offsetY, duration: 0.1, ease: 'power3.out' });
      const field = e.target instanceof Element ? e.target.closest(TEXT_FIELDS) : null;
      const nowOver = !!field;
      if (nowOver !== overField) {
        overField = nowOver;
        setVisible(!nowOver);
        document.documentElement.classList.toggle('rb-hud-cursor--field', nowOver);
      }
    };
    window.addEventListener('mousemove', moveHandler, { passive: true });

    const leaveWindow = (e) => { if (!e.relatedTarget && !e.toElement) setVisible(false); };
    const enterWindow = () => { if (!overField) setVisible(true); };
    document.addEventListener('mouseout', leaveWindow);
    document.addEventListener('mouseover', enterWindow);

    const scrollHandler = () => {
      if (!activeTarget) return;
      const { x: offsetX, y: offsetY } = getOffset();
      const mouseX = gsap.getProperty(cursor, 'x') + offsetX;
      const mouseY = gsap.getProperty(cursor, 'y') + offsetY;
      const under = document.elementFromPoint(mouseX, mouseY);
      const still = under && (under === activeTarget || under.closest(targetSelector) === activeTarget);
      if (!still && currentLeaveHandler) currentLeaveHandler();
    };
    window.addEventListener('scroll', scrollHandler, { passive: true });

    const mouseDownHandler = () => {
      gsap.to(dotRef.current, { scale: 0.6, duration: 0.25 });
      gsap.to(cursor, { scale: 0.9, duration: 0.2 });
    };
    const mouseUpHandler = () => {
      gsap.to(dotRef.current, { scale: 1, duration: 0.25 });
      gsap.to(cursor, { scale: 1, duration: 0.2 });
    };
    window.addEventListener('mousedown', mouseDownHandler);
    window.addEventListener('mouseup', mouseUpHandler);

    const enterHandler = (e) => {
      const direct = e.target;
      if (!(direct instanceof Element)) return;
      const target = direct.closest(targetSelector);
      if (!target || !cornersRef.current) return;
      if (activeTarget === target) return;
      if (activeTarget) cleanupTarget(activeTarget);
      if (resumeTimeout) { clearTimeout(resumeTimeout); resumeTimeout = null; }

      activeTarget = target;
      const corners = Array.from(cornersRef.current);
      corners.forEach((corner) => gsap.killTweensOf(corner, 'x,y'));
      gsap.killTweensOf(cursor, 'rotation');
      spinTl.current?.pause();
      gsap.set(cursor, { rotation: 0 });
      cursor.classList.add('is-locked');

      const rect = target.getBoundingClientRect();
      const { borderWidth, cornerSize } = constants;
      const { x: offsetX, y: offsetY } = getOffset();
      const cursorX = gsap.getProperty(cursor, 'x');
      const cursorY = gsap.getProperty(cursor, 'y');
      targetCornerPositionsRef.current = [
        { x: rect.left - borderWidth - offsetX, y: rect.top - borderWidth - offsetY },
        { x: rect.right + borderWidth - cornerSize - offsetX, y: rect.top - borderWidth - offsetY },
        { x: rect.right + borderWidth - cornerSize - offsetX, y: rect.bottom + borderWidth - cornerSize - offsetY },
        { x: rect.left - borderWidth - offsetX, y: rect.bottom + borderWidth - cornerSize - offsetY },
      ];
      gsap.ticker.add(tickerFnRef.current);
      gsap.to(activeStrengthRef, { current: 1, duration: hoverDuration, ease: 'power2.out' });
      corners.forEach((corner, i) => {
        gsap.to(corner, { x: targetCornerPositionsRef.current[i].x - cursorX, y: targetCornerPositionsRef.current[i].y - cursorY, duration: 0.2, ease: 'power2.out' });
      });

      const leaveHandler = () => {
        gsap.ticker.remove(tickerFnRef.current);
        targetCornerPositionsRef.current = null;
        gsap.set(activeStrengthRef, { current: 0, overwrite: true });
        activeTarget = null;
        cursor.classList.remove('is-locked');
        if (cornersRef.current) {
          const cs = Array.from(cornersRef.current);
          gsap.killTweensOf(cs, 'x,y');
          const s = constants.cornerSize;
          const positions = [
            { x: -s * 1.5, y: -s * 1.5 }, { x: s * 0.5, y: -s * 1.5 }, { x: s * 0.5, y: s * 0.5 }, { x: -s * 1.5, y: s * 0.5 },
          ];
          const tl = gsap.timeline();
          cs.forEach((corner, index) => tl.to(corner, { x: positions[index].x, y: positions[index].y, duration: 0.3, ease: 'power3.out' }, 0));
        }
        resumeTimeout = setTimeout(() => {
          if (!activeTarget && spinTl.current) {
            const currentRotation = gsap.getProperty(cursor, 'rotation');
            const normalized = currentRotation % 360;
            spinTl.current.kill();
            spinTl.current = gsap.timeline({ repeat: -1 }).to(cursor, { rotation: '+=360', duration: spinDuration, ease: 'none' });
            gsap.to(cursor, { rotation: normalized + 360, duration: spinDuration * (1 - normalized / 360), ease: 'none', onComplete: () => spinTl.current?.restart() });
          }
          resumeTimeout = null;
        }, 50);
        cleanupTarget(target);
      };
      currentLeaveHandler = leaveHandler;
      target.addEventListener('mouseleave', leaveHandler);
    };
    window.addEventListener('mouseover', enterHandler, { passive: true });

    const resizeHandler = () => { containingBlockRef.current = getContainingBlock(cursor); };
    window.addEventListener('resize', resizeHandler);

    return () => {
      if (tickerFnRef.current) gsap.ticker.remove(tickerFnRef.current);
      window.removeEventListener('mousemove', moveHandler);
      window.removeEventListener('mouseover', enterHandler);
      window.removeEventListener('scroll', scrollHandler);
      window.removeEventListener('resize', resizeHandler);
      window.removeEventListener('mousedown', mouseDownHandler);
      window.removeEventListener('mouseup', mouseUpHandler);
      document.removeEventListener('mouseout', leaveWindow);
      document.removeEventListener('mouseover', enterWindow);
      if (activeTarget) cleanupTarget(activeTarget);
      if (resumeTimeout) clearTimeout(resumeTimeout);
      spinTl.current?.kill();
      gsap.killTweensOf(cursor);
      document.documentElement.classList.remove('rb-hud-cursor', 'rb-hud-cursor--field');
      targetCornerPositionsRef.current = null;
      activeStrengthRef.current = 0;
    };
  }, [targetSelector, spinDuration, hideDefaultCursor, hoverDuration, parallaxOn]);

  return createPortal(
    <div ref={cursorRef} className="target-cursor-wrapper" aria-hidden="true">
      <div ref={dotRef} className="target-cursor-dot" />
      <div className="target-cursor-corner corner-tl" />
      <div className="target-cursor-corner corner-tr" />
      <div className="target-cursor-corner corner-br" />
      <div className="target-cursor-corner corner-bl" />
    </div>,
    document.body,
  );
}
