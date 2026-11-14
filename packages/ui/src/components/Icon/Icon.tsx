import { forwardRef, type SVGAttributes } from 'react';
import { cx } from '../../cx';
import { ICONS, type IconName } from './paths';
import styles from './Icon.module.css';

export type { IconName };

export interface IconProps extends Omit<SVGAttributes<SVGSVGElement>, 'name'> {
  name: IconName;
  /** Edge length in pixels. The reference draws nav glyphs at 18. */
  size?: number;
}

/**
 * The console's only icon component.
 *
 * It draws from the approved set in `paths.ts`, which was taken out of
 * design-reference/Aegis-One-Console-v129.html rather than from an icon
 * package. That matters more than it sounds: a stock pack's glyphs are
 * rounded and uniform, and the approved set is square-capped and mitred with
 * one filled gold square per nav glyph. Swapping one for the other is most
 * of what made the restored console stop looking like itself.
 *
 * A glyph that does not exist is a compile error, not a blank square, because
 * `name` is the union of the set's own keys.
 */
export const Icon = forwardRef<SVGSVGElement, IconProps>(function Icon(
  { name, size, className, ...rest },
  ref,
) {
  const icon = ICONS[name];
  const filled = icon.kind === 'fill';
  const edge = size ?? (filled ? 16 : 18);

  return (
    <svg
      ref={ref}
      className={cx(styles.icon, styles[icon.kind], className)}
      data-icon={name}
      width={edge}
      height={edge}
      viewBox={filled ? '0 0 256 256' : '0 0 24 24'}
      fill={filled ? 'currentColor' : 'none'}
      stroke={filled ? undefined : 'currentColor'}
      strokeWidth={filled ? undefined : icon.kind === 'nav' ? 2 : 1.8}
      strokeLinecap={filled ? undefined : icon.kind === 'nav' ? 'square' : 'round'}
      strokeLinejoin={filled ? undefined : icon.kind === 'nav' ? 'miter' : 'round'}
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {icon.paths.map((d) => (
        <path key={d} d={d} />
      ))}
      {'accent' in icon && icon.accent ? (
        <path className={styles.accent} d={icon.accent} stroke="none" />
      ) : null}
    </svg>
  );
});
