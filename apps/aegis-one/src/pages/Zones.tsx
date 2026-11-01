import { StatusPill, type DataTableColumn } from '@aegis/ui';
import { useListController } from '../app/useListController';
import { humanise, num, relative, toneFor } from '../app/format';
import { ResourceList } from './shared/ResourceList';
import type { Zone } from '../api/types';

const COLUMNS: DataTableColumn<Zone>[] = [
  {
    id: 'name',
    header: 'Aegis Zone',
    locked: true,
    sortable: true,
    width: 230,
    cell: (z) => z.name,
    exportValue: (z) => z.name,
  },
  {
    id: 'city',
    header: 'City',
    sortable: true,
    width: 170,
    cell: (z) => z.city,
    exportValue: (z) => z.city,
  },
  {
    id: 'deviceCount',
    header: 'Endpoints',
    numeric: true,
    sortable: true,
    width: 140,
    cell: (z) => num(z.deviceCount),
    exportValue: (z) => z.deviceCount,
  },
  {
    id: 'relayStatus',
    header: 'Relay',
    sortable: true,
    width: 140,
    cell: (z) => (
      <StatusPill dot tone={toneFor(z.relayStatus)}>
        {humanise(z.relayStatus)}
      </StatusPill>
    ),
    exportValue: (z) => z.relayStatus,
  },
  {
    id: 'peerCache',
    header: 'Peer cache',
    width: 140,
    cell: (z) => (
      <StatusPill tone={z.peerCache ? 'good' : 'neutral'}>
        {z.peerCache ? 'Enabled' : 'Not enabled'}
      </StatusPill>
    ),
    exportValue: (z) => (z.peerCache ? 'Enabled' : 'Not enabled'),
  },
  {
    id: 'bandwidthMbps',
    header: 'Link',
    numeric: true,
    sortable: true,
    width: 130,
    cell: (z) => `${num(z.bandwidthMbps)} Mbps`,
    exportValue: (z) => z.bandwidthMbps,
  },
  {
    id: 'lastSyncAt',
    header: 'Last sync',
    sortable: true,
    width: 150,
    cell: (z) => relative(z.lastSyncAt),
    exportValue: (z) => z.lastSyncAt,
  },
];

export default function Zones() {
  const controller = useListController<Zone>({
    path: '/sites',
    defaultSort: { id: 'deviceCount', desc: true },
  });

  return (
    <ResourceList
      label="Aegis Zones"
      description="Sites, their relays and how current each one is."
      unit="zones"
      viewKey="zones"
      columns={COLUMNS}
      controller={controller}
      getRowId={(z) => z.id}
      searchPlaceholder="Search zone or city"
      emptyTitle="No zones match this search"
      emptyDescription="Zones are created when the first endpoint in a site enrols."
    />
  );
}
