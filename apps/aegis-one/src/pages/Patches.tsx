import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Button,
  DataTable,
  ErrorState,
  Field,
  Input,
  Menu,
  Modal,
  Pagination,
  Select,
  Skeleton,
  buildDefaultView,
  type DataTableColumn,
  type TableView,
  useToast,
} from '@aegis/ui';
import { api } from '../api/client';
import PatchGlobalSettings from './PatchGlobalSettings';
import { useListController, useResource } from '../app/useListController';
import { useCan } from '../app/auth';
import { date, dateTime, num } from '../app/format';
import { segment } from '../app/safeNavigate';
import { Bars, Columns, Donut, bandTone } from './shared/Figures';
import type { Datum, Tone } from './shared/Figures';
import type { Patch, PatchPolicy, PatchSummary } from '../api/types';
import styles from './Patches.module.css';

/**
 * Patch Management, restored to the approved v129 layout: one page with eight
 * tabs — an Overview dashboard, the policies that schedule the work, four
 * catalogue tabs split by platform, firmware, and the whole catalogue.
 *
 * Every figure above a grid comes from `/patches/summary`, computed in SQL. The
 * grids themselves page through `/patches` with the tab's own fixed filters, so
 * switching tabs is a different query rather than a different filter applied in
 * the browser to rows it should never have fetched.
 */

type TabId =
  'overview' | 'policies' | 'windows' | 'macos' | 'linux' | 'third-party' | 'drivers' | 'all';

const TABS: readonly { id: TabId; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'policies', label: 'Patch Policies' },
  { id: 'windows', label: 'Windows' },
  { id: 'macos', label: 'macOS' },
  { id: 'linux', label: 'Linux' },
  { id: 'third-party', label: 'Third-Party Apps' },
  { id: 'drivers', label: 'Drivers & BIOS' },
  { id: 'all', label: 'All Patches' },
];

/** The grid heading and the fixed filters each catalogue tab asks the API for. */
const GRID_TABS: Record<string, { heading: string; fixed: Record<string, string> }> = {
  windows: { heading: 'Windows OS Updates', fixed: { platform: 'windows', category: 'os' } },
  macos: { heading: 'macOS Updates', fixed: { platform: 'macos', category: 'os' } },
  linux: { heading: 'Linux Updates', fixed: { platform: 'linux', category: 'os' } },
  'third-party': {
    heading: 'Third-Party Application Updates',
    fixed: { category: 'third-party' },
  },
  drivers: { heading: 'Drivers & BIOS', fixed: { category: 'driver-bios' } },
  all: { heading: 'All Patches', fixed: {} },
};

const SEVERITIES = [
  { value: '', label: 'All Severities' },
  { value: 'critical', label: 'Critical' },
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
];

const TYPE_OPTIONS = [
  { value: 'os', label: 'OS' },
  { value: 'third-party', label: 'Third-party' },
  { value: 'driver-bios', label: 'Drivers & BIOS' },
];

/** "Released" is a window, expressed as the earliest date it may have shipped. */
const RELEASED_WINDOWS = [
  { value: '7', label: 'Last 7 days' },
  { value: '30', label: 'Last 30 days' },
  { value: '90', label: 'Last 90 days' },
];

const SEVERITY_CLASS: Record<string, string> = {
  critical: styles.sevCritical as string,
  high: styles.sevHigh as string,
  medium: styles.sevMedium as string,
  low: styles.sevLow as string,
};

const APPROVAL_CLASS: Record<string, string> = {
  approved: styles.apApproved as string,
  test: styles.apTest as string,
  review: styles.apReview as string,
  declined: styles.apDeclined as string,
  superseded: styles.apSuperseded as string,
};

const APPROVAL_LABEL: Record<string, string> = {
  approved: 'Approved',
  test: 'Test',
  review: 'Review',
  declined: 'Declined',
  superseded: 'Superseded',
};

const RING_LABEL: Record<string, string> = {
  pilot: 'Pilot Ring',
  broad: 'Broad Ring',
  late: 'Late Ring',
};

const PLATFORM_LABEL: Record<string, string> = {
  windows: 'Windows',
  macos: 'macOS',
  linux: 'Linux',
  aix: 'AIX',
};

const CATEGORY_LABEL: Record<string, string> = {
  os: 'OS',
  'third-party': 'Third-party',
  'driver-bios': 'Drivers & BIOS',
};

const SEVERITY_TONE: Record<string, Tone> = {
  critical: 'bad',
  high: 'warn',
  medium: 'alt',
  low: 'info',
};

