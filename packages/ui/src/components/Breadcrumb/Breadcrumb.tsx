import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';
import { cx } from '../../cx';
import styles from './Breadcrumb.module.css';

export interface BreadcrumbItem {
  label: string;
  /** Omit on the current page. */
  onSelect?: () => void;
}

export interface BreadcrumbProps extends HTMLAttributes<HTMLElement> {
  items: BreadcrumbItem[];
  onBack: () => void;
  onHome: () => void;
  backIcon?: ReactNode;
  homeIcon?: ReactNode;
  /** Right-aligned content such as the signed-in user. */
  trailing?: ReactNode;
}

export const Breadcrumb = forwardRef<HTMLElement, BreadcrumbProps>(function Breadcrumb(
  { items, onBack, onHome, backIcon, homeIcon, trailing, className, ...rest },
  ref,
) {
  return (
    <header ref={ref} className={cx(styles.bar, className)} {...rest}>
      <div className={styles.nav}>
        <button type="button" className={styles.action} onClick={onBack} title="Back (Alt+Left)">
          {backIcon}
          <span>Back</span>
        </button>
        <button type="button" className={styles.action} onClick={onHome}>
          {homeIcon}
          <span>Home</span>
        </button>
      </div>
      <span className={styles.divider} aria-hidden="true" />
      <nav aria-label="Breadcrumb">
        <ol className={styles.trail}>
          {items.map((item, i) => {
            const last = i === items.length - 1;
            return (
              <li key={`${item.label}-${i}`} className={styles.crumb}>
                {item.onSelect && !last ? (
                  <button type="button" className={styles.link} onClick={item.onSelect}>
                    {item.label}
                  </button>
                ) : (
                  <span className={styles.current} aria-current={last ? 'page' : undefined}>
                    {item.label}
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      </nav>
      {trailing ? <div className={styles.trailing}>{trailing}</div> : null}
    </header>
  );
});
