import { useMemo, useState, type ReactNode } from 'react';
import {
  Button,
  ColumnChooser,
  DataTable,
  FilterBar,
  Menu,
  PageHeader,
  Pagination,
  SavedViews,
  buildDefaultView,
  exportCsv,
  exportXlsx,
  type ActiveFilterChip,
  type DataTableColumn,
  type SavedView,
  type TableView,
} from '@aegis/ui';
import type { RowData } from '@tanstack/react-table';
import type { ListController } from '../../app/useListController';
import { useCan } from '../../app/auth';
import styles from './ResourceList.module.css';

/**
 * The list page every resource shares: toolbar, virtualized table, pager,
 * column chooser, saved views and export.
 *
 * Pages supply their columns, their filter controls and their actions. None of
 * them re-implements paging, sorting, selection or export, so a fix to any of
 * those lands everywhere at once.
 */

export interface ResourceListProps<T extends RowData> {
  /** Accessible name for the grid, and the page's own heading, e.g. "Devices". */
  label: string;
  /** One line under the heading. Omit on a list embedded in a tab. */
  description?: string;
  /** Set when the page already renders its own PageHeader. */
  hideHeading?: boolean;
  columns: readonly DataTableColumn<T>[];
  controller: ListController<T>;
  getRowId: (row: T) => string;
  /** Noun for the pager and the empty state. */
  unit?: string;
  /** Filter controls, rendered between the search box and the actions. */
  filters?: ReactNode;
  /** Human-readable chips for the applied filters. */
  chips?: readonly ActiveFilterChip[];
  /** Buttons before the built-in column, view and export controls. */
  actions?: ReactNode;
  searchPlaceholder?: string;
  onRowClick?: (row: T) => void;
  selectable?: boolean;
  selectedIds?: readonly string[];
  onSelectedIdsChange?: (ids: string[]) => void;
  bulkActions?: ReactNode;
  emptyTitle?: string;
  emptyDescription?: string;
  /** Permission needed to export; the server enforces the same one. */
  exportPermission?: string;
  /** File name stem for an export, without the extension. */
  exportName?: string;
  /** Storage key for this table's saved views. */
  viewKey?: string;
}

function loadViews(key: string): SavedView[] {
  try {
    const raw = localStorage.getItem(`aegis.views.${key}`);
    return raw ? (JSON.parse(raw) as SavedView[]) : [];
  } catch {
    // Private windows and blocked site data both land here; a missing view is
    // a lost convenience, not a broken page.
    return [];
  }
}

function storeViews(key: string, views: readonly SavedView[]): void {
  try {
    localStorage.setItem(`aegis.views.${key}`, JSON.stringify(views));
  } catch {
    // Nothing to do: the layout still applies for this session.
  }
}

