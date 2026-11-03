import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Button,
  DataTable,
  ErrorState,
  Input,
  Pagination,
  Skeleton,
  type DataTableColumn,
} from '@aegis/ui';
import { useListController, useResource } from '../app/useListController';
import { useCan } from '../app/auth';
import { dateTime, num } from '../app/format';
import { segment } from '../app/safeNavigate';
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
          <Button disabled={!canWrite}>Import CSV</Button>
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
  // Roots first, each followed by its children, which is the order the
  // reference draws and the order a flat list of rows can carry.
  const ordered = useMemo(() => {
    const roots = groups.filter((g) => !g.parentId);
    return roots.flatMap((root) => [
      { group: root, depth: 0 },
      ...groups.filter((g) => g.parentId === root.id).map((g) => ({ group: g, depth: 1 })),
    ]);
  }, [groups]);

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
          ordered.map(({ group, depth }) => (
            <button
              key={group.id}
              type="button"
              aria-current={group.id === selectedId}
              className={[
                group.id === selectedId ? styles.treeItemOn : styles.treeItem,
                depth > 0 ? styles.treeChild : '',
              ]
                .filter(Boolean)
                .join(' ')}
              onClick={() => onSelect(group.id)}
            >
              <span className={styles.treeName}>{group.name}</span>
              <span className={styles.treeKind} title={group.kind}>
                {group.kind === 'dynamic' ? 'D' : 'S'}
              </span>
              <b className={styles.treeCount}>{num(group.members)}</b>
            </button>
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
          <span className={styles.tag}>{group.kind}</span>
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
