import { useMemo, useRef, useState } from 'react';
import { Button } from '../Button/Button';
import { Checkbox } from '../Checkbox/Checkbox';
import { Input } from '../Input/Input';
import { Modal } from '../Modal/Modal';
import { cx } from '../../cx';
import type { DataTableColumn, TableView } from './types';
import styles from './DataTable.module.css';

export interface ColumnChooserProps<T> {
  open: boolean;
  onClose: () => void;
  columns: readonly DataTableColumn<T>[];
  view: TableView;
  onApply: (view: TableView) => void;
  /** The view the table started with, for Reset. */
  defaultView: TableView;
}

/**
 * Visibility and order for the whole column set in one place. Built for the
 * 70-column device table: searchable, grouped, drag-reorderable, and with the
 * count of what is on so the user can tell when a view has grown unusable.
 */
export function ColumnChooser<T>({
  open,
  onClose,
  columns,
  view,
  onApply,
  defaultView,
}: ColumnChooserProps<T>) {
  const [draft, setDraft] = useState<TableView>(view);
  const [query, setQuery] = useState('');
  const dragId = useRef<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  // Re-seed the draft whenever the dialog is opened afresh.
  const [seenOpen, setSeenOpen] = useState(open);
  if (open !== seenOpen) {
    setSeenOpen(open);
    if (open) {
      setDraft(view);
      setQuery('');
    }
  }

  const byId = useMemo(() => new Map(columns.map((c) => [c.id, c])), [columns]);

  const ordered = useMemo(
    () =>
      draft.columnOrder
        .map((id) => byId.get(id))
        .filter((c): c is DataTableColumn<T> => Boolean(c)),
    [draft.columnOrder, byId],
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return ordered;
    return ordered.filter(
      (c) => c.header.toLowerCase().includes(q) || c.group?.toLowerCase().includes(q),
    );
  }, [ordered, query]);

  const shownCount = ordered.filter((c) => draft.columnVisibility[c.id] !== false).length;

  const setVisible = (id: string, on: boolean) =>
    setDraft((d) => ({ ...d, columnVisibility: { ...d.columnVisibility, [id]: on } }));

  const move = (from: string, to: string) => {
    if (from === to) return;
    setDraft((d) => {
      const next = [...d.columnOrder];
      const fromAt = next.indexOf(from);
      const toAt = next.indexOf(to);
      if (fromAt < 0 || toAt < 0) return d;
      next.splice(toAt, 0, ...next.splice(fromAt, 1));
      return { ...d, columnOrder: next };
    });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Columns"
      description="Choose which columns appear, and drag to reorder them."
      size="md"
      footer={
        <>
          <Button onClick={() => setDraft(defaultView)}>Reset to default</Button>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            onClick={() => {
              onApply(draft);
              onClose();
            }}
          >
            Apply
          </Button>
        </>
      }
    >
      <div className={styles.chooser}>
        <div className={styles.chooserHead}>
          <Input
            size="sm"
            type="search"
            placeholder="Search columns"
            aria-label="Search columns"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onClear={() => setQuery('')}
          />
          <span className={styles.chooserFoot}>
            {shownCount} of {ordered.length} shown
          </span>
        </div>

        <ul className={styles.chooserList}>
          {visible.map((c) => (
            <li
              key={c.id}
              className={cx(styles.chooserItem, overId === c.id && styles.dragOver)}
              draggable={!c.locked && !query}
              onDragStart={() => {
                dragId.current = c.id;
              }}
              onDragOver={(e) => {
                e.preventDefault();
                setOverId(c.id);
              }}
              onDragLeave={() => setOverId((v) => (v === c.id ? null : v))}
              onDrop={(e) => {
                e.preventDefault();
                if (dragId.current) move(dragId.current, c.id);
                dragId.current = null;
                setOverId(null);
              }}
            >
              <span className={styles.chooserGrip} aria-hidden="true">
                ⣿
              </span>
              <Checkbox
                checked={draft.columnVisibility[c.id] !== false}
                disabled={c.locked}
                aria-label={c.header}
                onChange={(e) => setVisible(c.id, e.target.checked)}
              />
              <span className={styles.chooserLabel}>{c.header}</span>
              {c.group ? <span className={styles.chooserGroup}>{c.group}</span> : null}
            </li>
          ))}
        </ul>

        {query ? <p className={styles.chooserFoot}>Clear the search to reorder columns.</p> : null}
      </div>
    </Modal>
  );
}
