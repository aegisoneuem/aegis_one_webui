import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cx } from '../../cx';
import { IconButton } from '../IconButton/IconButton';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { useOnEscape } from '../../hooks/useOnEscape';
import styles from './Modal.module.css';

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  /** One line under the title saying what the action will do. */
  description?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
  /** Buttons, right-aligned. Put the confirming action last. */
  footer?: ReactNode;
  /** Blocks Escape and overlay clicks, for a destructive confirm mid-flight. */
  dismissible?: boolean;
  className?: string;
  children: ReactNode;
}

export function Modal({
  open,
  onClose,
  title,
  description,
  size = 'sm',
  footer,
  dismissible = true,
  className,
  children,
}: ModalProps) {
  const panel = useRef<HTMLDivElement>(null);
  const id = useId();

  useFocusTrap(open, panel);
  useOnEscape(open && dismissible, onClose);

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
        if (dismissible && e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-title`}
        aria-describedby={description ? `${id}-desc` : undefined}
        tabIndex={-1}
        className={cx(styles.modal, size !== 'sm' && styles[size], className)}
      >
        <div className={styles.header}>
          <div className={styles.titles}>
            <h2 id={`${id}-title`} className={styles.title}>
              {title}
            </h2>
            {description ? (
              <p id={`${id}-desc`} className={styles.description}>
                {description}
              </p>
            ) : null}
          </div>
          {dismissible ? (
            <IconButton
              label="Close"
              icon={<span aria-hidden="true">&#10005;</span>}
              onClick={onClose}
            />
          ) : null}
        </div>
        <div className={styles.body}>{children}</div>
        {footer ? <div className={styles.footer}>{footer}</div> : null}
      </div>
    </div>,
    document.body,
  );
}
