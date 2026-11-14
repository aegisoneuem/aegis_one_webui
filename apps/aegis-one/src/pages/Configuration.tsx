import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Button, ErrorState, Skeleton, useToast } from '@aegis/ui';
import { api, type Page } from '../api/client';
import { useCan } from '../app/auth';
import { date, dateTime, num } from '../app/format';
import { Columns, Donut, Rings, type RingDatum, type Tone } from './shared/Figures';
import type {
  Benchmark,
  CheckSeverity,
  ConfigCheck,
  ConfigCheckDetail,
  ConfigDevice,
  ConfigDeviceDetail,
  ConfigException,
  ConfigProfile,
  ConfigProfileDetail,
  ConfigurationSummary,
  Framework,
  FrameworkTag,
  PlatformFamily,
} from '../api/types';
import styles from './Configuration.module.css';

/**
 * Configuration Compliance, restored to the approved v129 layout: five
 * counters over four widgets and a table of the worst checks, then six tabs —
 * Overview, Checks, Devices, Exceptions, Benchmarks and Profiles.
 *
 * Every figure on the page narrows with the filter bar, the counters
 * included, so a counter and the rows beneath it are the same query twice.
 * That matters more here than anywhere else in the console: on an estate of
 * 50,000 endpoints a compliance percentage with nothing behind it is a number
 * nobody can act on.
 *
 * The reference evaluates 32 computers and recomputes every result on each
 * render. This estate has 50,000 and a library of 200 checks, so the counts
 * are rolled up once at seed time and a single device's result is derived
 * from the same expression on demand — see docs/decisions.md D-039.
 */

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'checks', label: 'Checks' },
  { id: 'devices', label: 'Devices' },
  { id: 'exceptions', label: 'Exceptions' },
  { id: 'benchmarks', label: 'Benchmarks' },
  { id: 'profiles', label: 'Profiles' },
] as const;

const FRAMEWORK_LABEL: Record<Framework, string> = {
  cis: 'CIS',
  stig: 'DISA STIG',
  'pci-dss': 'PCI DSS',
  hipaa: 'HIPAA',
};

/** The tag's own short form, which is not the filter's label. */
const FRAMEWORK_TAG: Record<Framework, string> = {
  cis: 'CIS',
  stig: 'STIG',
  'pci-dss': 'PCI',
  hipaa: 'HIPAA',
};

const FRAMEWORK_TAG_CLASS: Record<Framework, string> = {
  cis: styles.tagCis as string,
  stig: styles.tagStig as string,
  'pci-dss': styles.tagPci as string,
  hipaa: styles.tagHipaa as string,
};

const PLATFORM_LABEL: Record<PlatformFamily, string> = {
  windows: 'Windows',
  macos: 'macOS',
  linux: 'Linux',
  aix: 'AIX',
};

const SEVERITY_LABEL: Record<CheckSeverity, string> = {
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};

/**
 * This page's severity ramp. A check has no Critical step, so the three it
 * does have take the reference's red, dark amber and blue — the last of which
 * reads as "noted, not urgent" rather than as a fourth warm step.
 */
const SEVERITY_CLASS: Record<CheckSeverity, string> = {
  high: styles.sevHigh as string,
  medium: styles.sevMedium as string,
  low: styles.sevLow as string,
};

const CONTROL_LABEL = {
  'disk-encryption': 'Disk Encryption',
  antivirus: 'Antivirus',
  firewall: 'Firewall',
} as const;

const SEVERITIES: readonly CheckSeverity[] = ['high', 'medium', 'low'];
const PLATFORMS: readonly PlatformFamily[] = ['windows', 'macos', 'linux'];

const RESULTS = [
  { value: 'fail', label: 'Has Failures' },
  { value: 'pass', label: 'All Passing' },
  { value: 'exception', label: 'Has Exceptions' },
] as const;

/** The filters the reference puts in the bar, in its own order. */
const FILTER_KEYS = ['framework', 'platform', 'group', 'category', 'severity', 'result'] as const;

/** The target the reference draws across every compliance chart. */
const TARGET_PCT = 90;

const PER_PAGE = 50;

/** High is good, and the reference's own bands are 90 and 75. */
const pctTone = (value: number | null): Tone =>
  value === null ? 'neutral' : value >= 90 ? 'good' : value >= 75 ? 'warn' : 'bad';

const pctClass = (value: number | null): string =>
  value === null
    ? (styles.muted as string)
    : value >= 90
      ? (styles.pctGood as string)
      : value >= 75
        ? (styles.pctWarn as string)
        : (styles.pctBad as string);

const pctText = (value: number | null): string => (value === null ? '—' : `${value}%`);

