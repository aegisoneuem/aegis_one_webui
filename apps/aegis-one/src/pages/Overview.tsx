import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Button, ErrorState, Select, Skeleton } from '@aegis/ui';
import { useResource } from '../app/useListController';
import { ApiError, api } from '../api/client';
import { dateTime, num, relative } from '../app/format';
import { segment } from '../app/safeNavigate';
import { Bars, Columns, Donut, Rings, bandTone } from './shared/Figures';
import type { Datum, RingDatum, Tone } from './shared/Figures';
import type { AttentionItem, Overview as OverviewData, ZoneList } from '../api/types';
import styles from './Overview.module.css';

/**
 * The landing page, restored to the approved v129 layout: a scope bar, five
 * KPIs, and six widgets in three rows.
 *
 * Every figure comes from one aggregate call, computed in SQL. Counting 50,000
 * rows in the browser is what the performance budget exists to prevent — and
 * every widget here reads a field the contract declares, so nothing on screen
 * is derived from a guess about what the real backend will send.
 */

/** v129's chart-type menus, per widget. */
const CHART_TYPES = {
  columnar: [
    { value: 'column', label: 'Column' },
    { value: 'bar', label: 'Bar' },
  ],
  circular: [
    { value: 'donut', label: 'Donut' },
    { value: 'pie', label: 'Pie' },
    { value: 'column', label: 'Column' },
    { value: 'bar', label: 'Bar' },
  ],
  rings: [
    { value: 'rings', label: 'Rings' },
    { value: 'column', label: 'Column' },
    { value: 'bar', label: 'Bar' },
  ],
} as const;

const PLATFORMS = [
  { value: 'windows', label: 'Windows' },
  { value: 'macos', label: 'macOS' },
  { value: 'linux', label: 'Linux' },
  { value: 'aix', label: 'AIX' },
];

/**
 * The department list the Overview filters by.
 *
 * The contract has no facet endpoint, so this is the console's own list rather
 * than something the server told it. The real backend should expose the
 * distinct departments; see docs/handover-backend.md.
 */
const DEPARTMENTS = [
  'Customer Support',
  'Engineering',
  'Field Operations',
  'Finance',
  'Human Resources',
  'IT Infrastructure',
  'Legal & Compliance',
  'Logistics',
  'Manufacturing',
  'Sales',
].map((d) => ({ value: d, label: d }));

const OS_LABEL: Record<string, string> = {
  windows: 'Windows',
  macos: 'macOS',
  linux: 'Linux',
  aix: 'AIX',
};

const CONTROL_LABEL: Record<string, string> = {
  'disk-encryption': 'Disk Encryption',
  antivirus: 'Antivirus',
  firewall: 'Firewall',
};

const SEVERITY_TONE: Record<AttentionItem['severity'], Tone> = {
  high: 'bad',
  medium: 'warn',
  low: 'neutral',
};

/** Where each Needs Attention row leads, by the id the server gives it. */
const ATTENTION_LINK: Record<string, string> = {
  'antivirus-missing': '/devices?antivirus=0',
  'not-encrypted': '/devices?encrypted=0',
  'high-risk': '/vulns?severity=critical',
  'deployment-failed': '/deployments?status=failed',
  'end-of-support-os': '/devices?eol=1',
  'firewall-off': '/devices?firewall=0',
  'not-seen': '/devices?status=offline',
  'low-disk': '/dex',
};

/** Protection target for the security controls, as the reference prints it. */
const PROTECTION_TARGET = 95;

