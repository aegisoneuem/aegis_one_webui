import { forwardRef, type HTMLAttributes } from 'react';
import { cx } from '../../cx';
import styles from './Skeleton.module.css';

export interface SkeletonProps extends HTMLAttributes<HTMLSpanElement> {
  /** Any CSS length; sizing is per-use, so it is set through a class. */
  variant?: 'block' | 'text' | 'circle';
}

/**
 * Placeholder block. Size it with a class from the calling module — the
 * library cannot know the shape of the thing being loaded.
 */
export const Skeleton = forwardRef<HTMLSpanElement, SkeletonProps>(function Skeleton(
  { variant = 'block', className, ...rest },
  ref,
) {
  return (
    <span
      ref={ref}
      aria-hidden="true"
      className={cx(styles.skeleton, variant !== 'block' && styles[variant], className)}
      {...rest}
    />
  );
});

export interface TableSkeletonProps {
  rows?: number;
  columns?: number;
  className?: string;
}

/** Row-shaped placeholder matching DataTable's density, for a first load. */
export function TableSkeleton({ rows = 12, columns = 6, className }: TableSkeletonProps) {
  return (
    <div className={cx(styles.rows, className)} role="status" aria-label="Loading rows">
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className={styles.tableRow}>
          {Array.from({ length: columns }, (_, c) => (
            <span key={c} className={styles.cell} />
          ))}
        </div>
      ))}
    </div>
  );
}
