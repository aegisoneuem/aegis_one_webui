/**
 * @aegis/ui — brand-agnostic component library.
 *
 * Nothing here knows the name or the palette of the console it is rendering.
 * Every colour, font, radius and density value comes from the --ui-* custom
 * properties a console defines in its own tokens.css.
 */

// Layout and navigation
export { Sidebar, NavGroup, NavItem } from './components/Sidebar/Sidebar';
export type { SidebarProps, NavGroupProps, NavItemProps } from './components/Sidebar/Sidebar';
export { Breadcrumb } from './components/Breadcrumb/Breadcrumb';
export type { BreadcrumbProps, BreadcrumbItem } from './components/Breadcrumb/Breadcrumb';
export { PageHeader } from './components/PageHeader/PageHeader';
export type { PageHeaderProps } from './components/PageHeader/PageHeader';

// Actions
export { Button } from './components/Button/Button';
export type { ButtonProps, ButtonVariant, ButtonSize } from './components/Button/Button';
export { IconButton } from './components/IconButton/IconButton';
export type { IconButtonProps } from './components/IconButton/IconButton';
export { Menu } from './components/Menu/Menu';
export type {
  MenuProps,
  MenuEntry,
  MenuAction,
  MenuSeparator,
  MenuTriggerProps,
} from './components/Menu/Menu';

// Form controls
export { Field } from './components/Field/Field';
export type { FieldProps, FieldRenderProps } from './components/Field/Field';
export { Input } from './components/Input/Input';
export type { InputProps } from './components/Input/Input';
export { Select } from './components/Select/Select';
export type { SelectProps, SelectOption } from './components/Select/Select';
export { MultiSelect } from './components/MultiSelect/MultiSelect';
export type { MultiSelectProps, MultiSelectOption } from './components/MultiSelect/MultiSelect';
export {
  DatePicker,
  DateRangePicker,
  DEFAULT_RANGE_PRESETS,
} from './components/DatePicker/DatePicker';
export type {
  DatePickerProps,
  DateRange,
  DateRangePreset,
  DateRangePickerProps,
} from './components/DatePicker/DatePicker';
export { Checkbox } from './components/Checkbox/Checkbox';
export type { CheckboxProps } from './components/Checkbox/Checkbox';
export { Toggle } from './components/Toggle/Toggle';
export type { ToggleProps } from './components/Toggle/Toggle';

// Overlays
export { Popover } from './components/Popover/Popover';
export type { PopoverProps, PopoverAlign } from './components/Popover/Popover';
export { Modal } from './components/Modal/Modal';
export type { ModalProps } from './components/Modal/Modal';
export { Drawer } from './components/Drawer/Drawer';
export type { DrawerProps } from './components/Drawer/Drawer';
export { Tooltip } from './components/Tooltip/Tooltip';
export type { TooltipProps } from './components/Tooltip/Tooltip';
export { ToastProvider, useToast } from './components/Toast/Toast';
export type {
  ToastProviderProps,
  ToastOptions,
  ToastTone,
  ToastApi,
} from './components/Toast/Toast';

// Structure and status
export { Card } from './components/Card/Card';
export type { CardProps } from './components/Card/Card';
export { Tabs, TabPanel } from './components/Tabs/Tabs';
export type { TabsProps, TabDef, TabPanelProps } from './components/Tabs/Tabs';
export { Stepper } from './components/Stepper/Stepper';
export type { StepperProps, StepDef } from './components/Stepper/Stepper';
export { StatusPill } from './components/StatusPill/StatusPill';
export type { StatusPillProps, StatusTone } from './components/StatusPill/StatusPill';
export { KpiTile } from './components/KpiTile/KpiTile';
export type { KpiTileProps, KpiTone } from './components/KpiTile/KpiTile';
export { ChartFrame, SERIES_VARS } from './components/ChartFrame/ChartFrame';
export type { ChartFrameProps, ChartLegendItem } from './components/ChartFrame/ChartFrame';
export { FilterBar } from './components/FilterBar/FilterBar';
export type { FilterBarProps, ActiveFilterChip } from './components/FilterBar/FilterBar';
export { Pagination } from './components/Pagination/Pagination';
export type { PaginationProps } from './components/Pagination/Pagination';

// Feedback
export { Skeleton, TableSkeleton } from './components/Skeleton/Skeleton';
export type { SkeletonProps, TableSkeletonProps } from './components/Skeleton/Skeleton';
export { EmptyState } from './components/EmptyState/EmptyState';
export type { EmptyStateProps } from './components/EmptyState/EmptyState';
export { ErrorState } from './components/ErrorState/ErrorState';
export type { ErrorStateProps } from './components/ErrorState/ErrorState';

// Data grid
export { DataTable, buildDefaultView } from './components/DataTable/DataTable';
export type { DataTableProps } from './components/DataTable/DataTable';
export { ColumnChooser } from './components/DataTable/ColumnChooser';
export type { ColumnChooserProps } from './components/DataTable/ColumnChooser';
export { SavedViews } from './components/DataTable/SavedViews';
export type { SavedViewsProps } from './components/DataTable/SavedViews';
export type {
  DataTableColumn,
  SortState,
  TableView,
  SavedView,
} from './components/DataTable/types';

// Utilities
export { cx } from './cx';
export { useOnEscape } from './hooks/useOnEscape';
export { useFocusTrap } from './hooks/useFocusTrap';
export { toCsv, exportCsv, exportXlsx, neutralizeFormula, downloadBlob } from './utils/exportRows';
export type { ExportColumn, CellValue } from './utils/exportRows';
