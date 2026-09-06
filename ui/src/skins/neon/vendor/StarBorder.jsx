/**
 * React Bits StarBorder — patched: no inline colours (the skin's CSS owns the
 * fill, text and rim so busy/done states can restyle the button), the streak
 * colour and speed travel as CSS custom properties, and `as` can be a link.
 */
import './StarBorder.css';

export default function StarBorder({
  as: Component = 'button',
  className = '',
  color = '#ff2bd6',
  speed = '5s',
  thickness = 1,
  children,
  style,
  ...rest
}) {
  return (
    <Component
      className={`star-border-container ${className}`}
      style={{ '--star-color': color, '--star-speed': speed, '--star-pad': `${thickness}px`, ...style }}
      {...rest}
    >
      <span className="border-gradient-bottom" aria-hidden="true" />
      <span className="border-gradient-top" aria-hidden="true" />
      <span className="inner-content">{children}</span>
    </Component>
  );
}
