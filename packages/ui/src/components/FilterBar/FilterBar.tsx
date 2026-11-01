import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';
import { cx } from '../../cx';
import { Input } from '../Input/Input';
import styles from './FilterBar.module.css';

export interface ActiveFilterChip {
  id: string;
  /** What is being filtered, e.g. "Zone". */
  label: string;
  /** The chosen value, e.g. "Mumbai HQ +2". */
  value: string;
  onRemove: () => void;
}

export interface FilterBarProps extends Omit<HTMLAttributes<HTMLDivElement>, 'onChange'> {
  /** Omit to leave the search box out entirely. */
  search?: {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    /** Accessible name; defaults to the placeholder. */
    label?: string;
  };
  /** Selects, MultiSelects and date ranges, left to right. */
  children?: ReactNode;
  /** Buttons on the right: column chooser, saved views, export. */
  actions?: ReactNode;
  /** Applied filters as removable chips, so the result set is explainable. */
  chips?: readonly ActiveFilterChip[];
  onClearAll?: () => void;
  /** Result count, e.g. "1,284 of 50,000". */
  count?: ReactNode;
}

export const FilterBar = forwardRef<HTMLDivElement, FilterBarProps>(function FilterBar(
  { search, children, actions, chips, onClearAll, count, className, ...rest },
  ref,
) {
  return (
    <div ref={ref} className={cx(styles.bar, className)} {...rest}>
      {search ? (
        <Input
          className={styles.search}
          type="search"
          size="sm"
          value={search.value}
          placeholder={search.placeholder ?? 'Search'}
          aria-label={search.label ?? search.placeholder ?? 'Search'}
          onChange={(e) => search.onChange(e.target.value)}
          onClear={() => search.onChange('')}
        />
      ) : null}

      {children ? <div className={styles.filters}>{children}</div> : null}

      {count ? <span className={styles.count}>{count}</span> : null}

      {actions ? <div className={styles.actions}>{actions}</div> : null}

      {chips?.length ? (
        <div className={styles.chips}>
          {chips.map((c) => (
            <span key={c.id} className={styles.chip}>
              <span className={styles.chipLabel}>{c.label}:</span>
              {c.value}
              <button
                type="button"
                className={styles.chipRemove}
                aria-label={`Remove ${c.label} filter`}
                onClick={c.onRemove}
              >
                &#10005;
              </button>
            </span>
          ))}
          {onClearAll ? (
            <button type="button" className={styles.clearAll} onClick={onClearAll}>
              Clear all
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
});
