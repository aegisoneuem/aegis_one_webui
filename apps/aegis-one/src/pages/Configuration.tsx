import { Select, StatusPill, type DataTableColumn } from '@aegis/ui';
import { useListController } from '../app/useListController';
import { humanise, num, pct } from '../app/format';
import { ResourceList } from './shared/ResourceList';
import type { ConfigCheck } from '../api/types';

const COLUMNS: DataTableColumn<ConfigCheck>[] = [
  {
    id: 'title',
    header: 'Check',
    locked: true,
    sortable: true,
    width: 360,
    cell: (c) => c.title,
    exportValue: (c) => c.title,
  },
  {
    id: 'benchmark',
    header: 'Benchmark',
    sortable: true,
    width: 300,
    cell: (c) => c.benchmark,
    exportValue: (c) => c.benchmark,
  },
  {
    id: 'severity',
    header: 'Severity',
    sortable: true,
    width: 130,
    cell: (c) => (
      <StatusPill
        tone={c.severity === 'high' ? 'bad' : c.severity === 'medium' ? 'warn' : 'neutral'}
      >
        {humanise(c.severity)}
      </StatusPill>
    ),
    exportValue: (c) => c.severity,
  },
  {
    id: 'platform',
    header: 'Platform',
    sortable: true,
    width: 130,
    cell: (c) => c.platform,
    exportValue: (c) => c.platform,
  },
  {
    id: 'passCount',
    header: 'Passing',
    numeric: true,
    sortable: true,
    width: 130,
    cell: (c) => num(c.passCount),
    exportValue: (c) => c.passCount,
  },
  {
    id: 'failCount',
    header: 'Failing',
    numeric: true,
    sortable: true,
    width: 150,
    cell: (c) => {
      const total = c.passCount + c.failCount;
      return c.failCount === 0 ? (
        '0'
      ) : (
        <StatusPill tone={c.failCount / Math.max(total, 1) > 0.15 ? 'bad' : 'warn'}>
          {`${num(c.failCount)} (${pct((c.failCount / Math.max(total, 1)) * 100, 0)})`}
        </StatusPill>
      );
    },
    exportValue: (c) => c.failCount,
  },
  {
    id: 'exceptionCount',
    header: 'Exceptions',
    numeric: true,
    sortable: true,
    width: 140,
    cell: (c) => num(c.exceptionCount),
    exportValue: (c) => c.exceptionCount,
  },
];

export default function Configuration() {
  const controller = useListController<ConfigCheck>({
    path: '/profiles/checks',
    defaultSort: { id: 'failCount', desc: true },
  });

  const chips = ['severity', 'platform']
    .filter((key) => controller.filters[key])
    .map((key) => ({
      id: key,
      label: humanise(key),
      value: humanise(controller.filters[key]),
      onRemove: () => controller.setFilter(key, undefined),
    }));

  return (
    <ResourceList
      label="Configuration"
      description="Benchmark checks and where endpoints fail them."
      unit="checks"
      viewKey="config"
      columns={COLUMNS}
      controller={controller}
      getRowId={(c) => c.id}
      searchPlaceholder="Search check or benchmark"
      chips={chips}
      emptyTitle="No checks match these filters"
      emptyDescription="Clear the platform filter to see checks for every operating system."
      filters={
        <>
          <Select
            size="sm"
            aria-label="Severity"
            placeholder="Any severity"
            options={['high', 'medium', 'low'].map((v) => ({ value: v, label: humanise(v) }))}
            value={controller.filters['severity'] ?? ''}
            onChange={(e) => controller.setFilter('severity', e.target.value || undefined)}
          />
          <Select
            size="sm"
            aria-label="Platform"
            placeholder="All platforms"
            options={['Windows', 'Linux', 'macOS', 'All'].map((v) => ({ value: v, label: v }))}
            value={controller.filters['platform'] ?? ''}
            onChange={(e) => controller.setFilter('platform', e.target.value || undefined)}
          />
        </>
      }
    />
  );
}
