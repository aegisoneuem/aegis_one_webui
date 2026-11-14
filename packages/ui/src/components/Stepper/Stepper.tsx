import { forwardRef, type HTMLAttributes } from 'react';
import { cx } from '../../cx';
import styles from './Stepper.module.css';

export interface StepDef {
  id: string;
  label: string;
  /** One line under the label summarising what was chosen. */
  hint?: string;
  /** Marks the step red; the user must come back to it. */
  invalid?: boolean;
}

export interface StepperProps extends HTMLAttributes<HTMLOListElement> {
  steps: readonly StepDef[];
  current: string;
  /** Steps the user may jump straight to. Everything ahead stays locked. */
  completed?: readonly string[];
  onStepClick?: (id: string) => void;
  label: string;
}

export const Stepper = forwardRef<HTMLOListElement, StepperProps>(function Stepper(
  { steps, current, completed = [], onStepClick, label, className, ...rest },
  ref,
) {
  const done = new Set(completed);
  const currentIndex = steps.findIndex((s) => s.id === current);

  return (
    <ol ref={ref} aria-label={label} className={cx(styles.stepper, className)} {...rest}>
      {steps.map((s, i) => {
        const isCurrent = s.id === current;
        const isDone = done.has(s.id);
        const reachable = Boolean(onStepClick) && (isDone || i <= currentIndex);
        return (
          <li
            key={s.id}
            className={cx(
              styles.step,
              isCurrent && styles.current,
              isDone && !isCurrent && styles.complete,
              s.invalid && styles.invalid,
            )}
            aria-current={isCurrent ? 'step' : undefined}
          >
            <button
              type="button"
              className={styles.button}
              disabled={!reachable}
              onClick={() => onStepClick?.(s.id)}
            >
              <span className={styles.marker} aria-hidden="true">
                {isDone && !isCurrent ? '✓' : i + 1}
              </span>
              <span className={styles.text}>
                <span className={styles.label}>{s.label}</span>
                {s.hint ? <span className={styles.hint}>{s.hint}</span> : null}
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
});
