/* eslint-disable no-restricted-syntax -- Virtualized geometry (row offsets, column widths, spacer height) is measured at runtime and cannot live in a stylesheet. Confined to this file. */
import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  columnOrderingFeature,
  columnResizingFeature,
  columnSizingFeature,
  columnVisibilityFeature,
  tableFeatures,
  useTable,
  type ColumnDef,
  type RowData,
} from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import { cx } from '../../cx';
import { Checkbox } from '../Checkbox/Checkbox';
import { Button } from '../Button/Button';
import { EmptyState } from '../EmptyState/EmptyState';
import { ErrorState } from '../ErrorState/ErrorState';
import { TableSkeleton } from '../Skeleton/Skeleton';
import type { DataTableColumn, SortState, TableView } from './types';
import styles from './DataTable.module.css';

/**
 * Only the column-model features are registered. Sorting, filtering and
 * pagination all happen on the server — a client row model would silently
 * re-sort the 200 rows on screen and disagree with the other 49,800.
 */
const features = tableFeatures({
  columnVisibilityFeature,
  columnOrderingFeature,
  columnSizingFeature,
  columnResizingFeature,
});

/**
 * Row types must be assignable to TanStack's `RowData`, which means an object
 * type rather than an `interface` (an interface has no implicit index
 * signature). The API types generated from the OpenAPI contract are type
 * aliases, so they satisfy this.
 */
export interface DataTableProps<T extends RowData> {
  columns: readonly DataTableColumn<T>[];
  rows: readonly T[];
  getRowId: (row: T) => string;
  /** Accessible name for the grid. */
  label: string;

  /** Current server-side sort. */
  sort?: SortState | null;
  onSortChange?: (sort: SortState | null) => void;

  /** Layout state. Pass it to persist saved views; omit to let the table own it. */
  view?: TableView;
  onViewChange?: (view: TableView) => void;

  /** Turns on the checkbox column. */
  selectable?: boolean;
  selectedIds?: readonly string[];
  onSelectedIdsChange?: (ids: string[]) => void;
  /** Rendered in the bulk bar while rows are selected. */
  bulkActions?: ReactNode;
  /**
   * Total matching the current filters. When it exceeds the loaded rows the
   * bulk bar offers to act on all of them, which the caller resolves
   * server-side from the filter rather than from a list of ids.
   */
  totalMatching?: number;
  onSelectAllMatching?: () => void;
  allMatchingSelected?: boolean;

  onRowClick?: (row: T) => void;

  loading?: boolean;
  error?: { message: string; detail?: string; onRetry?: () => void } | null;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyActions?: ReactNode;

  /** Pagination bar, rendered under the rows. */
  footer?: ReactNode;
  className?: string;
}

const SELECT_WIDTH = 36;

export function buildDefaultView<T extends RowData>(
  columns: readonly DataTableColumn<T>[],
): TableView {
  return {
    columnOrder: columns.map((c) => c.id),
    columnVisibility: Object.fromEntries(columns.map((c) => [c.id, !c.defaultHidden])),
    columnSizing: Object.fromEntries(
      columns.filter((c) => c.width).map((c) => [c.id, c.width as number]),
    ),
  };
}

