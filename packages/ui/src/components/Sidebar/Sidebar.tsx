import {
  forwardRef,
  type AnchorHTMLAttributes,
  type HTMLAttributes,
  type MouseEvent,
  type ReactNode,
} from 'react';
import { cx } from '../../cx';
import styles from './Sidebar.module.css';

export interface SidebarProps extends HTMLAttributes<HTMLElement> {
  collapsed: boolean;
  /** Brand block rendered at the top (logo, wordmark). The library does not style its content. */
  header?: ReactNode;
  /** Pinned to the bottom, e.g. the collapse toggle. */
  footer?: ReactNode;
}

export const Sidebar = forwardRef<HTMLElement, SidebarProps>(function Sidebar(
  { collapsed, header, footer, className, children, ...rest },
  ref,
) {
  return (
    <aside
      ref={ref}
      data-collapsed={collapsed}
      className={cx(styles.sidebar, className)}
      aria-label="Main navigation"
      {...rest}
    >
      {header ? <div className={styles.header}>{header}</div> : null}
      <nav className={styles.scroll}>{children}</nav>
      {footer ? <div className={styles.footer}>{footer}</div> : null}
    </aside>
  );
});

export interface NavGroupProps extends Omit<HTMLAttributes<HTMLDivElement>, 'onToggle'> {
  label: string;
  expanded: boolean;
  onToggle: () => void;
}

export const NavGroup = forwardRef<HTMLDivElement, NavGroupProps>(function NavGroup(
  { label, expanded, onToggle, className, children, ...rest },
  ref,
) {
  const regionId = `navgroup-${label.toLowerCase().replace(/\s+/g, '-')}`;
  return (
    <div ref={ref} className={cx(styles.group, className)} {...rest}>
      <button
        type="button"
        className={styles.groupToggle}
        aria-expanded={expanded}
        aria-controls={regionId}
        onClick={onToggle}
      >
        <span className={styles.groupLabel}>{label}</span>
        <span className={styles.chevron} aria-hidden="true" />
      </button>
      <ul id={regionId} className={styles.items} hidden={!expanded}>
        {children}
      </ul>
    </div>
  );
});

export interface NavItemProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  /** Real URL so middle-click, copy-link and open-in-new-tab keep working. */
  href: string;
  icon: ReactNode;
  label: string;
  active?: boolean;
  /** Small tag after the label, e.g. "Beta". */
  tag?: string;
  /** Called on a plain left click instead of a full page navigation. */
  onNavigate?: () => void;
}

export const NavItem = forwardRef<HTMLAnchorElement, NavItemProps>(function NavItem(
  { href, icon, label, active = false, tag, onNavigate, onClick, className, ...rest },
  ref,
) {
  const handleClick = (e: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e);
    const plain = e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey;
    if (onNavigate && plain && !e.defaultPrevented) {
      e.preventDefault();
      onNavigate();
    }
  };
  return (
    <li>
      <a
        ref={ref}
        href={href}
        className={cx(styles.item, active && styles.active, className)}
        aria-current={active ? 'page' : undefined}
        title={label}
        onClick={handleClick}
        {...rest}
      >
        <span className={styles.icon} aria-hidden="true">
          {icon}
        </span>
        <span className={styles.itemLabel}>{label}</span>
        {tag ? <span className={styles.tag}>{tag}</span> : null}
      </a>
    </li>
  );
});