export default function Patches() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();
  const canDeploy = useCan('patches:deploy');

  const raw = params.get('tab') ?? 'overview';
  const tab: TabId = (TABS.find((t) => t.id === raw)?.id ?? 'overview') as TabId;
  const grid = GRID_TABS[tab];

  const summary = useResource<PatchSummary>('/patches/summary');
  const policies = useResource<PatchPolicy[]>('/patch-policies', tab === 'policies');

  const controller = useListController<Patch>({
    path: '/patches',
    defaultSort: { id: 'releasedAt', desc: true },
    ...(grid ? { fixedFilters: grid.fixed } : {}),
    enabled: Boolean(grid),
  });

  // Switching tab starts a new question, so the previous tab's severity,
  // vendor and OS-version choices do not follow it across.
  const goTab = (next: TabId) => {
    const url = new URLSearchParams();
    if (next !== 'overview') url.set('tab', next);
    setParams(url, { replace: false });
  };

  // The release filter is stored as the window the operator picked; the date it
  // resolves to is computed when they pick it, because render may not read the
  // clock.
  const [released, setReleased] = useState('');
  const [policySearch, setPolicySearch] = useState('');
  const [policyStatus, setPolicyStatus] = useState('');
  const [policyPane, setPolicyPane] = useState<'policies' | 'settings'>('policies');

  const refreshPolicies = () => {
    void queryClient.invalidateQueries({ queryKey: ['/patch-policies'] });
    // The four counters above the table count policies, so they move too.
    void queryClient.invalidateQueries({ queryKey: ['/patches/summary'] });
  };

  const [policyDialog, setPolicyDialog] = useState(false);
  const [policyDraft, setPolicyDraft] = useState({ name: '', content: '', copyOf: '' });
  const [deleting, setDeleting] = useState<PatchPolicy | null>(null);
  /*
   * Open reads the declared detail route. The approved design has no policy
   * page to navigate to, so the detail is shown where the row is rather than
   * invented as a route of its own.
   */
  const [opened, setOpened] = useState<PatchPolicy | null>(null);
  const openedDetail = useQuery({
    queryKey: ['/patch-policies', opened?.id],
    enabled: opened !== null,
    queryFn: ({ signal }) =>
      api.get<PatchPolicy>(
        `/patch-policies/${encodeURIComponent(opened?.id ?? '')}`,
        undefined,
        signal,
      ),
  });

  const createPolicy = useMutation({
    mutationFn: () =>
      api.post<PatchPolicy>('/patch-policies', {
        name: policyDraft.name.trim(),
        ...(policyDraft.content.trim() ? { content: policyDraft.content.trim() } : {}),
        ...(policyDraft.copyOf ? { copyOf: policyDraft.copyOf } : {}),
      }),
    onSuccess: (policy) => {
      toast.show({
        title: `${policy.name} created`,
        /*
         * A new policy covers nothing until it is evaluated, so the server
         * creates it suspended. Saying so here is kinder than letting an
         * administrator wonder why the compliance column reads 0%.
         */
        message: 'It starts suspended and covers nothing until it runs.',
        tone: 'success',
      });
      setPolicyDialog(false);
      refreshPolicies();
    },
    onError: (error) =>
      toast.show({
        title: 'The policy could not be created.',
        message: error instanceof Error ? error.message : undefined,
        tone: 'error',
      }),
  });

  const changePolicyStatus = useMutation({
    mutationFn: (vars: { policy: PatchPolicy; status: 'active' | 'suspended' }) =>
      api.patch<PatchPolicy>(`/patch-policies/${encodeURIComponent(vars.policy.id)}`, {
        status: vars.status,
      }),
    onSuccess: (policy) => {
      toast.show({
        title:
          policy.status === 'suspended' ? `${policy.name} suspended` : `${policy.name} resumed`,
        message: policy.status === 'suspended' ? 'Its next run has been cleared.' : undefined,
        tone: 'success',
      });
      refreshPolicies();
    },
    onError: () => toast.show({ title: 'The policy could not be changed.', tone: 'error' }),
  });

  const deletePolicy = useMutation({
    mutationFn: (policy: PatchPolicy) =>
      api.delete(`/patch-policies/${encodeURIComponent(policy.id)}`),
    onSuccess: () => {
      toast.show({ title: 'Policy deleted', tone: 'success' });
      setDeleting(null);
      refreshPolicies();
    },
    onError: (error) =>
      toast.show({
        title: 'The policy could not be deleted.',
        message: error instanceof Error ? error.message : undefined,
        tone: 'error',
      }),
  });

  const openPolicyDialog = (copyOf?: PatchPolicy) => {
    setPolicyDraft({
      name: copyOf ? `${copyOf.name} (copy)` : '',
      content: copyOf?.content ?? '',
      copyOf: copyOf?.id ?? '',
    });
    setPolicyDialog(true);
  };
  const [osChart, setOsChart] = useState('bar');
  const [sevChart, setSevChart] = useState('donut');
  const [ageChart, setAgeChart] = useState('column');

  const approve = useMutation({
    mutationFn: ({ id, approval }: { id: string; approval: string }) =>
      api.put<Patch>(`/patches/${segment(id)}/approval`, { approval }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['/patches'] });
      void queryClient.invalidateQueries({ queryKey: ['/patches/summary'] });
    },
  });

  const columns = useMemo(
    () => buildColumns(tab, canDeploy, (id, approval) => approve.mutate({ id, approval })),
    // `approve.mutate` is stable for the life of the mutation, so the columns
    // are rebuilt only when the tab or the caller's permission changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tab, canDeploy],
  );
  const defaultView = useMemo(() => buildDefaultView(columns), [columns]);
  // Column layout is per tab: the tabs do not share a column set, so one
  // stored view would be applied to columns it was never built for.
  const [views, setViews] = useState<Record<string, TableView>>({});
  const shownView = views[tab] ?? defaultView;

  if (summary.error) {
    return (
      <ErrorState
        description="Patch figures could not be loaded."
        onRetry={() => void summary.refetch()}
      />
    );
  }

  const data = summary.data;

  // The header counts updates, not devices: it offers to patch the critical
  // updates, and the same update on 1,600 endpoints is still one update.
  const criticalCount = data?.criticalUpdates ?? 0;

  return (
    <div className={styles.page}>
      <div className={styles.heading}>
        <div>
          <p className={styles.eyebrow}>Aegis One / Endpoint Management</p>
          <h1 className={styles.title}>Patch Management</h1>
          <p className={styles.subtitle}>Missing updates, compliance and patch deployment.</p>
        </div>
        <div className={styles.actions}>
          <Button onClick={() => goTab('policies')}>Patch Policies</Button>
          <Button
            variant="primary"
            disabled={!canDeploy}
            onClick={() => void navigate('/deployments/new?kind=deploy-patches&severity=critical')}
          >
            + Patch critical ({num(criticalCount)})
          </Button>
        </div>
      </div>

      <div className={styles.tabs} role="tablist" aria-label="Patch management sections">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={t.id === tab}
            className={t.id === tab ? styles.tabOn : styles.tab}
            onClick={() => goTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {!data ? (
        <div className={styles.kpis}>
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className={styles.kpiSkeleton} />
          ))}
        </div>
      ) : tab === 'overview' ? (
        <OverviewTab
          data={data}
          osChart={osChart}
          onOsChart={setOsChart}
          sevChart={sevChart}
          onSevChart={setSevChart}
          ageChart={ageChart}
          onAgeChart={setAgeChart}
          onAllPatches={() => goTab('all')}
        />
      ) : tab === 'policies' ? (
        <PoliciesTab
          data={data}
          rows={policies.data ?? []}
          loading={policies.isLoading}
          pane={policyPane}
          onPane={setPolicyPane}
          search={policySearch}
          onSearch={setPolicySearch}
          status={policyStatus}
          onStatus={setPolicyStatus}
          canEdit={canDeploy}
          onNew={() => openPolicyDialog()}
          onOpen={setOpened}
          onCopy={(policy) => openPolicyDialog(policy)}
          onDelete={setDeleting}
          onStatusChange={(policy, status) => changePolicyStatus.mutate({ policy, status })}
        />
      ) : (
        <>
          <GridKpis tab={tab} data={data} />

          {tab === 'windows' || tab === 'linux' ? (
            <OsVersionChips
              data={data}
              platform={tab}
              value={controller.filters['osVersion'] ?? ''}
              onChange={(value) => controller.setFilter('osVersion', value || undefined)}
            />
          ) : null}

          {tab === 'drivers' ? (
            <DriverChips
              value={controller.filters['subcategory'] ?? ''}
              awaiting={controller.filters['approval'] === 'review'}
              counts={data.tabs.driversBios}
              onPick={(key) => {
                controller.setFilter(
                  'subcategory',
                  key === 'bios' || key === 'driver' ? key : undefined,
                );
                controller.setFilter('approval', key === 'awaiting' ? 'review' : undefined);
              }}
            />
          ) : null}

          <section className={styles.cardFill}>
            <header className={styles.cardHead}>
              <h2 className={styles.cardTitle}>{grid?.heading}</h2>

              <div className={styles.segments} role="group" aria-label="Severity">
                {SEVERITIES.map((s) => {
                  const on = (controller.filters['severity'] ?? '') === s.value;
                  return (
                    <button
                      key={s.value || 'all'}
                      type="button"
                      aria-pressed={on}
                      className={on ? styles.segOn : styles.seg}
                      onClick={() => controller.setFilter('severity', s.value || undefined)}
                    >
                      {s.label}
                    </button>
                  );
                })}
              </div>

              <div className={styles.filters}>
                <div className={styles.filter}>
                  <span id="pt-vendor">Vendor</span>
                  <Select
                    aria-labelledby="pt-vendor"
                    placeholder="All"
                    options={data.vendors.map((v) => ({ value: v, label: v }))}
                    value={controller.filters['vendor'] ?? ''}
                    onChange={(e) => controller.setFilter('vendor', e.target.value || undefined)}
                  />
                </div>
                {tab === 'all' ? (
                  <div className={styles.filter}>
                    <span id="pt-type">Type</span>
                    <Select
                      aria-labelledby="pt-type"
                      placeholder="All"
                      options={TYPE_OPTIONS}
                      value={controller.filters['category'] ?? ''}
                      onChange={(e) =>
                        controller.setFilter('category', e.target.value || undefined)
                      }
                    />
                  </div>
                ) : null}
                <div className={styles.filter}>
                  <span id="pt-released">Released</span>
                  <Select
                    aria-labelledby="pt-released"
                    placeholder="Any Time"
                    options={RELEASED_WINDOWS}
                    value={released}
                    onChange={(e) => {
                      setReleased(e.target.value);
                      controller.setFilter(
                        'releasedAfter',
                        e.target.value ? sinceDays(Number(e.target.value)) : undefined,
                      );
                    }}
                  />
                </div>
              </div>
            </header>

            <DataTable
              label={grid?.heading ?? 'Patches'}
              columns={columns}
              rows={controller.rows}
              getRowId={(p) => p.id}
              sort={controller.sort}
              onSortChange={controller.setSort}
              view={shownView}
              onViewChange={(next) => setViews((all) => ({ ...all, [tab]: next }))}
              loading={controller.loading}
              error={controller.error}
              selectable
              totalMatching={controller.total}
              rowClassName={(p) => (p.approval === 'superseded' ? styles.stale : undefined)}
              emptyTitle="No updates match these filters"
              emptyDescription="Try a different severity, vendor or release window."
              className={styles.table}
              footer={
                <Pagination
                  from={controller.from}
                  to={controller.to}
                  total={controller.total}
                  unit="updates"
                  pageSize={controller.pageSize}
                  onPageSizeChange={controller.setPageSize}
                  hasNext={controller.hasNext}
                  hasPrevious={controller.hasPrevious}
                  onNext={controller.next}
                  onPrevious={controller.previous}
                />
              }
            />
          </section>
        </>
      )}

      {data ? (
        <div className={styles.footnote}>
          <span>
            Aegis One <i>/</i> Patch Management
          </span>
          <span>
            {num(data.installed)} installed · {num(data.missing)} missing · catalogue of{' '}
            {num(data.tabs.all.total)} updates
          </span>
        </div>
      ) : null}

      <Modal
        open={policyDialog}
        onClose={() => setPolicyDialog(false)}
        title={policyDraft.copyOf ? 'Copy policy' : 'New patch policy'}
        description="A policy starts suspended and covers nothing until it runs. Give it a name and what it should cover."
        footer={
          <>
            <Button onClick={() => setPolicyDialog(false)}>Cancel</Button>
            <Button
              variant="primary"
              loading={createPolicy.isPending}
              disabled={!policyDraft.name.trim()}
              onClick={() => createPolicy.mutate()}
            >
              Create policy
            </Button>
          </>
        }
      >
        <Field label="Name" required>
          {(field) => (
            <Input
              {...field}
              maxLength={120}
              placeholder="Windows Monthly Security"
              value={policyDraft.name}
              onChange={(e) => setPolicyDraft({ ...policyDraft, name: e.target.value })}
            />
          )}
        </Field>
        <Field
          label="Content"
          hint="Platform, source and severities — for example Windows OS Critical/High."
        >
          {(field) => (
            <Input
              {...field}
              maxLength={200}
              placeholder="Windows · OS · Critical/High"
              value={policyDraft.content}
              onChange={(e) => setPolicyDraft({ ...policyDraft, content: e.target.value })}
            />
          )}
        </Field>
      </Modal>

      <Modal
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title={`Delete ${deleting?.name ?? ''}?`}
        description="The policy and its schedule are removed. Patches it has already installed stay installed."
        footer={
          <>
            <Button onClick={() => setDeleting(null)}>Cancel</Button>
            <Button
              variant="danger"
              loading={deletePolicy.isPending}
              onClick={() => deleting && deletePolicy.mutate(deleting)}
            >
              Delete policy
            </Button>
          </>
        }
      >
        {deleting ? (
          <p>
            It covers {num(deleting.computers)} computers and is {deleting.status}.
          </p>
        ) : null}
      </Modal>

      <Modal
        open={opened !== null}
        onClose={() => setOpened(null)}
        title={opened?.name ?? ''}
        description="Read from the policy's own record."
        footer={<Button onClick={() => setOpened(null)}>Close</Button>}
      >
        {openedDetail.data ? (
          <dl className={styles.policyDetail}>
            <div>
              <dt>Content</dt>
              <dd>{openedDetail.data.content}</dd>
            </div>
            <div>
              <dt>Rollout</dt>
              <dd>
                {openedDetail.data.rollout.length === 0
                  ? 'All Computers'
                  : openedDetail.data.rollout.map(capitalise).join(' → ')}
              </dd>
            </div>
            <div>
              <dt>Schedule</dt>
              <dd>{openedDetail.data.schedule}</dd>
            </div>
            <div>
              <dt>Computers</dt>
              <dd>{num(openedDetail.data.computers)}</dd>
            </div>
            <div>
              <dt>Compliance</dt>
              <dd>{openedDetail.data.compliancePct}%</dd>
            </div>
            <div>
              <dt>Next run</dt>
              <dd>
                {openedDetail.data.nextRunAt
                  ? dateTime(openedDetail.data.nextRunAt)
                  : 'Not scheduled'}
              </dd>
            </div>
          </dl>
        ) : (
          <Skeleton className={styles.rowSkeleton} />
        )}
      </Modal>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Overview tab                                                       */
