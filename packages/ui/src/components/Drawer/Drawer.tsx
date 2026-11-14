import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cx } from '../../cx';
import { IconButton } from '../IconButton/IconButton';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { useOnEscape } from '../../hooks/useOnEscape';
import styles from './Drawer.module.css';

export interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  /** Small caps line above the title, e.g. the record type. */
  eyebrow?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  /** Extra controls in the header, before the close button. */
  actions?: ReactNode;
  footer?: ReactNode;
  /** Removes body padding, for a drawer that is mostly a table or tab strip. */
  flush?: boolean;
  className?: string;
  children: ReactNode;
}

/**
 * Right-hand panel for inspecting a record without losing the list behind it.
 * Use Modal instead when the user must answer before anything else happens.
 */
export function Drawer({
  open,
  onClose,
  title,
  eyebrow,
  size = 'sm',
  actions,
  footer,
  flush = false,
  className,
  children,
}: DrawerProps) {
  const panel = useRef<HTMLDivElement>(null);
  const id = useId();

  useFocusTrap(open, panel);
  useOnEscape(open, onClose);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div
      className={styles.overlay}
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-title`}
        tabIndex={-1}
        className={cx(styles.drawer, size !== 'sm' && styles[size], className)}
      >
        <div className={styles.header}>
          <div className={styles.titles}>
            {eyebrow ? <span className={styles.eyebrow}>{eyebrow}</span> : null}
            <h2 id={`${id}-title`} className={styles.title}>
              {title}
            </h2>
          </div>
          {actions}
          <IconButton
            label="Close"
            icon={<span aria-hidden="true">&#10005;</span>}
            onClick={onClose}
          />
        </div>
        <div className={cx(styles.body, flush && styles.bodyFlush)}>{children}</div>
        {footer ? <div className={styles.footer}>{footer}</div> : null}
      </div>
    </div>,
    document.body,
  );
}
