import { useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Button,
  DataTable,
  ErrorState,
  Input,
  Pagination,
  Skeleton,
  useToast,
  type DataTableColumn,
} from '@aegis/ui';
import { useListController, useResource } from '../app/useListController';
import { useCan } from '../app/auth';
import { dateTime, num } from '../app/format';
import { segment } from '../app/safeNavigate';
import { api } from '../api/client';
import type { Device, DeviceGroup, GroupDetail, GroupsSummary } from '../api/types';
import styles from './DeviceGroups.module.css';

/**
 * Device Groups, restored to the approved v129 layout: four estate counters,
 * a group tree on the left, and the selected group's detail on the right.
 *
 * The tree is the page. A group has a parent, children and a membership rule,
 * and the five figures across the detail pane — members, online, offline,
 * missing patches, sub-groups — are counted from real membership rather than
 * stated on the row, which is what lets the member grid and the counters
 * agree with each other.
 */

const PAGE_SIZE = 50;

/** The member grid's own filters, which are the four figures above it. */
const MEMBER_FILTERS: Record<string, Record<string, string>> = {
  all: {},
  online: { status: 'online' },
  offline: { 'status.ne': 'online' },
  missing: { 'pendingPatches.gte': '1' },
};

/** Declared in the contract, served by nothing yet. */
const UNSERVED_TABS = new Set(['patches', 'software']);

const TABS = [
  { id: 'members', label: 'Members' },
  { id: 'patches', label: 'Patches' },
  { id: 'software', label: 'Software' },
  { id: 'subgroups', label: 'Sub-Groups' },
  { id: 'membership', label: 'Membership' },
  { id: 'policies', label: 'Policies' },
  { id: 'history', label: 'History' },
] as const;

type TabId = (typeof TABS)[number]['id'];

