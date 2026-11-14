import { forwardRef, type InputHTMLAttributes, type ReactNode } from 'react';
import { cx } from '../../cx';
import styles from './Input.module.css';

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  size?: 'sm' | 'md' | 'lg';
  /** Icon inside the leading edge, e.g. a magnifier on a search box. */
  icon?: ReactNode;
  /** Content on the trailing edge, e.g. a unit or a keyboard hint. */
  suffix?: ReactNode;
  /** Shows a clear button once the field has a value. */
  onClear?: () => void;
  /** Monospace value, for hashes, paths, IPs and script snippets. */
  mono?: boolean;
  className?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { size = 'md', icon, suffix, onClear, mono = false, className, disabled, value, ...rest },
  ref,
) {
  const showClear = Boolean(onClear) && value !== undefined && value !== '';
  return (
    <span
      className={cx(styles.wrap, size !== 'md' && styles[size], mono && styles.mono, className)}
      aria-disabled={disabled || undefined}
    >
      {icon ? (
        <span className={styles.adornment} aria-hidden="true">
          {icon}
        </span>
      ) : null}
      <input ref={ref} className={styles.input} disabled={disabled} value={value} {...rest} />
      {showClear ? (
        <button type="button" className={styles.clear} onClick={onClear} aria-label="Clear">
          &#10005;
        </button>
      ) : null}
      {suffix ? <span className={styles.adornment}>{suffix}</span> : null}
    </span>
  );
});