export default function Configuration() {
  const [params, setParams] = useSearchParams();
  const toast = useToast();
  const canWrite = useCan('config:write');

  const tab = params.get('tab') ?? 'overview';
  const group = params.get('group');
  const platform = params.get('platform');

  const [checkId, setCheckId] = useState<string | null>(null);
  const [deviceId, setDeviceId] = useState<string | null>(null);

  /** Replaces a set of filters at once, always returning to the first page. */
  const go = (next: Record<string, string | null>): void => {
    const updated = new URLSearchParams(params);
    for (const [key, value] of Object.entries(next)) {
      if (value === null) updated.delete(key);
      else updated.set(key, value);
    }
    updated.delete('cursor');
    setParams(updated, { replace: true });
  };

  const onTab = (next: string): void => go({ tab: next });

  // Only the group and platform narrow the figures; the other filters narrow
  // which rows are shown, so the summary does not read them.
  const summaryQuery: Record<string, string> = {};
  if (group) summaryQuery['group'] = group;
  if (platform) summaryQuery['platform'] = platform;

  const summary = useQuery({
    queryKey: ['/configuration/summary', summaryQuery],
    queryFn: ({ signal }) =>
      api.get<ConfigurationSummary>('/configuration/summary', summaryQuery, signal),
  });

  const groups = useQuery({
    queryKey: ['/groups', 'config'],
    queryFn: ({ signal }) =>
      api.get<Page<{ id: string; name: string }>>(
        '/groups',
        { limit: '100', fields: 'id,name' },
        signal,
      ),
  });

  const evaluate = useMutation({
    mutationFn: () => api.post<{ id: string }>('/configuration/evaluate', {}),
    onSuccess: () => {
      const s = summary.data;
      toast.show({
        title: 'Evaluation queued',
        message: s
          ? `${num(s.checksInScope)} checks on ${num(s.nonCompliantDevices.total)} computers`
          : undefined,
        tone: 'success',
      });
    },
    onError: () => toast.show({ title: 'The evaluation could not be queued.', tone: 'error' }),
  });

  if (summary.error) {
    return (
      <ErrorState
        title="Configuration compliance could not be loaded"
        description="The summary behind the counters did not come back."
        retryLabel="Try again"
        onRetry={() => void summary.refetch()}
      />
    );
  }

  const s = summary.data;

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <h1>Configuration Compliance</h1>
        <Button
          variant="primary"
          disabled={!canWrite || evaluate.isPending}
          onClick={() => evaluate.mutate()}
        >
          {evaluate.isPending ? 'Evaluating…' : 'Evaluate Now'}
        </Button>
      </header>

      <div className={styles.tabs} role="tablist" aria-label="Configuration views">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={tab === t.id ? styles.tabOn : styles.tab}
            onClick={() => onTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'profiles' ? null : (
        <FilterBar
          params={params}
          go={go}
          groups={groups.data?.items ?? []}
          categories={s ? s.byCategory.map((c) => c.category) : []}
        />
      )}

      {tab === 'overview' ? (
        <OverviewTab summary={s} go={go} onTab={onTab} onPickCheck={setCheckId} />
      ) : null}
      {tab === 'checks' ? <ChecksTab params={params} onPickCheck={setCheckId} /> : null}
      {tab === 'devices' ? <DevicesTab params={params} onPickDevice={setDeviceId} /> : null}
      {tab === 'exceptions' ? <ExceptionsTab onPickCheck={setCheckId} /> : null}
      {tab === 'benchmarks' ? <BenchmarksTab go={go} /> : null}
      {tab === 'profiles' ? <ProfilesTab summary={s} /> : null}

      {checkId === null ? null : (
        <CheckDrawer
          checkId={checkId}
          group={group}
          onClose={() => setCheckId(null)}
          onPickDevice={(id) => {
            setCheckId(null);
            setDeviceId(id);
          }}
        />
      )}
      {deviceId === null ? null : (
        <DeviceDrawer
          deviceId={deviceId}
          onClose={() => setDeviceId(null)}
          onPickCheck={(id) => {
            setDeviceId(null);
            setCheckId(id);
          }}
        />
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------
 * The filter bar
 * ---------------------------------------------------------------------- */

function FilterBar({
  params,
  go,
  groups,
  categories,
}: {
  params: URLSearchParams;
  go: (next: Record<string, string | null>) => void;
  groups: readonly { id: string; name: string }[];
  categories: readonly string[];
}) {
  const active = FILTER_KEYS.filter((k) => params.get(k));
  const search = params.get('q') ?? '';

  const labelFor = (key: (typeof FILTER_KEYS)[number], value: string): string => {
    if (key === 'framework') return FRAMEWORK_LABEL[value as Framework] ?? value;
    if (key === 'platform') return PLATFORM_LABEL[value as PlatformFamily] ?? value;
    if (key === 'severity') return SEVERITY_LABEL[value as CheckSeverity] ?? value;
    if (key === 'result') return RESULTS.find((r) => r.value === value)?.label ?? value;
    if (key === 'group') return groups.find((g) => g.id === value)?.name ?? value;
    return value;
  };

  const FILTER_LABEL: Record<(typeof FILTER_KEYS)[number], string> = {
    framework: 'Framework',
    platform: 'Platform',
    group: 'Device Group',
    category: 'Category',
    severity: 'Severity',
    result: 'Result',
  };

  return (
    <section className={styles.filters} aria-label="Filters">
      <div className={styles.filterRow}>
        <label className={styles.search}>
          <span className={styles.srOnly}>Search check ID, title or category</span>
          <input
            type="search"
            placeholder="Search check ID, title or category"
            value={search}
            onChange={(e) => go({ q: e.target.value || null })}
          />
        </label>

        <Field label="Framework">
          <Picker
            label="Framework"
            value={params.get('framework')}
            options={(Object.keys(FRAMEWORK_LABEL) as Framework[]).map((f) => ({
              value: f,
              label: FRAMEWORK_LABEL[f],
            }))}
            onChange={(v) => go({ framework: v })}
          />
        </Field>
        <Field label="Platform">
          <Picker
            label="Platform"
            value={params.get('platform')}
            options={PLATFORMS.map((p) => ({ value: p, label: PLATFORM_LABEL[p] }))}
            onChange={(v) => go({ platform: v })}
          />
        </Field>
        <Field label="Device Group">
          <Picker
            label="Device Group"
            value={params.get('group')}
            options={groups.map((g) => ({ value: g.id, label: g.name }))}
            onChange={(v) => go({ group: v })}
          />
        </Field>
        <Field label="Category">
          <Picker
            label="Category"
            value={params.get('category')}
            options={categories.map((c) => ({ value: c, label: c }))}
            onChange={(v) => go({ category: v })}
          />
        </Field>
        <Field label="Severity">
          <Picker
            label="Severity"
            value={params.get('severity')}
            options={SEVERITIES.map((v) => ({ value: v, label: SEVERITY_LABEL[v] }))}
            onChange={(v) => go({ severity: v })}
          />
        </Field>
        <Field label="Result">
          <Picker
            label="Result"
            value={params.get('result')}
            options={RESULTS.map((r) => ({ value: r.value, label: r.label }))}
            onChange={(v) => go({ result: v })}
          />
        </Field>
      </div>

      {active.length > 0 || search ? (
        <div className={styles.chips}>
          {active.map((key) => (
            <button
              key={key}
              type="button"
              className={styles.chip}
              onClick={() => go({ [key]: null })}
            >
              {FILTER_LABEL[key]}: {labelFor(key, params.get(key) ?? '')} ×
            </button>
          ))}
          {search ? (
            <button type="button" className={styles.chip} onClick={() => go({ q: null })}>
              Search: {search} ×
            </button>
          ) : null}
          <button
            type="button"
            className={styles.clearAll}
            onClick={() =>
              go({
                q: null,
                framework: null,
                platform: null,
                group: null,
                category: null,
                severity: null,
                result: null,
              })
            }
          >
            Clear All
          </button>
        </div>
      ) : null}
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <span className={styles.field}>
      <span className={styles.fieldLabel} aria-hidden="true">
        {label}
      </span>
      {children}
    </span>
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
      <option value="">All</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

/* -------------------------------------------------------------------------
 * Overview
 * ---------------------------------------------------------------------- */

function OverviewTab({
  summary,
  go,
  onTab,
  onPickCheck,
}: {
  summary: ConfigurationSummary | undefined;
  go: (next: Record<string, string | null>) => void;
  onTab: (tab: string) => void;
  onPickCheck: (id: string) => void;
}) {
  if (!summary) return <Skeleton className={styles.pageSkeleton} />;

  const bands = summary.deviceBands;
  const devices = bands.high + bands.medium + bands.low;

  return (
    <>
      <div className={styles.kpis}>
        <Kpi
          label="Overall Compliance"
          value={num(summary.overallPct)}
          unit="%"
          tone={pctTone(summary.overallPct)}
        />
        <Kpi
          label="Checks in Scope"
          value={num(summary.checksInScope)}
          onClick={() => onTab('checks')}
        />
        <Kpi
          label="Failing Checks"
          value={num(summary.failingChecks)}
          tone="bad"
          onClick={() => go({ tab: 'checks', result: 'fail' })}
        />
        <Kpi
          label="Non-Compliant Devices"
          value={num(summary.nonCompliantDevices.count)}
          unit={`/${num(summary.nonCompliantDevices.total)}`}
          tone={summary.nonCompliantDevices.count > 0 ? 'warn' : 'good'}
          onClick={() => onTab('devices')}
        />
        <Kpi
          label="Exceptions"
          value={num(summary.exceptions)}
          onClick={() => onTab('exceptions')}
        />
      </div>

      <div className={styles.row3}>
        <Panel title="Compliance by Framework">
          <Columns
            caption="Compliance by framework"
            target={TARGET_PCT}
            data={summary.byFramework.map((f) => ({
              key: f.framework,
              label: FRAMEWORK_LABEL[f.framework],
              value: f.compliancePct,
              tone: pctTone(f.compliancePct),
            }))}
            onPick={(key) => go({ tab: 'checks', framework: key })}
          />
        </Panel>

        <Panel title="Compliance by Platform">
          <Columns
            caption="Compliance by platform"
            target={TARGET_PCT}
            data={summary.byPlatform.map((p) => ({
              key: p.platform,
              label: PLATFORM_LABEL[p.platform],
              value: p.compliancePct,
              tone: 'deep' as const,
              note: `${num(p.devices)} devices`,
            }))}
            onPick={(key) => go({ platform: key })}
          />
        </Panel>

        <Panel title="Device Compliance">
          <Donut
            caption="Devices by compliance band"
            stack
            centreValue={num(devices)}
            centreLabel="devices"
            data={[
              { key: 'high', label: '90–100%', value: bands.high, tone: 'good' },
              { key: 'medium', label: '75–89%', value: bands.medium, tone: 'warn' },
              { key: 'low', label: 'Below 75%', value: bands.low, tone: 'bad' },
            ]}
            onPick={() => onTab('devices')}
          />
        </Panel>
      </div>

      <Panel title="Compliance by Category">
        <Columns
          caption="Compliance by category"
          target={TARGET_PCT}
          data={summary.byCategory.map((c) => ({
            key: c.category,
            label: c.category,
            value: c.compliancePct,
            tone: 'alt' as const,
          }))}
          onPick={(key) => go({ tab: 'checks', category: key })}
        />
      </Panel>

      <section className={styles.panel}>
        <header className={styles.panelHead}>
          <h2 className={styles.panelTitle}>Top Failing Checks</h2>
          <span className={styles.grow} />
          <Button size="sm" onClick={() => go({ tab: 'checks', result: 'fail' })}>
            All Failing Checks
          </Button>
        </header>
        <div className={styles.tableWrap}>
          <table className={styles.grid}>
            <thead>
              <tr>
                <th scope="col">Check</th>
                <th scope="col">Platform</th>
                <th scope="col">Severity</th>
                <th scope="col">Frameworks</th>
                <th scope="col" className={styles.numeric}>
                  Failing
                </th>
                <th scope="col" className={styles.numeric}>
                  Compliance
                </th>
              </tr>
            </thead>
            <tbody>
              {summary.topFailing.length === 0 ? (
                <tr>
                  <td colSpan={6} className={styles.empty}>
                    No failing checks in this scope
                  </td>
                </tr>
              ) : (
                summary.topFailing.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <button
                        type="button"
                        className={styles.rowLink}
                        onClick={() => onPickCheck(c.id)}
                      >
                        {c.title}
                      </button>
                      <small>
                        {c.id} · {c.category}
                      </small>
                    </td>
                    <td>{PLATFORM_LABEL[c.platform]}</td>
                    <td>
                      <b className={SEVERITY_CLASS[c.severity]}>{SEVERITY_LABEL[c.severity]}</b>
                    </td>
                    <td>
                      <FrameworkTags frameworks={c.frameworks} />
                    </td>
                    <td className={styles.numeric}>
                      <b className={styles.pctBad}>{num(c.failing)}</b>
                    </td>
                    <td className={styles.numeric}>
                      <b className={pctClass(c.compliancePct)}>{pctText(c.compliancePct)}</b>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

function Kpi({
  label,
  value,
  unit,
  tone,
  onClick,
}: {
  label: string;
  value: string;
  unit?: string;
  tone?: Tone;
  onClick?: () => void;
}) {
  const body = (
    <>
      <span className={styles.kpiLabel}>{label}</span>
      <strong className={tone ? styles[`kpi_${tone}`] : undefined}>
        {value}
        {unit ? <em>{unit}</em> : null}
      </strong>
    </>
  );
  return onClick ? (
    <button type="button" className={styles.kpiOn} onClick={onClick}>
      {body}
    </button>
  ) : (
    <div className={styles.kpi}>{body}</div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className={styles.panelPadded}>
      <h2 className={styles.panelTitle}>{title}</h2>
      {children}
    </section>
  );
}

function FrameworkTags({ frameworks }: { frameworks: readonly FrameworkTag[] }) {
  if (frameworks.length === 0) return <span className={styles.muted}>—</span>;
  return (
    <span className={styles.tags}>
      {frameworks.map((f) => (
        <span key={f.framework} className={FRAMEWORK_TAG_CLASS[f.framework]}>
          {f.framework === 'hipaa'
            ? FRAMEWORK_TAG[f.framework]
            : `${FRAMEWORK_TAG[f.framework]} ${f.ref.replace('CAT ', '')}`}
        </span>
      ))}
    </span>
  );
}

/* -------------------------------------------------------------------------
 * Checks
 * ---------------------------------------------------------------------- */

/**
 * The cursor stack the pager walks. The contract's lists are cursor-paged
 * with no offset, so "Page N of M" has to remember how it got here.
 */
function useCursors(
  params: URLSearchParams,
  keys: readonly string[],
): {
  cursor: string | undefined;
  page: number;
  push: (next: string) => void;
  back: () => void;
  first: () => void;
} {
  const [stack, setStack] = useState<string[]>([]);
  const key = keys.map((k) => params.get(k) ?? '').join('|');
  const [seen, setSeen] = useState(key);
  if (seen !== key) {
    setSeen(key);
    setStack([]);
  }
  return {
    cursor: stack[stack.length - 1],
    page: stack.length + 1,
    push: (next) => setStack([...stack, next]),
    back: () => setStack(stack.slice(0, -1)),
    first: () => setStack([]),
  };
}

const CHECK_QUERY_KEYS = ['q', ...FILTER_KEYS] as const;

function ChecksTab({
  params,
  onPickCheck,
}: {
  params: URLSearchParams;
  onPickCheck: (id: string) => void;
}) {
  const pager = useCursors(params, CHECK_QUERY_KEYS);

  const query: Record<string, string> = { limit: String(PER_PAGE) };
  if (pager.cursor) query['cursor'] = pager.cursor;
  for (const k of CHECK_QUERY_KEYS) {
    const v = params.get(k);
    if (v) query[k] = v;
  }

  const checks = useQuery({
    queryKey: ['/configuration/checks', query],
    queryFn: ({ signal }) => api.get<Page<ConfigCheck>>('/configuration/checks', query, signal),
  });

  const total = checks.data?.page.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PER_PAGE));
  const next = checks.data?.page.nextCursor ?? null;

  return (
    <section className={styles.panel}>
      <header className={styles.panelHead}>
        <h2 className={styles.panelTitle}>
          Checks <span className={styles.count}>{num(total)}</span>
        </h2>
      </header>
      <div className={styles.tableWrap}>
        <table className={styles.grid}>
          <thead>
            <tr>
              <th scope="col">Check</th>
              <th scope="col">Platform</th>
              <th scope="col">Severity</th>
              <th scope="col">Expected</th>
              <th scope="col">Frameworks</th>
              <th scope="col" className={styles.numeric}>
                Pass
              </th>
              <th scope="col" className={styles.numeric}>
                Fail
              </th>
              <th scope="col" className={styles.numeric}>
                Exc.
              </th>
              <th scope="col" className={styles.numeric}>
                Compliance
              </th>
            </tr>
          </thead>
          <tbody>
            {checks.isPending ? (
              <tr>
                <td colSpan={9} className={styles.empty}>
                  Loading checks…
                </td>
              </tr>
            ) : total === 0 ? (
              <tr>
                <td colSpan={9} className={styles.empty}>
                  No checks match these filters
                </td>
              </tr>
            ) : (
              (checks.data?.items ?? []).map((c) => (
                <tr key={c.id}>
                  <td>
                    <button
                      type="button"
                      className={styles.checkLink}
                      onClick={() => onPickCheck(c.id)}
                    >
                      {c.title}
                    </button>
                    <small>
                      {c.id} · {c.category}
                      {c.custom ? ' · Custom' : ''}
                    </small>
                  </td>
                  <td>{PLATFORM_LABEL[c.platform]}</td>
                  <td>
                    <b className={SEVERITY_CLASS[c.severity]}>{SEVERITY_LABEL[c.severity]}</b>
                  </td>
                  <td className={styles.expected}>{c.expected}</td>
                  <td>
                    <FrameworkTags frameworks={c.frameworks} />
                  </td>
                  <td className={styles.numeric}>
                    <b className={styles.pctGood}>{num(c.passing)}</b>
                  </td>
                  <td className={styles.numeric}>
                    {c.failing > 0 ? (
                      <button
                        type="button"
                        className={styles.failLink}
                        onClick={() => onPickCheck(c.id)}
                      >
                        {num(c.failing)}
                      </button>
                    ) : (
                      <span className={styles.muted}>0</span>
                    )}
                  </td>
                  <td className={styles.numeric}>
                    {c.exceptions > 0 ? num(c.exceptions) : <span className={styles.muted}>0</span>}
                  </td>
                  <td className={styles.numeric}>
                    <b className={pctClass(c.compliancePct)}>{pctText(c.compliancePct)}</b>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <Pager
        from={(pager.page - 1) * PER_PAGE + 1}
        to={Math.min(pager.page * PER_PAGE, total)}
        total={total}
        page={pager.page}
        pages={pages}
        unit="checks"
        onFirst={pager.first}
        onPrevious={pager.back}
        onNext={next === null ? undefined : () => pager.push(next)}
      />
    </section>
  );
}

function Pager({
  from,
  to,
  total,
  page,
  pages,
  unit,
  onFirst,
  onPrevious,
  onNext,
}: {
  from: number;
  to: number;
  total: number;
  page: number;
  pages: number;
  unit: string;
  onFirst: () => void;
  onPrevious: () => void;
  onNext?: () => void;
}) {
  return (
    <footer className={styles.pager}>
      <span className={styles.pagerCount}>
        {total === 0 ? `No ${unit}` : `${num(from)}–${num(to)} of ${num(total)} ${unit}`}
      </span>
      <span className={styles.grow} />
      <Button size="sm" disabled={page === 1} onClick={onFirst}>
        First
      </Button>
      <Button size="sm" disabled={page === 1} onClick={onPrevious}>
        Previous
      </Button>
      <span className={styles.pagerPage}>
        Page {num(page)} of {num(pages)}
      </span>
      <Button size="sm" disabled={!onNext} onClick={onNext}>
        Next
      </Button>
    </footer>
  );
}

/* -------------------------------------------------------------------------
 * Devices
 * ---------------------------------------------------------------------- */

function DevicesTab({
  params,
  onPickDevice,
}: {
  params: URLSearchParams;
  onPickDevice: (id: string) => void;
}) {
  const pager = useCursors(params, ['q', 'group']);

  const query: Record<string, string> = { limit: String(PER_PAGE) };
  if (pager.cursor) query['cursor'] = pager.cursor;
  const q = params.get('q');
  const group = params.get('group');
  if (q) query['q'] = q;
  if (group) query['group'] = group;

  const devices = useQuery({
    queryKey: ['/configuration/devices', query],
    queryFn: ({ signal }) => api.get<Page<ConfigDevice>>('/configuration/devices', query, signal),
  });

  const total = devices.data?.page.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PER_PAGE));
  const next = devices.data?.page.nextCursor ?? null;

  return (
    <section className={styles.panel}>
      <header className={styles.panelHead}>
        <h2 className={styles.panelTitle}>
          Devices <span className={styles.count}>{num(total)}</span>
        </h2>
      </header>
      <div className={styles.tableWrap}>
        <table className={styles.grid}>
          <thead>
            <tr>
              <th scope="col">Device Name</th>
              <th scope="col">OS</th>
              <th scope="col">Location</th>
              <th scope="col">User</th>
              <th scope="col" className={styles.numeric}>
                Compliance
              </th>
              <th scope="col" className={styles.numeric}>
                Failed
              </th>
              <th scope="col" className={styles.numeric}>
                High Failed
              </th>
              <th scope="col" className={styles.numeric}>
                Exceptions
              </th>
              <th scope="col">Last Evaluated</th>
            </tr>
          </thead>
          <tbody>
            {devices.isPending ? (
              <tr>
                <td colSpan={9} className={styles.empty}>
                  Loading devices…
                </td>
              </tr>
            ) : total === 0 ? (
              <tr>
                <td colSpan={9} className={styles.empty}>
                  No devices in this scope
                </td>
              </tr>
            ) : (
              (devices.data?.items ?? []).map((d) => (
                <tr key={d.deviceId}>
                  <td>
                    <button
                      type="button"
                      className={styles.rowLink}
                      onClick={() => onPickDevice(d.deviceId)}
                    >
                      {d.name}
                    </button>
                  </td>
                  <td>{d.os}</td>
                  <td>{d.site}</td>
                  <td>{d.user}</td>
                  <td className={styles.numeric}>
                    <b className={pctClass(d.compliancePct)}>{pctText(d.compliancePct)}</b>
                  </td>
                  <td className={styles.numeric}>
                    {d.failing > 0 ? (
                      <b className={styles.pctBad}>{num(d.failing)}</b>
                    ) : (
                      <span className={styles.muted}>0</span>
                    )}
                  </td>
                  <td className={styles.numeric}>
                    {d.highFailing > 0 ? (
                      <b className={styles.pctBad}>{num(d.highFailing)}</b>
                    ) : (
                      <span className={styles.muted}>0</span>
                    )}
                  </td>
                  <td className={styles.numeric}>{num(d.exceptions)}</td>
                  <td>{dateTime(d.lastEvaluated)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <Pager
        from={(pager.page - 1) * PER_PAGE + 1}
        to={Math.min(pager.page * PER_PAGE, total)}
        total={total}
        page={pager.page}
        pages={pages}
        unit="devices"
        onFirst={pager.first}
        onPrevious={pager.back}
        onNext={next === null ? undefined : () => pager.push(next)}
      />
    </section>
  );
}

/* -------------------------------------------------------------------------
 * Exceptions
 * ---------------------------------------------------------------------- */

function ExceptionsTab({ onPickCheck }: { onPickCheck: (id: string) => void }) {
  const exceptions = useQuery({
    queryKey: ['/configuration/exceptions'],
    queryFn: ({ signal }) =>
      api.get<ConfigException[]>('/configuration/exceptions', undefined, signal),
  });

  const rows = exceptions.data ?? [];

  return (
    <section className={styles.panel}>
      <header className={styles.panelHead}>
        <h2 className={styles.panelTitle}>
          Exceptions <span className={styles.count}>{num(rows.length)}</span>
        </h2>
      </header>
      <div className={styles.tableWrap}>
        <table className={styles.grid}>
          <thead>
            <tr>
              <th scope="col">Check</th>
              <th scope="col">Scope</th>
              <th scope="col">Reason</th>
              <th scope="col">Expires</th>
              <th scope="col">Created By</th>
            </tr>
          </thead>
          <tbody>
            {exceptions.isPending ? (
              <tr>
                <td colSpan={5} className={styles.empty}>
                  Loading exceptions…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={5} className={styles.empty}>
                  No exceptions
                </td>
              </tr>
            ) : (
              rows.map((x) => (
                <tr key={x.id}>
                  <td>
                    <button
                      type="button"
                      className={styles.rowLink}
                      onClick={() => onPickCheck(x.checkId)}
                    >
                      {x.checkTitle}
                    </button>
                    <small>{x.checkId}</small>
                  </td>
                  <td>{x.scope}</td>
                  <td className={styles.reason}>{x.reason}</td>
                  <td>{x.expiresAt === null ? 'No expiry' : date(x.expiresAt)}</td>
                  <td>{x.grantedBy}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------
 * Benchmarks
 * ---------------------------------------------------------------------- */

function BenchmarksTab({ go }: { go: (next: Record<string, string | null>) => void }) {
  const benchmarks = useQuery({
    queryKey: ['/configuration/benchmarks'],
    queryFn: ({ signal }) => api.get<Benchmark[]>('/configuration/benchmarks', undefined, signal),
  });

  const rows = benchmarks.data ?? [];

  return (
    <section className={styles.panel}>
      <header className={styles.panelHead}>
        <h2 className={styles.panelTitle}>
          Benchmarks <span className={styles.count}>{num(rows.length)}</span>
        </h2>
        <span className={styles.grow} />
        <span className={styles.muted}>Evaluated every 24 hours and on Evaluate Now</span>
      </header>
      <div className={styles.tableWrap}>
        <table className={styles.grid}>
          <thead>
            <tr>
              <th scope="col">Benchmark</th>
              <th scope="col">Platform</th>
              <th scope="col" className={styles.numeric}>
                Checks
              </th>
              <th scope="col">Assigned To</th>
              <th scope="col" className={styles.numeric}>
                Devices
              </th>
              <th scope="col" className={styles.numeric}>
                Compliance
              </th>
              <th scope="col" aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {benchmarks.isPending ? (
              <tr>
                <td colSpan={7} className={styles.empty}>
                  Loading benchmarks…
                </td>
              </tr>
            ) : (
              rows.map((b) => (
                <tr key={b.id}>
                  <td>
                    <b>{b.name}</b>
                    <small>
                      {FRAMEWORK_LABEL[b.framework]} {b.version}
                    </small>
                  </td>
                  <td>{b.platform === null ? 'All' : PLATFORM_LABEL[b.platform]}</td>
                  <td className={styles.numeric}>{num(b.checks)}</td>
                  <td>{b.assignedTo}</td>
                  <td className={styles.numeric}>{num(b.devices)}</td>
                  <td className={styles.numeric}>
                    <b className={pctClass(b.compliancePct)}>{pctText(b.compliancePct)}</b>
                  </td>
                  <td className={styles.numeric}>
                    <button
                      type="button"
                      className={styles.rowLink}
                      onClick={() =>
                        go({
                          tab: 'checks',
                          framework: b.framework,
                          platform: b.platform,
                          group: b.assignedGroupId,
                        })
                      }
                    >
                      View Checks
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------
 * Profiles
 * ---------------------------------------------------------------------- */

function ProfilesTab({ summary }: { summary: ConfigurationSummary | undefined }) {
  const [platform, setPlatform] = useState<PlatformFamily | null>(null);

  const profiles = useQuery({
    queryKey: ['/configuration/profiles'],
    queryFn: ({ signal }) => api.get<ConfigProfile[]>('/configuration/profiles', undefined, signal),
  });

  const rows = (profiles.data ?? []).filter((p) => platform === null || p.platform === platform);

  // The reference names one profile in the panel title and lays its versions
  // out side by side. The one worth showing is the one that has been revised
  // most, which is the one with a history to show.
  const mostRevised = [...(profiles.data ?? [])].sort((a, b) => b.version - a.version)[0];

  const detail = useQuery({
    queryKey: ['/configuration/profiles', mostRevised?.id],
    queryFn: ({ signal }) =>
      api.get<ConfigProfileDetail>(
        `/configuration/profiles/${encodeURIComponent(mostRevised?.id ?? '')}`,
        undefined,
        signal,
      ),
    enabled: Boolean(mostRevised),
  });

  const history = detail.data?.settings.length ? detail.data : undefined;
  const versions = history
    ? [...new Set(history.settings.flatMap((s) => s.values.map((v) => v.version)))].sort(
        (a, b) => a - b,
      )
    : [];
  const current = versions[versions.length - 1];

  return (
    <>
      <header className={styles.subHead}>
        <h2>Configuration Profiles</h2>
      </header>

      {summary ? (
        <section className={styles.panelPadded}>
          <div className={styles.panelHeadInline}>
            <h2 className={styles.panelTitle}>Security Posture</h2>
            <span className={styles.grow} />
            <span className={styles.postureTotal}>
              Pass All Three{' '}
              <b>
                {num(summary.posture.protectedCount)} / {num(summary.posture.evaluatedDevices)}
              </b>
            </span>
          </div>
          <Rings
            caption="Devices protected by each control"
            data={summary.posture.controls.map<RingDatum>((c) => ({
              key: c.control,
              label: CONTROL_LABEL[c.control],
              value: c.compliancePct,
              tone: pctTone(c.compliancePct),
              sub: `${num(c.protectedCount)} protected`,
              pill: `${num(c.notProtected)} not protected`,
              pillTone: c.notProtected > 0 ? 'bad' : 'good',
            }))}
          />
        </section>
      ) : null}

      <div className={styles.row12}>
        <Panel title="Configuration Compliance">
          {summary ? (
            <Donut
              caption="Devices by compliance band"
              stack
              centreValue={pctText(summary.overallPct)}
              centreLabel="compliant"
              data={[
                {
                  key: 'compliant',
                  label: 'Compliant',
                  value: summary.deviceBands.high,
                  tone: 'good',
                },
                {
                  key: 'attention',
                  label: 'Needs Attention',
                  value: summary.deviceBands.medium,
                  tone: 'warn',
                },
                { key: 'failed', label: 'Failed', value: summary.deviceBands.low, tone: 'bad' },
              ]}
            />
          ) : (
            <Skeleton className={styles.figureSkeleton} />
          )}
        </Panel>

        <section className={styles.panel}>
          <header className={styles.panelHead}>
            <h2 className={styles.panelTitle}>
              {history ? `Version History — ${history.profile.name}` : 'Version History'}
            </h2>
          </header>
          <div className={styles.tableWrap}>
            <table className={styles.grid}>
              <thead>
                <tr>
                  <th scope="col">Setting</th>
                  {versions.map((v) => (
                    <th key={v} scope="col">
                      v{v}
                      {v === current ? ' Current' : ''}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {history ? (
                  history.settings.map((row) => (
                    <tr key={row.setting}>
                      <td>
                        <b>{row.setting}</b>
                      </td>
                      {versions.map((v) => {
                        const hit = row.values.find((x) => x.version === v);
                        return (
                          <td key={v} className={v === current ? styles.current : styles.wasValue}>
                            {hit ? hit.value : '—'}
                          </td>
                        );
                      })}
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={2} className={styles.empty}>
                      No version history recorded
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <div className={styles.subTabs} role="tablist" aria-label="Profiles by platform">
        {[null, ...PLATFORMS].map((p) => (
          <button
            key={p ?? 'all'}
            type="button"
            role="tab"
            aria-selected={platform === p}
            className={platform === p ? styles.tabOn : styles.tab}
            onClick={() => setPlatform(p)}
          >
            {p === null ? 'All' : PLATFORM_LABEL[p]}
          </button>
        ))}
      </div>

      <section className={styles.panel}>
        <div className={styles.tableWrap}>
          <table className={styles.grid}>
            <thead>
              <tr>
                <th scope="col">Profile</th>
                <th scope="col">Platform</th>
                <th scope="col" className={styles.numeric}>
                  Assigned Devices
                </th>
                <th scope="col" className={styles.numeric}>
                  Compliance
                </th>
                <th scope="col">Status</th>
                <th scope="col">Last Modified</th>
              </tr>
            </thead>
            <tbody>
              {profiles.isPending ? (
                <tr>
                  <td colSpan={6} className={styles.empty}>
                    Loading profiles…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className={styles.empty}>
                    No profiles for this platform
                  </td>
                </tr>
              ) : (
                rows.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <b>{p.name}</b>
                      <small>v{p.version}</small>
                    </td>
                    <td>{PLATFORM_LABEL[p.platform]}</td>
                    <td className={styles.numeric}>{num(p.assignedDevices)}</td>
                    <td className={styles.numeric}>
                      <b className={pctClass(p.compliancePct)}>{pctText(p.compliancePct)}</b>
                    </td>
                    <td>
                      <b className={p.status === 'active' ? styles.pctGood : styles.muted}>
                        {p.status === 'active'
                          ? 'Active'
                          : p.status === 'draft'
                            ? 'Draft'
                            : 'Preview'}
                      </b>
                    </td>
                    <td>{dateTime(p.modifiedAt)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

/* -------------------------------------------------------------------------
 * Drawers
 * ---------------------------------------------------------------------- */

function CheckDrawer({
  checkId,
  group,
  onClose,
  onPickDevice,
}: {
  checkId: string;
  group: string | null;
  onClose: () => void;
  onPickDevice: (id: string) => void;
}) {
  const query: Record<string, string> = { limit: '50' };
  if (group) query['group'] = group;

  const detail = useQuery({
    queryKey: ['/configuration/checks', checkId, query],
    queryFn: ({ signal }) =>
      api.get<ConfigCheckDetail>(
        `/configuration/checks/${encodeURIComponent(checkId)}`,
        query,
        signal,
      ),
  });

  const c = detail.data?.check;

  return (
    <Drawer
      title={c ? c.title : 'Check'}
      subtitle={c ? `${c.id} · ${PLATFORM_LABEL[c.platform]} · ${c.category}` : ''}
      onClose={onClose}
    >
      {c ? (
        <>
          <dl className={styles.facts}>
            <div>
              <dt>Expected</dt>
              <dd>{c.expected}</dd>
            </div>
            <div>
              <dt>Severity</dt>
              <dd className={SEVERITY_CLASS[c.severity]}>{SEVERITY_LABEL[c.severity]}</dd>
            </div>
            <div>
              <dt>Compliance</dt>
              <dd className={pctClass(c.compliancePct)}>{pctText(c.compliancePct)}</dd>
            </div>
            <div>
              <dt>Frameworks</dt>
              <dd>
                <FrameworkTags frameworks={c.frameworks} />
              </dd>
            </div>
            <div>
              <dt>Pass · Fail · Exception</dt>
              <dd>
                {num(c.passing)} · {num(c.failing)} · {num(c.exceptions)}
              </dd>
            </div>
            <div>
              <dt>Remediation</dt>
              <dd>{c.remediation === 'automatic' ? 'Automatic' : 'Manual'}</dd>
            </div>
          </dl>

          <h3 className={styles.drawerSection}>Devices evaluated</h3>
          <div className={styles.tableWrap}>
            <table className={styles.grid}>
              <thead>
                <tr>
                  <th scope="col">Device Name</th>
                  <th scope="col">OS</th>
                  <th scope="col">Location</th>
                  <th scope="col">Actual Value</th>
                  <th scope="col">Result</th>
                </tr>
              </thead>
              <tbody>
                {(detail.data?.results ?? []).map((r) => (
                  <tr key={r.deviceId}>
                    <td>
                      <button
                        type="button"
                        className={styles.rowLink}
                        onClick={() => onPickDevice(r.deviceId)}
                      >
                        {r.name}
                      </button>
                    </td>
                    <td>{r.os}</td>
                    <td>{r.site}</td>
                    <td className={styles.expected}>{r.actual}</td>
                    <td>
                      <b
                        className={
                          r.result === 'pass'
                            ? styles.pctGood
                            : r.result === 'fail'
                              ? styles.pctBad
                              : styles.muted
                        }
                      >
                        {r.result === 'pass' ? 'Pass' : r.result === 'fail' ? 'Fail' : 'Exception'}
                      </b>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className={styles.note}>
            The framework mapping is an illustrative one. Validate against the published CIS, DISA
            STIG, PCI DSS and HIPAA documents before relying on it for an audit.
          </p>
        </>
      ) : (
        <Skeleton className={styles.tableSkeleton} />
      )}
    </Drawer>
  );
}

function DeviceDrawer({
  deviceId,
  onClose,
  onPickCheck,
}: {
  deviceId: string;
  onClose: () => void;
  onPickCheck: (id: string) => void;
}) {
  const detail = useQuery({
    queryKey: ['/configuration/devices', deviceId],
    queryFn: ({ signal }) =>
      api.get<ConfigDeviceDetail>(
        `/configuration/devices/${encodeURIComponent(deviceId)}`,
        undefined,
        signal,
      ),
  });

  const d = detail.data;

  return (
    <Drawer
      title={d ? d.name : 'Device'}
      subtitle={d ? `${d.os} · ${d.site} · ${d.user}` : ''}
      onClose={onClose}
    >
      {d ? (
        <>
          <dl className={styles.facts}>
            <div>
              <dt>Compliance</dt>
              <dd className={pctClass(d.compliancePct)}>{pctText(d.compliancePct)}</dd>
            </div>
            <div>
              <dt>Passed</dt>
              <dd className={styles.pctGood}>{num(d.passing)}</dd>
            </div>
            <div>
              <dt>Failed</dt>
              <dd className={styles.pctBad}>{num(d.failing)}</dd>
            </div>
            <div>
              <dt>Exceptions</dt>
              <dd>{num(d.exceptions)}</dd>
            </div>
          </dl>

          <h3 className={styles.drawerSection}>Failed checks</h3>
          <div className={styles.tableWrap}>
            <table className={styles.grid}>
              <thead>
                <tr>
                  <th scope="col">Failed Check</th>
                  <th scope="col">Severity</th>
                  <th scope="col">Expected</th>
                  <th scope="col">Actual</th>
                </tr>
              </thead>
              <tbody>
                {d.failedChecks.length === 0 ? (
                  <tr>
                    <td colSpan={4} className={styles.empty}>
                      No failed checks
                    </td>
                  </tr>
                ) : (
                  d.failedChecks.map((c) => (
                    <tr key={c.id}>
                      <td>
                        <button
                          type="button"
                          className={styles.rowLink}
                          onClick={() => onPickCheck(c.id)}
                        >
                          {c.title}
                        </button>
                        <small>
                          {c.id} · {c.category}
                        </small>
                      </td>
                      <td>
                        <b className={SEVERITY_CLASS[c.severity]}>{SEVERITY_LABEL[c.severity]}</b>
                      </td>
                      <td className={styles.expected}>{c.expected}</td>
                      <td className={`${styles.expected} ${styles.pctBad}`}>{c.actual}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <Skeleton className={styles.tableSkeleton} />
      )}
    </Drawer>
  );
}

function Drawer({
  title,
  subtitle,
  onClose,
  children,
}: {
  title: string;
  subtitle: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className={styles.overlay}
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <aside className={styles.drawer} role="dialog" aria-modal="true" aria-label={title}>
        <header className={styles.drawerHead}>
          <div>
            <h2>{title}</h2>
            {subtitle ? <span>{subtitle}</span> : null}
          </div>
          <Button size="sm" onClick={onClose} aria-label="Close">
            Close
          </Button>
        </header>
        <div className={styles.drawerBody}>{children}</div>
      </aside>
    </div>
  );
}
