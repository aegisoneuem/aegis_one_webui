import { KpiTile, PageHeader, Select, StatusPill, type DataTableColumn } from '@aegis/ui';
import { useListController, useResource } from '../app/useListController';
import { humanise, num, pct, relative, toneFor } from '../app/format';
import { ResourceList } from './shared/ResourceList';
import type { Peer } from '../api/types';
import styles from './Overview.module.css';

type Summary = {
  totals: {
    peers: number;
    servedGb: number;
    usedGb: number;
    capacityGb: number;
    peersServed: number;
  };
  byZone: { zoneName: string; peers: number; servedGb: number }[];
};

const COLUMNS: DataTableColumn<Peer>[] = [
  {
    id: 'hostname',
    header: 'Cache node',
    locked: true,
    sortable: true,
    width: 220,
    cell: (p) => p.hostname,
    exportValue: (p) => p.hostname,
  },
  {
    id: 'zoneName',
    header: 'Aegis Zone',
    sortable: true,
    width: 180,
    cell: (p) => p.zoneName,
    exportValue: (p) => p.zoneName,
  },
  {
    id: 'status',
    header: 'Status',
    sortable: true,
    width: 130,
    cell: (p) => (
      <StatusPill dot tone={toneFor(p.status)}>
        {humanise(p.status)}
      </StatusPill>
    ),
    exportValue: (p) => p.status,
  },
  {
    id: 'cacheUsedGb',
    header: 'Cache used',
    numeric: true,
    sortable: true,
    width: 160,
    cell: (p) => `${num(p.cacheUsedGb)} / ${num(p.cacheSizeGb)} GB`,
    exportValue: (p) => p.cacheUsedGb,
  },
  {
    id: 'servedGb',
    header: 'Served',
    numeric: true,
    sortable: true,
    width: 130,
    cell: (p) => `${num(p.servedGb)} GB`,
    exportValue: (p) => p.servedGb,
  },
  {
    id: 'peersServed',
    header: 'Peers served',
    numeric: true,
    sortable: true,
    width: 150,
    cell: (p) => num(p.peersServed),
    exportValue: (p) => p.peersServed,
  },
  {
    id: 'lastSeenAt',
    header: 'Last seen',
    sortable: true,
    width: 140,
    cell: (p) => relative(p.lastSeenAt),
    exportValue: (p) => p.lastSeenAt,
  },
];

export default function PeerCache() {
  const { data } = useResource<Summary>('/peercache/summary');
  const controller = useListController<Peer>({
    path: '/peercache/peers',
    defaultSort: { id: 'servedGb', desc: true },
  });

  const totals = data?.totals;
  const fillPct = totals?.capacityGb ? (totals.usedGb / totals.capacityGb) * 100 : 0;

  return (
    <div className={styles.page}>
      <PageHeader
        title="Peer cache"
        description="Content served endpoint to endpoint, so only one copy crosses the link to each site."
      />

      <div className={styles.kpis}>
        <KpiTile
          label="Cache nodes"
          value={num(totals?.peers ?? 0)}
          caption="Across zones with peer caching"
        />
        <KpiTile
          label="Content served"
          value={`${num(totals?.servedGb ?? 0)} GB`}
          tone="good"
          caption="Not pulled across the WAN"
        />
        <KpiTile
          label="Peers served"
          value={num(totals?.peersServed ?? 0)}
          caption="Endpoints fed from a local cache"
        />
        <KpiTile
          label="Cache in use"
          value={pct(fillPct, 0)}
          tone={fillPct > 85 ? 'warn' : 'neutral'}
          caption={`${num(totals?.usedGb ?? 0)} of ${num(totals?.capacityGb ?? 0)} GB`}
        />
      </div>

      <ResourceList
        hideHeading
        label="Peer cache"
        unit="nodes"
        viewKey="peercache"
        columns={COLUMNS}
        controller={controller}
        getRowId={(p) => p.id}
        searchPlaceholder="Search cache node"
        emptyTitle="No cache nodes match these filters"
        emptyDescription="Peer caching is enabled per zone; check the Aegis Zones page."
        filters={
          <Select
            size="sm"
            aria-label="Status"
            placeholder="Any status"
            options={['healthy', 'degraded', 'offline'].map((v) => ({
              value: v,
              label: humanise(v),
            }))}
            value={controller.filters['status'] ?? ''}
            onChange={(e) => controller.setFilter('status', e.target.value || undefined)}
          />
        }
      />
    </div>
  );
}
