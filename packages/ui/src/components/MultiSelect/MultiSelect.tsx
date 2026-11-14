import { useCallback, useMemo, useRef, useState } from 'react';
import { cx } from '../../cx';
import { Popover } from '../Popover/Popover';
import styles from './MultiSelect.module.css';

export interface MultiSelectOption {
  value: string;
  label: string;
  /** Right-aligned detail, e.g. a match count on a filter. */
  meta?: string;
  disabled?: boolean;
}

export interface MultiSelectProps {
  options: readonly MultiSelectOption[];
  value: readonly string[];
  onChange: (value: string[]) => void;
  /** Shown when nothing is selected. */
  placeholder?: string;
  /** Accessible name; required because the trigger shows a summary, not a label. */
  label: string;
  size?: 'sm' | 'md';
  /** Hides the search box; sensible under about a dozen options. */
  searchable?: boolean;
  /** Hides Select all / Clear. */
  showBulkActions?: boolean;
  disabled?: boolean;
  className?: string;
  id?: string;
}

/**
 * Checkbox list in a popover. Drives both multi-value filters and the
 * DataTable column chooser, so it has to stay comfortable with 70+ options:
 * hence the search box and the bulk actions.
 */
export function MultiSelect({
  options,
  value,
  onChange,
  placeholder = 'Any',
  label,
  size = 'md',
  searchable = true,
  showBulkActions = true,
  disabled = false,
  className,
  id,
}: MultiSelectProps) {
  const anchor = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const close = useCallback(() => setOpen(false), []);

  const selected = useMemo(() => new Set(value), [value]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query]);

  const summary =
    value.length === 0
      ? placeholder
      : value.length === 1
        ? (options.find((o) => o.value === value[0])?.label ?? '1 selected')
        : `${value.length} selected`;

  const toggle = (v: string) => {
    const next = new Set(selected);
    if (next.has(v)) next.delete(v);
    else next.add(v);
    // Keep the caller's option order rather than click order, so saved views are stable.
    onChange(options.filter((o) => next.has(o.value)).map((o) => o.value));
  };

  return (
    <>
      <button
        ref={anchor}
        type="button"
        id={id}
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`${label}: ${summary}`}
        className={cx(styles.trigger, size === 'sm' && styles.sm, className)}
        onClick={() => setOpen((v) => !v)}
      >
        <span className={cx(styles.summary, value.length === 0 && styles.placeholder)}>
          {summary}
        </span>
        {value.length > 1 ? <span className={styles.count}>{value.length}</span> : null}
        <span className={styles.caret} aria-hidden="true">
          &#9660;
        </span>
      </button>

      <Popover
        anchorRef={anchor}
        open={open}
        onClose={close}
        matchAnchorWidth
        role="dialog"
        aria-label={label}
      >
        <div className={styles.panel}>
          {searchable ? (
            <div className={styles.search}>
              <input
                className={styles.searchInput}
                type="search"
                placeholder="Search"
                aria-label={`Search ${label}`}
                value={query}
                // The popover has just taken focus on the user's own click, so
                // moving it to the search box is expected rather than a steal.
                ref={(node) => node?.focus()}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
          ) : null}

          {visible.length === 0 ? (
            <p className={styles.empty}>No matches</p>
          ) : (
            <ul className={styles.options}>
              {visible.map((o) => (
                <li key={o.value}>
                  <label className={styles.option}>
                    <input
                      type="checkbox"
                      checked={selected.has(o.value)}
                      disabled={o.disabled}
                      onChange={() => toggle(o.value)}
                    />
                    <span className={styles.optionLabel}>{o.label}</span>
                    {o.meta ? <span className={styles.optionMeta}>{o.meta}</span> : null}
                  </label>
                </li>
              ))}
            </ul>
          )}

          {showBulkActions ? (
            <div className={styles.footer}>
              <button
                type="button"
                className={styles.footerButton}
                onClick={() => onChange(visible.filter((o) => !o.disabled).map((o) => o.value))}
              >
                {query ? 'Select matches' : 'Select all'}
              </button>
              <button
                type="button"
                className={styles.footerButton}
                disabled={value.length === 0}
                onClick={() => onChange([])}
              >
                Clear
              </button>
            </div>
          ) : null}
        </div>
      </Popover>
    </>
  );
}
