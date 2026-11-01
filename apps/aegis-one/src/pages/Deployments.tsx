import { useNavigate } from 'react-router-dom';
import { Button, Select, StatusPill, type DataTableColumn } from '@aegis/ui';
import { useListController } from '../app/useListController';
import { useCan } from '../app/auth';
import { humanise, num, relative, toneFor } from '../app/format';
import { ResourceList } from './shared/ResourceList';
import type { Deployment } from '../api/types';

const COLUMNS: DataTableColumn<Deployment>[] = [
  {
    id: 'name',
    header: 'Action',
    locked: true,
    sortable: true,
    width: 300,
    cell: (d) => d.name,
    exportValue: (d) => d.name,
  },
  {
    id: 'type',
    header: 'Type',
    sortable: true,
    width: 170,
    cell: (d) => humanise(d.type),
    exportValue: (d) => d.type,
  },
  {
    id: 'status',
    header: 'Status',
    sortable: true,
    width: 190,
    cell: (d) => (
      <StatusPill dot tone={toneFor(d.status)}>
        {humanise(d.status)}
      </StatusPill>
    ),
    exportValue: (d) => d.status,
  },
  {
    id: 'content',
    header: 'Content',
    width: 260,
    cell: (d) => d.content,
    exportValue: (d) => d.content,
  },
  {
    id: 'targetCount',
    header: 'Targets',
    numeric: true,
    sortable: true,
    width: 120,
    cell: (d) => num(d.targetCount),
    exportValue: (d) => d.targetCount,
  },
  {
    id: 'succeeded',
    header: 'Succeeded',
    numeric: true,
    sortable: true,
    width: 130,
    cell: (d) => num(d.succeeded),
    exportValue: (d) => d.succeeded,
  },
  {
    id: 'failed',
    header: 'Failed',
    numeric: true,
    sortable: true,
    width: 110,
    cell: (d) => (d.failed > 0 ? <StatusPill tone="bad">{num(d.failed)}</StatusPill> : '0'),
    exportValue: (d) => d.failed,
  },
  {
    id: 'createdBy',
    header: 'Created by',
    sortable: true,
    width: 160,
    cell: (d) => d.createdBy,
    exportValue: (d) => d.createdBy,
  },
  {
    id: 'createdAt',
    header: 'Created',
    sortable: true,
    width: 140,
    cell: (d) => relative(d.createdAt),
    exportValue: (d) => d.createdAt,
  },
  {
    id: 'scheduledAt',
    header: 'Scheduled for',
    sortable: true,
    width: 150,
    defaultHidden: true,
    cell: (d) => relative(d.scheduledAt),
    exportValue: (d) => d.scheduledAt,
  },
];

export default function Deployments() {
  const navigate = useNavigate();
  const canCreate = useCan('deployments:create');
  const controller = useListController<Deployment>({
    path: '/deployments',
    defaultSort: { id: 'createdAt', desc: true },
  });

  return (
    <ResourceList
      label="Deployments"
      description="Actions you have queued, scheduled or completed."
      unit="actions"
      viewKey="deployments"
      columns={COLUMNS}
      controller={controller}
      getRowId={(d) => d.id}
      searchPlaceholder="Search action name or content"
      onRowClick={(d) => void navigate(`/deployments/${d.id}`)}
      emptyTitle="No deployments match these filters"
      emptyDescription="Start one from Software, Patches, or with New action."
      chips={
        controller.filters['status']
          ? [
              {
                id: 'status',
                label: 'Status',
                value: humanise(controller.filters['status']),
                onRemove: () => controller.setFilter('status', undefined),
              },
            ]
          : []
      }
      actions={
        canCreate ? (
          <Button size="sm" variant="primary" onClick={() => void navigate('/deployments/new')}>
            New action
          </Button>
        ) : null
      }
      filters={
        <>
          <Select
            size="sm"
            aria-label="Status"
            placeholder="Any status"
            options={[
              'running',
              'scheduled',
              'completed',
              'completed-with-errors',
              'failed',
              'cancelled',
            ].map((v) => ({
              value: v,
              label: humanise(v),
            }))}
            value={controller.filters['status'] ?? ''}
            onChange={(e) => controller.setFilter('status', e.target.value || undefined)}
          />
          <Select
            size="sm"
            aria-label="Type"
            placeholder="Any type"
            options={['software-install', 'software-uninstall', 'patch', 'script', 'os-update'].map(
              (v) => ({
                value: v,
                label: humanise(v),
              }),
            )}
            value={controller.filters['type'] ?? ''}
            onChange={(e) => controller.setFilter('type', e.target.value || undefined)}
          />
        </>
      }
    />
  );
}
