import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, ErrorState, Skeleton, useToast } from '@aegis/ui';
import { api, ApiError, type Page } from '../api/client';
import { useCan } from '../app/auth';
import { date, dateTime, num } from '../app/format';
import { Bars, Columns, type Tone } from './shared/Figures';
import type {
  Finding,
  FindingState,
  Remediation,
  Scan,
  ScanTemplate,
  Severity,
  SlaState,
  ThreatIndicator,
  VulnerabilityProject,
  VulnerabilitySummary,
  VulnerableDevice,
} from '../api/types';

/** One week of the summary's trend. */
type VulnerabilityTrendPoint = VulnerabilitySummary['trend'][number];
import styles from './Vulnerabilities.module.css';

/**
 * Vulnerabilities, restored to the approved v129 layout: a summary line and
 * six KPI cards over a six-widget dashboard, then five tabs — Findings,
 * Devices, Remediations, Projects and Scans.
 *
 * Every counter above the grid is a link into the grid below it, filtered to
 * exactly the rows it counted. That is the page's whole argument: a figure an
 * administrator cannot click through to is a figure nobody checks.
 *
 * The grid sorts on Priority Rating, not CVSS. CVSS says how bad a flaw is in
 * the abstract; the Priority Rating says how urgently it should be fixed on
 * this estate, which is the order the work is actually done in.
 */

const TABS = [
  { id: 'findings', label: 'Findings' },
  { id: 'devices', label: 'Devices' },
  { id: 'remediations', label: 'Remediations' },
  { id: 'projects', label: 'Projects' },
  { id: 'scans', label: 'Scans' },
] as const;

const SEVERITIES: readonly Severity[] = ['critical', 'high', 'medium', 'low'];

const SEVERITY_LABEL: Record<Severity, string> = {
  critical: 'Critical',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};

/** The same four colours the restored Patch Management gives severity. */
const SEVERITY_CLASS: Record<Severity, string> = {
  critical: styles.sevCritical as string,
  high: styles.sevHigh as string,
  medium: styles.sevMedium as string,
  low: styles.sevLow as string,
};

/** The eight threat indicators, in the reference's own order and words. */
const THREATS: readonly { id: ThreatIndicator; label: string }[] = [
  { id: 'known-exploited', label: 'Known exploited' },
  { id: 'exploit-available', label: 'Public exploit' },
  { id: 'ransomware', label: 'Ransomware' },
  { id: 'wormable', label: 'Wormable' },
  { id: 'zero-day', label: 'Zero-day' },
  { id: 'remote', label: 'Remote' },
  { id: 'malware', label: 'Malware' },
  { id: 'no-fix', label: 'No fix yet' },
];

const THREAT_LABEL = Object.fromEntries(THREATS.map((t) => [t.id, t.label])) as Record<
  ThreatIndicator,
  string
>;

const SLA_LABEL: Record<SlaState, string> = {
  within: 'Within SLA',
  'due-soon': 'Due soon',
  overdue: 'Overdue',
};

const SLA_CLASS: Record<SlaState, string> = {
  within: styles.slaWithin as string,
  'due-soon': styles.slaSoon as string,
  overdue: styles.slaOverdue as string,
};

const STATE_LABEL: Record<FindingState, string> = {
  open: 'Open',
  'in-remediation': 'In remediation',
  accepted: 'Accepted',
  resolved: 'Resolved',
};

const DETECTION_LABEL: Record<string, string> = {
  new: 'New',
  active: 'Active',
  reopened: 'Reopened',
};

const SCAN_TEMPLATES: readonly { id: ScanTemplate; label: string }[] = [
  { id: 'full-vulnerability', label: 'Full Vulnerability Scan' },
  { id: 'critical-and-exploited-quick', label: 'Critical & Exploited Quick Scan' },
  { id: 'configuration-audit', label: 'Configuration Audit' },
  { id: 'discovery', label: 'Discovery' },
];

const TEMPLATE_LABEL = Object.fromEntries(SCAN_TEMPLATES.map((t) => [t.id, t.label])) as Record<
  ScanTemplate,
  string
>;

const SCAN_SCHEDULES = [
  { id: 'now', label: 'Run now' },
  { id: 'daily-0300', label: 'Daily · 03:00' },
  { id: 'weekly-fri-0200', label: 'Weekly · Friday 02:00' },
  { id: 'monthly-1st-0100', label: 'Monthly · 1st 01:00' },
] as const;

/**
 * The scan scopes. `family` is matched as a prefix against the device's own
 * operating-system family, which is why it reads "Red Hat" rather than
 * "Linux": that is the string the estate stores.
 */
const SCAN_TARGETS = [
  { id: 'all', label: 'All devices', family: null },
  { id: 'windows', label: 'Platform: Windows', family: 'Windows' },
  { id: 'macos', label: 'Platform: macOS', family: 'macOS' },
  { id: 'ubuntu', label: 'Platform: Ubuntu', family: 'Ubuntu' },
  { id: 'rhel', label: 'Platform: Red Hat', family: 'Red Hat' },
] as const;

const SCAN_STATUS_LABEL: Record<Scan['status'], string> = {
  queued: 'Scheduled',
  running: 'Running',
  completed: 'Completed',
  'completed-with-failures': 'Completed with failures',
  failed: 'Failed',
  cancelled: 'Cancelled',
};

const SCAN_METHOD_LABEL: Record<VulnerableDevice['scanMethod'], string> = {
  agent: 'Agent',
  'credentialed-network': 'Credentialed (network)',
  'not-scanned': 'Offline — last scan missed',
};

const PER_PAGE = 15;

/** The filters the Findings grid carries, all of them in the URL. */
const FILTER_KEYS = ['severity', 'platform', 'detection', 'threat', 'confidence', 'sla', 'state'];

