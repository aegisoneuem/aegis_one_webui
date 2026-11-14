import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';
import { cx } from '../../cx';
import styles from './EmptyState.module.css';

export interface EmptyStateProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  title: ReactNode;
  /** Say what would put something here, not just that it is empty. */
  description?: ReactNode;
  icon?: ReactNode;
  /** One primary action at most; an empty list is not a place for a toolbar. */
  actions?: ReactNode;
  /** Tighter padding, for an empty card rather than an empty page. */
  inline?: boolean;
}

export const EmptyState = forwardRef<HTMLDivElement, EmptyStateProps>(function EmptyState(
  { title, description, icon, actions, inline = false, className, ...rest },
  ref,
) {
  return (
    <div ref={ref} className={cx(styles.state, inline && styles.inline, className)} {...rest}>
      {icon ? (
        <span className={styles.icon} aria-hidden="true">
          {icon}
        </span>
      ) : null}
      <p className={styles.title}>{title}</p>
      {description ? <p className={styles.description}>{description}</p> : null}
      {actions ? <div className={styles.actions}>{actions}</div> : null}
    </div>
  );
});
