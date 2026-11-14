import type { ReactNode } from 'react';
import type { CellValue } from '../../utils/exportRows';

export interface DataTableColumn<T> {
  id: string;
  header: string;
  /** Rendered cell. Keep it cheap: this runs for every visible row on every scroll frame. */
  cell: (row: T) => ReactNode;
  /**
   * Plain value for CSV and XLSX. Columns without one export as blank, which
   * is the right default for a column that is purely a set of buttons.
   */
  exportValue?: (row: T) => CellValue;
  /** Starting width in pixels. */
  width?: number;
  minWidth?: number;
  /** Right-aligns and uses tabular figures. */
  numeric?: boolean;
  /** Server-side sort key; omit for columns the API cannot sort by. */
  sortable?: boolean;
  /**
   * The field to sort by, when it is not this column's own id — for a column
   * that displays one field in a second form. Without it such a column would
   * ask the server to sort by an id the server has never heard of.
   */
  sortField?: string;
  /** Heading in the column chooser, e.g. "Hardware". */
  group?: string;
  /** Off until the user turns it on. Keeps the default view readable at 70+ columns. */
  defaultHidden?: boolean;
  /** Always visible and always first; the identifying column. */
  locked?: boolean;
}

export interface SortState {
  id: string;
  desc: boolean;
}

/** The part of a table's layout a saved view stores. */
export interface TableView {
  columnOrder: string[];
  columnVisibility: Record<string, boolean>;
  columnSizing: Record<string, number>;
}

export interface SavedView extends TableView {
  id: string;
  name: string;
  /** Built-in views cannot be renamed or deleted. */
  system?: boolean;
}
