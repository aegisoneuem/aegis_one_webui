import { Select, StatusPill, type DataTableColumn } from '@aegis/ui';
import { useListController } from '../app/useListController';
import { date, humanise, num, pct, toneFor } from '../app/format';
import { ResourceList } from './shared/ResourceList';
import type { Patch } from '../api/types';

const COLUMNS: DataTableColumn<Patch>[] = [
  {
    id: 'title',
    header: 'Patch',
    locked: true,
    sortable: true,
    width: 330,
    cell: (p) => p.title,
    exportValue: (p) => p.title,
  },
  {
    id: 'kb',
    header: 'Reference',
    sortable: true,
    width: 150,
    cell: (p) => p.kb ?? '—',
    exportValue: (p) => p.kb,
  },
  {
    id: 'platform',
    header: 'Platform',
    sortable: true,
    width: 140,
    cell: (p) => p.platform,
    exportValue: (p) => p.platform,
  },
  {
    id: 'severity',
    header: 'Severity',
    sortable: true,
    width: 130,
    cell: (p) => <StatusPill tone={toneFor(p.severity)}>{humanise(p.severity)}</StatusPill>,
    exportValue: (p) => p.severity,
  },
  {
    id: 'category',
    header: 'Category',
    sortable: true,
    width: 170,
    cell: (p) => p.category,
    exportValue: (p) => p.category,
  },
  {
    id: 'applicableCount',
    header: 'Applicable',
    numeric: true,
    sortable: true,
    width: 130,
    cell: (p) => num(p.applicableCount),
    exportValue: (p) => p.applicableCount,
  },
  {
    id: 'installedCount',
    header: 'Installed',
    numeric: true,
    sortable: true,
    width: 150,
    cell: (p) =>
      p.applicableCount === 0
        ? '—'
        : `${num(p.installedCount)} (${pct((p.installedCount / p.applicableCount) * 100, 0)})`,
    exportValue: (p) => p.installedCount,
  },
  {
    id: 'failedCount',
    header: 'Failed',
    numeric: true,
    sortable: true,
    width: 110,
    cell: (p) =>
      p.failedCount > 0 ? <StatusPill tone="bad">{num(p.failedCount)}</StatusPill> : '0',
    exportValue: (p) => p.failedCount,
  },
  {
    id: 'releasedAt',
    header: 'Released',
    sortable: true,
    width: 140,
    cell: (p) => date(p.releasedAt),
    exportValue: (p) => p.releasedAt,
  },
  {
    id: 'rebootRequired',
    header: 'Restart',
    width: 110,
    defaultHidden: true,
    cell: (p) => (p.rebootRequired ? 'Required' : 'No'),
    exportValue: (p) => (p.rebootRequired ? 'Required' : 'No'),
  },
];

export default function Patches() {
  const controller = useListController<Patch>({
    path: '/patches',
    defaultSort: { id: 'releasedAt', desc: true },
  });

  const chips = ['platform', 'severity']
    .filter((key) => controller.filters[key])
    .map((key) => ({
      id: key,
      label: humanise(key),
      value: humanise(controller.filters[key]),
      onRemove: () => controller.setFilter(key, undefined),
    }));

  return (
    <ResourceList
      label="Patches"
      description="Available patches and how far each one has rolled out."
      unit="patches"
      viewKey="patches"
      columns={COLUMNS}
      controller={controller}
      getRowId={(p) => p.id}
      searchPlaceholder="Search title or KB reference"
      chips={chips}
      emptyTitle="No patches match these filters"
      emptyDescription="Try a different platform, or clear the severity filter."
      filters={
        <>
          <Select
            size="sm"
            aria-label="Platform"
            placeholder="All platforms"
            options={['Windows', 'Linux', 'macOS', 'Third-Party', 'Firmware'].map((v) => ({
              value: v,
              label: v,
            }))}
            value={controller.filters['platform'] ?? ''}
            onChange={(e) => controller.setFilter('platform', e.target.value || undefined)}
          />
          <Select
            size="sm"
            aria-label="Severity"
            placeholder="Any severity"
            options={['critical', 'important', 'moderate', 'low'].map((v) => ({
              value: v,
              label: humanise(v),
            }))}
            value={controller.filters['severity'] ?? ''}
            onChange={(e) => controller.setFilter('severity', e.target.value || undefined)}
          />
        </>
      }
    />
  );
}
