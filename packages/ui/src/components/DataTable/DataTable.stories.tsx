import { useMemo, useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { DataTable, buildDefaultView } from './DataTable';
import { ColumnChooser } from './ColumnChooser';
import { SavedViews } from './SavedViews';
import type { DataTableColumn, SavedView, SortState, TableView } from './types';
import { Button } from '../Button/Button';
import { FilterBar } from '../FilterBar/FilterBar';
import { Pagination } from '../Pagination/Pagination';
import { StatusPill } from '../StatusPill/StatusPill';
import { exportCsv } from '../../utils/exportRows';
import { Frame } from '../../../.storybook/decorators';

type Device = {
  id: string;
  hostname: string;
  status: 'online' | 'offline' | 'pending';
  os: string;
  osVersion: string;
  zone: string;
  user: string;
  ip: string;
  serial: string;
  lastSeen: string;
  compliance: number;
  criticalVulns: number;
  pendingPatches: number;
  diskFreePct: number;
  agentVersion: string;
  model: string;
};

const ZONES = ['Mumbai HQ', 'Delhi Branch', 'Jaipur Branch', 'Bengaluru', 'Pune', 'Hyderabad'];
const OSES = [
  ['Windows', '11 24H2'],
  ['Windows', '10 22H2'],
  ['Windows Server', '2022'],
  ['RHEL', '9.4'],
  ['Ubuntu', '24.04 LTS'],
  ['macOS', '15.1'],
];
const USERS = ['r.deshpande', 'a.iyer', 's.kulkarni', 'n.banerjee', 'p.chandrasekar', 'm.shaikh'];
const MODELS = [
  'Latitude 5450',
  'ThinkPad T14 Gen 5',
  'EliteBook 840 G11',
  'PowerEdge R660',
  'MacBook Pro 14',
];

/** Deterministic, so the story renders the same table every time. */
function makeDevices(count: number): Device[] {
  const rows: Device[] = [];
  for (let i = 0; i < count; i++) {
    const [os, osVersion] = OSES[i % OSES.length] ?? ['Windows', '11 24H2'];
    const zone = ZONES[i % ZONES.length] ?? 'Mumbai HQ';
    rows.push({
      id: `DEV-${String(10000 + i)}`,
      hostname: `${zone.slice(0, 3).toUpperCase()}-WS-${String(1000 + i).padStart(4, '0')}`,
      status: i % 17 === 0 ? 'offline' : i % 7 === 0 ? 'pending' : 'online',
      os: os ?? 'Windows',
      osVersion: osVersion ?? '11 24H2',
      zone,
      user: USERS[i % USERS.length] ?? 'r.deshpande',
      ip: `10.${24 + (i % 6)}.${i % 250}.${(i * 7) % 250}`,
      serial: `SN${String(4810000 + i * 13)}`,
      lastSeen: `${(i % 59) + 1} min ago`,
      compliance: 70 + (i % 31),
      criticalVulns: i % 9,
      pendingPatches: i % 14,
      diskFreePct: 4 + (i % 80),
      agentVersion: `7.4.${i % 5}`,
      model: MODELS[i % MODELS.length] ?? 'Latitude 5450',
    });
  }
  return rows;
}

const COLUMNS: DataTableColumn<Device>[] = [
  {
    id: 'hostname',
    header: 'Hostname',
    locked: true,
    sortable: true,
    width: 180,
    group: 'Identity',
    cell: (d) => d.hostname,
    exportValue: (d) => d.hostname,
  },
  {
    id: 'status',
    header: 'Status',
    sortable: true,
    width: 120,
    group: 'Identity',
    cell: (d) => (
      <StatusPill
        dot
        tone={d.status === 'online' ? 'good' : d.status === 'pending' ? 'warn' : 'neutral'}
      >
        {d.status === 'pending' ? 'Pending restart' : d.status === 'online' ? 'Online' : 'Offline'}
      </StatusPill>
    ),
    exportValue: (d) => d.status,
  },
  {
    id: 'os',
    header: 'OS',
    sortable: true,
    width: 130,
    group: 'Platform',
    cell: (d) => d.os,
    exportValue: (d) => d.os,
  },
  {
    id: 'osVersion',
    header: 'OS version',
    sortable: true,
    width: 120,
    group: 'Platform',
    cell: (d) => d.osVersion,
    exportValue: (d) => d.osVersion,
  },
  {
    id: 'zone',
    header: 'Aegis Zone',
    sortable: true,
    width: 140,
    group: 'Location',
    cell: (d) => d.zone,
    exportValue: (d) => d.zone,
  },
  {
    id: 'user',
    header: 'Primary user',
    sortable: true,
    width: 150,
    group: 'Identity',
    cell: (d) => d.user,
    exportValue: (d) => d.user,
  },
  {
    id: 'ip',
    header: 'IP address',
    width: 130,
    group: 'Network',
    cell: (d) => d.ip,
    exportValue: (d) => d.ip,
  },
  {
    id: 'serial',
    header: 'Serial',
    width: 130,
    group: 'Hardware',
    defaultHidden: true,
    cell: (d) => d.serial,
    exportValue: (d) => d.serial,
  },
  {
    id: 'model',
    header: 'Model',
    width: 170,
    group: 'Hardware',
    defaultHidden: true,
    cell: (d) => d.model,
    exportValue: (d) => d.model,
  },
  {
    id: 'lastSeen',
    header: 'Last seen',
    sortable: true,
    width: 120,
    group: 'Identity',
    cell: (d) => d.lastSeen,
    exportValue: (d) => d.lastSeen,
  },
  {
    id: 'compliance',
    header: 'Compliance',
    numeric: true,
    sortable: true,
    width: 120,
    group: 'Security',
    cell: (d) => `${d.compliance}%`,
    exportValue: (d) => d.compliance,
  },
  {
    id: 'criticalVulns',
    header: 'Critical CVEs',
    numeric: true,
    sortable: true,
    width: 120,
    group: 'Security',
    cell: (d) => d.criticalVulns,
    exportValue: (d) => d.criticalVulns,
  },
  {
    id: 'pendingPatches',
    header: 'Pending patches',
    numeric: true,
    sortable: true,
    width: 140,
    group: 'Security',
    cell: (d) => d.pendingPatches,
    exportValue: (d) => d.pendingPatches,
  },
  {
    id: 'diskFreePct',
    header: 'Disk free',
    numeric: true,
    sortable: true,
    width: 110,
    group: 'Hardware',
    defaultHidden: true,
    cell: (d) => `${d.diskFreePct}%`,
    exportValue: (d) => d.diskFreePct,
  },
  {
    id: 'agentVersion',
    header: 'Agent',
    width: 100,
    group: 'Platform',
    defaultHidden: true,
    cell: (d) => d.agentVersion,
    exportValue: (d) => d.agentVersion,
  },
];

const meta: Meta<typeof DataTable> = {
  title: 'Data/DataTable',
  component: DataTable,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component: [
          "The console's list primitive. Rows are virtualized with TanStack Virtual over a TanStack",
          'Table column model, so a 50,000-row device list scrolls without mounting 50,000 rows.',
          '',
          'Sorting, filtering and paging are all server-side. No client row model is registered on',
          'purpose: one would quietly re-sort the 200 rows on screen and disagree with the other',
          '49,800.',
          '',
          'Selection is held as a set of ids rather than a row-model slice, because "select all',
          '12,480 matching" has to mean the filter, not the rows that happen to be loaded. When the',
          'user takes that option the caller resolves it server-side.',
          '',
          'Export runs every cell through a spreadsheet-formula guard — device names and software',
          'titles come from the endpoints, and a hostname beginning with `=` would otherwise execute',
          'when someone opens the CSV.',
          '',
          '**Accessibility** — a real `<table>` with a sticky `<thead>`; sortable headers are buttons',
          'and the `<th>` carries `aria-sort`. Clickable rows are focusable and respond to Enter and',
          'Space. Each row checkbox is named, and the header checkbox goes indeterminate when the',
          'page is part-selected. Virtualized rows carry `aria-rowindex`, so position is announced',
          'correctly even though most rows are not in the DOM.',
        ].join('\n'),
      },
    },
  },
};
export default meta;

