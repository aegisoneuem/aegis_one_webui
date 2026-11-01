import { forwardRef, useId, type HTMLAttributes, type ReactNode } from 'react';
import { cx } from '../../cx';
import styles from './Field.module.css';

export interface FieldRenderProps {
  /** Put on the control. */
  id: string;
  /** Put on the control so the hint and error are announced. */
  'aria-describedby': string | undefined;
  'aria-invalid': boolean | undefined;
  required: boolean | undefined;
}

export interface FieldProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  label: ReactNode;
  /** Help text under the control. Hidden while an error is showing. */
  hint?: ReactNode;
  /** Validation message. Its presence marks the control invalid. */
  error?: ReactNode;
  required?: boolean;
  /** Prints "Optional" beside the label; use on forms where most fields are required. */
  showOptional?: boolean;
  /** Label beside the control instead of above it, for settings screens. */
  layout?: 'stacked' | 'horizontal';
  children: (props: FieldRenderProps) => ReactNode;
}

/**
 * Label, hint and error around any control, wiring up the aria-describedby
 * relationships so the control itself does not have to.
 */
export const Field = forwardRef<HTMLDivElement, FieldProps>(function Field(
  {
    label,
    hint,
    error,
    required,
    showOptional = false,
    layout = 'stacked',
    className,
    children,
    ...rest
  },
  ref,
) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = error ? errorId : hint ? hintId : undefined;

  const body = (
    <>
      {children({
        id,
        'aria-describedby': describedBy,
        'aria-invalid': error ? true : undefined,
        required: required || undefined,
      })}
      {error ? (
        <span id={errorId} className={styles.error} role="alert">
          {error}
        </span>
      ) : hint ? (
        <span id={hintId} className={styles.hint}>
          {hint}
        </span>
      ) : null}
    </>
  );

  return (
    <div
      ref={ref}
      className={cx(styles.field, layout === 'horizontal' && styles.horizontal, className)}
      {...rest}
    >
      <label className={styles.label} htmlFor={id}>
        {label}
        {required ? (
          <span className={styles.required} aria-hidden="true">
            *
          </span>
        ) : showOptional ? (
          <span className={styles.optional}>Optional</span>
        ) : null}
      </label>
      {layout === 'horizontal' ? <div className={styles.body}>{body}</div> : body}
    </div>
  );
});
