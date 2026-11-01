import { useCallback, useRef, useState, type KeyboardEvent, type ReactNode, type Ref } from 'react';
import { cx } from '../../cx';
import { Popover, type PopoverAlign } from '../Popover/Popover';
import styles from './Menu.module.css';

export interface MenuAction {
  id: string;
  label: ReactNode;
  icon?: ReactNode;
  /** Keyboard hint shown right-aligned; the Menu does not bind it. */
  shortcut?: string;
  onSelect: () => void;
  disabled?: boolean;
  /** Destructive action, e.g. uninstall or revoke. */
  danger?: boolean;
}

export interface MenuSeparator {
  separator: true;
  /** Optional heading above the group that follows. */
  label?: string;
}

export type MenuEntry = MenuAction | MenuSeparator;

export interface MenuTriggerProps {
  ref: Ref<HTMLButtonElement>;
  onClick: () => void;
  'aria-haspopup': 'menu';
  'aria-expanded': boolean;
}

export interface MenuProps {
  items: readonly MenuEntry[];
  /** Accessible name for the popup itself. */
  label: string;
  align?: PopoverAlign;
  className?: string;
  children: (trigger: MenuTriggerProps) => ReactNode;
}

const isAction = (e: MenuEntry): e is MenuAction => !('separator' in e);

export function Menu({ items, label, align = 'end', className, children }: MenuProps) {
  const anchor = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const buttons = Array.from(
      list.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [],
    );
    if (buttons.length === 0) return;
    const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const next =
      e.key === 'ArrowDown'
        ? (at + 1) % buttons.length
        : (at - 1 + buttons.length) % buttons.length;
    buttons[next]?.focus();
  };

  return (
    <>
      {children({
        ref: anchor,
        onClick: () => setOpen((v) => !v),
        'aria-haspopup': 'menu',
        'aria-expanded': open,
      })}
      <Popover
        ref={list}
        anchorRef={anchor}
        open={open}
        onClose={close}
        align={align}
        className={className}
        role="menu"
        aria-label={label}
        onKeyDown={onKeyDown}
      >
        <ul className={styles.list}>
          {items.map((entry, i) =>
            isAction(entry) ? (
              <li key={entry.id} role="none">
                <button
                  type="button"
                  role="menuitem"
                  className={cx(styles.item, entry.danger && styles.danger)}
                  disabled={entry.disabled}
                  onClick={() => {
                    close();
                    entry.onSelect();
                  }}
                >
                  {entry.icon ? (
                    <span className={styles.icon} aria-hidden="true">
                      {entry.icon}
                    </span>
                  ) : null}
                  {entry.label}
                  {entry.shortcut ? (
                    <span className={styles.shortcut}>{entry.shortcut}</span>
                  ) : null}
                </button>
              </li>
            ) : entry.label ? (
              <li key={`sep-${i}`} role="presentation" className={styles.sectionLabel}>
                {entry.label}
              </li>
            ) : (
              <li key={`sep-${i}`} role="separator" className={styles.separator} />
            ),
          )}
        </ul>
      </Popover>
    </>
  );
}
