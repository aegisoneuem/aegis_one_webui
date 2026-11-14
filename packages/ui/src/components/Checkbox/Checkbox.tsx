import {
  forwardRef,
  useEffect,
  useRef,
  type InputHTMLAttributes,
  type MutableRefObject,
  type ReactNode,
} from 'react';
import { cx } from '../../cx';
import styles from './Checkbox.module.css';

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: ReactNode;
  hint?: ReactNode;
  /** Partial selection, e.g. a header checkbox over a part-selected table. */
  indeterminate?: boolean;
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { label, hint, indeterminate = false, className, ...rest },
  ref,
) {
  const inner = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (inner.current) inner.current.indeterminate = indeterminate;
  }, [indeterminate]);

  const setRefs = (node: HTMLInputElement | null) => {
    inner.current = node;
    if (typeof ref === 'function') ref(node);
    else if (ref) (ref as MutableRefObject<HTMLInputElement | null>).current = node;
  };

  const input = <input ref={setRefs} type="checkbox" className={styles.input} {...rest} />;

  // Without a label the caller supplies aria-label; wrapping in <label> would be wrong.
  if (!label) return <span className={cx(styles.row, className)}>{input}</span>;

  return (
    <label className={cx(styles.row, className)}>
      {input}
      <span className={styles.text}>
        <span>{label}</span>
        {hint ? <span className={styles.hint}>{hint}</span> : null}
      </span>
    </label>
  );
});
