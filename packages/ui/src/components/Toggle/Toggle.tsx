import { forwardRef, useId, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cx } from '../../cx';
import styles from './Toggle.module.css';

export interface ToggleProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onChange'> {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: ReactNode;
  /** Required when there is no visible label. */
  'aria-label'?: string;
}

/**
 * Switch for settings that apply immediately. Use Checkbox inside forms that
 * are saved with a button.
 */
export const Toggle = forwardRef<HTMLButtonElement, ToggleProps>(function Toggle(
  { checked, onChange, label, className, disabled, id, ...rest },
  ref,
) {
  const autoId = useId();
  const labelId = `${id ?? autoId}-label`;

  const button = (
    <button
      ref={ref}
      type="button"
      role="switch"
      id={id ?? autoId}
      aria-checked={checked}
      aria-labelledby={label ? labelId : undefined}
      disabled={disabled}
      className={styles.track}
      onClick={() => onChange(!checked)}
      {...rest}
    >
      <span className={styles.knob} />
    </button>
  );

  if (!label) return <span className={cx(styles.row, className)}>{button}</span>;

  return (
    <span className={cx(styles.row, className)}>
      {button}
      <span id={labelId}>{label}</span>
    </span>
  );
});
