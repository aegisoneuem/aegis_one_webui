import { Select, StatusPill, type DataTableColumn } from '@aegis/ui';
import { useListController } from '../app/useListController';
import { humanise, num, relative } from '../app/format';
import { ResourceList } from './shared/ResourceList';
import type { DeviceGroup } from '../api/types';

const COLUMNS: DataTableColumn<DeviceGroup>[] = [
  {
    id: 'name',
    header: 'Group',
    locked: true,
    sortable: true,
    width: 300,
    cell: (g) => g.name,
    exportValue: (g) => g.name,
  },
  {
    id: 'kind',
    header: 'Type',
    sortable: true,
    width: 140,
    cell: (g) => (
      <StatusPill tone={g.kind === 'rule' ? 'info' : 'neutral'}>
        {g.kind === 'rule' ? 'Rule-based' : 'Static'}
      </StatusPill>
    ),
    exportValue: (g) => g.kind,
  },
  {
    id: 'memberCount',
    header: 'Members',
    numeric: true,
    sortable: true,
    width: 130,
    cell: (g) => num(g.memberCount),
    exportValue: (g) => g.memberCount,
  },
  {
    id: 'rule',
    header: 'Rule',
    width: 420,
    cell: (g) => g.rule ?? 'Members chosen individually',
    exportValue: (g) => g.rule,
  },
  {
    id: 'createdBy',
    header: 'Created by',
    sortable: true,
    width: 160,
    cell: (g) => g.createdBy,
    exportValue: (g) => g.createdBy,
  },
  {
    id: 'createdAt',
    header: 'Created',
    sortable: true,
    width: 140,
    cell: (g) => relative(g.createdAt),
    exportValue: (g) => g.createdAt,
  },
];

export default function DeviceGroups() {
  const controller = useListController<DeviceGroup>({
    path: '/groups',
    defaultSort: { id: 'name', desc: false },
  });

  return (
    <ResourceList
      label="Device groups"
      description="Collections of endpoints you can target as one."
      unit="groups"
      viewKey="groups"
      columns={COLUMNS}
      controller={controller}
      getRowId={(g) => g.id}
      searchPlaceholder="Search group name"
      emptyTitle="No groups match these filters"
      emptyDescription="Groups collect endpoints for targeting; create one from the Devices list."
      chips={
        controller.filters['kind']
          ? [
              {
                id: 'kind',
                label: 'Type',
                value: humanise(controller.filters['kind']),
                onRemove: () => controller.setFilter('kind', undefined),
              },
            ]
          : []
      }
      filters={
        <Select
          size="sm"
          aria-label="Group type"
          placeholder="All types"
          options={[
            { value: 'rule', label: 'Rule-based' },
            { value: 'static', label: 'Static' },
          ]}
          value={controller.filters['kind'] ?? ''}
          onChange={(e) => controller.setFilter('kind', e.target.value || undefined)}
        />
      }
    />
  );
}