type Story = StoryObj<typeof DataTable>;

export const Devices: Story = {
  render: function Devices() {
    const rows = useMemo(() => makeDevices(2000), []);
    const [sort, setSort] = useState<SortState | null>({ id: 'hostname', desc: false });
    const [selected, setSelected] = useState<string[]>([]);
    const [allMatching, setAllMatching] = useState(false);
    const [view, setView] = useState<TableView>(() => buildDefaultView(COLUMNS));
    const [chooserOpen, setChooserOpen] = useState(false);
    const [views, setViews] = useState<SavedView[]>([
      { id: 'default', name: 'Default view', system: true, ...buildDefaultView(COLUMNS) },
    ]);
    const [activeView, setActiveView] = useState<string | null>('default');
    const [q, setQ] = useState('');

    const defaultView = useMemo(() => buildDefaultView(COLUMNS), []);
    const visible = useMemo(
      () => rows.filter((r) => !q || r.hostname.toLowerCase().includes(q.toLowerCase())),
      [rows, q],
    );

    return (
      <Frame>
        <FilterBar
          search={{ value: q, onChange: setQ, placeholder: 'Search hostname' }}
          count={`${visible.length.toLocaleString('en-IN')} of ${rows.length.toLocaleString('en-IN')}`}
          actions={
            <>
              <SavedViews
                views={views}
                activeId={activeView}
                current={view}
                onApply={(v) => {
                  setView(v);
                  setActiveView(v.id);
                }}
                onSave={(name, v) => {
                  const id = `view-${views.length}`;
                  setViews((list) => [...list, { id, name, ...v }]);
                  setActiveView(id);
                }}
                onDelete={(id) => {
                  setViews((list) => list.filter((v) => v.id !== id));
                  setActiveView('default');
                }}
              />
              <Button size="sm" onClick={() => setChooserOpen(true)}>
                Columns
              </Button>
              <Button
                size="sm"
                onClick={() =>
                  exportCsv(
                    COLUMNS.filter(
                      (c) => c.exportValue && view.columnVisibility[c.id] !== false,
                    ).map((c) => ({
                      id: c.id,
                      header: c.header,
                      value: c.exportValue as (row: Device) => string | number,
                    })),
                    visible,
                    'devices',
                  )
                }
              >
                Export CSV
              </Button>
            </>
          }
        />

        <DataTable
          label="Devices"
          columns={COLUMNS}
          rows={visible}
          getRowId={(d) => d.id}
          sort={sort}
          onSortChange={setSort}
          view={view}
          onViewChange={setView}
          selectable
          selectedIds={selected}
          onSelectedIdsChange={(ids) => {
            setSelected(ids);
            setAllMatching(false);
          }}
          totalMatching={visible.length}
          allMatchingSelected={allMatching}
          onSelectAllMatching={() => setAllMatching(true)}
          bulkActions={
            <>
              <Button size="sm">Collect logs</Button>
              <Button size="sm">Run script</Button>
              <Button size="sm" variant="primary">
                New action
              </Button>
            </>
          }
          onRowClick={() => {}}
          footer={
            <Pagination
              from={1}
              to={Math.min(200, visible.length)}
              total={visible.length}
              pageSize={200}
              unit="devices"
              hasNext
            />
          }
        />

        <ColumnChooser
          open={chooserOpen}
          onClose={() => setChooserOpen(false)}
          columns={COLUMNS}
          view={view}
          defaultView={defaultView}
          onApply={setView}
        />
      </Frame>
    );
  },
};

export const Loading: Story = {
  render: () => (
    <Frame>
      <DataTable
        label="Devices"
        columns={COLUMNS}
        rows={[]}
        getRowId={(d: Device) => d.id}
        loading
      />
    </Frame>
  ),
};

export const Empty: Story = {
  render: () => (
    <Frame>
      <DataTable label="Devices" columns={COLUMNS} rows={[]} getRowId={(d: Device) => d.id} />
    </Frame>
  ),
};

export const Failed: Story = {
  render: () => (
    <Frame>
      <DataTable
        label="Devices"
        columns={COLUMNS}
        rows={[]}
        getRowId={(d: Device) => d.id}
        error={{
          message:
            'The request did not complete. Try again, and quote the reference below if it keeps failing.',
          detail: 'Request 7f3c9a1e-44b2-4c7d-9f10-2a6e8b1d0c55',
          onRetry: () => {},
        }}
      />
    </Frame>
  ),
};
