import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';
import { cx } from '../../cx';
import { Button } from '../Button/Button';
import styles from '../EmptyState/EmptyState.module.css';

export interface ErrorStateProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  title?: ReactNode;
  description?: ReactNode;
  /** Request id or error code. Never put a stack trace or a raw server message here. */
  detail?: string;
  onRetry?: () => void;
  retryLabel?: string;
  icon?: ReactNode;
  inline?: boolean;
}

/**
 * Failure counterpart to EmptyState. `detail` is for the one identifier that
 * lets support find the request — the server's own error text is not shown,
 * because it is not written for the person reading it.
 */
export const ErrorState = forwardRef<HTMLDivElement, ErrorStateProps>(function ErrorState(
  {
    title = 'Could not load this',
    description = 'The request did not complete. Try again, and if it keeps failing quote the reference below.',
    detail,
    onRetry,
    retryLabel = 'Try again',
    icon,
    inline = false,
    className,
    ...rest
  },
  ref,
) {
  return (
    <div
      ref={ref}
      role="alert"
      className={cx(styles.state, inline && styles.inline, className)}
      {...rest}
    >
      <span className={cx(styles.icon, styles.errorIcon)} aria-hidden="true">
        {icon ?? '!'}
      </span>
      <p className={styles.title}>{title}</p>
      {description ? <p className={styles.description}>{description}</p> : null}
      {detail ? <p className={styles.detail}>{detail}</p> : null}
      {onRetry ? (
        <div className={styles.actions}>
          <Button onClick={onRetry}>{retryLabel}</Button>
        </div>
      ) : null}
    </div>
  );
});
