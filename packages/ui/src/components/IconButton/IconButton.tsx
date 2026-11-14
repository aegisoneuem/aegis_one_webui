import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cx } from '../../cx';
import styles from './IconButton.module.css';

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Required: an icon alone has no accessible name. */
  label: string;
  icon: ReactNode;
  size?: 'sm' | 'md' | 'lg';
  /** Draws the control's own border, for toolbars where it must read as a button. */
  bordered?: boolean;
  /** Toggled-on state, e.g. a filter panel that is open. */
  active?: boolean;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  {
    label,
    icon,
    size = 'md',
    bordered = false,
    active = false,
    className,
    type = 'button',
    ...rest
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={label}
      aria-pressed={active || undefined}
      className={cx(
        styles.iconButton,
        size !== 'md' && styles[size],
        bordered && styles.bordered,
        active && styles.active,
        className,
      )}
      {...rest}
    >
      {icon}
    </button>
  );
});
