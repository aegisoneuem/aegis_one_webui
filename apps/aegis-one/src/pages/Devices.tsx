import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, MultiSelect, Select, StatusPill, type DataTableColumn } from '@aegis/ui';
import { useListController } from '../app/useListController';
import { useCan } from '../app/auth';
import { complianceTone, humanise, num, pct, relative, toneFor } from '../app/format';
import { segment } from '../app/safeNavigate';
import { ResourceList } from './shared/ResourceList';
import type { Device, Zone } from '../api/types';
import { api, type Page } from '../api/client';
import { useQuery } from '@tanstack/react-query';

/**
 * The 50,000-row list.
 *
 * Every column here is one the API can project, and every sortable column is
 * one the server will sort by. Adding a column that neither does would produce
 * a table that silently sorts the wrong way at page two.
 */
const COLUMNS: DataTableColumn<Device>[] = [
  {
    id: 'hostname',
    header: 'Hostname',
    locked: true,
    sortable: true,
    width: 190,
    group: 'Identity',
    cell: (d) => d.hostname,
    exportValue: (d) => d.hostname,
  },
  {
    id: 'status',
    header: 'Status',
    sortable: true,
    width: 140,
    group: 'Identity',
    cell: (d) => (
      <StatusPill dot tone={toneFor(d.status)}>
        {humanise(d.status)}
      </StatusPill>
    ),
    exportValue: (d) => d.status,
  },
  {
    id: 'osName',
    header: 'Operating system',
    sortable: true,
    width: 220,
    group: 'Platform',
    cell: (d) => `${d.osName} ${d.osVersion}`,
    exportValue: (d) => `${d.osName} ${d.osVersion}`,
  },
  {
    id: 'zoneName',
    header: 'Aegis Zone',
    sortable: true,
    width: 160,
    group: 'Location',
    cell: (d) => d.zoneName,
    exportValue: (d) => d.zoneName,
  },
  {
    id: 'primaryUserName',
    header: 'Primary user',
    sortable: true,
    width: 170,
    group: 'Identity',
    cell: (d) => d.primaryUserName,
    exportValue: (d) => d.primaryUserName,
  },
  {
    id: 'department',
    header: 'Department',
    sortable: true,
    width: 160,
    group: 'Identity',
    cell: (d) => d.department,
    exportValue: (d) => d.department,
  },
  {
    id: 'lastSeenAt',
    header: 'Last seen',
    sortable: true,
    width: 130,
    group: 'Identity',
    cell: (d) => relative(d.lastSeenAt),
    exportValue: (d) => d.lastSeenAt,
  },
  {
    id: 'compliancePct',
    header: 'Compliance',
    numeric: true,
    sortable: true,
    width: 130,
    group: 'Security',
    cell: (d) => (
      <StatusPill tone={complianceTone(d.compliancePct)}>{pct(d.compliancePct, 0)}</StatusPill>
    ),
    exportValue: (d) => d.compliancePct,
  },
  {
    id: 'criticalVulns',
    header: 'Critical CVEs',
    numeric: true,
    sortable: true,
    width: 130,
    group: 'Security',
    cell: (d) => num(d.criticalVulns),
    exportValue: (d) => d.criticalVulns,
  },
  {
    id: 'pendingPatches',
    header: 'Pending patches',
    numeric: true,
    sortable: true,
    width: 150,
    group: 'Security',
    cell: (d) => num(d.pendingPatches),
    exportValue: (d) => d.pendingPatches,
  },
  {
    id: 'encrypted',
    header: 'Encrypted',
    sortable: true,
    width: 120,
    group: 'Security',
    cell: (d) => (
      <StatusPill tone={d.encrypted ? 'good' : 'bad'}>{d.encrypted ? 'Yes' : 'No'}</StatusPill>
    ),
    exportValue: (d) => (d.encrypted ? 'Yes' : 'No'),
  },
  {
    id: 'ip',
    header: 'IP address',
    sortable: true,
    width: 140,
    group: 'Network',
    defaultHidden: true,
    cell: (d) => d.ip,
    exportValue: (d) => d.ip,
  },
  {
    id: 'mac',
    header: 'MAC address',
    width: 160,
    group: 'Network',
    defaultHidden: true,
    cell: (d) => d.mac,
    exportValue: (d) => d.mac,
  },
  {
    id: 'serial',
    header: 'Serial',
    sortable: true,
    width: 140,
    group: 'Hardware',
    defaultHidden: true,
    cell: (d) => d.serial,
    exportValue: (d) => d.serial,
  },
  {
    id: 'model',
    header: 'Model',
    sortable: true,
    width: 200,
    group: 'Hardware',
    defaultHidden: true,
    cell: (d) => d.model,
    exportValue: (d) => d.model,
  },
  {
    id: 'cpu',
    header: 'CPU',
    width: 190,
    group: 'Hardware',
    defaultHidden: true,
    cell: (d) => d.cpu,
    exportValue: (d) => d.cpu,
  },
  {
    id: 'ramGb',
    header: 'RAM',
    numeric: true,
    sortable: true,
    width: 100,
    group: 'Hardware',
    defaultHidden: true,
    cell: (d) => `${d.ramGb} GB`,
    exportValue: (d) => d.ramGb,
  },
  {
    id: 'diskFreePct',
    header: 'Disk free',
    numeric: true,
    sortable: true,
    width: 110,
    group: 'Hardware',
    defaultHidden: true,
    cell: (d) => (
      <StatusPill tone={d.diskFreePct < 10 ? 'bad' : d.diskFreePct < 20 ? 'warn' : 'neutral'}>
        {pct(d.diskFreePct, 0)}
      </StatusPill>
    ),
    exportValue: (d) => d.diskFreePct,
  },
  {
    id: 'dexScore',
    header: 'DEX score',
    numeric: true,
    sortable: true,
    width: 120,
    group: 'Experience',
    defaultHidden: true,
    cell: (d) => num(d.dexScore),
    exportValue: (d) => d.dexScore,
  },
  {
    id: 'configPassPct',
    header: 'Config pass',
    numeric: true,
    sortable: true,
    width: 130,
    group: 'Security',
    defaultHidden: true,
    cell: (d) => pct(d.configPassPct, 0),
    exportValue: (d) => d.configPassPct,
  },
  {
    id: 'agentVersion',
    header: 'Agent',
    sortable: true,
    width: 110,
    group: 'Platform',
    defaultHidden: true,
    cell: (d) => d.agentVersion,
    exportValue: (d) => d.agentVersion,
  },
  {
    id: 'kind',
    header: 'Type',
    sortable: true,
    width: 130,
    group: 'Platform',
    defaultHidden: true,
    cell: (d) => humanise(d.kind),
    exportValue: (d) => d.kind,
  },
  {
    id: 'enrolledAt',
    header: 'Enrolled',
    sortable: true,
    width: 130,
    group: 'Identity',
    defaultHidden: true,
    cell: (d) => relative(d.enrolledAt),
    exportValue: (d) => d.enrolledAt,
  },
];

