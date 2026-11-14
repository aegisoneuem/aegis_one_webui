import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Select, Skeleton, type DataTableColumn } from '@aegis/ui';
import { useQuery } from '@tanstack/react-query';
import { useListController, useResource } from '../app/useListController';
import { useCan } from '../app/auth';
import { dateTime, humanise, num, pct } from '../app/format';
import { segment } from '../app/safeNavigate';
import { AdvancedFilter, type FilterRule } from './shared/AdvancedFilter';
import { ResourceList } from './shared/ResourceList';
import type { Device, DeviceGroup, DevicesSummary, ZoneList } from '../api/types';
import { api } from '../api/client';
import styles from './Devices.module.css';

/**
 * The 50,000-row inventory.
 *
 * The columns, their order and their headers are the approved grid's. Every
 * one of them is a field the API can project, and every sortable one is a
 * field the server will sort by — a column that is neither produces a table
 * that silently sorts the wrong way at page two.
 */

/** Dimmed rows and a plain word, as the reference renders status. */
function Status({ value }: { value: string }) {
  const cls =
    value === 'online'
      ? styles.statusOnline
      : value === 'offline'
        ? styles.statusOffline
        : styles.statusOther;
  return <span className={cls}>{humanise(value)}</span>;
}

const COLUMNS: DataTableColumn<Device>[] = [
  {
    id: 'hostname',
    header: 'Computer Name',
    locked: true,
    sortable: true,
    width: 170,
    group: 'Identity',
    cell: (d) => <span className={styles.name}>{d.hostname}</span>,
    exportValue: (d) => d.hostname,
  },
  {
    id: 'osName',
    header: 'OS',
    sortable: true,
    width: 210,
    group: 'Platform',
    cell: (d) => d.osName,
    exportValue: (d) => d.osName,
  },
  {
    id: 'ip',
    header: 'IP Address',
    sortable: true,
    width: 140,
    group: 'Network',
    cell: (d) => d.ip,
    exportValue: (d) => d.ip,
  },
  {
    id: 'dnsName',
    header: 'Hostname',
    sortable: true,
    width: 150,
    group: 'Network',
    // The short name, which is the fully-qualified one up to its first dot.
    cell: (d) => d.dnsName.split('.')[0] ?? '',
    exportValue: (d) => d.dnsName.split('.')[0] ?? '',
  },
  {
    id: 'mac',
    header: 'MAC Address',
    sortable: true,
    width: 160,
    group: 'Network',
    cell: (d) => d.mac,
    exportValue: (d) => d.mac,
  },
  {
    id: 'dnsNameFull',
    header: 'DNS Name',
    /*
     * This column and `dnsName` above show the same field, full and short,
     * so they sort by the same key and both read as sorted together. That is
     * what they are; the alternative was a column the reference marks
     * sortable and this grid silently did not.
     */
    sortable: true,
    sortField: 'dnsName',
    width: 250,
    group: 'Network',
    cell: (d) => d.dnsName,
    exportValue: (d) => d.dnsName,
  },
  {
    id: 'zoneName',
    header: 'Location',
    sortable: true,
    width: 140,
    group: 'Location',
    cell: (d) => d.zoneName,
    exportValue: (d) => d.zoneName,
  },
  {
    id: 'primaryUserName',
    header: 'User',
    sortable: true,
    width: 150,
    group: 'Identity',
    cell: (d) => d.primaryUserName,
    exportValue: (d) => d.primaryUserName,
  },
  {
    id: 'status',
    header: 'Status',
    sortable: true,
    width: 110,
    group: 'Identity',
    cell: (d) => <Status value={d.status} />,
    exportValue: (d) => d.status,
  },
  {
    id: 'lastSeenAt',
    header: 'Last Seen',
    sortable: true,
    width: 160,
    group: 'Identity',
    cell: (d) => dateTime(d.lastSeenAt),
    exportValue: (d) => d.lastSeenAt,
  },
  {
    id: 'osVersion',
    header: 'OS Version',
    sortable: true,
    width: 130,
    group: 'Platform',
    cell: (d) => d.osVersion,
    exportValue: (d) => d.osVersion,
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
    id: 'kind',
    header: 'Computer Type',
    sortable: true,
    width: 140,
    group: 'Platform',
    cell: (d) => humanise(d.kind),
    exportValue: (d) => d.kind,
  },
  {
    id: 'manufacturer',
    header: 'Manufacturer',
    sortable: true,
    width: 140,
    group: 'Hardware',
    cell: (d) => d.manufacturer,
    exportValue: (d) => d.manufacturer,
  },
  {
    id: 'model',
    header: 'Model',
    sortable: true,
    width: 210,
    group: 'Hardware',
    cell: (d) => d.model,
    exportValue: (d) => d.model,
  },
  {
    id: 'serial',
    header: 'Serial Number',
    sortable: true,
    width: 150,
    group: 'Hardware',
    cell: (d) => d.serial,
    exportValue: (d) => d.serial,
  },
  {
    id: 'ramGb',
    header: 'RAM (GB)',
    numeric: true,
    sortable: true,
    width: 110,
    group: 'Hardware',
    cell: (d) => num(d.ramGb),
    exportValue: (d) => d.ramGb,
  },
  {
    id: 'lastBoot',
    header: 'Last Boot',
    sortable: true,
    width: 160,
    group: 'Hardware',
    cell: (d) => dateTime(d.lastBoot),
    exportValue: (d) => d.lastBoot,
  },
  {
    id: 'agentVersion',
    header: 'Agent Version',
    sortable: true,
    width: 130,
    group: 'Platform',
    cell: (d) => d.agentVersion,
    exportValue: (d) => d.agentVersion,
  },
  {
    id: 'dnsServer',
    header: 'DNS Server',
    sortable: true,
    width: 140,
    group: 'Network',
    cell: (d) => d.dnsServer,
    exportValue: (d) => d.dnsServer,
  },
  /*
   * Everything below is off by default. The approved grid shows twenty
   * columns and labels its chooser "Columns 20", which is a count of what is
   * visible, not of what exists — the contract's Device record carries the
   * posture fields too, and an operator who wants them should not have to
   * leave the inventory to see them.
   */
  {
    id: 'architecture',
    header: 'Architecture',
    sortable: true,
    width: 130,
    group: 'Hardware',
    defaultHidden: true,
    cell: (d) => d.architecture,
    exportValue: (d) => d.architecture,
  },
  {
    id: 'enrolledAt',
    header: 'Enrolled',
    sortable: true,
    width: 160,
    group: 'Identity',
    defaultHidden: true,
    cell: (d) => dateTime(d.enrolledAt),
    exportValue: (d) => d.enrolledAt,
  },
  {
    id: 'compliancePct',
    header: 'Compliance',
    numeric: true,
    sortable: true,
    width: 130,
    group: 'Security',
    defaultHidden: true,
    cell: (d) => pct(d.compliancePct, 0),
    exportValue: (d) => d.compliancePct,
  },
  {
    id: 'pendingPatches',
    header: 'Missing Patches',
    numeric: true,
    sortable: true,
    width: 150,
    group: 'Security',
    defaultHidden: true,
    cell: (d) => num(d.pendingPatches),
    exportValue: (d) => d.pendingPatches,
  },
  {
    id: 'criticalVulns',
    header: 'Critical CVEs',
    numeric: true,
    sortable: true,
    width: 140,
    group: 'Security',
    defaultHidden: true,
    cell: (d) => num(d.criticalVulns),
    exportValue: (d) => d.criticalVulns,
  },
  {
    id: 'encrypted',
    header: 'Disk Encryption',
    sortable: true,
    width: 150,
    group: 'Security',
    defaultHidden: true,
    cell: (d) => (d.encrypted ? 'On' : 'Off'),
    exportValue: (d) => (d.encrypted ? 'On' : 'Off'),
  },
  {
    id: 'diskFreePct',
    header: 'Disk Free',
    numeric: true,
    sortable: true,
    width: 120,
    group: 'Hardware',
    defaultHidden: true,
    cell: (d) => pct(d.diskFreePct, 0),
    exportValue: (d) => d.diskFreePct,
  },
  {
    id: 'dexScore',
    header: 'DEX Score',
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
    header: 'Config Pass',
    numeric: true,
    sortable: true,
    width: 130,
    group: 'Security',
    defaultHidden: true,
    cell: (d) => pct(d.configPassPct, 0),
    exportValue: (d) => d.configPassPct,
  },
  {
    id: 'cpu',
    header: 'Processor',
    width: 190,
    group: 'Hardware',
    defaultHidden: true,
    cell: (d) => d.cpu,
    exportValue: (d) => d.cpu,
  },
];