export function ResourceList<T extends RowData>({
  label,
  description,
  hideHeading = false,
  columns,
  controller,
  getRowId,
  unit = 'rows',
  filters,
  chips,
  actions,
  searchPlaceholder,
  onRowClick,
  selectable = false,
  selectedIds,
  onSelectedIdsChange,
  bulkActions,
  emptyTitle,
  emptyDescription,
  exportPermission = 'reports:export',
  exportName,
  viewKey,
}: ResourceListProps<T>) {
  const defaultView = useMemo(() => buildDefaultView(columns), [columns]);
  const [view, setView] = useState<TableView>(defaultView);
  const [chooserOpen, setChooserOpen] = useState(false);
  const [views, setViews] = useState<SavedView[]>(() =>
    viewKey
      ? [
          { id: 'default', name: 'Default view', system: true, ...defaultView },
          ...loadViews(viewKey),
        ]
      : [],
  );
  const [activeView, setActiveView] = useState<string | null>('default');
  const canExport = useCan(exportPermission);

  const exportColumns = useMemo(
    () =>
      columns
        .filter((c) => c.exportValue && view.columnVisibility[c.id] !== false)
        .map((c) => ({
          id: c.id,
          header: c.header,
          value: c.exportValue as NonNullable<DataTableColumn<T>['exportValue']>,
        })),
    [columns, view.columnVisibility],
  );

  const stem = exportName ?? label.toLowerCase().replace(/\s+/g, '-');

  /**
   * Export covers the page on screen, not the whole result set. Pulling 50,000
   * rows through the browser to build a file is exactly what the performance
   * budget rules out; a full extract belongs in Reports, which the server
   * generates.
   */
  const exportMenu = [
    {
      id: 'csv',
      label: `Export this page as CSV (${controller.rows.length} rows)`,
      onSelect: () => exportCsv(exportColumns, controller.rows, stem),
    },
    {
      id: 'xlsx',
      label: `Export this page as Excel (${controller.rows.length} rows)`,
      onSelect: () => void exportXlsx(exportColumns, controller.rows, stem, label),
    },
  ];

  return (
    <div className={styles.list}>
      {hideHeading ? null : <PageHeader title={label} {...(description ? { description } : {})} />}
      <FilterBar
        search={{
          value: controller.search,
          onChange: controller.setSearch,
          placeholder: searchPlaceholder ?? `Search ${label.toLowerCase()}`,
          label: `Search ${label.toLowerCase()}`,
        }}
        count={
          controller.total > 0 ? `${controller.total.toLocaleString('en-IN')} ${unit}` : undefined
        }
        chips={chips}
        {...(controller.activeFilterCount > 0 ? { onClearAll: controller.clearFilters } : {})}
        actions={
          <>
            {actions}
            {viewKey ? (
              <SavedViews
                views={views}
                activeId={activeView}
                current={view}
                onApply={(v) => {
                  setView({
                    columnOrder: v.columnOrder,
                    columnVisibility: v.columnVisibility,
                    columnSizing: v.columnSizing,
                  });
                  setActiveView(v.id);
                }}
                onSave={(name, layout) => {
                  const saved: SavedView = { id: `view-${Date.now()}`, name, ...layout };
                  const next = [...views, saved];
                  setViews(next);
                  setActiveView(saved.id);
                  storeViews(
                    viewKey,
                    next.filter((v) => !v.system),
                  );
                }}
                onDelete={(id) => {
                  const next = views.filter((v) => v.id !== id);
                  setViews(next);
                  setActiveView('default');
                  storeViews(
                    viewKey,
                    next.filter((v) => !v.system),
                  );
                }}
              />
            ) : null}
            <Button size="sm" onClick={() => setChooserOpen(true)}>
              Columns
            </Button>
            {canExport && exportColumns.length > 0 ? (
              <Menu items={exportMenu} label="Export options">
                {(trigger) => (
                  <Button size="sm" {...trigger} disabled={controller.rows.length === 0}>
                    Export
                  </Button>
                )}
              </Menu>
            ) : null}
          </>
        }
      >
        {filters}
      </FilterBar>

      <DataTable
        label={label}
        columns={columns}
        rows={controller.rows}
        getRowId={getRowId}
        sort={controller.sort}
        onSortChange={controller.setSort}
        view={view}
        onViewChange={setView}
        loading={controller.loading}
        error={controller.error}
        selectable={selectable}
        {...(selectedIds ? { selectedIds } : {})}
        {...(onSelectedIdsChange ? { onSelectedIdsChange } : {})}
        {...(bulkActions ? { bulkActions } : {})}
        totalMatching={controller.total}
        {...(onRowClick ? { onRowClick } : {})}
        {...(emptyTitle ? { emptyTitle } : {})}
        {...(emptyDescription ? { emptyDescription } : {})}
        className={styles.table}
        footer={
          <Pagination
            from={controller.from}
            to={controller.to}
            total={controller.total}
            unit={unit}
            pageSize={controller.pageSize}
            onPageSizeChange={controller.setPageSize}
            hasNext={controller.hasNext}
            hasPrevious={controller.hasPrevious}
            onNext={controller.next}
            onPrevious={controller.previous}
          />
        }
      />

      <ColumnChooser
        open={chooserOpen}
        onClose={() => setChooserOpen(false)}
        columns={columns}
        view={view}
        defaultView={defaultView}
        onApply={setView}
      />
    </div>
  );
}
