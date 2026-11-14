import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Button,
  DataTable,
  ErrorState,
  Input,
  Pagination,
  Select,
  Skeleton,
  type DataTableColumn,
} from '@aegis/ui';
import { useListController, useResource } from '../app/useListController';
import { useCan } from '../app/auth';
import { dateTime, humanise, num } from '../app/format';
import { segment } from '../app/safeNavigate';
import type { Deployment, DeploymentsSummary } from '../api/types';
import styles from './Deployments.module.css';

/**
 * Deployments, restored to the approved v129 layout: six counters that are
 * also the page's filters, a search and type row, and one wide grid where
 * every row carries its own result breakdown.
 *
 * A row is an action, not a job queue entry. That is why it reads the package
 * it carries, which computers it went to, and how many of them have reported
 * back — the three figures the contract keeps in `counts`.
 */

/** The reference's rows are tall enough to stack three lines; ours are too. */
const PAGE_SIZE = 25;

/**
 * Each counter is a filter. They are expressed as query parameters rather than
 * resolved in the browser, so a tile narrows the query instead of hiding rows
 * that were fetched anyway.
 */
const TILE_FILTERS: Record<string, Record<string, string>> = {
  all: {},
  active: { 'status.in': 'queued,running' },
  scheduled: { status: 'scheduled' },
  completed: { status: 'completed' },
  failures: { 'failed.gte': '1' },
  halted: { 'status.in': 'paused,cancelled' },
};

/**
 * The contract's DeploymentType, in the reference's order and under the
 * reference's own labels — `refresh-details` is "Refresh Computer Details"
 * there, which no general-purpose humaniser would produce.
 */
const TYPE_LABEL: Record<string, string> = {
  'install-software': 'Install Software',
  'update-software': 'Update Software',
  'uninstall-software': 'Uninstall Software',
  'repair-software': 'Repair Software',
  'deploy-patches': 'Deploy Patches',
  'refresh-details': 'Refresh Computer Details',
  'vulnerability-scan': 'Vulnerability Scan',
  'collect-logs': 'Collect Logs',
  'restart-devices': 'Restart Devices',
  'roll-back-patches': 'Roll Back Patches',
  'remediate-configuration': 'Remediate Configuration',
};

const typeLabel = (type: string): string => TYPE_LABEL[type] ?? humanise(type);

/** The reference colours a status rather than boxing it. */
const STATUS_CLASS: Record<string, string | undefined> = {
  completed: styles.good,
  // Running is activity, not success: it borrows the page's navy, as the
  // reference does for every state nobody has to act on.
  running: styles.cool,
  failed: styles.bad,
  paused: styles.warn,
  cancelled: styles.warn,
  queued: styles.cool,
  scheduled: styles.cool,
};

