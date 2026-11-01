import { forwardRef, type HTMLAttributes, type ReactNode, type Ref } from 'react';
import { cx } from '../../cx';
import styles from './Card.module.css';

export interface CardProps extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  /** Omit for a bare panel with no header rule. */
  title?: ReactNode;
  subtitle?: ReactNode;
  /** Controls in the header, right-aligned. */
  actions?: ReactNode;
  footer?: ReactNode;
  /** Removes body padding, for a card whose body is a table. */
  flush?: boolean;
  /** Renders as <section>; give it a title or an aria-label when you do. */
  as?: 'div' | 'section';
}

export const Card = forwardRef<HTMLElement, CardProps>(function Card(
  {
    title,
    subtitle,
    actions,
    footer,
    flush = false,
    as: Tag = 'div',
    className,
    children,
    ...rest
  },
  ref,
) {
  return (
    <Tag ref={ref as Ref<HTMLDivElement>} className={cx(styles.card, className)} {...rest}>
      {title || actions ? (
        <div className={styles.header}>
          <div className={styles.titles}>
            {title ? <h3 className={styles.title}>{title}</h3> : null}
            {subtitle ? <span className={styles.subtitle}>{subtitle}</span> : null}
          </div>
          {actions ? <div className={styles.actions}>{actions}</div> : null}
        </div>
      ) : null}
      <div className={cx(styles.body, flush && styles.flush)}>{children}</div>
      {footer ? <div className={styles.footer}>{footer}</div> : null}
    </Tag>
  );
});