export function DataTable<T extends RowData>({
  columns,
  rows,
  getRowId,
  label,
  sort = null,
  onSortChange,
  view,
  onViewChange,
  selectable = false,
  selectedIds,
  onSelectedIdsChange,
  bulkActions,
  totalMatching,
  onSelectAllMatching,
  allMatchingSelected = false,
  onRowClick,
  loading = false,
  error = null,
  emptyTitle = 'Nothing matches these filters',
  emptyDescription = 'Widen the date range or clear a filter to see more.',
  emptyActions,
  footer,
  className,
}: DataTableProps<T>) {
  const scroller = useRef<HTMLDivElement>(null);
  const dragId = useRef<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  const defaultView = useMemo(() => buildDefaultView(columns), [columns]);
  const [ownView, setOwnView] = useState<TableView>(defaultView);
  const current = view ?? ownView;
  const setView = useCallback(
    (next: TableView) => {
      if (onViewChange) onViewChange(next);
      else setOwnView(next);
    },
    [onViewChange],
  );

  const byId = useMemo(() => new Map(columns.map((c) => [c.id, c])), [columns]);

  const tableColumns = useMemo<ColumnDef<typeof features, T>[]>(
    () =>
      columns.map((c) => ({
        id: c.id,
        header: c.header,
        size: c.width ?? 160,
        minSize: c.minWidth ?? 72,
        enableHiding: !c.locked,
      })),
    [columns],
  );

  const table = useTable({
    features,
    columns: tableColumns,
    data: rows as T[],
    getRowId,
    columnResizeMode: 'onChange',
    state: {
      columnOrder: current.columnOrder,
      columnVisibility: current.columnVisibility,
      columnSizing: current.columnSizing,
    },
    onColumnOrderChange: (updater) => {
      const next = typeof updater === 'function' ? updater(current.columnOrder) : updater;
      setView({ ...current, columnOrder: next });
    },
    onColumnVisibilityChange: (updater) => {
      const next = typeof updater === 'function' ? updater(current.columnVisibility) : updater;
      setView({ ...current, columnVisibility: next });
    },
    onColumnSizingChange: (updater) => {
      const next = typeof updater === 'function' ? updater(current.columnSizing) : updater;
      setView({ ...current, columnSizing: next });
    },
  });

  const headers = table.getHeaderGroups()[0]?.headers ?? [];
  const bodyWidth = headers.reduce((sum, h) => sum + h.getSize(), selectable ? SELECT_WIDTH : 0);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scroller.current,
    estimateSize: () => 34,
    getItemKey: (index) => {
      const row = rows[index];
      return row ? getRowId(row) : index;
    },
    overscan: 12,
  });

  const selected = useMemo(() => new Set(selectedIds ?? []), [selectedIds]);
  const pageIds = useMemo(() => rows.map(getRowId), [rows, getRowId]);
  const allOnPageSelected = pageIds.length > 0 && pageIds.every((id) => selected.has(id));
  const someOnPageSelected = pageIds.some((id) => selected.has(id));

  const toggleRow = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onSelectedIdsChange?.([...next]);
  };

  const togglePage = () => {
    const next = new Set(selected);
    if (allOnPageSelected) pageIds.forEach((id) => next.delete(id));
    else pageIds.forEach((id) => next.add(id));
    onSelectedIdsChange?.([...next]);
  };

  const onHeaderSort = (columnId: string) => {
    if (!onSortChange) return;
    if (sort?.id !== columnId) onSortChange({ id: columnId, desc: false });
    else if (!sort.desc) onSortChange({ id: columnId, desc: true });
    else onSortChange(null);
  };

  const moveColumn = (from: string, to: string) => {
    if (from === to) return;
    const next = [...current.columnOrder];
    const fromAt = next.indexOf(from);
    const toAt = next.indexOf(to);
    if (fromAt < 0 || toAt < 0) return;
    next.splice(toAt, 0, ...next.splice(fromAt, 1));
    setView({ ...current, columnOrder: next });
  };

  const selectionCount = selected.size;
  const showBulkBar = selectable && (selectionCount > 0 || allMatchingSelected);

  const body = loading ? (
    <TableSkeleton rows={14} columns={Math.min(headers.length || 6, 8)} />
  ) : error ? (
    <div className={styles.states}>
      <ErrorState description={error.message} detail={error.detail} onRetry={error.onRetry} />
    </div>
  ) : rows.length === 0 ? (
    <div className={styles.states}>
      <EmptyState title={emptyTitle} description={emptyDescription} actions={emptyActions} />
    </div>
  ) : null;

  return (
    <div className={cx(styles.wrap, className)}>
      {showBulkBar ? (
        <div className={styles.bulkBar}>
          <span className={styles.bulkCount}>
            {allMatchingSelected && totalMatching !== undefined
              ? `All ${totalMatching.toLocaleString('en-IN')} matching selected`
              : `${selectionCount.toLocaleString('en-IN')} selected`}
          </span>
          {!allMatchingSelected &&
          onSelectAllMatching &&
          totalMatching !== undefined &&
          totalMatching > selectionCount ? (
            <Button variant="link" size="sm" onClick={onSelectAllMatching}>
              Select all {totalMatching.toLocaleString('en-IN')} matching
            </Button>
          ) : null}
          <Button variant="link" size="sm" onClick={() => onSelectedIdsChange?.([])}>
            Clear
          </Button>
          <div className={styles.bulkActions}>{bulkActions}</div>
        </div>
      ) : null}

      <div ref={scroller} className={styles.scroller}>
        <table className={styles.table} aria-label={label} aria-rowcount={rows.length}>
          <thead className={styles.thead}>
            <tr className={styles.headerRow} style={{ width: bodyWidth }}>
              {selectable ? (
                <th
                  className={cx(styles.th, styles.pinned, styles.selectCell)}
                  style={{ width: SELECT_WIDTH }}
                >
                  <Checkbox
                    checked={allOnPageSelected}
                    indeterminate={!allOnPageSelected && someOnPageSelected}
                    aria-label={
                      allOnPageSelected
                        ? 'Clear selection on this page'
                        : 'Select all rows on this page'
                    }
                    onChange={togglePage}
                  />
                </th>
              ) : null}

              {headers.map((header, index) => {
                const col = byId.get(header.column.id);
                if (!col) return null;
                const isSorted = sort?.id === col.id;
                const pinned = index === 0 && col.locked;
                return (
                  <th
                    key={header.id}
                    className={cx(
                      styles.th,
                      col.numeric && styles.numeric,
                      isSorted && styles.sorted,
                      pinned && styles.pinned,
                      overId === col.id && styles.dragOver,
                    )}
                    style={{
                      width: header.getSize(),
                      left: pinned ? (selectable ? SELECT_WIDTH : 0) : undefined,
                    }}
                    aria-sort={isSorted ? (sort.desc ? 'descending' : 'ascending') : undefined}
                    draggable={!col.locked}
                    onDragStart={() => {
                      dragId.current = col.id;
                    }}
                    onDragOver={(e) => {
                      if (!dragId.current || col.locked) return;
                      e.preventDefault();
                      setOverId(col.id);
                    }}
                    onDragLeave={() => setOverId((v) => (v === col.id ? null : v))}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (dragId.current) moveColumn(dragId.current, col.id);
                      dragId.current = null;
                      setOverId(null);
                    }}
                  >
                    {col.sortable && onSortChange ? (
                      <button
                        type="button"
                        className={styles.sortButton}
                        onClick={() => onHeaderSort(col.id)}
                      >
                        <span className={styles.headerLabel}>{col.header}</span>
                        <span className={styles.sortIcon} aria-hidden="true">
                          {isSorted ? (sort.desc ? '▼' : '▲') : '▲'}
                        </span>
                      </button>
                    ) : (
                      <span className={styles.headerLabel}>{col.header}</span>
                    )}

                    {header.column.getCanResize() ? (
                      <button
                        type="button"
                        tabIndex={-1}
                        aria-hidden="true"
                        className={cx(
                          styles.resizer,
                          header.column.getIsResizing() && styles.resizing,
                        )}
                        onMouseDown={header.getResizeHandler()}
                        onTouchStart={header.getResizeHandler()}
                      />
                    ) : null}
                  </th>
                );
              })}
            </tr>
          </thead>

          {body ? null : (
            <tbody
              className={styles.tbody}
              style={{ height: virtualizer.getTotalSize(), width: bodyWidth }}
            >
              {virtualizer.getVirtualItems().map((item) => {
                const row = rows[item.index];
                if (!row) return null;
                const id = getRowId(row);
                const isSelected = selected.has(id) || allMatchingSelected;
                return (
                  <tr
                    key={id}
                    data-index={item.index}
                    aria-rowindex={item.index + 1}
                    aria-selected={selectable ? isSelected : undefined}
                    className={cx(
                      styles.row,
                      isSelected && styles.selected,
                      onRowClick && styles.clickable,
                    )}
                    style={{ transform: `translateY(${item.start}px)`, width: bodyWidth }}
                    tabIndex={onRowClick ? 0 : undefined}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                    onKeyDown={
                      onRowClick
                        ? (e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              onRowClick(row);
                            }
                          }
                        : undefined
                    }
                  >
                    {selectable ? (
                      <td
                        className={cx(styles.td, styles.pinned, styles.selectCell)}
                        style={{ width: SELECT_WIDTH }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Checkbox
                          checked={isSelected}
                          disabled={allMatchingSelected}
                          aria-label={`Select ${id}`}
                          onChange={() => toggleRow(id)}
                        />
                      </td>
                    ) : null}

                    {headers.map((header, index) => {
                      const col = byId.get(header.column.id);
                      if (!col) return null;
                      const pinned = index === 0 && col.locked;
                      return (
                        <td
                          key={header.id}
                          className={cx(
                            styles.td,
                            col.numeric && styles.numeric,
                            pinned && styles.pinned,
                          )}
                          style={{
                            width: header.getSize(),
                            left: pinned ? (selectable ? SELECT_WIDTH : 0) : undefined,
                          }}
                        >
                          <span className={styles.cellText}>{col.cell(row)}</span>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          )}
        </table>
        {body}
      </div>

      {footer ? <div className={styles.footer}>{footer}</div> : null}
    </div>
  );
}
