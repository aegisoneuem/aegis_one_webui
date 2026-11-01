import { forwardRef, type HTMLAttributes } from 'react';
import { cx } from '../../cx';
import styles from './StatusPill.module.css';

export type StatusTone = 'good' | 'bad' | 'warn' | 'info' | 'neutral';

export interface StatusPillProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: StatusTone;
  /** Leading dot, for dense table cells where the tone carries the meaning. */
  dot?: boolean;
}

export const StatusPill = forwardRef<HTMLSpanElement, StatusPillProps>(function StatusPill(
  { tone = 'neutral', dot = false, className, children, ...rest },
  ref,
) {
  return (
    <span ref={ref} className={cx(styles.pill, styles[tone], className)} {...rest}>
      {dot ? <span className={styles.dot} aria-hidden="true" /> : null}
      <span className={styles.label}>{children}</span>
    </span>
  );
});
