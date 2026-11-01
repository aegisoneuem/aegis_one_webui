import { Select, StatusPill, type DataTableColumn } from '@aegis/ui';
import { useListController } from '../app/useListController';
import { humanise, num, relative, toneFor } from '../app/format';
import { ResourceList } from './shared/ResourceList';
import type { Integration } from '../api/types';

const COLUMNS: DataTableColumn<Integration>[] = [
  {
    id: 'name',
    header: 'Integration',
    locked: true,
    sortable: true,
    width: 320,
    cell: (i) => i.name,
    exportValue: (i) => i.name,
  },
  {
    id: 'kind',
    header: 'Kind',
    sortable: true,
    width: 160,
    cell: (i) => humanise(i.kind),
    exportValue: (i) => i.kind,
  },
  {
    id: 'status',
    header: 'Status',
    sortable: true,
    width: 150,
    cell: (i) => (
      <StatusPill dot tone={toneFor(i.status)}>
        {humanise(i.status)}
      </StatusPill>
    ),
    exportValue: (i) => i.status,
  },
  {
    id: 'events24h',
    header: 'Events (24 h)',
    numeric: true,
    sortable: true,
    width: 150,
    cell: (i) => num(i.events24h),
    exportValue: (i) => i.events24h,
  },
  {
    id: 'lastEventAt',
    header: 'Last event',
    sortable: true,
    width: 160,
    cell: (i) => relative(i.lastEventAt),
    exportValue: (i) => i.lastEventAt,
  },
];

export default function Integrations() {
  const controller = useListController<Integration>({
    path: '/integrations',
    defaultSort: { id: 'name', desc: false },
  });

  return (
    <ResourceList
      label="Integrations"
      description="Connected SIEM, ITSM, identity and notification systems."
      unit="integrations"
      viewKey="integrations"
      columns={COLUMNS}
      controller={controller}
      getRowId={(i) => i.id}
      searchPlaceholder="Search integration"
      emptyTitle="No integrations match these filters"
      emptyDescription="Connect a SIEM, an ITSM tool or a notification channel to see it here."
      filters={
        <>
          <Select
            size="sm"
            aria-label="Kind"
            placeholder="All kinds"
            options={['siem', 'itsm', 'notification', 'identity'].map((v) => ({
              value: v,
              label: humanise(v),
            }))}
            value={controller.filters['kind'] ?? ''}
            onChange={(e) => controller.setFilter('kind', e.target.value || undefined)}
          />
          <Select
            size="sm"
            aria-label="Status"
            placeholder="Any status"
            options={['connected', 'degraded', 'disconnected'].map((v) => ({
              value: v,
              label: humanise(v),
            }))}
            value={controller.filters['status'] ?? ''}
            onChange={(e) => controller.setFilter('status', e.target.value || undefined)}
          />
        </>
      }
    />
  );
}
