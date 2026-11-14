import { forwardRef, useCallback, useRef, useState, type InputHTMLAttributes } from 'react';
import { cx } from '../../cx';
import { Popover } from '../Popover/Popover';
import styles from './DatePicker.module.css';

export interface DatePickerProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'type' | 'size'
> {
  size?: 'sm' | 'md';
}

/**
 * Single date, on the native date input. The browser's own calendar already
 * handles locale, keyboard and screen readers; a hand-rolled calendar grid
 * would be a large component that does all of that slightly worse.
 */
export const DatePicker = forwardRef<HTMLInputElement, DatePickerProps>(function DatePicker(
  { size = 'md', className, ...rest },
  ref,
) {
  return (
    <input
      ref={ref}
      type="date"
      className={cx(styles.input, size === 'sm' && styles.sm, className)}
      {...rest}
    />
  );
});

export interface DateRange {
  /** ISO yyyy-mm-dd, or '' for an open end. */
  from: string;
  to: string;
}

export interface DateRangePreset {
  id: string;
  label: string;
  /** Resolved when picked, so "Last 7 days" stays relative to today. */
  resolve: () => DateRange;
}

const iso = (d: Date): string => d.toISOString().slice(0, 10);

const daysAgo = (n: number): DateRange => {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - n);
  return { from: iso(from), to: iso(to) };
};

/** Ranges the console offers everywhere: patch windows, audit, job history. */
export const DEFAULT_RANGE_PRESETS: readonly DateRangePreset[] = [
  { id: '24h', label: 'Last 24 hours', resolve: () => daysAgo(1) },
  { id: '7d', label: 'Last 7 days', resolve: () => daysAgo(7) },
  { id: '30d', label: 'Last 30 days', resolve: () => daysAgo(30) },
  { id: '90d', label: 'Last 90 days', resolve: () => daysAgo(90) },
];

export interface DateRangePickerProps {
  value: DateRange;
  onChange: (value: DateRange, presetId: string | null) => void;
  label: string;
  presets?: readonly DateRangePreset[];
  /** Which preset is active, so the panel can show it selected. */
  presetId?: string | null;
  size?: 'sm' | 'md';
  className?: string;
  id?: string;
}

export function DateRangePicker({
  value,
  onChange,
  label,
  presets = DEFAULT_RANGE_PRESETS,
  presetId = null,
  size = 'md',
  className,
  id,
}: DateRangePickerProps) {
  const anchor = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);

  const active = presets.find((p) => p.id === presetId);
  const summary = active
    ? active.label
    : value.from || value.to
      ? `${value.from || '…'} to ${value.to || '…'}`
      : 'Any time';

  return (
    <>
      <button
        ref={anchor}
        type="button"
        id={id}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`${label}: ${summary}`}
        className={cx(styles.rangeTrigger, size === 'sm' && styles.sm, className)}
        onClick={() => setOpen((v) => !v)}
      >
        <span>{summary}</span>
        <span className={styles.caret} aria-hidden="true">
          &#9660;
        </span>
      </button>

      <Popover anchorRef={anchor} open={open} onClose={close} role="dialog" aria-label={label}>
        <div className={styles.panel}>
          <div className={styles.presets}>
            {presets.map((p) => (
              <button
                key={p.id}
                type="button"
                className={styles.preset}
                aria-pressed={p.id === presetId}
                onClick={() => {
                  onChange(p.resolve(), p.id);
                  close();
                }}
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className={styles.custom}>
            <span className={styles.customLabel}>Custom range</span>
            <div className={styles.customRow}>
              <DatePicker
                size="sm"
                aria-label={`${label} from`}
                value={value.from}
                max={value.to || undefined}
                onChange={(e) => onChange({ ...value, from: e.target.value }, null)}
              />
              <span className={styles.customLabel}>to</span>
              <DatePicker
                size="sm"
                aria-label={`${label} to`}
                value={value.to}
                min={value.from || undefined}
                onChange={(e) => onChange({ ...value, to: e.target.value }, null)}
              />
            </div>
          </div>
        </div>
      </Popover>
    </>
  );
}