export default function Vulnerabilities() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') ?? 'findings';
  const openFindingId = params.get('finding');
  const canScan = useCan('vulns:scan');
  const canRemediate = useCan('deployments:create');
  const [newScan, setNewScan] = useState(false);

  const set = (changes: Record<string, string | null>): void => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(changes)) {
      if (value === null) next.delete(key);
      else next.set(key, value);
    }
    setParams(next, { replace: true });
  };

  /** Clears every grid filter, then applies the one the counter stands for. */
  const go = (filters: Record<string, string | null>): void => {
    const next = new URLSearchParams(params);
    for (const key of [...FILTER_KEYS, 'q', 'page']) next.delete(key);
    next.set('tab', 'findings');
    for (const [key, value] of Object.entries(filters)) {
      if (value !== null) next.set(key, value);
    }
    setParams(next, { replace: true });
  };

  const summary = useQuery({
    queryKey: ['/vulnerabilities/summary'],
    queryFn: ({ signal }) =>
      api.get<VulnerabilitySummary>('/vulnerabilities/summary', undefined, signal),
  });

  // The summary line's fifth figure. The Projects tab fetches the same
  // query, so opening it costs nothing.
  const projects = useQuery({
    queryKey: ['/vulnerabilities/projects'],
    queryFn: ({ signal }) =>
      api.get<VulnerabilityProject[]>('/vulnerabilities/projects', undefined, signal),
  });

  if (summary.error) {
    return (
      <ErrorState
        title="Vulnerabilities could not be loaded"
        description="The summary behind the counters did not come back."
        retryLabel="Try again"
        onRetry={() => void summary.refetch()}
      />
    );
  }

  const s = summary.data;
  // The figure the reference puts on its own button: what is open and
  // critical right now, not a total of everything ever found.
  const criticalOpen = s?.criticalAndHigh ?? 0;

  return (
    <div className={styles.page}>
      <div className={styles.head}>
        <div>
          <p className={styles.eyebrow}>Aegis One / Security</p>
          <h1 className={styles.title}>Vulnerabilities</h1>
          {s ? (
            <p className={styles.summaryLine}>
              <button type="button" className={styles.sumLink} onClick={() => go({})}>
                <b>{num(s.openFindings)}</b> Open Findings
              </button>
              <span aria-hidden="true">·</span>
              <button
                type="button"
                className={styles.sumLink}
                onClick={() => go({ threat: 'known-exploited' })}
              >
                <b>{num(s.knownExploited)}</b> Known Exploited
              </button>
              <span aria-hidden="true">·</span>
              <button
                type="button"
                className={styles.sumLink}
                onClick={() => go({ sla: 'overdue' })}
              >
                <b>{num(s.slaOverdue)}</b> SLA Overdue
              </button>
              <span aria-hidden="true">·</span>
              <button
                type="button"
                className={styles.sumLink}
                onClick={() => set({ tab: 'devices' })}
              >
                <b>
                  {num(s.scanCoverage.scanned)}/{num(s.scanCoverage.total)}
                </b>{' '}
                Devices Scanned
              </button>
              <span aria-hidden="true">·</span>
              <button
                type="button"
                className={styles.sumLink}
                onClick={() => set({ tab: 'projects' })}
              >
                <b>{num(projects.data?.length ?? 0)}</b> Projects
              </button>
            </p>
          ) : (
            <p className={styles.summaryLine}>Reading the estate…</p>
          )}
        </div>
        <div className={styles.headActions}>
          {/*
           * The reference's two shortcuts out of this page. A finding is
           * fixed somewhere else — by a patch, or by an action sent to the
           * endpoints that have it — so the page that reports them offers
           * the way to both rather than leaving the reader to find it.
           */}
          <Button size="sm" onClick={() => void navigate('/patches')}>
            Open Patch Management
          </Button>
          {canRemediate && criticalOpen > 0 ? (
            <Button size="sm" onClick={() => void navigate('/deployments/new')}>
              Remediate critical ({num(criticalOpen)})
            </Button>
          ) : null}
          <Button size="sm" onClick={() => set({ tab: 'scans' })}>
            Scan history
          </Button>
          {canScan ? (
            <Button size="sm" variant="primary" onClick={() => setNewScan(true)}>
              + New Scan
            </Button>
          ) : null}
        </div>
      </div>

      {s ? (
        <KpiRow summary={s} go={go} onTab={(t) => set({ tab: t })} />
      ) : (
        <Skeleton className={styles.kpiSkeleton} />
      )}
      {s ? (
        <Dashboard
          summary={s}
          go={go}
          onOpen={(id) => set({ finding: id })}
          onRemediations={() => set({ tab: 'remediations' })}
        />
      ) : null}

      <div className={styles.panel}>
        <div className={styles.tabs} role="tablist" aria-label="Vulnerability views">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              className={tab === t.id ? styles.tabOn : styles.tab}
              onClick={() => set({ tab: t.id, page: null })}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className={styles.tabBody}>
          {tab === 'findings' ? (
            <FindingsTab
              params={params}
              set={set}
              go={go}
              summary={s}
              onOpen={(id) => set({ finding: id })}
            />
          ) : null}
          {tab === 'devices' ? <DevicesTab /> : null}
          {tab === 'remediations' ? <RemediationsTab /> : null}
          {tab === 'projects' ? <ProjectsTab /> : null}
          {tab === 'scans' ? <ScansTab canScan={canScan} onNew={() => setNewScan(true)} /> : null}
        </div>
      </div>

      {openFindingId ? (
        <FindingDrawer findingId={openFindingId} onClose={() => set({ finding: null })} />
      ) : null}
      {newScan ? <NewScanDialog onClose={() => setNewScan(false)} /> : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* The six KPI cards                                                    */
/* ------------------------------------------------------------------ */

function KpiRow({
  summary,
  go,
  onTab,
}: {
  summary: VulnerabilitySummary;
  go: (f: Record<string, string | null>) => void;
  onTab: (tab: string) => void;
}) {
  const coverage = summary.scanCoverage.total
    ? Math.round((summary.scanCoverage.scanned / summary.scanCoverage.total) * 100)
    : 0;
  const pct = (a: number, b: number): string => (b ? `${Math.round((a / b) * 100)}%` : '');

  return (
    <div className={styles.kpiRow}>
      <Kpi
        label="Exposure Score"
        value={num(summary.exposureScore)}
        unit="/ 1000"
        sub={`Grade ${summary.grade}`}
        onClick={() => onTab('devices')}
      />
      <Kpi
        label="Open Findings"
        value={num(summary.openFindings)}
        sub={`on ${num(summary.devicesAffected)} devices`}
        onClick={() => go({})}
      />
      <Kpi
        label="Critical & High"
        value={num(summary.criticalAndHigh)}
        unit={pct(summary.criticalAndHigh, summary.openFindings)}
        sub="fix first"
        tone="bad"
        onClick={() => go({ severity: 'critical' })}
      />
      <Kpi
        label="Known Exploited"
        value={num(summary.knownExploited)}
        sub="exploited in the wild"
        tone="bad"
        onClick={() => go({ threat: 'known-exploited' })}
      />
      <Kpi
        label="SLA Overdue"
        value={num(summary.slaOverdue)}
        unit={pct(summary.slaOverdue, summary.openFindings)}
        sub="past their due date"
        tone={summary.slaOverdue > 0 ? 'bad' : 'good'}
        onClick={() => go({ sla: 'overdue' })}
      />
      <Kpi
        label="Scan Coverage"
        value={String(coverage)}
        unit="%"
        sub={`${num(summary.scanCoverage.scanned)} / ${num(summary.scanCoverage.total)} devices`}
        onClick={() => onTab('devices')}
      />
    </div>
  );
}

function Kpi({
  label,
  value,
  unit,
  sub,
  tone,
  onClick,
}: {
  label: string;
  value: string;
  unit?: string;
  sub: string;
  tone?: Tone;
  onClick: () => void;
}) {
  return (
    <button type="button" className={styles.kpi} onClick={onClick}>
      <span className={styles.kpiLabel}>{label}</span>
      <span className={styles.kpiValue}>
        <strong className={tone ? styles[tone] : undefined}>{value}</strong>
        {unit ? <em>{unit}</em> : null}
      </span>
      <span className={styles.kpiSub}>{sub}</span>
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* The six dashboard widgets                                            */
/* ------------------------------------------------------------------ */

function Dashboard({
  summary,
  go,
  onOpen,
  onRemediations,
}: {
  summary: VulnerabilitySummary;
  go: (f: Record<string, string | null>) => void;
  onOpen: (findingId: string) => void;
  onRemediations: () => void;
}) {
  return (
    <div className={styles.dashboard}>
      <Widget title="Open Findings Trend" subtitle="Twelve weeks, by severity" wide>
        <TrendChart trend={summary.trend} />
        <div className={styles.legend}>
          {SEVERITIES.map((sev) => (
            <span key={sev}>
              <i className={styles[`dot_${sev}`]} />
              {SEVERITY_LABEL[sev]}
            </span>
          ))}
        </div>
      </Widget>

      <Widget title="SLA Status" subtitle="Open findings against their due date">
        <Bars
          caption="Open findings by SLA state"
          suffix=""
          max={0}
          data={[
            { key: 'within', label: 'Within SLA', value: summary.sla.within, tone: 'good' },
            { key: 'due-soon', label: 'Due soon', value: summary.sla.dueSoon, tone: 'warn' },
            { key: 'overdue', label: 'Overdue', value: summary.sla.overdue, tone: 'bad' },
          ]}
          onPick={(key) => go({ sla: key })}
        />
      </Widget>

      <Widget
        title="Top Priorities"
        subtitle="Highest Priority Rating first"
        link={{ label: 'All findings', onClick: () => go({}) }}
        wide
      >
        <table className={styles.miniTable}>
          <thead>
            <tr>
              <th scope="col">Check ID</th>
              <th scope="col">Finding</th>
              <th scope="col">Severity</th>
              <th scope="col" className={styles.numeric}>
                Priority
              </th>
              <th scope="col" className={styles.numeric}>
                Devices
              </th>
            </tr>
          </thead>
          <tbody>
            {summary.topPriorities.map((f) => (
              <tr key={f.id} onClick={() => onOpen(f.id)} className={styles.clickRow}>
                <td className={styles.mono}>{f.checkId ?? '—'}</td>
                <th scope="row">{f.title}</th>
                <td>
                  <SeverityTag severity={f.severity} />
                </td>
                <td className={styles.numeric}>
                  <b>{f.priority.toFixed(1)}</b>
                </td>
                <td className={styles.numeric}>{num(f.devices)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Widget>

      <Widget title="Vulnerability Age" subtitle="How long findings have been open">
        <Columns
          caption="Open findings by age"
          suffix=""
          max={0}
          data={summary.age.map((a, i) => ({
            key: a.bucket,
            label: a.bucket,
            value: a.count,
            // The reference's own ramp: sand, amber, dark amber, red.
            tone: (['sand', 'amber', 'warn', 'bad'] as const)[i] ?? 'neutral',
          }))}
        />
      </Widget>

      <Widget
        title="Top Fixes Out of Compliance"
        subtitle="Ranked by devices missing them"
        link={{ label: 'Remediations', onClick: onRemediations }}
        wide
      >
        <table className={styles.miniTable}>
          <thead>
            <tr>
              <th scope="col">Fix</th>
              <th scope="col" className={styles.numeric}>
                Findings
              </th>
              <th scope="col" className={styles.numeric}>
                Devices missing it
              </th>
            </tr>
          </thead>
          <tbody>
            {summary.topFixes.map((f) => (
              <tr key={f.fix}>
                <th scope="row">{f.fix}</th>
                <td className={styles.numeric}>{num(f.findings)}</td>
                <td className={styles.numeric}>
                  <b>{num(f.devicesMissing)}</b>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Widget>

      <Widget title="Threat Indicators" subtitle="Open findings carrying each flag">
        <Bars
          caption="Open findings by threat indicator"
          suffix=""
          max={0}
          // One tone per indicator, cycled: the reference colours these
          // categorically, because no indicator is worse than another by
          // position in the list.
          data={summary.threatIndicators.map((t, i) => ({
            key: t.indicator,
            label: THREAT_LABEL[t.indicator] ?? t.indicator,
            value: t.count,
            tone: (['bad', 'alt', 'info', 'warn', 'good', 'neutral'] as const)[i % 6] ?? 'neutral',
          }))}
          onPick={(key) => go({ threat: key })}
        />
      </Widget>
    </div>
  );
}

function Widget({
  title,
  subtitle,
  link,
  wide = false,
  children,
}: {
  title: string;
  subtitle: string;
  /** The reference gives two widgets a link out instead of a caption. */
  link?: { label: string; onClick: () => void };
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className={wide ? styles.widgetWide : styles.widget}>
      <div className={styles.widgetHead}>
        <h2>{title}</h2>
        {link ? (
          <button type="button" className={styles.widgetLink} onClick={link.onClick}>
            {link.label} <span aria-hidden="true">&rarr;</span>
          </button>
        ) : (
          <span>{subtitle}</span>
        )}
      </div>
      <div className={styles.widgetBody}>{children}</div>
    </section>
  );
}

/**
 * The trend is stacked rather than four lines, because the question it answers
 * is "is the total coming down, and is the worst of it coming down fastest".
 * Drawn here rather than with the shared Columns figure, which takes one tone
 * per column and cannot stack.
 */
/**
 * One week's four severity bands, as rects in a 0-100 box measured from the
 * bottom. Critical sits at the foot of the stack, so the worst band is the
 * one the eye lands on first across the whole series.
 */
function stackOf(
  week: VulnerabilityTrendPoint,
  ceiling: number,
): { severity: Severity; y: number; height: number }[] {
  const segments: { severity: Severity; y: number; height: number }[] = [];
  let bottom = 100;
  for (const severity of SEVERITIES) {
    const height = (week[severity] / ceiling) * 100;
    if (height <= 0) continue;
    bottom -= height;
    segments.push({ severity, y: bottom, height });
  }
  return segments;
}

function TrendChart({ trend }: { trend: VulnerabilityTrendPoint[] }) {
  const ceiling = Math.max(1, ...trend.map((t) => t.open));
  return (
    <div className={styles.trend}>
      <div className={styles.trendPlot}>
        {trend.map((week) => (
          <div key={week.date} className={styles.trendCol}>
            <b className={styles.trendValue}>{week.open}</b>
            <svg
              className={styles.trendBar}
              viewBox="0 0 1 100"
              preserveAspectRatio="none"
              role="img"
              aria-label={`${date(week.date)}: ${week.open} open findings`}
            >
              {stackOf(week, ceiling).map((seg) => (
                <rect
                  key={seg.severity}
                  className={styles[`seg_${seg.severity}`]}
                  x="0"
                  width="1"
                  y={seg.y}
                  height={seg.height}
                />
              ))}
            </svg>
          </div>
        ))}
      </div>
      <div className={styles.trendAxis}>
        {trend.map((week, i) => (
          <span key={week.date}>
            {i === trend.length - 1 ? 'Now' : `W-${trend.length - 1 - i}`}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Findings                                                             */
/* ------------------------------------------------------------------ */

function FindingsTab({
  params,
  set,
  go,
  summary,
  onOpen,
}: {
  params: URLSearchParams;
  set: (changes: Record<string, string | null>) => void;
  go: (f: Record<string, string | null>) => void;
  summary: VulnerabilitySummary | undefined;
  onOpen: (findingId: string) => void;
}) {
  /*
   * The contract pages by cursor, so Previous walks back down a stack of the
   * cursors already followed rather than subtracting an offset the server
   * never offered. The stack resets whenever the filters change, because a
   * cursor is only meaningful for the query that produced it.
   */
  const navigate = useNavigate();
  const canDeploy = useCan('patches:deploy');
  const [cursors, setCursors] = useState<string[]>([]);
  const filterKey = FILTER_KEYS.map((k) => params.get(k) ?? '').join('|') + (params.get('q') ?? '');
  const [seenKey, setSeenKey] = useState(filterKey);
  if (seenKey !== filterKey) {
    setSeenKey(filterKey);
    setCursors([]);
  }
  const page = cursors.length;

  const query = useMemo(() => {
    const q: Record<string, string> = { limit: String(PER_PAGE) };
    const cursor = cursors[cursors.length - 1];
    if (cursor) q['cursor'] = cursor;
    for (const key of FILTER_KEYS) {
      if (key === 'state') continue;
      const value = params.get(key);
      if (value) q[key] = value;
    }
    // The grid opens on the open findings, so the figure above it and the
    // rows inside it are the same set. Everything else — accepted risks,
    // findings since resolved — is a deliberate choice from the State filter.
    const state = params.get('state') ?? 'open';
    if (state !== 'all') q['state'] = state;
    const search = params.get('q');
    if (search) q['q'] = search;
    return q;
  }, [params, cursors]);

  const findings = useQuery({
    queryKey: ['/vulnerabilities/findings', query],
    queryFn: ({ signal }) => api.get<Page<Finding>>('/vulnerabilities/findings', query, signal),
  });

  const active =
    FILTER_KEYS.filter((k) => params.get(k) && !(k === 'state' && params.get(k) === 'open'))
      .length + (params.get('q') ? 1 : 0);
  const total = findings.data?.page.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PER_PAGE));
  const nextCursor = findings.data?.page.nextCursor ?? null;

  return (
    <>
      <div className={styles.filterBar}>
        <input
          type="search"
          className={styles.search}
          aria-label="Search findings"
          placeholder="Search name, CVE, check ID or product"
          maxLength={80}
          defaultValue={params.get('q') ?? ''}
          onChange={(e) => set({ q: e.target.value || null, page: null })}
        />
        <Picker
          label="Severity"
          value={params.get('severity')}
          options={SEVERITIES.map((v) => ({ value: v, label: SEVERITY_LABEL[v] }))}
          onChange={(v) => set({ severity: v, page: null })}
        />
        <Picker
          label="Platform"
          value={params.get('platform')}
          options={[
            { value: 'windows', label: 'Windows' },
            { value: 'macos', label: 'macOS' },
            { value: 'linux', label: 'Linux' },
            { value: 'aix', label: 'AIX' },
          ]}
          onChange={(v) => set({ platform: v, page: null })}
        />
        <Picker
          label="Detection"
          value={params.get('detection')}
          options={[
            { value: 'new', label: 'New' },
            { value: 'active', label: 'Active' },
            { value: 'reopened', label: 'Reopened' },
          ]}
          onChange={(v) => set({ detection: v, page: null })}
        />
        <Picker
          label="Threat"
          value={params.get('threat')}
          options={THREATS.map((t) => ({ value: t.id, label: t.label }))}
          onChange={(v) => set({ threat: v, page: null })}
        />
        <Picker
          label="Status"
          value={params.get('confidence')}
          options={[
            { value: 'confirmed', label: 'Confirmed' },
            { value: 'potential', label: 'Potential' },
          ]}
          onChange={(v) => set({ confidence: v, page: null })}
        />
        <Picker
          label="SLA"
          value={params.get('sla')}
          options={[
            { value: 'within', label: 'Within SLA' },
            { value: 'due-soon', label: 'Due soon' },
            { value: 'overdue', label: 'Overdue' },
          ]}
          onChange={(v) => set({ sla: v, page: null })}
        />
        {/* The only filter with a default, so it names its own values. */}
        <select
          className={styles.select}
          aria-label="State"
          value={params.get('state') ?? 'open'}
          onChange={(e) => set({ state: e.target.value, page: null })}
        >
          <option value="open">State: Open</option>
          <option value="accepted">State: Accepted</option>
          <option value="resolved">State: Resolved</option>
          <option value="all">State: All</option>
        </select>
        {active > 0 ? (
          <button type="button" className={styles.clear} onClick={() => go({})}>
            Clear filters
          </button>
        ) : null}
        <span className={styles.count}>
          {num(total)} finding{total === 1 ? '' : 's'}
        </span>
      </div>

      {summary ? (
        <div className={styles.chips} role="group" aria-label="Threat indicators">
          {summary.threatIndicators.map((t) => (
            <button
              key={t.indicator}
              type="button"
              className={params.get('threat') === t.indicator ? styles.chipOn : styles.chip}
              aria-pressed={params.get('threat') === t.indicator}
              onClick={() =>
                set({
                  threat: params.get('threat') === t.indicator ? null : t.indicator,
                  page: null,
                })
              }
            >
              {THREAT_LABEL[t.indicator] ?? t.indicator} <b>{num(t.count)}</b>
            </button>
          ))}
        </div>
      ) : null}

      {findings.isLoading ? <Skeleton className={styles.tableSkeleton} /> : null}
      {findings.data ? (
        <div className={styles.scroll}>
          <table className={styles.grid}>
            <thead>
              <tr>
                <th scope="col">Severity</th>
                <th scope="col" className={styles.numeric}>
                  Priority
                </th>
                <th scope="col" className={styles.numeric}>
                  CVSS
                </th>
                <th scope="col">Finding</th>
                <th scope="col">Threats</th>
                <th scope="col">Detection</th>
                <th scope="col" className={styles.numeric}>
                  Devices
                </th>
                <th scope="col" className={styles.numeric}>
                  Age
                </th>
                <th scope="col">SLA</th>
                <th scope="col">State</th>
                {/*
                 * The reference leaves this header empty, so it looks the
                 * same here; the name is there for a screen reader only,
                 * because an unnamed column is what the naming pass was
                 * about.
                 */}
                <th scope="col" className={styles.rowActions}>
                  <span className={styles.srOnly}>Action</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {findings.data.items.map((f) => (
                <tr key={f.id} className={styles.clickRow} onClick={() => onOpen(f.id)}>
                  <td>
                    <SeverityTag severity={f.severity} />
                  </td>
                  <td className={styles.numeric}>
                    <b>{f.priority.toFixed(1)}</b>
                  </td>
                  <td className={styles.numeric}>{f.cvss.toFixed(1)}</td>
                  <th scope="row">
                    <b>{f.title}</b>
                    <small>
                      {f.cve ?? f.id} · {f.product}
                    </small>
                  </th>
                  <td>
                    <ThreatTags threats={f.threats} limit={2} />
                  </td>
                  <td>
                    <span className={styles.detection}>
                      {DETECTION_LABEL[f.detection] ?? f.detection}
                    </span>
                    <small className={styles.confidence}>
                      {f.confidence === 'confirmed' ? 'Confirmed' : 'Potential'}
                    </small>
                  </td>
                  <td className={styles.numeric}>{num(f.devices)}</td>
                  <td className={styles.numeric}>{f.ageDays} d</td>
                  <td>
                    {f.state === 'open' ? (
                      <SlaCell finding={f} />
                    ) : (
                      <span className={styles.muted}>—</span>
                    )}
                  </td>
                  <td>
                    <span className={styles.state}>{STATE_LABEL[f.state]}</span>
                  </td>
                  {/*
                   * One action per row, chosen the way the reference chooses
                   * it: a finding with a patch behind it offers the deploy,
                   * and one with only a workaround offers the read. The row
                   * itself still opens the drawer, so the button stops the
                   * click rather than doing both.
                   */}
                  <td className={styles.rowActions}>
                    {f.fixType === 'patch' ? (
                      <Button
                        size="sm"
                        disabled={!canDeploy}
                        aria-label={`Deploy the fix for ${f.title}`}
                        /*
                         * The whole patch list, unfiltered. The contract's
                         * Patch carries a title and a KB and no CVE, so a
                         * finding cannot name the patch that fixes it; a
                         * search built from the CVE would match nothing and
                         * look like an empty estate.
                         */
                        onClick={(e) => {
                          e.stopPropagation();
                          void navigate('/patches?tab=all');
                        }}
                      >
                        Deploy Fix
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        aria-label={`Review ${f.title}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpen(f.id);
                        }}
                      >
                        Review
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
              {findings.data.items.length === 0 ? (
                <tr>
                  <td colSpan={11} className={styles.empty}>
                    No findings match these filters.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      ) : null}

      {pages > 1 ? (
        <div className={styles.pager}>
          <Button size="sm" disabled={page === 0} onClick={() => setCursors(cursors.slice(0, -1))}>
            ‹ Previous
          </Button>
          <span>
            Page {page + 1} of {pages}
          </span>
          <Button
            size="sm"
            disabled={nextCursor === null}
            onClick={() => setCursors([...cursors, nextCursor ?? ''])}
          >
            Next ›
          </Button>
        </div>
      ) : null}
    </>
  );
}

function Picker({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string | null;
  options: readonly { value: string; label: string }[];
  onChange: (value: string | null) => void;
}) {
  return (
    <select
      className={styles.select}
      aria-label={label}
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value || null)}
    >
      <option value="">{label}: All</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

/** A proportion drawn as a stretched rect, so no pixel lands in a style attribute. */
function Meter({ pct, label }: { pct: number; label: string }) {
  return (
    <svg
      className={styles.meterBar}
      viewBox="0 0 100 1"
      preserveAspectRatio="none"
      role="img"
      aria-label={label}
    >
      <rect x="0" y="0" height="1" width={Math.max(0, Math.min(100, pct))} />
    </svg>
  );
}

function SeverityTag({ severity }: { severity: Severity }) {
  return (
    <span className={SEVERITY_CLASS[severity]}>
      <i aria-hidden="true" />
      {SEVERITY_LABEL[severity]}
    </span>
  );
}

function ThreatTags({ threats, limit }: { threats: ThreatIndicator[]; limit?: number }) {
  const shown = limit ? threats.slice(0, limit) : threats;
  if (threats.length === 0) return <span className={styles.muted}>—</span>;
  return (
    <span className={styles.threats}>
      {shown.map((t) => (
        <span key={t} className={styles.threat} title={THREAT_LABEL[t]}>
          {THREAT_LABEL[t]}
        </span>
      ))}
      {threats.length > shown.length ? (
        <span className={styles.threatMore}>+{threats.length - shown.length}</span>
      ) : null}
    </span>
  );
}

/**
 * Days left comes from two figures the server already measured against its
 * own clock — the SLA window and the finding's age — rather than from
 * `Date.now()`, which would make this component's output depend on when it
 * happened to render.
 */
function SlaCell({ finding }: { finding: Finding }) {
  const window = Math.round(
    (Date.parse(finding.slaDueAt) - Date.parse(finding.firstDetectedAt)) / 86_400_000,
  );
  const days = window - finding.ageDays;
  return (
    <span className={SLA_CLASS[finding.sla]} title={`Due ${date(finding.slaDueAt)}`}>
      {finding.sla === 'overdue' ? `${Math.abs(days)} d overdue` : `${days} d left`}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Devices                                                              */
/* ------------------------------------------------------------------ */

function DevicesTab() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const devices = useQuery({
    queryKey: ['/vulnerabilities/devices', search],
    queryFn: ({ signal }) =>
      api.get<Page<VulnerableDevice>>(
        '/vulnerabilities/devices',
        { limit: 50, ...(search ? { q: search } : {}) },
        signal,
      ),
  });

  return (
    <>
      <div className={styles.filterBar}>
        <input
          type="search"
          className={styles.search}
          aria-label="Search devices"
          placeholder="Search by hostname"
          maxLength={80}
          onChange={(e) => setSearch(e.target.value)}
        />
        <span className={styles.count}>
          {num(devices.data?.page.total ?? 0)} devices · worst exposure first
        </span>
      </div>

      {devices.isLoading ? <Skeleton className={styles.tableSkeleton} /> : null}
      {devices.data ? (
        <div className={styles.scroll}>
          <table className={styles.grid}>
            <thead>
              <tr>
                <th scope="col">Device</th>
                <th scope="col">IP Address</th>
                <th scope="col" className={styles.numeric}>
                  Device Criticality
                </th>
                <th scope="col">Exposure (0–1000)</th>
                <th scope="col" className={styles.numeric}>
                  Critical
                </th>
                <th scope="col" className={styles.numeric}>
                  High
                </th>
                <th scope="col" className={styles.numeric}>
                  Medium
                </th>
                <th scope="col" className={styles.numeric}>
                  Low
                </th>
                <th scope="col">Scan Method</th>
                <th scope="col">Last Scan</th>
              </tr>
            </thead>
            <tbody>
              {devices.data.items.map((d) => (
                <tr
                  key={d.deviceId}
                  className={styles.clickRow}
                  onClick={() => void navigate(`/devices/${d.deviceId}/vulnerabilities`)}
                >
                  <th scope="row">
                    <b>{d.name}</b>
                    <small>
                      {d.os} · {d.site}
                    </small>
                  </th>
                  <td className={styles.mono}>{d.ip}</td>
                  <td className={styles.numeric}>{d.criticality} / 10</td>
                  <td>
                    {d.scanMethod === 'not-scanned' ? (
                      <span className={styles.muted}>Not scanned</span>
                    ) : (
                      <span className={styles.meter}>
                        <b>{num(d.exposure)}</b>
                        <Meter pct={d.exposure / 10} label={`Exposure ${d.exposure} of 1000`} />
                      </span>
                    )}
                  </td>
                  <td className={`${styles.numeric} ${styles.bad}`}>{d.critical}</td>
                  <td className={`${styles.numeric} ${styles.warn}`}>{d.high}</td>
                  <td className={`${styles.numeric} ${styles.alt}`}>{d.medium}</td>
                  <td className={styles.numeric}>{d.low}</td>
                  <td>{SCAN_METHOD_LABEL[d.scanMethod]}</td>
                  <td>{d.lastScan ? dateTime(d.lastScan) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Remediations                                                         */
/* ------------------------------------------------------------------ */

function RemediationsTab() {
  const navigate = useNavigate();
  const canDeploy = useCan('deployments:create');
  const remediations = useQuery({
    queryKey: ['/vulnerabilities/remediations'],
    queryFn: ({ signal }) =>
      api.get<Page<Remediation>>('/vulnerabilities/remediations', undefined, signal),
  });

  if (remediations.isLoading) return <Skeleton className={styles.tableSkeleton} />;
  if (!remediations.data) return null;

  return (
    <>
      <p className={styles.note}>
        One fix closes several findings on several devices, so a row here is a fix, not a CVE.
        Deployment itself happens in Patch Management, which owns the maintenance windows and the
        restart rules.
      </p>
      <div className={styles.scroll}>
        <table className={styles.grid}>
          <thead>
            <tr>
              <th scope="col">Remediation</th>
              <th scope="col">Highest Severity</th>
              <th scope="col" className={styles.numeric}>
                Findings Fixed
              </th>
              <th scope="col" className={styles.numeric}>
                Devices
              </th>
              <th scope="col">Risk Reduced</th>
              <th scope="col">Fix Type</th>
              <th scope="col" aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {remediations.data.items.map((r) => (
              <tr key={r.id}>
                <th scope="row">
                  <b>{r.fix}</b>
                  <small>{r.cves.join(', ')}</small>
                </th>
                <td>
                  <SeverityTag severity={r.highestSeverity} />
                </td>
                <td className={styles.numeric}>{num(r.findings)}</td>
                <td className={styles.numeric}>{num(r.devicesMissing)}</td>
                <td>
                  <span className={styles.meter}>
                    <b>{r.riskReducedPct}%</b>
                    <Meter
                      pct={r.riskReducedPct}
                      label={`${r.riskReducedPct}% of the risk every open fix would remove`}
                    />
                  </span>
                </td>
                <td>
                  {r.fixType === 'patch' ? (
                    <span className={styles.good}>Patch available</span>
                  ) : (
                    <span className={styles.muted}>Workaround only</span>
                  )}
                </td>
                <td className={styles.rowActions}>
                  {canDeploy && r.fixType === 'patch' ? (
                    <Button
                      size="sm"
                      aria-label={`Deploy the fix for ${r.fix}`}
                      onClick={() => void navigate('/patches?tab=all')}
                    >
                      Deploy Fix
                    </Button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Projects                                                             */
/* ------------------------------------------------------------------ */

function ProjectsTab() {
  const projects = useQuery({
    queryKey: ['/vulnerabilities/projects'],
    queryFn: ({ signal }) =>
      api.get<VulnerabilityProject[]>('/vulnerabilities/projects', undefined, signal),
  });

  if (projects.isLoading) return <Skeleton className={styles.tableSkeleton} />;
  if (!projects.data) return null;
  if (projects.data.length === 0) {
    return <p className={styles.note}>No remediation projects are open.</p>;
  }

  return (
    <div className={styles.projects}>
      {projects.data.map((p) => {
        const days = p.dueInDays;
        const sla: SlaState = days < 0 ? 'overdue' : days <= 7 ? 'due-soon' : 'within';
        return (
          <section key={p.id} className={styles.project}>
            <div className={styles.projectHead}>
              <h3>{p.name}</h3>
              <span className={SLA_CLASS[sla]}>
                {days < 0 ? `${Math.abs(days)} d overdue` : `Due in ${days} d`}
              </span>
            </div>
            <p className={styles.muted}>
              Owner {p.owner} · due {date(p.due)} · {num(p.findings)} findings
            </p>
            <div className={styles.progress}>
              <Meter pct={p.progressPct} label={`${p.progressPct}% of devices remediated`} />
              <span>{p.progressPct}% devices remediated</span>
            </div>
          </section>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Scans                                                                */
/* ------------------------------------------------------------------ */

function ScansTab({ canScan, onNew }: { canScan: boolean; onNew: () => void }) {
  const scans = useQuery({
    queryKey: ['/vulnerabilities/scans'],
    queryFn: ({ signal }) => api.get<Page<Scan>>('/vulnerabilities/scans', { limit: 50 }, signal),
  });

  return (
    <>
      <div className={styles.tabBar}>
        <span className={styles.count}>{num(scans.data?.page.total ?? 0)} scans</span>
        {canScan ? (
          <Button size="sm" variant="primary" onClick={onNew}>
            + New Scan
          </Button>
        ) : null}
      </div>

      {scans.isLoading ? <Skeleton className={styles.tableSkeleton} /> : null}
      {scans.data ? (
        <div className={styles.scroll}>
          <table className={styles.grid}>
            <thead>
              <tr>
                <th scope="col">Scan</th>
                <th scope="col">Template</th>
                <th scope="col">Targets</th>
                <th scope="col">Status</th>
                <th scope="col">Started</th>
                <th scope="col">Duration</th>
                <th scope="col" className={styles.numeric}>
                  Devices
                </th>
                <th scope="col" className={styles.numeric}>
                  New Findings
                </th>
                <th scope="col" className={styles.numeric}>
                  Fixed
                </th>
              </tr>
            </thead>
            <tbody>
              {scans.data.items.map((scan) => {
                const done = scan.status === 'completed';
                return (
                  <tr key={scan.id}>
                    <th scope="row">
                      <b>{scan.name}</b>
                      <small>{scan.schedule}</small>
                    </th>
                    <td>{TEMPLATE_LABEL[scan.template] ?? scan.template}</td>
                    <td>{scan.scope}</td>
                    <td>
                      <span className={styles.state}>{SCAN_STATUS_LABEL[scan.status]}</span>
                    </td>
                    <td>{dateTime(scan.startedAt)}</td>
                    <td>{scan.durationLabel}</td>
                    <td className={styles.numeric}>{done ? num(scan.devicesScanned) : '—'}</td>
                    <td className={styles.numeric}>{done ? `+${scan.findingsOpened}` : '—'}</td>
                    <td className={styles.numeric}>{done ? num(scan.findingsFixed) : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Finding drawer                                                       */
/* ------------------------------------------------------------------ */

function FindingDrawer({ findingId, onClose }: { findingId: string; onClose: () => void }) {
  const finding = useQuery({
    queryKey: ['/vulnerabilities/findings', findingId],
    queryFn: ({ signal }) =>
      api.get<Finding>(
        `/vulnerabilities/findings/${encodeURIComponent(findingId)}`,
        undefined,
        signal,
      ),
  });

  const f = finding.data;

  return (
    <div
      className={styles.overlay}
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <aside
        className={styles.drawer}
        role="dialog"
        aria-modal="true"
        aria-label={f ? f.title : 'Finding'}
      >
        <header className={styles.drawerHead}>
          <div>
            {f ? <SeverityTag severity={f.severity} /> : null}
            <h2>{f ? f.title : 'Loading…'}</h2>
            {f ? (
              <p className={styles.mono}>
                {f.cve ?? f.id} · {f.checkId ?? '—'}
              </p>
            ) : null}
          </div>
          <Button size="sm" onClick={onClose}>
            Close
          </Button>
        </header>

        {finding.isLoading ? <Skeleton className={styles.tableSkeleton} /> : null}
        {f ? (
          <div className={styles.drawerBody}>
            <dl className={styles.facts}>
              <div>
                <dt>Priority Rating</dt>
                <dd>{f.priority.toFixed(1)}</dd>
              </div>
              <div>
                <dt>CVSS v3.1 base</dt>
                <dd>{f.cvss.toFixed(1)}</dd>
              </div>
              <div>
                <dt>Detection</dt>
                <dd>
                  {DETECTION_LABEL[f.detection] ?? f.detection} ·{' '}
                  {f.confidence === 'confirmed' ? 'Confirmed' : 'Potential'}
                </dd>
              </div>
              <div>
                <dt>Affected devices</dt>
                <dd>{num(f.devices)}</dd>
              </div>
              <div>
                <dt>SLA</dt>
                <dd>
                  {SLA_LABEL[f.sla]} · due {date(f.slaDueAt)}
                </dd>
              </div>
              <div>
                <dt>Fix type</dt>
                <dd>{f.fixType === 'patch' ? 'Patch available' : 'Workaround only'}</dd>
              </div>
              <div>
                <dt>Family</dt>
                <dd>{f.family}</dd>
              </div>
              <div>
                <dt>State</dt>
                <dd>{STATE_LABEL[f.state]}</dd>
              </div>
            </dl>

            <h3>Threat indicators</h3>
            {f.threats.length ? (
              <ThreatTags threats={f.threats} />
            ) : (
              <p className={styles.muted}>No active threat indicators.</p>
            )}

            <h3>Solution</h3>
            <p>{f.solution}</p>

            <h3>Detection history</h3>
            <ol className={styles.timeline}>
              <li>
                <b>First detected</b> {date(f.firstDetectedAt)}
              </li>
              <li>
                <b>Last detected</b> {dateTime(f.lastDetectedAt)}
              </li>
              <li>
                <b>SLA due</b> {date(f.slaDueAt)}
              </li>
            </ol>

            <h3>Scan evidence</h3>
            <pre className={styles.evidence}>
              {[
                `Check      : ${f.checkId ?? '—'} (${f.family})`,
                `Product    : ${f.product}`,
                `Port       : ${f.port}`,
                `Method     : authenticated (agent)`,
                `Result     : vulnerable version present`,
                `Fixed by   : ${f.solution}`,
              ].join('\n')}
            </pre>

            {f.acceptedReason ? (
              <>
                <h3>Accepted risk</h3>
                <p>{f.acceptedReason}</p>
              </>
            ) : null}
          </div>
        ) : null}
      </aside>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* New Scan                                                             */
/* ------------------------------------------------------------------ */

const scanFamily = (id: (typeof SCAN_TARGETS)[number]['id']): string | null =>
  SCAN_TARGETS.find((t) => t.id === id)?.family ?? null;

function NewScanDialog({ onClose }: { onClose: () => void }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [name, setName] = useState('Ad-hoc vulnerability scan');
  const [template, setTemplate] = useState<ScanTemplate>('full-vulnerability');
  const [target, setTarget] = useState<(typeof SCAN_TARGETS)[number]['id']>('all');
  const [schedule, setSchedule] = useState<(typeof SCAN_SCHEDULES)[number]['id']>('now');
  const [authenticated, setAuthenticated] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const start = useMutation({
    mutationFn: () =>
      api.post<Scan>('/vulnerabilities/scans', {
        name: name.trim(),
        template,
        schedule,
        authenticated,
        // "All devices" is the absence of a narrowing, not a list of 50,000
        // ids: the server resolves what the scan reaches.
        targets: scanFamily(target) === null ? {} : { filter: `osFamily=${scanFamily(target)}` },
      }),
    onSuccess: (scan) => {
      void queryClient.invalidateQueries({ queryKey: ['/vulnerabilities/scans'] });
      toast.show({
        tone: 'success',
        title: schedule === 'now' ? `Scan started: ${scan.name}` : `Scan scheduled: ${scan.name}`,
      });
      onClose();
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'The scan could not be started.'),
  });

  return (
    <div
      className={styles.overlay}
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className={styles.modal} role="dialog" aria-modal="true" aria-label="New Scan">
        <header className={styles.drawerHead}>
          <h2>New Scan</h2>
        </header>
        <div className={styles.modalBody}>
          <label className={styles.field}>
            <span>Scan name</span>
            <input
              type="text"
              maxLength={80}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label className={styles.field}>
            <span>Template</span>
            <select value={template} onChange={(e) => setTemplate(e.target.value as ScanTemplate)}>
              {SCAN_TEMPLATES.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.field}>
            <span>Targets</span>
            <select
              value={target}
              onChange={(e) => setTarget(e.target.value as (typeof SCAN_TARGETS)[number]['id'])}
            >
              {SCAN_TARGETS.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.field}>
            <span>Schedule</span>
            <select
              value={schedule}
              onChange={(e) => setSchedule(e.target.value as (typeof SCAN_SCHEDULES)[number]['id'])}
            >
              {SCAN_SCHEDULES.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.check}>
            <input
              type="checkbox"
              checked={authenticated}
              onChange={(e) => setAuthenticated(e.target.checked)}
            />
            Authenticated scan (agent, or credentials for devices without an agent)
          </label>
          {error ? (
            <p className={styles.error} role="alert">
              {error}
            </p>
          ) : null}
        </div>
        <footer className={styles.modalFoot}>
          <Button size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            size="sm"
            variant="primary"
            disabled={name.trim().length < 3 || start.isPending}
            onClick={() => {
              setError(null);
              start.mutate();
            }}
          >
            {schedule === 'now' ? 'Start Scan' : 'Schedule Scan'}
          </Button>
        </footer>
      </div>
    </div>
  );
}