export default function Deployments() {
  const navigate = useNavigate();
  const canCreate = useCan('deployments:create');
  const [tile, setTile] = useState('all');

  const controller = useListController<Deployment>({
    path: '/deployments',
    defaultSort: { id: 'triggeredAt', desc: true },
    defaultPageSize: PAGE_SIZE,
    fixedFilters: TILE_FILTERS[tile] ?? {},
  });

  // The counters count every action, not the filtered page: each one is a
  // filter a reader can click, so a counter that moved with the filter would
  // always read the same as the grid beneath it.
  const summary = useResource<DeploymentsSummary>('/deployments/summary');

  if (controller.error) {
    return (
      <ErrorState
        description="Deployment actions could not be loaded."
        onRetry={controller.error.onRetry}
      />
    );
  }

  const open = (d: Deployment) => void navigate(`/deployments/${segment(d.id)}`);
  const columns = buildColumns(open);
  const counts = summary.data;

  return (
    <div className={styles.page}>
      <div className={styles.heading}>
        <h1 className={styles.title}>Deployments</h1>
        <div className={styles.actions}>
          <Button onClick={() => void navigate('/reports')}>Export</Button>
          <Button
            variant="primary"
            disabled={!canCreate}
            onClick={() => void navigate('/deployments/new')}
          >
            + New action
          </Button>
        </div>
      </div>

      <div className={styles.kpis}>
        {counts ? (
          <>
            <Kpi id="all" label="All Actions" value={counts.all} tile={tile} onPick={setTile} />
            <Kpi
              id="active"
              label="Active / waiting"
              value={counts.active}
              tile={tile}
              onPick={setTile}
            />
            <Kpi
              id="scheduled"
              label="Scheduled"
              value={counts.scheduled}
              tile={tile}
              onPick={setTile}
            />
            <Kpi
              id="completed"
              label="Completed"
              value={counts.completed}
              tile={tile}
              onPick={setTile}
            />
            <Kpi
              id="failures"
              label="With Failures"
              value={counts.withFailures}
              tile={tile}
              onPick={setTile}
            />
            <Kpi
              id="halted"
              label="Paused / cancelled"
              value={counts.pausedOrCancelled}
              tile={tile}
              onPick={setTile}
            />
          </>
        ) : (
          Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className={styles.kpiSkeleton} />)
        )}
      </div>

      <div className={styles.toolbar}>
        <Input
          className={styles.search}
          aria-label="Search action, package or hostname"
          placeholder="Search action, package or hostname…"
          value={controller.search}
          onChange={(e) => controller.setSearch(e.target.value)}
        />
        <div className={styles.inline}>
          <span className={styles.count}>{num(controller.total)} actions</span>
          <Select
            className={styles.typeSelect}
            aria-label="Filter deployment action"
            placeholder="All Types"
            options={Object.entries(TYPE_LABEL).map(([value, label]) => ({ value, label }))}
            value={controller.filters['type'] ?? ''}
            onChange={(e) => controller.setFilter('type', e.target.value || undefined)}
          />
        </div>
      </div>

      <DataTable
        label="Deployments"
        columns={columns}
        rows={controller.rows}
        getRowId={(d) => d.id}
        sort={controller.sort}
        onSortChange={controller.setSort}
        loading={controller.loading}
        onRowClick={open}
        emptyTitle="No actions match these filters"
        emptyDescription="Start one from Software, Patches, or with New action."
        className={styles.table}
        footer={
          controller.hasNext || controller.hasPrevious ? (
            <Pagination
              from={controller.from}
              to={controller.to}
              total={controller.total}
              unit="actions"
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

      <p className={styles.notice}>
        Results reflect stored per-computer records. An action reports as its endpoints check in, so
        a running action shows fewer results than computers.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Columns                                                            */
/* ------------------------------------------------------------------ */

function buildColumns(open: (d: Deployment) => void): DataTableColumn<Deployment>[] {
  return [
    {
      id: 'name',
      header: 'Action / package',
      locked: true,
      sortable: true,
      width: 349,
      cell: (d) => (
        <div>
          <button
            type="button"
            className={styles.jobLink}
            onClick={(e) => {
              e.stopPropagation();
              open(d);
            }}
          >
            {d.name}
          </button>
          <small className={styles.jobMeta}>
            {d.id} · {typeLabel(d.type)}
          </small>
          {d.package ? (
            <span className={styles.packageLine}>
              {/*
               * The reference puts the vendor's own icon here. Icons are
               * imported by an administrator rather than shipped with the
               * product (docs/decisions.md D-029), so this is the same
               * lettered tile the software cards fall back to.
               */}
              <span className={styles.packageIcon} aria-hidden="true">
                {d.package.slice(0, 1).toUpperCase()}
              </span>
              {d.package}
            </span>
          ) : null}
        </div>
      ),
      exportValue: (d) => `${d.name} (${d.package})`,
    },
    {
      id: 'targetCount',
      header: 'Computers',
      sortable: true,
      // Wider than the reference's, because this estate's hostnames are
      // longer than its fixture's and the sample has to stay readable.
      width: 250,
      cell: (d) => (
        <div>
          <strong className={styles.figure}>{num(d.targetCount)}</strong>
          <small className={styles.jobMeta}>{targetLine(d)}</small>
        </div>
      ),
      exportValue: (d) => d.targetCount,
    },
    {
      id: 'status',
      header: 'Status',
      sortable: true,
      width: 185,
      cell: (d) => (
        <div>
          <span className={STATUS_CLASS[d.status] ?? styles.cool}>{humanise(d.status)}</span>
          {d.status === 'scheduled' && d.startsAt ? (
            <small className={styles.jobMeta}>Starts {dateTime(d.startsAt)}</small>
          ) : null}
        </div>
      ),
      exportValue: (d) => d.status,
    },
    {
      id: 'results',
      header: 'Results',
      width: 231,
      cell: (d) => <Results deployment={d} />,
      exportValue: (d) =>
        `${d.counts.done} done, ${d.counts.failed} failed, ${d.counts.pending} pending`,
    },
    {
      id: 'triggeredBy',
      header: 'Triggered by / time',
      sortable: true,
      width: 220,
      cell: (d) => (
        <div>
          {d.triggeredBy}
          <small className={styles.jobMeta}>{dateTime(d.triggeredAt)}</small>
        </div>
      ),
      exportValue: (d) => d.triggeredBy,
    },
    {
      id: 'open',
      header: '',
      width: 120,
      cell: (d) => (
        <Button
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            open(d);
          }}
        >
          View Details
        </Button>
      ),
      exportValue: () => '',
    },
  ];
}

/** "PC-DEL-102, PC-BLR-103 +1", as the reference writes it. */
function targetLine(d: Deployment): string {
  // Two names and a remainder, which is what fits on one line.
  const shown = (d.targetPreview ?? []).slice(0, 2);
  if (shown.length === 0) return '';
  const rest = d.targetCount - shown.length;
  return rest > 0 ? `${shown.join(', ')} +${num(rest)}` : shown.join(', ');
}

/* ------------------------------------------------------------------ */
/* Pieces                                                             */
/* ------------------------------------------------------------------ */

function Results({ deployment }: { deployment: Deployment }) {
  const { done, failed, pending } = deployment.counts;
  const recorded = done + failed;
  const total = recorded + pending;
  const share = (n: number) => (total > 0 ? (n / total) * 100 : 0);

  return (
    <div>
      <div className={styles.counts}>
        <span className={done > 0 ? styles.good : undefined}>{num(done)} done</span>
        <span className={failed > 0 ? styles.bad : undefined}>{num(failed)} failed</span>
        <span>{num(pending)} pending</span>
      </div>
      {/*
       * Two segments over a track, so the bar reads as "of everything targeted"
       * rather than "of what has reported" — a running action with one failure
       * should not draw as half red. Drawn as an SVG for the same reason the
       * other figures are: a proportional width is data, and inline styles are
       * not allowed in this console.
       */}
      <svg
        className={styles.bar}
        viewBox="0 0 100 1"
        preserveAspectRatio="none"
        role="img"
        aria-label={`${num(done)} succeeded, ${num(failed)} failed, ${num(pending)} pending`}
      >
        <rect className={styles.barGood} x="0" y="0" height="1" width={share(done)} />
        <rect className={styles.barBad} x={share(done)} y="0" height="1" width={share(failed)} />
      </svg>
      <small className={styles.jobMeta}>
        {num(recorded)} / {num(total)} Results Recorded
      </small>
    </div>
  );
}

function Kpi({
  id,
  label,
  value,
  tile,
  onPick,
}: {
  id: string;
  label: string;
  value: number;
  tile: string;
  onPick: (id: string) => void;
}) {
  const active = tile === id;
  return (
    <button
      type="button"
      aria-pressed={active}
      className={active ? styles.kpiActive : styles.kpi}
      onClick={() => onPick(id)}
    >
      <span className={styles.kpiLabel}>{label}</span>
      <span className={styles.kpiValue}>{num(value)}</span>
    </button>
  );
}