export default function Overview() {
  const navigate = useNavigate();

  /*
   * The scope lives in the query string, so a narrowed dashboard is a link
   * someone can send — "the estate, Bengaluru only" is a thing people pass
   * around in a ticket. The reference keeps it in memory; this console puts
   * filters in the URL everywhere else, and section D of the brief asks for
   * the same here.
   */
  const [params, setParams] = useSearchParams();
  const zone = params.get('zone') ?? '';
  const platform = params.get('platform') ?? '';
  const department = params.get('department') ?? '';
  const scoped = zone !== '' || platform !== '' || department !== '';

  const setScope = (key: 'zone' | 'platform' | 'department', value: string): void => {
    const next = new URLSearchParams(params);
    if (value === '') next.delete(key);
    else next.set(key, value);
    setParams(next, { replace: true });
  };

  const query = new URLSearchParams();
  if (zone) query.set('zone', zone);
  if (platform) query.set('platform', platform);
  if (department) query.set('department', department);
  const path = query.size ? `/overview?${query.toString()}` : '/overview';

  const { data, isLoading, error, refetch, isFetching } = useResource<OverviewData>(path);

  // The zone list for the scope select. It carries delivery figures this page
  // has no use for, but there are nine zones, so narrowing it would cost more
  // than it saves.
  const { data: zones } = useQuery({
    queryKey: ['/zones', 'overview'],
    queryFn: ({ signal }) => api.get<ZoneList>('/zones', undefined, signal),
  });

  // Per-widget view and chart-type choices. They are the page's own state
  // rather than the saved layout: /overview/layout is declared in the contract
  // but not yet served, so persisting them would be inventing behaviour.
  const [healthView, setHealthView] = useState('measures');
  const [healthChart, setHealthChart] = useState('column');
  const [patchView, setPatchView] = useState('devices');
  const [patchChart, setPatchChart] = useState('donut');
  const [postureView, setPostureView] = useState('all');
  const [postureChart, setPostureChart] = useState('rings');
  const [deployChart, setDeployChart] = useState('donut');
  const [showAllAttention, setShowAllAttention] = useState(false);

  const zoneOptions = useMemo(
    () => (zones?.items ?? []).map((z) => ({ value: z.id, label: z.name })),
    [zones],
  );

  if (error) {
    return (
      <ErrorState
        description="The estate summary could not be loaded."
        {...(error instanceof ApiError ? { detail: `Request ${error.requestId}` } : {})}
        onRetry={() => void refetch()}
      />
    );
  }

  if (isLoading || !data) {
    return (
      <div className={styles.page}>
        <div className={styles.heading}>
          <div>
            <p className={styles.eyebrow}>Aegis One / Endpoint Management</p>
            <h1 className={styles.title}>Overview</h1>
          </div>
        </div>
        <div className={styles.kpis}>
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className={styles.kpiSkeleton} />
          ))}
        </div>
        <div className={styles.row2}>
          <Skeleton className={styles.panelSkeleton} />
          <Skeleton className={styles.panelSkeleton} />
        </div>
      </div>
    );
  }

  const { counts, health, patchCompliance, securityPosture, deploymentStatus } = data;
  const onlinePct = counts.managedEndpoints
    ? Math.round((counts.online / counts.managedEndpoints) * 100)
    : 0;

  const go = (to: string) => () => void navigate(to);

  /* ---------------------------------------------------------------- */
  /* Overall Health Score                                             */
  /* ---------------------------------------------------------------- */

  const HEALTHY = 85;
  const healthData: Datum[] = health.measures.map((m) => ({
    key: m.id,
    label: m.label,
    value: healthView === 'gap' ? Math.max(0, HEALTHY - m.score) : m.score,
    tone:
      healthView === 'gap' ? (m.score >= HEALTHY ? 'good' : bandTone(m.score)) : bandTone(m.score),
    note: `weight ${Math.round(m.weight * 100)}%`,
  }));

  const healthSeries = {
    caption:
      healthView === 'gap'
        ? 'Points below Healthy, per measure'
        : 'Health score per measure, 0–100',
    data: healthData,
  };

  // Which measures are pulling the score up: the ones already clear of the
  // Healthy threshold, best first.
  const gains = [...health.measures]
    .filter((m) => m.score >= HEALTHY)
    .sort((a, b) => b.score - a.score)
    .slice(0, 2);

  const measurePage: Record<string, string> = {
    patching: '/patches',
    'security-posture': '/vulns',
    'agent-health': '/devices',
    experience: '/dex',
    'content-delivery': '/peercache',
  };

  /* ---------------------------------------------------------------- */
  /* Patch Compliance                                                 */
  /* ---------------------------------------------------------------- */

  const patchSeries = (() => {
    switch (patchView) {
      case 'severity':
        return {
          caption: 'Missing patches by severity',
          data: [
            {
              key: 'critical',
              label: 'Critical',
              value: patchCompliance.missingBySeverity.critical,
              tone: 'bad' as Tone,
            },
            {
              key: 'high',
              label: 'High',
              value: patchCompliance.missingBySeverity.high,
              tone: 'bad' as Tone,
            },
            {
              key: 'medium',
              label: 'Medium',
              value: patchCompliance.missingBySeverity.medium,
              tone: 'warn' as Tone,
            },
            {
              key: 'low',
              label: 'Low',
              value: patchCompliance.missingBySeverity.low,
              tone: 'neutral' as Tone,
            },
          ],
        };
      case 'install':
        return {
          caption: 'Last install result',
          data: [
            {
              key: 'successful',
              label: 'Successful',
              value: patchCompliance.lastInstall.successful,
              tone: 'good' as Tone,
            },
            {
              key: 'restart',
              label: 'Restart Needed',
              value: patchCompliance.lastInstall.restartNeeded,
              tone: 'warn' as Tone,
            },
            {
              key: 'pending',
              label: 'Pending',
              value: patchCompliance.lastInstall.pending,
              tone: 'info' as Tone,
            },
            {
              key: 'failed',
              label: 'Failed',
              value: patchCompliance.lastInstall.failed,
              tone: 'bad' as Tone,
            },
          ],
        };
      case 'os':
        return {
          caption: 'Compliance by OS family',
          data: patchCompliance.byOs.map((row) => ({
            key: row.family,
            label: OS_LABEL[row.family] ?? row.family,
            value: row.compliantPct,
            tone: bandTone(row.compliantPct),
          })),
        };
      default:
        return {
          caption: 'Device compliance',
          data: [
            {
              key: 'compliant',
              label: 'Compliant',
              value: patchCompliance.compliant,
              tone: 'good' as Tone,
            },
            {
              key: 'non-compliant',
              label: 'Non-compliant',
              value: patchCompliance.nonCompliant,
              tone: 'bad' as Tone,
            },
          ],
        };
    }
  })();

  const patchUnit =
    patchView === 'os' ? 'Percent of devices fully patched per OS family' : 'Devices';

  /* ---------------------------------------------------------------- */
  /* Security Posture                                                 */
  /* ---------------------------------------------------------------- */

  const postureControls = securityPosture.filter(
    (c) => postureView === 'all' || c.control === postureView,
  );

  const postureRings: RingDatum[] = postureControls.map((c) => {
    const pctProtected = c.total ? Math.round((c.protected / c.total) * 100) : 0;
    const gap = PROTECTION_TARGET - pctProtected;
    return {
      key: c.control,
      label: CONTROL_LABEL[c.control] ?? c.control,
      value: pctProtected,
      tone: bandTone(pctProtected),
      sub: `${num(c.protected)} of ${num(c.total)} protected`,
      pill: gap > 0 ? `${gap} pts to target` : 'At target',
      pillTone: gap > 0 ? ('warn' as Tone) : ('good' as Tone),
    };
  });

  const postureSeries = {
    caption: 'Endpoints protected per control, as a percentage',
    data: postureRings.map(({ key, label, value, tone }) => ({ key, label, value, tone })),
  };

  /* ---------------------------------------------------------------- */
  /* Deployment Status                                                */
  /* ---------------------------------------------------------------- */

  const deploySeries = {
    caption: 'Deployment actions by current status',
    data: (
      [
        ['completed', 'Completed', deploymentStatus.completed, 'good'],
        ['queued', 'Queued or Scheduled', deploymentStatus.queuedOrScheduled, 'info'],
        ['running', 'Running', deploymentStatus.running, 'alt'],
        ['paused', 'Paused', deploymentStatus.paused, 'neutral'],
        ['failed', 'Failed', deploymentStatus.failed, 'bad'],
      ] as const
    )
      .filter(([, , value]) => value > 0)
      .map(([key, label, value, tone]) => ({ key, label, value, tone: tone as Tone })),
  };
  const deployTotal = deploySeries.data.reduce((sum, d) => sum + d.value, 0);

  /* ---------------------------------------------------------------- */
  /* Expiring Soon                                                    */
  /* ---------------------------------------------------------------- */

  // Measured against the server's own stamp, not the browser clock: a laptop
  // with a skewed clock must not decide what has expired, and reading the
  // clock during render is not something render may do.
  const now = new Date(data.updatedAt).getTime();
  const DAY = 86_400_000;
  const buckets = [
    { key: 'expired', label: 'Expired', tone: 'bad' as Tone, max: 0 },
    { key: 'd10', label: 'Within 10 days', tone: 'warn' as Tone, max: 10 },
    { key: 'd30', label: 'Within 30 days', tone: 'info' as Tone, max: 30 },
    { key: 'later', label: 'Later', tone: 'good' as Tone, max: Number.POSITIVE_INFINITY },
  ];
  const bucketOf = (expiresAt: string): string => {
    const days = (new Date(expiresAt).getTime() - now) / DAY;
    return buckets.find((b) => days <= b.max)?.key ?? 'later';
  };

  const expiringSeries = {
    caption: 'Licences and tokens by time to expiry',
    data: buckets.map((b) => ({
      key: b.key,
      label: b.label,
      value: data.expiring.filter((e) => bucketOf(e.expiresAt) === b.key).length,
      tone: b.tone,
    })),
  };
  const expiringSoon = data.expiring
    .filter((e) => new Date(e.expiresAt).getTime() - now < 30 * DAY)
    .slice(0, 6);

  /* ---------------------------------------------------------------- */
  /* Needs Attention                                                  */
  /* ---------------------------------------------------------------- */

  const attentionShown = showAllAttention ? data.attention : data.attention.slice(0, 6);
  const attentionHidden = data.attention.length - attentionShown.length;

  const chart = (
    series: { caption: string; data: Datum[] },
    type: string,
    opts: { onPick?: (key: string) => void; suffix?: string; centre?: [string, string] } = {},
  ) => {
    const total = series.data.reduce((sum, d) => sum + d.value, 0);
    const [centreValue, centreLabel] = opts.centre ?? [num(total), 'items'];
    const pick = opts.onPick ? { onPick: opts.onPick } : {};
    const suffix = opts.suffix ?? '';
    switch (type) {
      case 'donut':
      case 'pie':
        return (
          <Donut
            {...series}
            {...pick}
            centreValue={centreValue}
            centreLabel={centreLabel}
            pie={type === 'pie'}
          />
        );
      case 'bar':
        return <Bars {...series} {...pick} suffix={suffix} max={suffix === '%' ? 100 : 0} />;
      default:
        return (
          <Columns
            {...series}
            {...pick}
            suffix={suffix}
            max={suffix === '%' ? 100 : Math.max(1, ...series.data.map((d) => d.value))}
          />
        );
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.heading}>
        <div className={styles.headingMain}>
          <p className={styles.eyebrow}>Aegis One / Endpoint Management</p>
          <h1 className={styles.title}>Overview</h1>
          <p className={styles.meta}>
            <button type="button" className={styles.metaItem} onClick={go('/groups')}>
              <b>{num(counts.deviceGroups)}</b> Device Groups
            </button>
            <button type="button" className={styles.metaItem} onClick={go('/software')}>
              <b>{num(counts.softwarePackages)}</b> Software Packages
            </button>
            <button type="button" className={styles.metaItem} onClick={go('/patches')}>
              <b>{num(counts.patchUpdates)}</b> Patch Updates
            </button>
            <button type="button" className={styles.metaItem} onClick={go('/deployments')}>
              <b>{num(counts.deployments)}</b> Deployments
            </button>
            <button type="button" className={styles.metaItem} onClick={go('/sites')}>
              <b>{num(counts.zones)}</b> Zones
            </button>
          </p>
        </div>

        <div className={styles.headingActions}>
          <Button onClick={go('/reports')}>Export</Button>
          <Button variant="primary" onClick={go('/deployments/new')}>
            New Action
          </Button>
        </div>
      </div>

      <div className={styles.scope}>
        <div className={styles.scopeField}>
          <span id="ov-zone-label">Zone</span>
          <Select
            aria-labelledby="ov-zone-label"
            options={zoneOptions}
            placeholder="All"
            value={zone}
            onChange={(e) => setScope('zone', e.target.value)}
          />
        </div>
        <div className={styles.scopeField}>
          <span id="ov-platform-label">Platform</span>
          <Select
            aria-labelledby="ov-platform-label"
            options={PLATFORMS}
            placeholder="All"
            value={platform}
            onChange={(e) => setScope('platform', e.target.value)}
          />
        </div>
        <div className={styles.scopeField}>
          <span id="ov-department-label">Department</span>
          <Select
            aria-labelledby="ov-department-label"
            options={DEPARTMENTS}
            placeholder="All"
            value={department}
            onChange={(e) => setScope('department', e.target.value)}
          />
        </div>
        {/*
         * The reference shows this only once something is narrowed, which is
         * the right moment: an always-present Reset invites a reader to
         * wonder what it would reset.
         */}
        {scoped ? (
          <button
            type="button"
            className={styles.reset}
            onClick={() => setParams(new URLSearchParams(), { replace: true })}
          >
            Reset
          </button>
        ) : null}
        <span className={styles.updated}>
          Updated {dateTime(data.updatedAt)}
          <button
            type="button"
            className={styles.refresh}
            onClick={() => void refetch()}
            disabled={isFetching}
            aria-label="Refresh the estate summary"
          >
            ⟳
          </button>
        </span>
      </div>

      <div className={styles.kpis}>
        <Kpi
          active
          label="Managed Endpoints"
          value={num(counts.managedEndpoints)}
          sub={`${num(counts.zones)} zones · ${num(counts.managedEndpoints - counts.online)} not online`}
          onClick={go('/devices')}
        />
        <Kpi
          label="Online Now"
          value={num(counts.online)}
          unit={`${onlinePct}%`}
          tone="good"
          sub="Checked in and reachable"
          onClick={go('/devices?status=online')}
        />
        <Kpi
          label="Patch Compliance"
          value={String(patchCompliance.compliantPct)}
          unit="%"
          tone={bandTone(patchCompliance.compliantPct)}
          sub={`${num(patchCompliance.compliant)} of ${num(counts.managedEndpoints)} fully patched`}
          onClick={go('/patches')}
        />
        <Kpi
          label="High-Risk Endpoints"
          value={num(counts.highRiskEndpoints)}
          tone={counts.highRiskEndpoints > 0 ? 'bad' : 'good'}
          sub="At least one open critical finding"
          onClick={go('/vulns?severity=critical')}
        />
        <Kpi
          label="Overall Health Score"
          value={String(health.score)}
          unit="/100"
          tone={bandTone(health.score)}
          sub={
            health.band === 'healthy'
              ? 'Healthy · 85 and above'
              : health.band === 'fair'
                ? 'Fair · 70–84 band'
                : 'Poor · below 70'
          }
          onClick={go('/insight')}
        />
      </div>

      <div className={styles.row2}>
        <Panel
          title="Overall Health Score"
          subtitle="Weighted 0–100 · current snapshot"
          footer="Click a measure to open its page"
        >
          <div className={styles.hs}>
            <div className={styles.hsHead}>
              <span className={styles.hsNum}>
                <strong>{health.score}</strong>
                <em>/ 100</em>
              </span>
              <span className={styles.hsState}>
                <b>
                  {health.band === 'healthy' ? 'Healthy' : health.band === 'fair' ? 'Fair' : 'Poor'}
                </b>
                <small>
                  {health.score >= HEALTHY
                    ? `${health.score - HEALTHY} points above Healthy (${HEALTHY})`
                    : `${HEALTHY - health.score} points below Healthy (${HEALTHY})`}
                </small>
              </span>
            </div>

            <div className={styles.hsScale}>
              {/*
               * Bands at the thresholds the score is read against, with the
               * score marked on them. Drawn in SVG because the marker's
               * position is a data value, and a style attribute would put
               * that geometry outside the stylesheet.
               */}
              <svg
                className={styles.hsBar}
                viewBox="0 0 100 10"
                preserveAspectRatio="none"
                role="img"
                aria-label={`Health score ${health.score} of 100. Fair starts at 70, Healthy at 85.`}
              >
                <rect className={styles.hsPoor} x="0" y="2" width="70" height="6" />
                <rect className={styles.hsFair} x="70" y="2" width="15" height="6" />
                <rect className={styles.hsGood} x="85" y="2" width="15" height="6" />
                <rect
                  className={styles.hsMarker}
                  x={Math.min(99.6, Math.max(0, health.score - 0.4))}
                  y="0"
                  width="0.8"
                  height="10"
                />
              </svg>
              <div className={styles.hsTicks}>
                <span className={styles.hsTickStart}>0</span>
                <span className={styles.hsTickPoor}>70</span>
                <span className={styles.hsTickFair}>85</span>
                <span className={styles.hsTickGood}>100</span>
              </div>
            </div>

            <div className={styles.hsGains}>
              <span className={styles.hsGainsLabel}>Biggest gains</span>
              {gains.length === 0 ? (
                <span className={styles.hsNoGains}>No measure is clear of Healthy yet</span>
              ) : (
                gains.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    className={styles.hsGain}
                    onClick={go(measurePage[m.id] ?? '/insight')}
                  >
                    {m.label} <b>+{m.score - HEALTHY}</b>
                  </button>
                ))
              )}
            </div>
          </div>

          <ChartTools
            panel="Overall Health Score"
            view={healthView}
            onView={setHealthView}
            viewOptions={[
              { value: 'measures', label: 'Score by Measure' },
              { value: 'gap', label: 'Points to Healthy' },
            ]}
            chart={healthChart}
            onChart={setHealthChart}
            chartOptions={CHART_TYPES.columnar}
          />
          <p className={styles.unit}>
            {healthView === 'gap'
              ? `Points still needed to reach Healthy (${HEALTHY}) · weight below each label`
              : `% per measure · dashed line = Healthy (${HEALTHY}) · weight below each label`}
          </p>
          <div className={styles.body}>
            {healthChart === 'bar' ? (
              <Bars
                {...healthSeries}
                suffix="%"
                onPick={(key) => void navigate(measurePage[key] ?? '/insight')}
              />
            ) : (
              <Columns
                {...healthSeries}
                suffix="%"
                {...(healthView === 'gap' ? {} : { target: HEALTHY })}
                onPick={(key) => void navigate(measurePage[key] ?? '/insight')}
              />
            )}
          </div>
        </Panel>

        <Panel
          title="Patch Compliance"
          subtitle={`${num(patchCompliance.nonCompliant)} of ${num(counts.managedEndpoints)} devices need patches`}
          link={{ label: 'Patches', to: '/patches' }}
          footer="Click a slice or bar to see matching details"
        >
          <ChartTools
            panel="Patch compliance"
            view={patchView}
            onView={setPatchView}
            viewOptions={[
              { value: 'devices', label: 'Device Compliance' },
              { value: 'severity', label: 'Missing Patches by Severity' },
              { value: 'install', label: 'Last Install Result' },
              { value: 'os', label: 'Compliance by OS Family' },
            ]}
            chart={patchChart}
            onChart={setPatchChart}
            chartOptions={CHART_TYPES.circular}
          />
          <p className={styles.unit}>{patchUnit}</p>
          <div className={styles.body}>
            {chart(patchSeries, patchChart, {
              onPick: () => void navigate('/patches'),
              suffix: patchView === 'os' ? '%' : '',
              centre:
                patchView === 'devices'
                  ? [`${patchCompliance.compliantPct}%`, 'compliant']
                  : undefined,
            })}
          </div>

          <div className={styles.mini}>
            <MiniStat
              label="Missing patches"
              items={[
                {
                  text: 'Critical',
                  value: num(patchCompliance.missingBySeverity.critical),
                  tone: 'bad',
                },
                { text: 'High', value: num(patchCompliance.missingBySeverity.high), tone: 'bad' },
                {
                  text: 'Medium',
                  value: num(patchCompliance.missingBySeverity.medium),
                  tone: 'warn',
                },
                { text: 'Low', value: num(patchCompliance.missingBySeverity.low), tone: 'neutral' },
              ]}
            />
            <MiniStat
              label="Last install result"
              items={[
                {
                  text: 'Successful',
                  value: num(patchCompliance.lastInstall.successful),
                  tone: 'good',
                },
                {
                  text: 'Restart',
                  value: num(patchCompliance.lastInstall.restartNeeded),
                  tone: 'warn',
                },
                { text: 'Pending', value: num(patchCompliance.lastInstall.pending), tone: 'info' },
                { text: 'Failed', value: num(patchCompliance.lastInstall.failed), tone: 'bad' },
              ]}
            />
            <MiniStat
              label="Compliance by OS"
              items={patchCompliance.byOs.map((row) => ({
                text: OS_LABEL[row.family] ?? row.family,
                value: `${row.compliantPct}%`,
                tone: bandTone(row.compliantPct),
              }))}
            />
          </div>
        </Panel>
      </div>

      <div className={styles.row3}>
        <Panel
          title="Security Posture"
          subtitle={`${num(securityPosture[0]?.total ?? 0)} endpoints across three controls`}
          link={{ label: 'Security', to: '/vulns' }}
          footer="Click a control to see the endpoints missing it"
        >
          <ChartTools
            panel="Security Posture"
            view={postureView}
            onView={setPostureView}
            viewOptions={[
              { value: 'all', label: 'All Controls' },
              { value: 'disk-encryption', label: 'Disk Encryption' },
              { value: 'antivirus', label: 'Antivirus' },
              { value: 'firewall', label: 'Firewall' },
            ]}
            chart={postureChart}
            onChart={setPostureChart}
            chartOptions={CHART_TYPES.rings}
          />
          <p className={styles.unit}>% of endpoints protected · target {PROTECTION_TARGET}%</p>
          <div className={styles.body}>
            {postureChart === 'rings' ? (
              <Rings
                caption={postureSeries.caption}
                data={postureRings}
                onPick={() => void navigate('/vulns')}
              />
            ) : (
              chart(postureSeries, postureChart, {
                onPick: () => void navigate('/vulns'),
                suffix: '%',
              })
            )}
          </div>
        </Panel>

        <Panel
          title="Deployment Status"
          subtitle={`${num(counts.deployments)} deployment actions`}
          link={{ label: 'Deployments', to: '/deployments' }}
          footer="Click a slice or bar to see matching details"
        >
          <ChartTools
            panel="Deployment status"
            view="status"
            onView={() => undefined}
            viewOptions={[{ value: 'status', label: 'By Current Status' }]}
            chart={deployChart}
            onChart={setDeployChart}
            chartOptions={CHART_TYPES.circular}
          />
          <p className={styles.unit}>Each action counted once, by the status it is in now</p>
          <div className={styles.body}>
            {chart(deploySeries, deployChart, {
              onPick: (key) => void navigate(`/deployments?status=${segment(key)}`),
              centre: [num(deployTotal), 'actions'],
            })}
          </div>
        </Panel>

        <Panel title="Expiring Soon" subtitle="Licence, enrollment and API tokens">
          <div className={styles.body}>
            <Donut
              {...expiringSeries}
              centreValue={num(data.expiring.length)}
              centreLabel="items"
            />
          </div>
          <div className={styles.expList}>
            {expiringSoon.length === 0 ? (
              <p className={styles.empty}>Nothing expires in the next 30 days.</p>
            ) : (
              expiringSoon.map((item) => {
                const expired = new Date(item.expiresAt).getTime() < now;
                return (
                  <button
                    key={`${item.kind}-${item.name}`}
                    type="button"
                    className={styles.expRow}
                    onClick={go(item.kind === 'license' ? '/licensing' : '/admin')}
                  >
                    <span className={expired ? styles.expStBad : styles.expStWarn}>
                      {expired ? 'Expired' : 'Expiring'}
                    </span>
                    <span className={styles.expName}>
                      <b>{item.name}</b>
                      <small>
                        {item.kind === 'license'
                          ? 'Licence'
                          : item.kind === 'api-token'
                            ? 'API Token'
                            : item.kind === 'certificate'
                              ? 'Certificate'
                              : 'Enrollment Token'}
                      </small>
                    </span>
                    <time dateTime={item.expiresAt}>{relative(item.expiresAt)}</time>
                  </button>
                );
              })
            )}
          </div>
        </Panel>
      </div>

      <div className={styles.row2}>
        <Panel
          title="Needs Attention"
          subtitle={`${data.attention.length} open items · highest priority first`}
        >
          <div className={styles.attn}>
            {data.attention.length === 0 ? (
              <p className={styles.empty}>Nothing needs attention right now.</p>
            ) : (
              attentionShown.map((item) => (
                <div key={item.id} className={styles.attnRow}>
                  <span className={styles[`sev-${SEVERITY_TONE[item.severity]}`]}>
                    {item.severity}
                  </span>
                  <span className={styles.attnN}>{num(item.count)}</span>
                  <button
                    type="button"
                    className={styles.attnMain}
                    onClick={go(ATTENTION_LINK[item.id] ?? '/devices')}
                  >
                    <b>{item.title}</b>
                    <small>{item.detail}</small>
                  </button>
                  <button
                    type="button"
                    className={styles.attnAct}
                    onClick={go(ATTENTION_LINK[item.id] ?? '/devices')}
                  >
                    {item.action} →
                  </button>
                </div>
              ))
            )}
            {attentionHidden > 0 ? (
              <button
                type="button"
                className={styles.more}
                onClick={() => setShowAllAttention(true)}
              >
                Show {attentionHidden} more
              </button>
            ) : null}
          </div>
        </Panel>

        <Panel
          title="Recent Activity"
          subtitle="Latest deployment and audit events"
          link={{ label: 'All Deployments', to: '/deployments' }}
        >
          <div className={styles.events}>
            {data.recentActivity.map((item) => (
              <button
                key={item.id}
                type="button"
                className={styles.event}
                onClick={go(`/deployments/${segment(item.id)}`)}
              >
                <span className={styles.eventMain}>
                  <b>{item.name}</b>
                  <small>
                    {item.id} · {num(item.targetCount)} targets · {item.counts.done} done
                    {item.counts.failed > 0 ? ` · ${item.counts.failed} failed` : ''}
                  </small>
                </span>
                <span className={styles[`badge-${badgeTone(item.status)}`]}>{item.status}</span>
                <time dateTime={item.triggeredAt}>{dateTime(item.triggeredAt)}</time>
              </button>
            ))}
          </div>
        </Panel>
      </div>

      <div className={styles.footnote}>
        <span>
          Aegis One <i>/</i> Endpoint Control
        </span>
        <span>Figures computed server-side at {dateTime(data.updatedAt)}</span>
      </div>
    </div>
  );
}

