/**
 * React Bits Dock — patched: items are real links (<a href>) with proper
 * aria-current, a fixed bottom-centre placement, namespaced classes (`rb-dock*`),
 * and magnification that stands down under reduced motion.
 */
import { motion, useMotionValue, useSpring, useTransform, AnimatePresence } from 'motion/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import './Dock.css';

function DockItem({ item, mouseX, spring, distance, magnification, baseItemSize, reduced }) {
  const ref = useRef(null);
  const isHovered = useMotionValue(0);
  const mouseDistance = useTransform(mouseX, (val) => {
    const rect = ref.current?.getBoundingClientRect() ?? { x: 0, width: baseItemSize };
    return val - rect.x - baseItemSize / 2;
  });
  const targetSize = useTransform(mouseDistance, [-distance, 0, distance], [baseItemSize, reduced ? baseItemSize : magnification, baseItemSize]);
  const size = useSpring(targetSize, spring);
  const Icon = item.icon;
  return (
    <motion.a
      ref={ref}
      href={item.href}
      style={{ width: size, height: size }}
      onHoverStart={() => isHovered.set(1)}
      onHoverEnd={() => isHovered.set(0)}
      onFocus={() => isHovered.set(1)}
      onBlur={() => isHovered.set(0)}
      className={`rb-dock__item cursor-target ${item.active ? 'is-active' : ''} ${item.className || ''}`}
      aria-label={item.label}
      aria-current={item.active ? 'page' : undefined}
    >
      <span className="rb-dock__icon"><Icon /></span>
      <DockLabel isHovered={isHovered}>{item.label}</DockLabel>
    </motion.a>
  );
}

function DockLabel({ children, isHovered }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => isHovered.on('change', (v) => setVisible(v === 1)), [isHovered]);
  return (
    <AnimatePresence>
      {visible && (
        <motion.span
          initial={{ opacity: 0, y: 0 }}
          animate={{ opacity: 1, y: -8 }}
          exit={{ opacity: 0, y: 0 }}
          transition={{ duration: 0.18 }}
          className="rb-dock__label"
          role="tooltip"
          style={{ x: '-50%' }}
        >
          {children}
        </motion.span>
      )}
    </AnimatePresence>
  );
}

export default function Dock({
  items,
  className = '',
  spring = { mass: 0.1, stiffness: 170, damping: 13 },
  magnification = 62,
  distance = 150,
  panelHeight = 58,
  baseItemSize = 42,
  reduced = false,
}) {
  const mouseX = useMotionValue(Infinity);
  const isHovered = useMotionValue(0);
  const maxHeight = useMemo(() => Math.max(panelHeight, magnification + 20), [magnification, panelHeight]);
  const heightRow = useTransform(isHovered, [0, 1], [panelHeight, reduced ? panelHeight : maxHeight]);
  const height = useSpring(heightRow, spring);
  return (
    <motion.nav style={{ height }} className={`rb-dock ${className}`} aria-label="Quick navigation">
      <motion.div
        onMouseMove={({ pageX }) => { isHovered.set(1); mouseX.set(pageX); }}
        onMouseLeave={() => { isHovered.set(0); mouseX.set(Infinity); }}
        className="rb-dock__panel"
        style={{ height: panelHeight }}
      >
        <span className="rb-dock__tag" aria-hidden="true">NAV</span>
        {items.map((item) => (
          <DockItem key={item.href} item={item} mouseX={mouseX} spring={spring} distance={distance} magnification={magnification} baseItemSize={baseItemSize} reduced={reduced} />
        ))}
      </motion.div>
    </motion.nav>
  );
}