/* ------------------------------------------------------------------ */

function OverviewTab({
  data,
  osChart,
  onOsChart,
  sevChart,
  onSevChart,
  ageChart,
  onAgeChart,
  onAllPatches,
}: {
  data: PatchSummary;
  osChart: string;
  onOsChart: (v: string) => void;
  sevChart: string;
  onSevChart: (v: string) => void;
  ageChart: string;
  onAgeChart: (v: string) => void;
  onAllPatches: () => void;
}) {
  const navigate = useNavigate();

  const osSeries = {
    caption: 'Patch compliance per OS version, as a percentage',
    data: data.byOsVersion.map((row) => ({
      key: row.label,
      label: row.label,
      value: row.compliantPct,
      tone: bandTone(row.compliantPct),
    })),
  };

  const sevSeries = {
    caption: 'Outstanding updates by severity',
    data: (
      [
        ['critical', 'Critical', data.bySeverity.critical],
        ['high', 'High', data.bySeverity.high],
        ['medium', 'Medium', data.bySeverity.medium],
        ['low', 'Low', data.bySeverity.low],
      ] as const
    ).map(([key, label, value]) => ({
      key,
      label,
      value,
      tone: SEVERITY_TONE[key] ?? 'neutral',
    })),
  };

  const ageSeries: { caption: string; data: Datum[] } = {
    caption: 'Outstanding updates by days since release',
    data: data.byAge.map((row, i) => ({
      key: row.bucket,
      label: row.bucket,
      value: row.count,
      // Older is worse, so the buckets darken from left to right.
      tone: (['good', 'info', 'alt', 'warn', 'bad'] as const)[i] ?? 'neutral',
    })),
  };

  return (
    <>
      <div className={styles.kpis}>
        <Kpi
          active
          label="Patch Compliance"
          value={String(data.compliancePct)}
          unit="%"
          sub={`${num(data.installed)} installed · ${num(data.missing)} missing`}
        />
        <Kpi
          label="Devices Missing Patches"
          value={num(data.devicesMissing)}
          unit={`/ ${num(data.devicesTotal)}`}
          sub={`${num(data.devicesTotal - data.devicesMissing)} fully patched`}
        />
        <Kpi
          label="Missing Critical"
          value={num(data.bySeverity.critical)}
          sub={`${num(data.criticalDevices)} devices`}
          tone={data.bySeverity.critical > 0 ? 'bad' : 'good'}
        />
        <Kpi
          label="Average Patch Age"
          value={String(data.averageAgeDays)}
          unit="days"
          sub={`${num(data.devicesAwaitingRestart)} devices waiting for restart`}
        />
      </div>

      <div className={styles.charts}>
        <Panel
          title="Compliance by OS Version"
          wide
          chart={osChart}
          onChart={onOsChart}
          options={[
            { value: 'bar', label: 'Bar' },
            { value: 'column', label: 'Column' },
          ]}
        >
          {osChart === 'column' ? (
            <Columns {...osSeries} suffix="%" />
          ) : (
            <Bars {...osSeries} suffix="%" />
          )}
        </Panel>

        <Panel
          title="Missing by Severity"
          chart={sevChart}
          onChart={onSevChart}
          options={[
            { value: 'donut', label: 'Donut' },
            { value: 'pie', label: 'Pie' },
            { value: 'column', label: 'Column' },
            { value: 'bar', label: 'Bar' },
          ]}
        >
          {sevChart === 'donut' || sevChart === 'pie' ? (
            <Donut
              {...sevSeries}
              stack
              pie={sevChart === 'pie'}
              centreValue={num(data.missing)}
              centreLabel="missing"
            />
          ) : sevChart === 'bar' ? (
            <Bars {...sevSeries} suffix="" max={0} />
          ) : (
            <Columns {...sevSeries} suffix="" max={maxOf(sevSeries.data)} />
          )}
        </Panel>

        <Panel
          title="Missing Patch Age"
          chart={ageChart}
          onChart={onAgeChart}
          options={[
            { value: 'column', label: 'Column' },
            { value: 'bar', label: 'Bar' },
            { value: 'donut', label: 'Donut' },
          ]}
        >
          {ageChart === 'donut' ? (
            <Donut {...ageSeries} stack centreValue={num(data.missing)} centreLabel="missing" />
          ) : ageChart === 'bar' ? (
            <Bars {...ageSeries} suffix="" max={0} />
          ) : (
            <Columns {...ageSeries} suffix="" max={maxOf(ageSeries.data)} />
          )}
        </Panel>
      </div>

      <div className={styles.tables}>
        <section className={styles.card}>
          <header className={styles.cardHead}>
            <h2 className={styles.cardTitle}>Top Missing Patches</h2>
            <button type="button" className={styles.cardLink} onClick={onAllPatches}>
              All Patches →
            </button>
          </header>
          <table className={styles.mini}>
            <thead>
              <tr>
                <th scope="col">Patch</th>
                <th scope="col">Severity</th>
                <th scope="col" className={styles.right}>
                  Devices
                </th>
              </tr>
            </thead>
            <tbody>
              {data.topMissing.map((p) => (
                <tr key={p.id}>
                  <th scope="row">
                    <b>{p.title}</b>
                    <small>
                      {p.kb ?? p.id} · {PLATFORM_LABEL[p.platform] ?? p.platform}
                    </small>
                  </th>
                  <td>
                    <span className={SEVERITY_CLASS[p.severity]}>
                      <i aria-hidden="true" />
                      {capitalise(p.severity)}
                    </span>
                  </td>
                  <td className={styles.right}>
                    <b>{num(p.endpointsMissing)}</b>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className={styles.card}>
          <header className={styles.cardHead}>
            <h2 className={styles.cardTitle}>Devices Needing Attention</h2>
          </header>
          <table className={styles.mini}>
            <thead>
              <tr>
                <th scope="col">Device</th>
                <th scope="col">OS Version</th>
                <th scope="col" className={styles.right}>
                  Critical
                </th>
                <th scope="col" className={styles.right}>
                  Missing
                </th>
              </tr>
            </thead>
            <tbody>
              {data.devicesNeedingAttention.map((d) => (
                <tr key={d.deviceId}>
                  <th scope="row">
                    <button
                      type="button"
                      className={styles.deviceLink}
                      onClick={() => void navigate(`/devices/${segment(d.deviceId)}`)}
                    >
                      {d.name}
                    </button>
                  </th>
                  <td>{d.osVersion}</td>
                  <td className={styles.right}>
                    {d.critical > 0 ? <b className={styles.bad}>{d.critical}</b> : '0'}
                  </td>
                  <td className={styles.right}>{num(d.missing)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Patch Policies tab                                                 */
/* ------------------------------------------------------------------ */

function PoliciesTab({
  data,
  rows,
  loading,
  pane,
  onPane,
  search,
  onSearch,
  status,
  onStatus,
  canEdit,
  onNew,
  onOpen,
  onCopy,
  onDelete,
  onStatusChange,
}: {
  data: PatchSummary;
  rows: readonly PatchPolicy[];
  loading: boolean;
  pane: 'policies' | 'settings';
  onPane: (p: 'policies' | 'settings') => void;
  search: string;
  onSearch: (v: string) => void;
  status: string;
  onStatus: (v: string) => void;
  canEdit: boolean;
  onNew: () => void;
  onOpen: (policy: PatchPolicy) => void;
  onCopy: (policy: PatchPolicy) => void;
  onDelete: (policy: PatchPolicy) => void;
  onStatusChange: (policy: PatchPolicy, status: 'active' | 'suspended') => void;
}) {
  const term = search.trim().toLowerCase();
  const shown = rows.filter(
    (p) =>
      (!term || p.name.toLowerCase().includes(term) || p.content.toLowerCase().includes(term)) &&
      (!status || p.status === status),
  );

  return (
    <>
      <div className={styles.subtabs} role="tablist" aria-label="Patch policy sections">
        <button
          type="button"
          role="tab"
          aria-selected={pane === 'policies'}
          className={pane === 'policies' ? styles.subtabOn : styles.subtab}
          onClick={() => onPane('policies')}
        >
          Patch Policies
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={pane === 'settings'}
          className={pane === 'settings' ? styles.subtabOn : styles.subtab}
          onClick={() => onPane('settings')}
        >
          Global Settings
        </button>
      </div>

      <div className={styles.kpis}>
        <Kpi
          active
          label="Active Policies"
          value={String(data.policies.active)}
          unit={`/ ${data.policies.total}`}
          sub=""
        />
        <Kpi
          label="Computers Covered"
          value={num(data.policies.computersCovered)}
          unit={`/ ${num(data.policies.computersTotal)}`}
          sub=""
        />
        <Kpi
          label="Not Covered"
          value={num(data.policies.computersTotal - data.policies.computersCovered)}
          sub=""
        />
        <Kpi
          label="Highly Vulnerable"
          value={num(data.policies.highlyVulnerable)}
          sub=""
          tone="bad"
        />
      </div>

      {pane === 'settings' ? (
        <PatchGlobalSettings canEdit={canEdit} />
      ) : (
        <section className={styles.card}>
          <header className={styles.policyBar}>
            <Input
              aria-label="Search policies"
              placeholder="Search policies"
              value={search}
              onChange={(e) => onSearch(e.target.value)}
            />
            <div className={styles.filter}>
              <span id="pt-status">Status</span>
              <Select
                aria-labelledby="pt-status"
                placeholder="All"
                options={[
                  { value: 'active', label: 'Active' },
                  { value: 'suspended', label: 'Suspended' },
                  { value: 'draft', label: 'Draft' },
                ]}
                value={status}
                onChange={(e) => onStatus(e.target.value)}
              />
            </div>
            <span className={styles.spacer} />
            <Button variant="primary" disabled={!canEdit} onClick={() => onNew()}>
              + New Policy
            </Button>
          </header>

          <table className={styles.policies}>
            <thead>
              <tr>
                <th scope="col">Policy</th>
                <th scope="col">Content</th>
                <th scope="col">Rollout</th>
                <th scope="col" className={styles.right}>
                  Computers
                </th>
                <th scope="col" className={styles.right}>
                  Compliance
                </th>
                <th scope="col">Next Run</th>
                <th scope="col">Status</th>
                <th scope="col">
                  <span className={styles.srOnly}>Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8}>
                    <Skeleton className={styles.rowSkeleton} />
                  </td>
                </tr>
              ) : shown.length === 0 ? (
                <tr>
                  <td colSpan={8} className={styles.notYet}>
                    No policy matches that search.
                  </td>
                </tr>
              ) : (
                shown.map((p) => (
                  <tr key={p.id}>
                    <th scope="row">
                      <b>{p.name}</b>
                      <small>{p.schedule}</small>
                    </th>
                    <td>
                      <b>{num(p.patchCount)} patches</b>
                      <small>{p.content}</small>
                    </td>
                    <td>
                      <span className={styles.rings}>
                        {p.rollout.length === 0 ? (
                          <i className={styles.ring}>All Computers</i>
                        ) : (
                          p.rollout.map((r) => (
                            <i key={r} className={styles.ring}>
                              {capitalise(r)}
                            </i>
                          ))
                        )}
                      </span>
                    </td>
                    <td className={styles.right}>{num(p.computers)}</td>
                    <td className={styles.right}>
                      <b className={p.compliancePct >= 85 ? styles.good : styles.bad}>
                        {p.compliancePct}%
                      </b>
                    </td>
                    <td>{p.nextRunAt ? dateTime(p.nextRunAt) : '—'}</td>
                    <td>
                      <span className={p.status === 'active' ? styles.apApproved : styles.apReview}>
                        {capitalise(p.status)}
                      </span>
                    </td>
                    <td className={styles.policyActions}>
                      <Button size="sm" disabled={!canEdit} onClick={() => onOpen(p)}>
                        Open
                      </Button>
                      <Menu
                        label={`More actions for ${p.name}`}
                        items={[
                          {
                            id: 'status',
                            label: p.status === 'active' ? 'Suspend' : 'Resume',
                            disabled: !canEdit,
                            onSelect: () =>
                              onStatusChange(p, p.status === 'active' ? 'suspended' : 'active'),
                          },
                          {
                            id: 'copy',
                            label: 'Copy',
                            disabled: !canEdit,
                            onSelect: () => onCopy(p),
                          },
                          {
                            id: 'delete',
                            label: 'Delete',
                            // An active policy is deploying right now; the
                            // server refuses, so the menu says so first.
                            disabled: !canEdit || p.status === 'active',
                            onSelect: () => onDelete(p),
                          },
                        ]}
                      >
                        {(trigger) => (
                          <Button size="sm" {...trigger}>
                            ⋯
                          </Button>
                        )}
                      </Menu>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </section>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Catalogue tabs                                                     */
/* ------------------------------------------------------------------ */

function GridKpis({ tab, data }: { tab: TabId; data: PatchSummary }) {
  if (tab === 'drivers') {
    const d = data.tabs.driversBios;
    return (
      <div className={styles.kpis}>
        <Kpi
          active
          label="Endpoints Needing Updates"
          value={num(d.endpointsNeeding)}
          unit={`/ ${num(d.endpointsTotal)}`}
          sub=""
        />
        <Kpi label="BIOS & Firmware" value={num(d.bios)} sub="" />
        <Kpi label="Drivers" value={num(d.drivers)} sub="" />
        <Kpi label="Awaiting Approval" value={num(d.awaitingApproval)} sub="" tone="warn" />
      </div>
    );
  }

  if (tab === 'all') {
    const a = data.tabs.all;
    return (
      <div className={styles.kpis7}>
        <Kpi active label="All Patches" value={num(a.total)} sub="" />
        <Kpi label="Applicable" value={num(a.applicable)} sub="" />
        <Kpi label="Remediated" value={num(a.remediated)} sub="" tone="good" />
        <Kpi label="Failed Patches" value={num(a.failed)} sub="" tone="bad" />
        <Kpi label="Declined Patches" value={num(a.declined)} sub="" />
        <Kpi label="Superseded Patches" value={num(a.superseded)} sub="" />
        <Kpi label="Zero-Day CVEs" value={num(a.zeroDayCves)} sub="" tone="bad" />
      </div>
    );
  }

  const key = tab === 'third-party' ? 'third-party' : tab;
  const stats = data.tabs.platforms.find((p) => p.key === key);
  if (!stats) return null;
  const label = tab === 'third-party' ? 'Third-Party' : (PLATFORM_LABEL[tab] ?? tab);

  return (
    <div className={styles.kpis}>
      <Kpi
        active
        label={`${label} Compliance`}
        value={String(stats.compliancePct)}
        unit="%"
        sub=""
      />
      <Kpi
        label="Endpoints Missing Updates"
        value={num(stats.endpointsMissing)}
        unit={`/ ${num(stats.endpointsTotal)}`}
        sub=""
      />
      <Kpi
        label="Critical Updates"
        value={num(stats.criticalUpdates)}
        sub=""
        tone={stats.criticalUpdates > 0 ? 'bad' : 'good'}
      />
      <Kpi
        label="Updates Available"
        value={num(stats.updatesAvailable)}
        unit={`· ${num(stats.updatesMissing)} missing`}
        sub=""
      />
    </div>
  );
}

function OsVersionChips({
  data,
  platform,
  value,
  onChange,
}: {
  data: PatchSummary;
  platform: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const rows = data.byOsVersion.filter((r) => r.platform === platform);
  if (rows.length === 0) return null;
  const total = rows.reduce((sum, r) => sum + r.endpoints, 0);
  const label = platform === 'windows' ? 'All Windows' : 'All Linux';

  return (
    <div className={styles.chips}>
      <span className={styles.chipsLabel}>OS Version</span>
      <button
        type="button"
        aria-pressed={value === ''}
        className={value === '' ? styles.chipOn : styles.chip}
        onClick={() => onChange('')}
      >
        {label} <b>{num(total)}</b>
      </button>
      {rows.map((r) => (
        <button
          key={r.label}
          type="button"
          aria-pressed={value === r.label}
          className={value === r.label ? styles.chipOn : styles.chip}
          onClick={() => onChange(value === r.label ? '' : r.label)}
        >
          {r.label} <b>{num(r.endpoints)}</b>
        </button>
      ))}
    </div>
  );
}

function DriverChips({
  value,
  awaiting,
  counts,
  onPick,
}: {
  value: string;
  awaiting: boolean;
  counts: PatchSummary['tabs']['driversBios'];
  onPick: (key: string) => void;
}) {
  const items = [
    { key: '', label: 'All', count: counts.bios + counts.drivers, on: !value && !awaiting },
    { key: 'bios', label: 'BIOS & Firmware', count: counts.bios, on: value === 'bios' },
    { key: 'driver', label: 'Drivers', count: counts.drivers, on: value === 'driver' },
    {
      key: 'awaiting',
      label: 'Awaiting Approval',
      count: counts.awaitingApproval,
      on: awaiting,
    },
  ];
  return (
    <div className={styles.chips}>
      <span className={styles.chipsLabel}>Drivers &amp; BIOS</span>
      {items.map((item) => (
        <button
          key={item.key || 'all'}
          type="button"
          aria-pressed={item.on}
          className={item.on ? styles.chipOn : styles.chip}
          onClick={() => onPick(item.key)}
        >
          {item.label} <b>{num(item.count)}</b>
        </button>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Columns                                                            */
/* ------------------------------------------------------------------ */

function buildColumns(
  tab: TabId,
  canDeploy: boolean,
  setApproval: (id: string, approval: string) => void,
): DataTableColumn<Patch>[] {
  const update: DataTableColumn<Patch> = {
    id: 'title',
    header: 'Update',
    locked: true,
    sortable: true,
    width: 470,
    cell: (p) => (
      <span className={styles.update}>
        <b>{p.title}</b>
        <small>
          {p.kb ?? p.id} · {PLATFORM_LABEL[p.platform] ?? p.platform} · {p.source}
        </small>
      </span>
    ),
    exportValue: (p) => p.title,
  };

  const typeOrVendor: DataTableColumn<Patch> =
    tab === 'all' || tab === 'drivers'
      ? {
          id: 'category',
          header: 'Type',
          sortable: true,
          width: 130,
          cell: (p) =>
            tab === 'drivers'
              ? p.subcategory === 'bios'
                ? 'BIOS'
                : 'Driver'
              : (CATEGORY_LABEL[p.category] ?? p.category),
          exportValue: (p) => p.category,
        }
      : {
          id: 'source',
          header: 'Vendor',
          sortable: true,
          width: 150,
          cell: (p) => p.source,
          exportValue: (p) => p.source,
        };

  const rest: DataTableColumn<Patch>[] = [
    {
      id: 'severity',
      header: 'Severity',
      sortable: true,
      width: 110,
      cell: (p) => <span className={SEVERITY_CLASS[p.severity]}>{capitalise(p.severity)}</span>,
      exportValue: (p) => p.severity,
    },
    {
      id: 'releasedAt',
      header: 'Released',
      sortable: true,
      width: 110,
      cell: (p) => date(p.releasedAt),
      exportValue: (p) => p.releasedAt,
    },
    {
      id: 'endpointsMissing',
      header: 'Applicable',
      numeric: true,
      sortable: true,
      width: 110,
      cell: (p) =>
        p.endpointsMissing > 0 ? (
          <b className={styles.countLink}>{num(p.endpointsMissing)}</b>
        ) : (
          '0'
        ),
      exportValue: (p) => p.endpointsMissing,
    },
    {
      id: 'installedCount',
      header: tab === 'drivers' ? 'Installed' : 'Remediated',
      numeric: true,
      sortable: true,
      width: 120,
      cell: (p) => (p.installedCount > 0 ? num(p.installedCount) : '0'),
      exportValue: (p) => p.installedCount,
    },
    {
      id: 'approval',
      header: tab === 'drivers' ? 'Approval' : 'Approval · ring',
      sortable: true,
      width: 160,
      cell: (p) => (
        <span className={styles.approval}>
          <b className={APPROVAL_CLASS[p.approval]}>{APPROVAL_LABEL[p.approval]}</b>
          <small>
            {p.approval === 'superseded'
              ? `by ${p.supersededBy ?? '—'}`
              : p.endpointsMissing === 0
                ? 'Installed'
                : (RING_LABEL[p.ring] ?? p.ring)}
          </small>
        </span>
      ),
      exportValue: (p) => p.approval,
    },
    {
      id: 'actions',
      header: '',
      width: 130,
      cell: (p) => <RowActions patch={p} canDeploy={canDeploy} setApproval={setApproval} />,
    },
  ];

  const zeroDay: DataTableColumn<Patch> = {
    id: 'zeroDay',
    header: 'Zero-day',
    width: 110,
    defaultHidden: true,
    cell: (p) => (p.zeroDay ? 'Yes' : 'No'),
    exportValue: (p) => (p.zeroDay ? 'Yes' : 'No'),
  };

  return [update, typeOrVendor, ...rest, zeroDay];
}

function RowActions({
  patch,
  canDeploy,
  setApproval,
}: {
  patch: Patch;
  canDeploy: boolean;
  setApproval: (id: string, approval: string) => void;
}) {
  const navigate = useNavigate();
  if (patch.approval === 'superseded') return null;

  const primary =
    patch.approval === 'declined'
      ? { label: 'Approve', run: () => setApproval(patch.id, 'approved') }
      : patch.endpointsMissing > 0
        ? {
            label: 'Deploy',
            run: () =>
              void navigate(
                `/deployments/new?kind=deploy-patches&patch=${encodeURIComponent(patch.id)}`,
              ),
          }
        : { label: 'Decline', run: () => setApproval(patch.id, 'declined') };

  return (
    <div className={styles.rowActions}>
      <Button
        size="sm"
        variant={primary.label === 'Deploy' ? 'primary' : 'secondary'}
        disabled={!canDeploy}
        onClick={primary.run}
      >
        {primary.label}
      </Button>
      <Menu
        label={`Actions for ${patch.title}`}
        items={[
          {
            id: 'approve',
            label: 'Approve',
            disabled: !canDeploy || patch.approval === 'approved',
            onSelect: () => setApproval(patch.id, 'approved'),
          },
          {
            id: 'test',
            label: 'Send to test ring',
            disabled: !canDeploy || patch.approval === 'test',
            onSelect: () => setApproval(patch.id, 'test'),
          },
          {
            id: 'decline',
            label: 'Decline',
            disabled: !canDeploy || patch.approval === 'declined',
            onSelect: () => setApproval(patch.id, 'declined'),
          },
        ]}
      >
        {(trigger) => (
          <Button size="sm" {...trigger}>
            …
          </Button>
        )}
      </Menu>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Pieces                                                             */
/* ------------------------------------------------------------------ */

function Kpi({
  label,
  value,
  unit,
  sub,
  tone,
  active = false,
}: {
  label: string;
  value: string;
  unit?: string;
  sub: string;
  tone?: Tone;
  active?: boolean;
}) {
  return (
    <div className={active ? styles.kpiActive : styles.kpi}>
      <span className={styles.kpiLabel}>{label}</span>
      <span className={styles.kpiValue}>
        <strong className={tone && !active ? styles[tone] : undefined}>{value}</strong>
        {unit ? <em>{unit}</em> : null}
      </span>
      {sub ? <span className={styles.kpiSub}>{sub}</span> : null}
    </div>
  );
}

function Panel({
  title,
  chart,
  onChart,
  options,
  wide = false,
  children,
}: {
  title: string;
  chart: string;
  onChart: (v: string) => void;
  options: readonly { value: string; label: string }[];
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className={wide ? styles.panelWide : styles.panel}>
      <header className={styles.cardHead}>
        <h2 className={styles.cardTitle}>{title}</h2>
        <Select
          aria-label={`${title} chart type`}
          options={options}
          value={chart}
          onChange={(e) => onChart(e.target.value)}
        />
      </header>
      <div className={styles.panelBody}>{children}</div>
    </section>
  );
}

const capitalise = (value: string): string => value.charAt(0).toUpperCase() + value.slice(1);

const maxOf = (data: readonly Datum[]): number => Math.max(1, ...data.map((d) => d.value));

const sinceDays = (days: number): string =>
  new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