const badgeTone = (status: string): Tone =>
  status === 'completed'
    ? 'good'
    : status === 'failed'
      ? 'bad'
      : status === 'queued' || status === 'scheduled'
        ? 'warn'
        : 'neutral';

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
  onClick,
}: {
  label: string;
  value: string;
  unit?: string;
  sub: string;
  tone?: Tone;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button type="button" className={active ? styles.kpiActive : styles.kpi} onClick={onClick}>
      <span className={styles.kpiLabel}>{label}</span>
      <span className={styles.kpiValue}>
        <strong>{value}</strong>
        {unit ? <em>{unit}</em> : null}
      </span>
      <span className={styles.kpiSub}>
        {tone && !active ? <i className={styles[`dot-${tone}`]} aria-hidden="true" /> : null}
        {sub}
      </span>
    </button>
  );
}

/** A labelled row of figure-and-word pairs, under the patch donut. */
function MiniStat({
  label,
  items,
}: {
  label: string;
  items: { text: string; value: string; tone: Tone }[];
}) {
  return (
    <div>
      <span className={styles.miniLabel}>{label}</span>
      <p className={styles.miniRow}>
        {items.map((item) => (
          <span key={item.text} className={styles.miniPair}>
            <b className={styles[item.tone]}>{item.value}</b>
            {item.text}
          </span>
        ))}
      </p>
    </div>
  );
}