const STATUS_OPTIONS = [
  { value: 'online', label: 'Online' },
  { value: 'offline', label: 'Offline' },
  { value: 'pending-restart', label: 'Pending restart' },
];

const OS_OPTIONS = [
  { value: 'Windows', label: 'Windows' },
  { value: 'Windows Server', label: 'Windows Server' },
  { value: 'Linux', label: 'Linux' },
  { value: 'macOS', label: 'macOS' },
  { value: 'AIX', label: 'AIX' },
];

export default function Devices() {
  const navigate = useNavigate();
  const [selected, setSelected] = useState<string[]>([]);
  const canAct = useCan('devices:action');
  const canRunScripts = useCan('liveops:run');

  const controller = useListController<Device>({
    path: '/devices',
    defaultSort: { id: 'hostname', desc: false },
  });

  const { data: zones } = useQuery({
    queryKey: ['/sites', 'all'],
    queryFn: ({ signal }) =>
      api.get<Page<Zone>>('/sites', { limit: 100, fields: 'id,name' }, signal),
  });

  const zoneOptions = useMemo(
    () => (zones?.items ?? []).map((z) => ({ value: z.id, label: z.name })),
    [zones],
  );

  const selectedZones = controller.filters['zoneId']?.split(',').filter(Boolean) ?? [];
  const selectedStatus = controller.filters['status']?.split(',').filter(Boolean) ?? [];

  const chips = [
    ...(selectedZones.length
      ? [
          {
            id: 'zoneId',
            label: 'Zone',
            value:
              selectedZones.length === 1
                ? (zoneOptions.find((z) => z.value === selectedZones[0])?.label ?? '1 selected')
                : `${selectedZones.length} selected`,
            onRemove: () => controller.setFilter('zoneId', undefined),
          },
        ]
      : []),
    ...(selectedStatus.length
      ? [
          {
            id: 'status',
            label: 'Status',
            value: selectedStatus.map(humanise).join(', '),
            onRemove: () => controller.setFilter('status', undefined),
          },
        ]
      : []),
    ...(controller.filters['osFamily']
      ? [
          {
            id: 'osFamily',
            label: 'OS',
            value: controller.filters['osFamily'],
            onRemove: () => controller.setFilter('osFamily', undefined),
          },
        ]
      : []),
    ...(controller.filters['encrypted'] === '0'
      ? [
          {
            id: 'encrypted',
            label: 'Encryption',
            value: 'Not encrypted',
            onRemove: () => controller.setFilter('encrypted', undefined),
          },
        ]
      : []),
  ];

  return (
    <ResourceList
      label="Devices"
      description="Every managed endpoint, with its posture and where it sits."
      unit="devices"
      viewKey="devices"
      columns={COLUMNS}
      controller={controller}
      getRowId={(d) => d.id}
      searchPlaceholder="Search hostname, IP, serial, user or model"
      chips={chips}
      onRowClick={(d) => void navigate(`/devices/${segment(d.id)}`)}
      selectable={canAct}
      selectedIds={selected}
      onSelectedIdsChange={setSelected}
      emptyTitle="No devices match these filters"
      emptyDescription="Clear a filter or widen the search to see more of the estate."
      bulkActions={
        <>
          {canRunScripts ? (
            <Button
              size="sm"
              onClick={() =>
                void navigate(
                  `/liveops?deviceIds=${encodeURIComponent(selected.slice(0, 500).join(','))}`,
                )
              }
            >
              Run script
            </Button>
          ) : null}
          <Button
            size="sm"
            variant="primary"
            onClick={() =>
              void navigate(
                `/deployments/new?deviceIds=${encodeURIComponent(selected.slice(0, 500).join(','))}`,
              )
            }
          >
            New action
          </Button>
        </>
      }
      filters={
        <>
          <MultiSelect
            size="sm"
            label="Aegis Zone"
            placeholder="All zones"
            options={zoneOptions}
            value={selectedZones}
            onChange={(value) => controller.setFilter('zoneId', value)}
          />
          <MultiSelect
            size="sm"
            label="Status"
            placeholder="Any status"
            searchable={false}
            options={STATUS_OPTIONS}
            value={selectedStatus}
            onChange={(value) => controller.setFilter('status', value)}
          />
          <Select
            size="sm"
            aria-label="Operating system"
            placeholder="Any OS"
            options={OS_OPTIONS}
            value={controller.filters['osFamily'] ?? ''}
            onChange={(e) => controller.setFilter('osFamily', e.target.value || undefined)}
          />
          <Select
            size="sm"
            aria-label="Encryption"
            placeholder="Any encryption"
            options={[
              { value: '1', label: 'Encrypted' },
              { value: '0', label: 'Not encrypted' },
            ]}
            value={controller.filters['encrypted'] ?? ''}
            onChange={(e) => controller.setFilter('encrypted', e.target.value || undefined)}
          />
        </>
      }
    />
  );
}
