import { useId, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { cx } from '../../cx';
import styles from './Tabs.module.css';

export interface TabDef {
  id: string;
  label: ReactNode;
  /** Badge after the label, e.g. a finding count. */
  count?: number;
  icon?: ReactNode;
  disabled?: boolean;
}

export interface TabsProps {
  tabs: readonly TabDef[];
  value: string;
  onChange: (id: string) => void;
  /** Accessible name for the tab strip, e.g. "Device detail sections". */
  label: string;
  variant?: 'underline' | 'segmented';
  className?: string;
}

/**
 * Tab strip only; the caller renders the panel. Panels are usually routed
 * (device detail tabs are URL segments), so owning them here would fight the
 * router.
 */
export function Tabs({
  tabs,
  value,
  onChange,
  label,
  variant = 'underline',
  className,
}: TabsProps) {
  const strip = useRef<HTMLDivElement>(null);
  const id = useId();

  // Bound to each tab rather than the strip: focus lives on a tab, and a
  // keydown handler on a non-focusable container would never fire for them.
  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    const keys = ['ArrowLeft', 'ArrowRight', 'Home', 'End'];
    if (!keys.includes(e.key)) return;
    e.preventDefault();
    const usable = tabs.filter((t) => !t.disabled);
    const at = usable.findIndex((t) => t.id === value);
    const next =
      e.key === 'Home'
        ? 0
        : e.key === 'End'
          ? usable.length - 1
          : e.key === 'ArrowRight'
            ? (at + 1) % usable.length
            : (at - 1 + usable.length) % usable.length;
    const target = usable[next];
    if (!target) return;
    onChange(target.id);
    strip.current
      ?.querySelector<HTMLButtonElement>(`#${CSS.escape(`${id}-${target.id}`)}`)
      ?.focus();
  };

  return (
    <div
      ref={strip}
      role="tablist"
      aria-label={label}
      className={cx(variant === 'segmented' ? styles.segmented : styles.tablist, className)}
    >
      {tabs.map((t) => (
        <button
          key={t.id}
          id={`${id}-${t.id}`}
          type="button"
          role="tab"
          aria-selected={t.id === value}
          aria-controls={`${id}-${t.id}-panel`}
          tabIndex={t.id === value ? 0 : -1}
          disabled={t.disabled}
          className={styles.tab}
          onClick={() => onChange(t.id)}
          onKeyDown={onKeyDown}
        >
          {t.icon ? <span aria-hidden="true">{t.icon}</span> : null}
          {t.label}
          {t.count !== undefined ? (
            <span className={styles.count}>{t.count.toLocaleString('en-IN')}</span>
          ) : null}
        </button>
      ))}
    </div>
  );
}

export interface TabPanelProps {
  /** Must match the Tabs `label`-scoped id; use `useTabPanelId`. */
  id: string;
  tabId: string;
  className?: string;
  children: ReactNode;
}

export function TabPanel({ id, tabId, className, children }: TabPanelProps) {
  return (
    <div
      id={id}
      role="tabpanel"
      aria-labelledby={tabId}
      tabIndex={0}
      className={cx(styles.panel, className)}
    >
      {children}
    </div>
  );
}