function Panel({
  title,
  subtitle,
  link,
  footer,
  children,
}: {
  title: string;
  subtitle: string;
  link?: { label: string; to: string };
  footer?: string;
  children: React.ReactNode;
}) {
  const navigate = useNavigate();
  return (
    <article className={styles.panel}>
      <header className={styles.panelHead}>
        <div className={styles.panelTitle}>
          <h2>{title}</h2>
          <p>{subtitle}</p>
        </div>
        {link ? (
          <button type="button" className={styles.panelLink} onClick={() => void navigate(link.to)}>
            {link.label} →
          </button>
        ) : null}
      </header>
      {children}
      {footer ? <footer className={styles.panelFoot}>{footer}</footer> : null}
    </article>
  );
}

/**
 * The two selects a panel carries.
 *
 * `panel` is not decoration: four panels each offering "View" and "Chart
 * type" give a screen reader four controls with the same name and no way to
 * tell them apart. The reference names them per panel — "Overall Health
 * Score view", "Patch compliance chart type" — and so does this.
 */
function ChartTools({
  panel,
  view,
  onView,
  viewOptions,
  chart,
  onChart,
  chartOptions,
}: {
  panel: string;
  view: string;
  onView: (value: string) => void;
  viewOptions: readonly { value: string; label: string }[];
  chart: string;
  onChart: (value: string) => void;
  chartOptions: readonly { value: string; label: string }[];
}) {
  return (
    <div className={styles.tools}>
      <Select
        aria-label={`${panel} view`}
        options={viewOptions}
        value={view}
        onChange={(e) => onView(e.target.value)}
        disabled={viewOptions.length < 2}
      />
      <Select
        aria-label={`${panel} chart type`}
        options={chartOptions}
        value={chart}
        onChange={(e) => onChart(e.target.value)}
      />
    </div>
  );
}