export default function DeviceGroups() {
  const [params, setParams] = useSearchParams();
  const canWrite = useCan('groups:write');
  const [treeQuery, setTreeQuery] = useState('');
  const [memberTile, setMemberTile] = useState('all');
  const toast = useToast();
  const csvInput = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);

  const tree = useResource<{ items: DeviceGroup[]; summary: GroupsSummary }>(
    treeQuery.trim() ? `/groups?q=${encodeURIComponent(treeQuery.trim())}` : '/groups',
  );
  const groups = useMemo(() => tree.data?.items ?? [], [tree.data]);

  // The selection lives in the URL, so a group someone is looking at is a
  // link they can paste into a ticket.
  const selectedId = params.get('group') ?? groups[0]?.id ?? '';
  const tab = (params.get('tab') ?? 'members') as TabId;

  const set = (key: string, value: string | undefined) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };

  /*
   * The reference's importer, against the endpoint the contract has always
   * declared: two columns, group name then computer name. The input is
   * cleared before anything else happens so that picking the same file twice
   * running still fires a change.
   */
  const onCsv = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    // The contract caps the body at a megabyte; saying so here beats a 400
    // after the upload.
    if (file.size > 1_048_576) {
      toast.show({
        title: 'That file is larger than 1 MB.',
        message: 'Split it, or import the groups that matter first.',
        tone: 'error',
      });
      return;
    }
    setImporting(true);
    try {
      const result = await api.postText<{ created: number; skipped: number; errors: string[] }>(
        '/groups/import',
        await file.text(),
        'text/csv',
      );
      await tree.refetch();
      toast.show({
        title: `${num(result.created)} added, ${num(result.skipped)} skipped`,
        message: result.errors[0] ?? 'Every row named a computer this estate knows.',
        tone: result.created > 0 ? 'success' : 'error',
      });
    } catch (error) {
      toast.show({
        title: 'The groups could not be imported.',
        message: error instanceof Error ? error.message : undefined,
        tone: 'error',
      });
    } finally {
      setImporting(false);
    }
  };

  if (tree.error) {
    return <ErrorState description="Device groups could not be loaded." onRetry={tree.refetch} />;
  }

  const summary = tree.data?.summary;

  return (
    <div className={styles.page}>
      <div className={styles.heading}>
        <div>
          <p className={styles.eyebrow}>Aegis One / Endpoint Management</p>
          <h1 className={styles.title}>Device Groups</h1>
        </div>
        <div className={styles.actions}>
          <Button
            aria-label="Import groups from CSV"
            title="CSV with two columns: group name, computer name or hostname"
            disabled={!canWrite || importing}
            onClick={() => csvInput.current?.click()}
          >
            {importing ? 'Importing…' : 'Import CSV'}
          </Button>
          <input
            ref={csvInput}
            type="file"
            accept=".csv,text/csv,.txt"
            className={styles.hiddenFile}
            tabIndex={-1}
            aria-hidden="true"
            onChange={(e) => void onCsv(e)}
          />
          <Button disabled={!canWrite}>Directory Sync</Button>
          <Button variant="primary" disabled={!canWrite}>
            Create Group
          </Button>
        </div>
      </div>

      <div className={styles.kpis}>
        {summary ? (
          <>
            <Kpi label="Groups" value={num(summary.groups)} dark />
            <Kpi label="Sub-Groups" value={num(summary.subGroups)} />
            <Kpi
              label="Endpoints Grouped"
              value={num(summary.grouped)}
              suffix={`/${num(summary.grouped + summary.notGrouped)}`}
            />
            <Kpi label="Not Grouped" value={num(summary.notGrouped)} />
          </>
        ) : (
          Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className={styles.kpiSkeleton} />)
        )}
      </div>

      <div className={styles.split}>
        <GroupTree
          groups={groups}
          loading={tree.isLoading}
          selectedId={selectedId}
          query={treeQuery}
          onQuery={setTreeQuery}
          onSelect={(id) => {
            setMemberTile('all');
            set('group', id);
          }}
          estateTotal={(summary?.grouped ?? 0) + (summary?.notGrouped ?? 0)}
        />

        {selectedId ? (
          <GroupPane
            key={selectedId}
            groupId={selectedId}
            groups={groups}
            tab={tab}
            onTab={(next) => set('tab', next)}
            memberTile={memberTile}
            onMemberTile={setMemberTile}
            onSelect={(id) => set('group', id)}
            canWrite={canWrite}
          />
        ) : (
          <section className={styles.main}>
            <p className={styles.empty}>No group matches that search.</p>
          </section>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* The tree                                                           */
/* ------------------------------------------------------------------ */

function GroupTree({
  groups,
  loading,
  selectedId,
  query,
  onQuery,
  onSelect,
  estateTotal,
}: {
  groups: DeviceGroup[];
  loading: boolean;
  selectedId: string;
  query: string;
  onQuery: (value: string) => void;
  onSelect: (id: string) => void;
  estateTotal: number;
}) {
  /*
   * Which roots are shut. Collapsing is a view of the tree rather than a
   * property of a group, so it lives here and is not written to the URL: a
   * link to a group should open that group, not somebody else's folded tree.
   */
  const [shut, setShut] = useState<Record<string, boolean>>({});

  // Roots first, each followed by its children, which is the order the
  // reference draws and the order a flat list of rows can carry. A search
  // flattens the tree, exactly as the reference does, because a match inside
  // a shut branch that stays hidden is a search that lies.
  const searching = query.trim().length > 0;
  const ordered = useMemo(() => {
    const roots = groups.filter((g) => !g.parentId);
    return roots.flatMap((root) => {
      const children = groups.filter((g) => g.parentId === root.id);
      const open = searching || !shut[root.id];
      return [
        { group: root, depth: 0, children: children.length },
        ...(open ? children.map((g) => ({ group: g, depth: 1, children: 0 })) : []),
      ];
    });
  }, [groups, shut, searching]);

  return (
    <aside className={styles.tree}>
      <div className={styles.treeHead}>
        <b>All Groups</b>
        <Input
          aria-label="Search groups"
          placeholder="Search groups"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
        />
      </div>

      <div className={styles.allComputers}>
        <span className={styles.treeName}>All Computers</span>
        <b className={styles.treeCount}>{num(estateTotal)}</b>
      </div>

      <div className={styles.treeList}>
        {loading ? (
          Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className={styles.treeSkeleton} />)
        ) : ordered.length === 0 ? (
          <p className={styles.empty}>No groups</p>
        ) : (
          ordered.map(({ group, depth, children }) => (
            <div
              key={group.id}
              className={[
                group.id === selectedId ? styles.treeRowOn : styles.treeRow,
                depth > 0 ? styles.treeChild : '',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              {children > 0 && !searching ? (
                <button
                  type="button"
                  className={styles.twisty}
                  aria-expanded={!shut[group.id]}
                  aria-label={`${shut[group.id] ? 'Expand' : 'Collapse'} ${group.name}`}
                  onClick={() => setShut({ ...shut, [group.id]: !shut[group.id] })}
                >
                  {shut[group.id] ? '▸' : '▾'}
                </button>
              ) : (
                <span className={styles.twistySpacer} />
              )}
              <button
                type="button"
                aria-current={group.id === selectedId}
                className={group.id === selectedId ? styles.treeItemOn : styles.treeItem}
                onClick={() => onSelect(group.id)}
              >
                <span className={styles.treeName}>{group.name}</span>
                <span className={styles.treeKind} title={group.kind}>
                  {group.kind === 'dynamic' ? 'D' : 'S'}
                </span>
                <b className={styles.treeCount}>{num(group.members)}</b>
              </button>
            </div>
          ))
        )}
      </div>
    </aside>
  );
}

/* ------------------------------------------------------------------ */
/* The detail pane                                                    */
/* ------------------------------------------------------------------ */

function GroupPane({
  groupId,
  groups,
  tab,
  onTab,
  memberTile,
  onMemberTile,
  onSelect,
  canWrite,
}: {
  groupId: string;
  groups: DeviceGroup[];
  tab: TabId;
  onTab: (tab: TabId) => void;
  memberTile: string;
  onMemberTile: (tile: string) => void;
  onSelect: (id: string) => void;
  canWrite: boolean;
}) {
  const detail = useResource<GroupDetail>(`/groups/${encodeURIComponent(segment(groupId))}`);
  const children = groups.filter((g) => g.parentId === groupId);
  const group = detail.data;

  if (detail.error) {
    return (
      <section className={styles.main}>
        <ErrorState description="That group could not be loaded." onRetry={detail.refetch} />
      </section>
    );
  }

  if (!group) {
    return (
      <section className={styles.main}>
        <Skeleton className={styles.paneSkeleton} />
      </section>
    );
  }

  const counts: Record<TabId, number | undefined> = {
    members: group.members,
    patches: undefined,
    software: undefined,
    subgroups: group.subGroups,
    membership: undefined,
    policies: group.policies.length,
    history: group.history.length,
  };

  return (
    <section className={styles.main}>
      <div className={styles.paneHead}>
        <h2 className={styles.paneTitle}>
          {group.name}
          <span className={styles.tag}>{group.kind === 'dynamic' ? 'Dynamic' : 'Static'}</span>
        </h2>
        <div className={styles.paneActions}>
          <Button size="sm" disabled={!canWrite}>
            Add Sub-Group
          </Button>
          <Button size="sm" disabled={!canWrite}>
            Edit
          </Button>
        </div>
      </div>

      <div className={styles.stats}>
        <Stat label="Members" value={num(group.members)} dark />
        <Stat label="Online" value={num(group.online)} tone={styles.good} />
        <Stat label="Offline" value={num(group.offline)} tone={styles.bad} />
        <Stat label="Missing Patches" value={num(group.missingPatches)} tone={styles.warn} />
        <Stat label="Sub-Groups" value={num(group.subGroups)} />
      </div>

      <div className={styles.tabs} role="tablist" aria-label="Group detail">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            disabled={UNSERVED_TABS.has(t.id)}
            className={tab === t.id ? styles.tabOn : styles.tab}
            onClick={() => onTab(t.id)}
            {...(UNSERVED_TABS.has(t.id)
              ? { title: 'No endpoint serves this yet — see docs/handover-backend.md' }
              : {})}
          >
            {t.label}
            {counts[t.id] === undefined ? null : (
              <span className={styles.tabCount}>{num(counts[t.id] ?? 0)}</span>
            )}
          </button>
        ))}
      </div>

      {tab === 'members' ? (
        <Members group={group} tile={memberTile} onTile={onMemberTile} />
      ) : tab === 'subgroups' ? (
        <SubGroups items={children} onSelect={onSelect} />
      ) : tab === 'policies' ? (
        <Policies policies={group.policies} />
      ) : tab === 'history' ? (
        <History entries={group.history} />
      ) : tab === 'membership' ? (
        <Membership group={group} />
      ) : (
        <p className={styles.empty}>
          The approved design shows this tab. No endpoint serves it yet, so it is disabled rather
          than filled with something invented.
        </p>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Tabs                                                               */
/* ------------------------------------------------------------------ */

const MEMBER_COLUMNS: DataTableColumn<Device>[] = [
  {
    id: 'hostname',
    header: 'Device Name',
    locked: true,
    sortable: true,
    width: 150,
    cell: (d) => <span className={styles.deviceName}>{d.hostname}</span>,
    exportValue: (d) => d.hostname,
  },
  {
    id: 'id',
    header: 'Device ID',
    width: 115,
    cell: (d) => <span className={styles.mono}>{d.id}</span>,
    exportValue: (d) => d.id,
  },
  {
    id: 'ip',
    header: 'IP Address',
    sortable: true,
    width: 125,
    cell: (d) => <span className={styles.mono}>{d.ip}</span>,
    exportValue: (d) => d.ip,
  },
  {
    id: 'osName',
    header: 'OS',
    sortable: true,
    width: 175,
    cell: (d) => `${d.osName} ${d.osVersion}`,
    exportValue: (d) => `${d.osName} ${d.osVersion}`,
  },
  {
    id: 'primaryUserName',
    header: 'User',
    sortable: true,
    width: 135,
    cell: (d) => d.primaryUserName,
    exportValue: (d) => d.primaryUserName,
  },
  {
    id: 'zoneName',
    header: 'Location',
    sortable: true,
    width: 140,
    cell: (d) => d.zoneName,
    exportValue: (d) => d.zoneName,
  },
  {
    id: 'status',
    header: 'Connection',
    sortable: true,
    width: 105,
    cell: (d) => (
      <span className={d.status === 'online' ? styles.good : styles.bad}>
        {d.status === 'online' ? 'Online' : 'Offline'}
      </span>
    ),
    exportValue: (d) => d.status,
  },
  {
    id: 'pendingPatches',
    header: 'Patch Status',
    sortable: true,
    width: 120,
    cell: (d) =>
      d.pendingPatches > 0 ? (
        <span className={styles.warn}>{num(d.pendingPatches)} missing</span>
      ) : (
        <span className={styles.good}>Up to Date</span>
      ),
    exportValue: (d) => d.pendingPatches,
  },
  {
    /*
     * The reference's ninth column. It opens the endpoint, which is the only
     * management action a group's member grid can offer that the contract
     * describes — a member is a device, and everything else lives on its own
     * page.
     */
    id: 'manage',
    header: 'Manage',
    width: 110,
    cell: () => <span className={styles.manage}>Open</span>,
    exportValue: () => '',
  },
];

function Members({
  group,
  tile,
  onTile,
}: {
  group: GroupDetail;
  tile: string;
  onTile: (tile: string) => void;
}) {
  const navigate = useNavigate();
  const controller = useListController<Device>({
    path: `/groups/${encodeURIComponent(segment(group.id))}/members`,
    defaultSort: { id: 'hostname', desc: false },
    defaultPageSize: PAGE_SIZE,
    fixedFilters: MEMBER_FILTERS[tile] ?? {},
  });

  const segments: readonly [string, string, number][] = [
    ['all', 'All', group.members],
    ['online', 'Online', group.online],
    ['offline', 'Offline', group.offline],
    ['missing', 'Missing Patches', group.missingPatches],
  ];

  return (
    <>
      <div className={styles.tools}>
        <div className={styles.segmented} role="group" aria-label="Member filter">
          {segments.map(([id, label, count]) => (
            <button
              key={id}
              type="button"
              aria-pressed={tile === id}
              className={tile === id ? styles.segOn : styles.seg}
              onClick={() => onTile(id)}
            >
              {label} <b>{num(count)}</b>
            </button>
          ))}
        </div>
        <Input
          className={styles.toolSearch}
          aria-label="Search name, IP, OS or location"
          placeholder="Search name, IP, OS or location"
          value={controller.search}
          onChange={(e) => controller.setSearch(e.target.value)}
        />
      </div>

      <DataTable
        label="Group members"
        columns={MEMBER_COLUMNS}
        rows={controller.rows}
        getRowId={(d) => d.id}
        sort={controller.sort}
        onSortChange={controller.setSort}
        loading={controller.loading}
        error={controller.error}
        onRowClick={(d) => void navigate(`/devices/${segment(d.id)}`)}
        emptyTitle="No member matches this filter"
        emptyDescription="Clear the filter or the search to see the whole group."
        className={styles.table}
        footer={
          controller.hasNext || controller.hasPrevious ? (
            <Pagination
              from={controller.from}
              to={controller.to}
              total={controller.total}
              unit="members"
              pageSize={controller.pageSize}
              onPageSizeChange={controller.setPageSize}
              hasNext={controller.hasNext}
              hasPrevious={controller.hasPrevious}
              onNext={controller.next}
              onPrevious={controller.previous}
            />
          ) : null
        }
      />
    </>
  );
}

function SubGroups({ items, onSelect }: { items: DeviceGroup[]; onSelect: (id: string) => void }) {
  if (items.length === 0) return <p className={styles.empty}>This group has no sub-groups.</p>;
  return (
    <ul className={styles.cards}>
      {items.map((g) => (
        <li key={g.id}>
          <button type="button" className={styles.card} onClick={() => onSelect(g.id)}>
            <span className={styles.cardName}>{g.name}</span>
            <span className={styles.cardMeta}>
              {g.kind === 'dynamic' ? 'Dynamic' : 'Static'} · {num(g.members)} members ·{' '}
              {num(g.missingPatches)} missing patches
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function Membership({ group }: { group: GroupDetail }) {
  return (
    <dl className={styles.facts}>
      <div>
        <dt>Kind</dt>
        <dd>{group.kind === 'dynamic' ? 'Dynamic — membership follows the rule' : 'Static'}</dd>
      </div>
      <div>
        <dt>Rule</dt>
        <dd className={styles.mono}>{group.rule ?? 'Members chosen individually'}</dd>
      </div>
      <div>
        <dt>Members</dt>
        <dd>{num(group.members)}</dd>
      </div>
    </dl>
  );
}

function Policies({ policies }: { policies: string[] }) {
  if (policies.length === 0) {
    return <p className={styles.empty}>No policy is applied to this group.</p>;
  }
  return (
    <ul className={styles.list}>
      {policies.map((p) => (
        <li key={p}>{p}</li>
      ))}
    </ul>
  );
}

function History({ entries }: { entries: GroupDetail['history'] }) {
  if (entries.length === 0) return <p className={styles.empty}>Nothing recorded for this group.</p>;
  return (
    <ul className={styles.history}>
      {entries.map((e) => (
        <li key={e.id}>
          <span className={styles.historyAt}>{dateTime(e.at)}</span>
          <span className={styles.historyAction}>{e.action}</span>
          <span className={styles.historyActor}>{e.actor}</span>
        </li>
      ))}
    </ul>
  );
}

/* ------------------------------------------------------------------ */
/* Pieces                                                             */
/* ------------------------------------------------------------------ */

function Kpi({
  label,
  value,
  suffix,
  dark = false,
}: {
  label: string;
  value: string;
  suffix?: string;
  dark?: boolean;
}) {
  return (
    <div className={dark ? styles.kpiDark : styles.kpi}>
      <span className={styles.kpiLabel}>{label}</span>
      <strong className={styles.kpiValue}>
        {value}
        {suffix ? <em className={styles.kpiSuffix}>{suffix}</em> : null}
      </strong>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
  dark = false,
}: {
  label: string;
  value: string;
  tone?: string;
  dark?: boolean;
}) {
  return (
    <div className={dark ? styles.statDark : styles.stat}>
      <span className={styles.statLabel}>{label}</span>
      <b className={[styles.statValue, tone].filter(Boolean).join(' ')}>{value}</b>
    </div>
  );
}
