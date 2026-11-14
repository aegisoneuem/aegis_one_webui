import { forwardRef, type ReactNode } from 'react';
import { cx } from '../../cx';
import styles from './KpiTile.module.css';

export type KpiTone = 'neutral' | 'good' | 'warn' | 'bad';

export interface KpiTileProps {
  label: string;
  /** Pre-formatted: the library does not know the locale rules of the caller. */
  value: ReactNode;
  unit?: string;
  icon?: ReactNode;
  /** Change against the previous period. `direction` is the arrow; `good` says whether that arrow is welcome. */
  delta?: { value: string; direction: 'up' | 'down' | 'flat'; good?: boolean };
  /** One line of context under the number, e.g. "of 48,210 reporting". */
  caption?: ReactNode;
  /** Colours the number; use for counts that are themselves a problem. */
  tone?: KpiTone;
  /** Makes the tile a button, for tiles that filter the list below. */
  onClick?: () => void;
  /** Shows the tile as the active filter. */
  active?: boolean;
  className?: string;
}

export const KpiTile = forwardRef<HTMLDivElement & HTMLButtonElement, KpiTileProps>(
  function KpiTile(
    { label, value, unit, icon, delta, caption, tone = 'neutral', onClick, active, className },
    ref,
  ) {
    const deltaClass =
      delta &&
      (delta.direction === 'flat'
        ? styles.flat
        : (delta.good ?? delta.direction === 'up')
          ? styles.up
          : styles.down);

    const body = (
      <>
        <div className={styles.head}>
          <span className={styles.label}>{label}</span>
          {icon ? (
            <span className={styles.icon} aria-hidden="true">
              {icon}
            </span>
          ) : null}
        </div>
        <div className={styles.valueRow}>
          <span className={styles.value}>{value}</span>
          {unit ? <span className={styles.unit}>{unit}</span> : null}
          {delta ? (
            <span className={cx(styles.delta, deltaClass)}>
              <span aria-hidden="true">
                {delta.direction === 'up' ? '▲' : delta.direction === 'down' ? '▼' : '—'}
              </span>
              {delta.value}
            </span>
          ) : null}
        </div>
        {caption ? <span className={styles.caption}>{caption}</span> : null}
      </>
    );

    const classes = cx(
      styles.tile,
      tone !== 'neutral' && styles[`tone-${tone}`],
      onClick && styles.clickable,
      className,
    );

    if (onClick) {
      return (
        <button ref={ref} type="button" className={classes} aria-pressed={active} onClick={onClick}>
          {body}
        </button>
      );
    }
    return (
      <div ref={ref} className={classes}>
        {body}
      </div>
    );
  },
);