/** The twenty the approved grid shows; the rest are in the column chooser. */
const DEFAULT_VISIBLE = COLUMNS.filter((c) => !c.defaultHidden).length;

const STATUS_OPTIONS = [
  { value: 'online', label: 'Online' },
  { value: 'offline', label: 'Offline' },
  { value: 'pending-restart', label: 'Pending restart' },
];

const PLATFORM_OPTIONS = [
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

  // The counts follow the search term the grid follows, so the strip and the
  // list below it can never disagree about how much estate is in view.
  const summaryPath = controller.search
    ? `/devices/summary?q=${encodeURIComponent(controller.search)}`
    : '/devices/summary';
  const { data: summary } = useResource<DevicesSummary>(summaryPath);

  const { data: zones } = useQuery({
    queryKey: ['/zones', 'all'],
    queryFn: ({ signal }) => api.get<ZoneList>('/zones', undefined, signal),
  });

  const zoneOptions = useMemo(
    () => (zones?.items ?? []).map((z) => ({ value: z.id, label: z.name })),
    [zones],
  );

  /*
   * The group filter the reference's bar carries. `?group=` has been in the
   * contract all along; until now no server answered it, so asking for one
   * group quietly returned the whole estate.
   */
  const { data: groups } = useQuery({
    queryKey: ['/groups', 'filter'],
    queryFn: ({ signal }) => api.get<{ items: DeviceGroup[] }>('/groups', undefined, signal),
  });

  const groupOptions = useMemo(() => {
    const all = groups?.items ?? [];
    const children = new Map<string, DeviceGroup[]>();
    for (const g of all) {
      const key = g.parentId ?? '';
      children.set(key, [...(children.get(key) ?? []), g]);
    }
    // Drawn flat with indents, as the reference draws its own tree.
    const out: { value: string; label: string }[] = [];
    const walk = (parent: string, depth: number): void => {
      for (const g of children.get(parent) ?? []) {
        out.push({ value: g.id, label: `${'   '.repeat(depth)}${g.name}` });
        walk(g.id, depth + 1);
      }
    };
    walk('', 0);
    return out;
  }, [groups]);

  const setFilter = (key: string, value: string) => controller.setFilter(key, value || undefined);

  /*
   * The advanced rules ride in the same filter map as everything else, as
   * the contract's `?filter=` — one JSON array of {field, op, value}, all of
   * which must match.
   */
  const [builderOpen, setBuilderOpen] = useState(false);
  const rules = useMemo<FilterRule[]>(() => {
    const raw = controller.filters['filter'];
    if (typeof raw !== 'string' || raw === '') return [];
    try {
      const parsed: unknown = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as FilterRule[]) : [];
    } catch {
      // A hand-edited URL should not take the page down with it.
      return [];
    }
  }, [controller.filters]);

  /*
   * Every column the grid has, bar the one the API cannot filter on:
   * `dnsNameFull` is assembled for display and is not a column on the
   * device table, so offering it would only ever return a 400.
   */
  const filterFields = useMemo(
    () =>
      COLUMNS.filter((c) => c.id !== 'dnsNameFull').map((c) => ({
        value: c.id,
        label: c.header,
      })),
    [],
  );

  const chips = [
    ...(rules.length > 0
      ? [
          {
            id: 'filter',
            label: 'Advanced',
            value: `${rules.length} rule${rules.length === 1 ? '' : 's'}`,
            onRemove: () => controller.setFilter('filter', undefined),
          },
        ]
      : []),
    ...(controller.filters['group']
      ? [
          {
            id: 'group',
            label: 'Group',
            value:
              groupOptions.find((g) => g.value === controller.filters['group'])?.label.trim() ??
              (controller.filters['group'] as string),
            onRemove: () => controller.setFilter('group', undefined),
          },
        ]
      : []),
    ...(controller.filters['zoneId']
      ? [
          {
            id: 'zoneId',
            label: 'Location',
            value:
              zoneOptions.find((z) => z.value === controller.filters['zoneId'])?.label ??
              (controller.filters['zoneId'] as string),
            onRemove: () => controller.setFilter('zoneId', undefined),
          },
        ]
      : []),
    ...(controller.filters['status']
      ? [
          {
            id: 'status',
            label: 'Status',
            value: humanise(controller.filters['status']),
            onRemove: () => controller.setFilter('status', undefined),
          },
        ]
      : []),
    ...(controller.filters['osFamily']
      ? [
          {
            id: 'osFamily',
            label: 'Platform',
            value: controller.filters['osFamily'],
            onRemove: () => controller.setFilter('osFamily', undefined),
          },
        ]
      : []),
    /*
     * Not a control in the toolbar, because the approved grid has none — but
     * the Overview's Needs Attention rows link straight here with it set, so
     * it still needs a chip to be visible and removable.
     */
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
    ...(controller.filters['antivirus_ok'] === '0' || controller.filters['antivirusOk'] === '0'
      ? [
          {
            id: 'antivirusOk',
            label: 'Antivirus',
            value: 'Not protected',
            onRemove: () => controller.setFilter('antivirusOk', undefined),
          },
        ]
      : []),
  ];

  return (
    <div className={styles.page}>
      <div className={styles.heading}>
        <h1 className={styles.title}>Devices</h1>
        <div className={styles.actions}>
          <Button onClick={() => void navigate('/reports')}>Export</Button>
          <Button
            variant="primary"
            disabled={!canAct}
            onClick={() => void navigate('/deployments/new')}
          >
            Create Action
          </Button>
        </div>
      </div>

      <div className={styles.kpis}>
        {summary ? (
          <>
            <Kpi active label="All Endpoints" value={num(summary.all)} onClick={() => undefined} />
            <Kpi
              label="Online"
              value={num(summary.online)}
              onClick={() => setFilter('status', 'online')}
            />
            <Kpi
              label="Offline"
              value={num(summary.offline)}
              onClick={() => setFilter('status', 'offline')}
            />
            <Kpi
              label="Locations"
              value={num(summary.locations)}
              onClick={() => void navigate('/sites')}
            />
          </>
        ) : (
          Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className={styles.kpiSkeleton} />)
        )}
      </div>

      <ResourceList
        hideHeading
        label="Devices"
        unit="devices"
        viewKey="devices"
        columns={COLUMNS}
        controller={controller}
        getRowId={(d) => d.id}
        searchPlaceholder="Search hostname, IP, serial, user or model"
        chips={chips}
        onRowClick={(d) => void navigate(`/devices/${segment(d.id)}`)}
        rowClassName={(d) => (d.status === 'offline' ? styles.offline : undefined)}
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
              Create Action
            </Button>
          </>
        }
        filters={
          <>
            <Button size="sm" onClick={() => setBuilderOpen(true)}>
              Advanced Filter
              {rules.length > 0 ? <span className={styles.ruleCount}>{rules.length}</span> : null}
            </Button>
            <Select
              size="sm"
              aria-label="Device group"
              placeholder="All Groups"
              options={groupOptions}
              value={controller.filters['group'] ?? ''}
              onChange={(e) => setFilter('group', e.target.value)}
            />
            <Select
              size="sm"
              aria-label="Device location"
              placeholder="All Locations"
              options={zoneOptions}
              value={controller.filters['zoneId'] ?? ''}
              onChange={(e) => setFilter('zoneId', e.target.value)}
            />
            <Select
              size="sm"
              aria-label="Device platform"
              placeholder="All Platforms"
              options={PLATFORM_OPTIONS}
              value={controller.filters['osFamily'] ?? ''}
              onChange={(e) => setFilter('osFamily', e.target.value)}
            />
            <Select
              size="sm"
              aria-label="Device status"
              placeholder="All Statuses"
              options={STATUS_OPTIONS}
              value={controller.filters['status'] ?? ''}
              onChange={(e) => setFilter('status', e.target.value)}
            />
          </>
        }
      />

      {/* Remounted per open, so the builder always starts from what is
          applied rather than from the last thing that was typed. */}
      <AdvancedFilter
        key={builderOpen ? 'open' : 'closed'}
        open={builderOpen}
        onClose={() => setBuilderOpen(false)}
        fields={filterFields}
        rules={rules}
        onApply={(next) =>
          controller.setFilter('filter', next.length > 0 ? JSON.stringify(next) : undefined)
        }
      />

      <div className={styles.footnote}>
        <span>
          Aegis One <i>/</i> Endpoint Inventory
        </span>
        <span>
          Showing {DEFAULT_VISIBLE} of {COLUMNS.length} columns · scroll horizontally for the rest
        </span>
      </div>
    </div>
  );
}

function Kpi({
  label,
  value,
  active = false,
  onClick,
}: {
  label: string;
  value: string;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button type="button" className={active ? styles.kpiActive : styles.kpi} onClick={onClick}>
      <span className={styles.kpiLabel}>{label}</span>
      <span className={styles.kpiValue}>{value}</span>
    </button>
  );
}
