import { forwardRef, type SelectHTMLAttributes } from 'react';
import { cx } from '../../cx';
import styles from './Select.module.css';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps extends Omit<
  SelectHTMLAttributes<HTMLSelectElement>,
  'size' | 'children'
> {
  options: readonly SelectOption[];
  size?: 'sm' | 'md' | 'lg';
  /** Leading entry with an empty value, for "All", "Any" and the like. */
  placeholder?: string;
}

/**
 * Native select. Deliberately not a custom listbox: the browser's own popup
 * handles keyboard, screen readers and long option lists better than a
 * re-implementation, and these lists are short. Use MultiSelect for
 * multi-value filters and the column chooser.
 */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { options, size = 'md', placeholder, className, ...rest },
  ref,
) {
  return (
    <select
      ref={ref}
      className={cx(styles.select, size !== 'md' && styles[size], className)}
      {...rest}
    >
      {placeholder ? <option value="">{placeholder}</option> : null}
      {options.map((o) => (
        <option key={o.value} value={o.value} disabled={o.disabled}>
          {o.label}
        </option>
      ))}
    </select>
  );
});
