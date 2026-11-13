import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Button, ErrorState, Skeleton, useToast } from '@aegis/ui';
import { api, ApiError, type Page } from '../api/client';
import { useCan } from '../app/auth';
import { bytes, dateTime, num } from '../app/format';
import type {
  AuditEntry,
  DeviceGroup,
  EndpointJobStatus,
  LiveJob,
  LiveJobKind,
  LiveJobResult,
  LogBundle,
  LogSchedule,
  LogSettings,
  LogStats,
} from '../api/types';
import styles from './LiveActivity.module.css';

/**
 * Live Activity, restored to the approved v129 layout: five tabs, and a
 * Console that is three operation cards over a two-step grid — configure the
 * request on the left, choose the endpoints on the right, review at the foot.
 *
 * Every one of the three operations is a job: submitted, polled, and read
 * back per endpoint. There is no interactive session here and no channel to
 * attach to. Once a job is submitted the only things the console can do are
 * watch it and cancel it, which is the difference between running a script
 * and remote control — and remote control is its own page now, next door,
 * with its own consent rules.
 */

const TABS = [
  { id: 'console', label: 'Console' },
  { id: 'logs', label: 'Log Collection' },
  { id: 'results', label: 'Task Results' },
  { id: 'history', label: 'Task History' },
  { id: 'audit', label: 'Audit Trail' },
] as const;

/** The three operations, in the reference's order and its own words. */
const MODES = [
  {
    id: 'live-data',
    name: 'Live Data',
    blurb: 'Request fresh facts from selected computers.',
  },
  {
    id: 'script',
    name: 'Run Script',
    blurb: 'PowerShell, Shell, Python or Command Prompt.',
  },
  {
    id: 'log-collection',
    name: 'Collect Logs',
    blurb: 'Retrieve agent, system or custom log files.',
  },
] as const;

/** The eight live-data fields of the contract, with the reference's captions. */
const LIVE_DATA_FIELDS = [
  { id: 'hostname', label: 'Hostname', caption: 'Device Identity' },
  { id: 'operating-system', label: 'Operating System', caption: 'Platform & Version' },
  { id: 'ip-address', label: 'IP Address', caption: 'Network Address' },
  { id: 'agent-status', label: 'Agent Status', caption: 'Connection State' },
  { id: 'last-seen', label: 'Last Seen', caption: 'Last Agent Check-In' },
  { id: 'cpu-usage', label: 'CPU Usage', caption: 'Processor Utilization' },
  { id: 'memory-usage', label: 'Memory Usage', caption: 'RAM Utilization' },
  { id: 'free-disk-space', label: 'Free Disk Space', caption: 'Available Storage' },
] as const;

const RUNTIMES = [
  { id: 'powershell', label: 'PowerShell' },
  { id: 'shell', label: 'Shell' },
  { id: 'python', label: 'Python' },
  { id: 'cmd', label: 'Command Prompt' },
] as const;

const LOG_SOURCES = [
  { id: 'agent', label: 'Agent Logs' },
  { id: 'system-event', label: 'System Logs' },
  { id: 'application', label: 'Application Logs' },
  { id: 'custom-path', label: 'Custom Path' },
] as const;

/** The reference's own example, loaded by the button of the same name. */
const INVENTORY_EXAMPLE =
  'Get-CimInstance Win32_OperatingSystem | Select-Object Caption, Version, LastBootUpTime | ConvertTo-Json';

const KIND_LABEL: Record<LiveJobKind, string> = {
  'live-data': 'query',
  script: 'script',
  'log-collection': 'logs',
};

export default function LiveActivity() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') ?? 'console';
  const openJobId = params.get('job');

  const set = (key: string, value: string | null) => {
    const next = new URLSearchParams(params);
    if (value === null) next.delete(key);
    else next.set(key, value);
    setParams(next, { replace: true });
  };

  const history = useQuery({
    queryKey: ['/liveops/script-jobs', 'history'],
    queryFn: ({ signal }) => api.get<Page<LiveJob>>('/liveops/script-jobs', { limit: 50 }, signal),
  });

  return (
    <div className={styles.page}>
      <div className={styles.heading}>
        <div>
          <p className={styles.eyebrow}>Aegis One / Operations</p>
          <h1 className={styles.title}>Live Activity</h1>
          <p className={styles.subtitle}>
            Investigate endpoints, run scripts and collect diagnostics from one console.
          </p>
        </div>
      </div>

      <div className={styles.tabs} role="tablist" aria-label="Live Activity">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={tab === t.id ? styles.tabOn : styles.tab}
            onClick={() => set('tab', t.id)}
          >
            {t.label}
            {t.id === 'history' && history.data ? (
              <span className={styles.tabCount}>{num(history.data.items.length)}</span>
            ) : null}
          </button>
        ))}
      </div>

      {tab === 'console' ? <Console onOpen={(id) => set('job', id)} /> : null}
      {tab === 'logs' ? <LogCollection /> : null}
      {tab === 'results' ? <TaskResults jobId={openJobId} /> : null}
      {tab === 'history' ? (
        <History
          query={history}
          onOpen={(id) => {
            const next = new URLSearchParams(params);
            next.set('job', id);
            next.set('tab', 'results');
            setParams(next, { replace: true });
          }}
        />
      ) : null}
      {tab === 'audit' ? <AuditTrail /> : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Console                                                            */
/* ------------------------------------------------------------------ */

function Console({ onOpen }: { onOpen: (id: string) => void }) {
  const canRun = useCan('liveops:run');
  const toast = useToast();

  const [mode, setMode] = useState<LiveJobKind>('live-data');
  const [name, setName] = useState('');
  const [changeRef, setChangeRef] = useState('');
  const [fields, setFields] = useState<string[]>([
    'hostname',
    'operating-system',
    'ip-address',
    'agent-status',
  ]);
  const [runtime, setRuntime] = useState('powershell');
  const [script, setScript] = useState(INVENTORY_EXAMPLE);
  const [logSource, setLogSource] = useState('agent');
  const [timeoutSeconds, setTimeoutSeconds] = useState(120);
  const [outputLimitKb, setOutputLimitKb] = useState(64);

  const [search, setSearch] = useState('');
  const [platform, setPlatform] = useState('');
  const [groupId, setGroupId] = useState('');
  const [selected, setSelected] = useState<string[]>([]);

  const groups = useQuery({
    queryKey: ['/groups', 'liveops'],
    queryFn: ({ signal }) =>
      // /groups returns the whole tree and a summary, not a page.
      api.get<{ items: DeviceGroup[] }>('/groups', {}, signal),
  });

  const devices = useQuery({
    queryKey: ['/devices', 'liveops', search, platform],
    queryFn: ({ signal }) =>
      api.get<Page<{ id: string; hostname: string; osName: string; ip: string; status: string }>>(
        '/devices',
        {
          limit: 50,
          fields: 'id,hostname,osName,ip,status',
          sort: 'hostname',
          ...(search.trim() ? { q: search.trim() } : {}),
          ...(platform ? { osFamily: platform } : {}),
        },
        signal,
      ),
  });

  const shown = devices.data?.items ?? [];
  const groupMembers = groups.data?.items.find((g) => g.id === groupId)?.members ?? 0;
  const targetCount = selected.length || groupMembers;

  const submit = useMutation({
    mutationFn: () =>
      api.post<LiveJob>('/liveops/script-jobs', {
        kind: mode,
        name: name.trim(),
        ...(changeRef.trim() ? { changeRef: changeRef.trim() } : {}),
        targets: {
          ...(selected.length ? { deviceIds: selected } : {}),
          ...(!selected.length && groupId ? { groupIds: [groupId] } : {}),
        },
        timeoutSeconds,
        outputLimitKb,
        ...(mode === 'script' ? { script: { language: runtime, body: script } } : {}),
        ...(mode === 'live-data' ? { liveData: { fields } } : {}),
        ...(mode === 'log-collection' ? { logCollection: { sources: [logSource] } } : {}),
      }),
    onSuccess: (job) => {
      toast.show({
        tone: 'success',
        title: 'Request submitted',
        message: `${num(job.targetCount)} endpoints targeted. Each reports back on its next check-in.`,
      });
      setName('');
      setSelected([]);
      onOpen(job.id);
    },
    onError: (err) =>
      toast.show({
        tone: 'error',
        title: 'The request could not be submitted',
        message:
          err instanceof ApiError
            ? `${err.message} Nothing ran on any endpoint. Reference ${err.requestId}.`
            : 'Nothing ran on any endpoint.',
      }),
  });

  const ready =
    name.trim().length > 0 &&
    targetCount > 0 &&
    (mode !== 'script' || script.trim().length > 0) &&
    (mode !== 'live-data' || fields.length > 0);

  const current = MODES.find((m) => m.id === mode);

  return (
    <>
      <div className={styles.modes}>
        {MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            aria-pressed={mode === m.id}
            className={mode === m.id ? styles.modeOn : styles.mode}
            onClick={() => setMode(m.id)}
          >
            <span className={styles.modeIcon} aria-hidden="true">
              <ModeGlyph id={m.id} />
            </span>
            <b>{m.name}</b>
            <small>{m.blurb}</small>
          </button>
        ))}
      </div>

      <div className={styles.grid}>
        <section className={styles.card}>
          <div className={styles.panelHead}>
            <span className={styles.step}>01</span>
            <div>
              <h2 className={styles.panelTitle}>Configure Request</h2>
              <p className={styles.panelSub}>Define what you need from your endpoints.</p>
            </div>
          </div>

          <div className={styles.fields}>
            <label className={styles.field}>
              <span>Task Name</span>
              <input
                value={name}
                maxLength={120}
                placeholder="Endpoint health check"
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <label className={styles.field}>
              <span>Reason / ticket (optional)</span>
              <input
                value={changeRef}
                maxLength={64}
                placeholder="e.g. INC-1234 or short reason"
                onChange={(e) => setChangeRef(e.target.value)}
              />
            </label>
          </div>

          {mode === 'live-data' ? (
            <fieldset className={styles.fieldset}>
              <legend>Data to Request</legend>
              <div className={styles.checks}>
                {LIVE_DATA_FIELDS.map((f) => {
                  const on = fields.includes(f.id);
                  return (
                    <label key={f.id} className={on ? styles.checkOn : styles.check}>
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={(e) =>
                          setFields((prev) =>
                            e.target.checked ? [...prev, f.id] : prev.filter((x) => x !== f.id),
                          )
                        }
                      />
                      <b>{f.label}</b>
                      <small>{f.caption}</small>
                    </label>
                  );
                })}
              </div>
              <p className={styles.note}>
                {fields.length} of {LIVE_DATA_FIELDS.length} fields selected · each is read from the
                endpoint at check-in, not from the console&rsquo;s own inventory.
              </p>
            </fieldset>
          ) : null}

          {mode === 'script' ? (
            <>
              <label className={styles.field}>
                <span>Script Runtime</span>
                <select value={runtime} onChange={(e) => setRuntime(e.target.value)}>
                  {RUNTIMES.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </label>

              <div className={styles.editorTools}>
                <span>Custom Script</span>
                <Button size="sm" onClick={() => setScript(INVENTORY_EXAMPLE)}>
                  Load Inventory Example
                </Button>
              </div>
              <textarea
                className={styles.code}
                spellCheck={false}
                maxLength={65_536}
                aria-label="Custom Script"
                value={script}
                onChange={(e) => setScript(e.target.value)}
              />
              <p className={styles.note}>
                The selected interpreter must be installed. PowerShell and Command Prompt target
                Windows; Shell targets Unix platforms. Python availability is verified by the agent.
              </p>
            </>
          ) : null}

          {mode === 'log-collection' ? (
            <>
              <label className={styles.field}>
                <span>Log Source</span>
                <select value={logSource} onChange={(e) => setLogSource(e.target.value)}>
                  {LOG_SOURCES.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </label>
              <p className={styles.note}>
                Collect the latest log tail, capped by the output limit. The server enforces
                permitted paths and redacts secrets before returning content.
              </p>
            </>
          ) : null}

          <div className={styles.fields}>
            <label className={styles.field}>
              <span>Timeout (seconds)</span>
              <input
                type="number"
                min={5}
                max={3600}
                value={timeoutSeconds}
                onChange={(e) => setTimeoutSeconds(Number(e.target.value))}
              />
            </label>
            <label className={styles.field}>
              <span>Output limit per target (KB)</span>
              <input
                type="number"
                min={1}
                max={256}
                value={outputLimitKb}
                onChange={(e) => setOutputLimitKb(Number(e.target.value))}
              />
            </label>
          </div>
        </section>

        <section className={styles.card}>
          <div className={styles.sectionHead}>
            <div className={styles.panelHead}>
              <span className={styles.step}>02</span>
              <div>
                <h2 className={styles.panelTitle}>Select Targets</h2>
                <p className={styles.panelSub}>Choose the endpoints for this operation.</p>
              </div>
            </div>
            <span className={styles.selectedCount}>{num(targetCount)} selected</span>
          </div>

          <div className={styles.fields}>
            <label className={styles.field}>
              <span className={styles.srOnly}>Search</span>
              <input
                type="search"
                placeholder="Search computer, IP or OS…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
            <label className={styles.field}>
              <span className={styles.srOnly}>Platform</span>
              <select value={platform} onChange={(e) => setPlatform(e.target.value)}>
                <option value="">All Platforms</option>
                <option value="Windows">Windows</option>
                <option value="macOS">macOS</option>
                <option value="Linux">Linux</option>
                <option value="AIX">AIX</option>
              </select>
            </label>
          </div>

          <div className={styles.selection}>
            <label className={styles.field}>
              <span className={styles.srOnly}>Add Device Group</span>
              <select value={groupId} onChange={(e) => setGroupId(e.target.value)}>
                <option value="">Add Device Group…</option>
                {(groups.data?.items ?? []).map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name} ({num(g.members)})
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className={styles.linkButton}
              onClick={() => setSelected(shown.map((d) => d.id))}
            >
              Select all applicable ({num(shown.length)})
            </button>
            <button
              type="button"
              className={styles.linkMuted}
              onClick={() => {
                setSelected([]);
                setGroupId('');
              }}
            >
              Clear Selection
            </button>
          </div>

          <div className={styles.targetsHead}>
            <span />
            <span>Computer</span>
            <span>Status</span>
          </div>

          <div className={styles.targets}>
            {devices.isLoading ? (
              <Skeleton className={styles.targetsSkeleton} />
            ) : shown.length === 0 ? (
              <p className={styles.empty}>No endpoint matches this search.</p>
            ) : (
              shown.map((d) => (
                <label key={d.id} className={styles.target}>
                  <input
                    type="checkbox"
                    checked={selected.includes(d.id)}
                    onChange={(e) =>
                      setSelected((prev) =>
                        e.target.checked ? [...prev, d.id] : prev.filter((x) => x !== d.id),
                      )
                    }
                  />
                  <span className={styles.targetName}>
                    <b>{d.hostname}</b>
                    <small>
                      {d.osName} · {d.ip}
                    </small>
                  </span>
                  <span className={d.status === 'online' ? styles.good : styles.warn}>
                    {d.status === 'online' ? 'Online' : 'Offline'}
                  </span>
                </label>
              ))
            )}
          </div>

          <div className={styles.targetFoot}>
            <span>{num(shown.length)} Endpoints Shown</span>
            <span>Selection Persists Across Filters</span>
          </div>
        </section>
      </div>

      <div className={styles.submit}>
        <div>
          <b>Build Your Request</b>
          <small>
            {current?.name} · {timeoutSeconds}s timeout · {outputLimitKb} KB per Endpoint
          </small>
        </div>
        <Button
          variant="primary"
          disabled={!ready || !canRun}
          loading={submit.isPending}
          onClick={() => submit.mutate()}
        >
          Review Request
        </Button>
      </div>
    </>
  );
}

/** Three flat glyphs, drawn rather than lettered: no emoji anywhere here. */
function ModeGlyph({ id }: { id: LiveJobKind }) {
  if (id === 'script') {
    return (
      <svg viewBox="0 0 20 20" width="20" height="20" fill="none" stroke="currentColor">
        <path d="M4 6l3 4-3 4" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M10 14h6" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    );
  }
  if (id === 'log-collection') {
    return (
      <svg viewBox="0 0 20 20" width="20" height="20" fill="none" stroke="currentColor">
        <path d="M3 5h14M3 10h10M3 15h6" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 20 20" width="20" height="20" fill="none" stroke="currentColor">
      <rect x="3" y="3" width="6" height="6" strokeWidth="1.6" />
      <rect x="11" y="11" width="6" height="6" strokeWidth="1.6" />
      <path d="M9 6h4a3 3 0 013 3v2" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Log Collection                                                     */
/* ------------------------------------------------------------------ */

const LOG_SUBTABS = [
  { id: 'collected', label: 'Collected Logs' },
  { id: 'schedules', label: 'Schedules' },
  { id: 'storage', label: 'Storage & Mail' },
] as const;

const LOG_TYPE_LABEL: Record<string, string> = {
  agent: 'Agent',
  'system-event': 'System / Event',
  application: 'Application',
  security: 'Security',
  'patch-update': 'Patch & Update',
  'custom-path': 'Custom Path',
};

function LogCollection() {
  const [sub, setSub] = useState<string>('collected');
  const [status, setStatus] = useState('');
  const [logType, setLogType] = useState('');
  const [collected, setCollected] = useState('');

  const logs = useQuery({
    queryKey: ['/liveops/logs', status, logType, collected],
    queryFn: ({ signal }) =>
      api.get<Page<LogBundle> & { stats: LogStats }>(
        '/liveops/logs',
        {
          limit: 25,
          ...(status ? { status } : {}),
          ...(logType ? { logType } : {}),
          ...(collected ? { collected } : {}),
        },
        signal,
      ),
  });

  if (logs.error) {
    return <ErrorState description="Collected logs could not be loaded." onRetry={logs.refetch} />;
  }

  const stats = logs.data?.stats;

  return (
    <>
      <div className={styles.kpis}>
        {stats ? (
          <>
            <Kpi label="Bundles Stored" value={num(stats.bundlesStored)} />
            <Kpi label="Hosts Covered" value={num(stats.hostsCovered)} />
            <Kpi label="Failed or Waiting" value={num(stats.failedOrWaiting)} />
            <Kpi label="Storage Used" value={num(stats.storageUsedMb)} suffix="MB" />
            <Kpi
              label="Next Scheduled"
              value={stats.nextScheduled ? dateTime(stats.nextScheduled) : '—'}
            />
          </>
        ) : (
          Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className={styles.kpiSkeleton} />)
        )}
      </div>

      <div className={styles.subtabs} role="tablist" aria-label="Log collection">
        {LOG_SUBTABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={sub === t.id}
            className={sub === t.id ? styles.subtabOn : styles.subtab}
            onClick={() => setSub(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {sub === 'collected' ? (
        <section className={styles.card}>
          <div className={styles.filters}>
            <label className={styles.inlineField}>
              <span>Status</span>
              <select value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="">All</option>
                {['uploaded', 'waiting', 'failed', 'skipped'].map((s) => (
                  <option key={s} value={s}>
                    {s.slice(0, 1).toUpperCase() + s.slice(1)}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.inlineField}>
              <span>Log Type</span>
              <select value={logType} onChange={(e) => setLogType(e.target.value)}>
                <option value="">All</option>
                {Object.entries(LOG_TYPE_LABEL).map(([id, label]) => (
                  <option key={id} value={id}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.inlineField}>
              <span>Collected</span>
              <select value={collected} onChange={(e) => setCollected(e.target.value)}>
                <option value="">All</option>
                <option value="24h">Last 24 Hours</option>
                <option value="7d">Last 7 Days</option>
                <option value="30d">Last 30 Days</option>
              </select>
            </label>
          </div>

          <header className={styles.tableHead}>
            <h2 className={styles.panelTitle}>Collected Logs</h2>
            <span className={styles.muted}>{num(stats?.bundlesStored ?? 0)} stored</span>
          </header>

          {logs.data ? (
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">Hostname</th>
                  <th scope="col">Types</th>
                  <th scope="col">Status</th>
                  <th scope="col" className={styles.numeric}>
                    Size
                  </th>
                  <th scope="col">Collected</th>
                  <th scope="col">Emailed</th>
                </tr>
              </thead>
              <tbody>
                {logs.data.items.length === 0 ? (
                  <tr>
                    <td colSpan={6} className={styles.empty}>
                      No logs match these filters · use Collect Now or a schedule
                    </td>
                  </tr>
                ) : (
                  logs.data.items.map((l) => (
                    <tr key={l.id}>
                      <td>
                        <b>{l.hostname}</b>
                      </td>
                      <td>{l.fileTypes.map((t) => LOG_TYPE_LABEL[t] ?? t).join(', ')}</td>
                      <td>
                        <span className={LOG_STATUS_CLASS[l.status]}>
                          {l.status.slice(0, 1).toUpperCase() + l.status.slice(1)}
                        </span>
                      </td>
                      <td className={styles.numeric}>{bytes(l.sizeBytes)}</td>
                      <td>{dateTime(l.collectedAt)}</td>
                      <td>{l.emailed ? 'Yes' : 'No'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          ) : (
            <Skeleton className={styles.tableSkeleton} />
          )}
        </section>
      ) : null}

      {sub === 'schedules' ? <Schedules /> : null}
      {sub === 'storage' ? <StorageAndMail /> : null}
    </>
  );
}

const LOG_STATUS_CLASS: Record<LogBundle['status'], string | undefined> = {
  uploaded: styles.good,
  waiting: styles.warn,
  failed: styles.bad,
  skipped: styles.muted,
};

function Schedules() {
  const schedules = useQuery({
    queryKey: ['/liveops/log-schedules'],
    queryFn: ({ signal }) => api.get<LogSchedule[]>('/liveops/log-schedules', {}, signal),
  });

  return (
    <section className={styles.card}>
      <header className={styles.tableHead}>
        <h2 className={styles.panelTitle}>Schedules</h2>
        <span className={styles.muted}>{num(schedules.data?.length ?? 0)}</span>
      </header>
      {schedules.data ? (
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">Schedule</th>
              <th scope="col">Log Types</th>
              <th scope="col" className={styles.numeric}>
                Runs
              </th>
              <th scope="col">Delivery</th>
              <th scope="col">Next Run</th>
              <th scope="col">Last Run</th>
              <th scope="col">Enabled</th>
            </tr>
          </thead>
          <tbody>
            {schedules.data.length === 0 ? (
              <tr>
                <td colSpan={7} className={styles.empty}>
                  No Schedules Yet
                </td>
              </tr>
            ) : (
              schedules.data.map((s) => (
                <tr key={s.id}>
                  <td>
                    <b>{s.name}</b>
                  </td>
                  <td>{s.sources.map((t) => LOG_TYPE_LABEL[t] ?? t).join(', ')}</td>
                  <td className={styles.numeric}>{num(s.runs ?? 0)}</td>
                  <td>{s.delivery ?? '—'}</td>
                  <td>{dateTime(s.nextRunAt)}</td>
                  <td>{s.lastRunAt ? dateTime(s.lastRunAt) : '—'}</td>
                  <td>
                    <span className={s.enabled ? styles.good : styles.muted}>
                      {s.enabled ? 'Enabled' : 'Off'}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      ) : (
        <Skeleton className={styles.tableSkeleton} />
      )}
    </section>
  );
}

const LAYOUT_LABEL: Record<string, string> = {
  'date-hostname': 'Date \\ Hostname',
  'hostname-date': 'Hostname \\ Date',
};

const SEND_AS_LABEL: Record<string, string> = {
  link: 'Secure Download Link',
  'attachment-when-small': 'Attachment when small, link otherwise',
};

function StorageAndMail() {
  const settings = useQuery({
    queryKey: ['/liveops/log-settings'],
    queryFn: ({ signal }) => api.get<LogSettings>('/liveops/log-settings', {}, signal),
  });

  const s = settings.data;
  if (!s) return <Skeleton className={styles.tableSkeleton} />;

  return (
    <div className={styles.twoCol}>
      <section className={styles.card}>
        <div className={styles.panelHead}>
          <h2 className={styles.panelTitle}>Central Storage (Root Server)</h2>
        </div>
        <dl className={styles.settings}>
          <Setting label="Root Path" value={s.rootPath ?? '—'} mono />
          <Setting
            label="Folder Layout"
            value={LAYOUT_LABEL[s.folderLayout ?? ''] ?? s.folderLayout ?? '—'}
          />
          <Setting label="File Name Pattern" value={s.fileNamePattern ?? '—'} mono />
          <Setting label="Retention" value={`${num(s.retentionDays)} days`} />
          <Setting label="Max Bundle Size" value={`${num(s.maxBundleSizeMb ?? 0)} MB`} />
        </dl>
        <p className={styles.note}>
          Tokens: {'{hostname}'} {'{type}'} {'{yyyyMMdd-HHmm}'}. The root path is a placeholder
          here; a real one names a server.
        </p>
      </section>

      <section className={styles.card}>
        <div className={styles.panelHead}>
          <h2 className={styles.panelTitle}>Email Delivery</h2>
        </div>
        <dl className={styles.settings}>
          <Setting
            label="Default Recipients"
            value={s.recipients?.length ? s.recipients.join(', ') : 'None'}
          />
          <Setting label="Send As" value={SEND_AS_LABEL[s.sendAs ?? ''] ?? s.sendAs ?? '—'} />
          <Setting label="Attachment Limit" value={`${num(s.attachmentLimitMb ?? 0)} MB`} />
          <Setting label="Email Bundles" value={s.emailBundles ? 'On' : 'Off'} />
        </dl>
        <p className={styles.note}>
          Mail uses the SMTP server set in Integrations → Notifications. These settings are read
          only here: the contract declares the write, and nothing serves it yet.
        </p>
      </section>
    </div>
  );
}

function Setting({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className={styles.setting}>
      <dt>{label}</dt>
      <dd className={mono ? styles.mono : undefined}>{value}</dd>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Task Results                                                       */
/* ------------------------------------------------------------------ */

const RESULT_LABEL: Record<EndpointJobStatus, string> = {
  queued: 'QUEUED',
  running: 'RUNNING',
  succeeded: 'SUCCESS',
  failed: 'FAILED',
  'timed-out': 'TIMED OUT',
  cancelled: 'CANCELLED',
  offline: 'UNREACHABLE',
};

const RESULT_CLASS: Record<EndpointJobStatus, string | undefined> = {
  queued: styles.muted,
  running: styles.cool,
  succeeded: styles.good,
  failed: styles.bad,
  'timed-out': styles.warn,
  cancelled: styles.muted,
  offline: styles.bad,
};

function TaskResults({ jobId }: { jobId: string | null }) {
  const canRun = useCan('liveops:run');

  const job = useQuery({
    queryKey: ['/liveops/script-jobs', jobId],
    enabled: jobId !== null,
    queryFn: ({ signal }) => api.get<LiveJob>(`/liveops/script-jobs/${jobId ?? ''}`, {}, signal),
  });

  const results = useQuery({
    queryKey: ['/liveops/script-jobs', jobId, 'results'],
    enabled: jobId !== null,
    queryFn: ({ signal }) =>
      api.get<Page<LiveJobResult>>(
        `/liveops/script-jobs/${jobId ?? ''}/results`,
        { limit: 100 },
        signal,
      ),
  });

  if (jobId === null) {
    return (
      <div className={styles.emptyPanel}>
        <h2>No Task Selected</h2>
        <p>Create a request or open a task from history.</p>
      </div>
    );
  }

  const j = job.data;

  return (
    <section className={styles.card}>
      <div className={styles.sectionHead}>
        <div>
          <h2 className={styles.panelTitle}>{j?.title ?? 'Task'}</h2>
          <p className={styles.panelSub}>
            {j ? dateTime(j.submittedAt) : '…'} ·{' '}
            {j ? (
              <span className={JOB_STATUS_CLASS[j.status]}>{j.status.replace(/-/g, ' ')}</span>
            ) : null}
          </p>
        </div>
        <div className={styles.actions}>
          <Button size="sm" onClick={() => void results.refetch()}>
            Refresh Results
          </Button>
          <Button size="sm" disabled={!canRun}>
            Cancel Task
          </Button>
        </div>
      </div>

      {results.data ? (
        <div className={styles.scroll}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">Device ID</th>
                <th scope="col">Device Name</th>
                <th scope="col">Connection</th>
                <th scope="col">Action ID</th>
                <th scope="col">Action Type</th>
                <th scope="col">Status</th>
                <th scope="col" className={styles.numeric}>
                  Exit Code
                </th>
                <th scope="col">Reason</th>
                <th scope="col">Detail</th>
                <th scope="col">Timestamps</th>
              </tr>
            </thead>
            <tbody>
              {results.data.items.length === 0 ? (
                <tr>
                  <td colSpan={10} className={styles.empty}>
                    No endpoint has reported back yet.
                  </td>
                </tr>
              ) : (
                results.data.items.map((r) => (
                  <tr key={r.deviceId}>
                    <td className={styles.mono}>{r.deviceId}</td>
                    <td className={styles.hostCell}>
                      <b>{r.deviceName}</b>
                    </td>
                    <td>
                      <span className={r.connection === 'online' ? styles.good : styles.warn}>
                        {r.connection === 'online' ? 'Online' : 'Offline'}
                      </span>
                    </td>
                    <td className={styles.mono}>{r.actionId ?? '—'}</td>
                    <td className={styles.mono}>{r.actionType ?? '—'}</td>
                    <td>
                      <span className={RESULT_CLASS[r.status]}>{RESULT_LABEL[r.status]}</span>
                    </td>
                    <td className={styles.numeric}>{r.exitCode ?? '—'}</td>
                    <td>{r.reason ?? '—'}</td>
                    <td className={styles.detail}>{r.detail ?? '—'}</td>
                    <td className={styles.stamps}>
                      <small>Queued {r.queuedAt ? dateTime(r.queuedAt) : '—'}</small>
                      <small>Started {r.startedAt ? dateTime(r.startedAt) : '—'}</small>
                      <small>Finished {r.finishedAt ? dateTime(r.finishedAt) : '—'}</small>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <Skeleton className={styles.tableSkeleton} />
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Task History and Audit Trail                                       */
/* ------------------------------------------------------------------ */

function History({
  query,
  onOpen,
}: {
  query: { data?: Page<LiveJob>; error: unknown; refetch: () => void };
  onOpen: (id: string) => void;
}) {
  if (query.error) {
    return <ErrorState description="Task history could not be loaded." onRetry={query.refetch} />;
  }

  return (
    <section className={styles.card}>
      <header className={styles.tableHead}>
        <h2 className={styles.panelTitle}>Investigation History</h2>
      </header>
      {query.data ? (
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">Task</th>
              <th scope="col">Type</th>
              <th scope="col" className={styles.numeric}>
                Targets
              </th>
              <th scope="col">Status</th>
              <th scope="col">Created</th>
            </tr>
          </thead>
          <tbody>
            {query.data.items.map((j) => (
              <tr key={j.id}>
                <td>
                  <button type="button" className={styles.linkButton} onClick={() => onOpen(j.id)}>
                    {j.title ?? j.id}
                  </button>
                </td>
                <td>{KIND_LABEL[j.kind]}</td>
                <td className={styles.numeric}>{num(j.targetCount)}</td>
                <td>
                  <span className={JOB_STATUS_CLASS[j.status]}>{j.status.replace(/-/g, ' ')}</span>
                </td>
                <td>{dateTime(j.submittedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <Skeleton className={styles.tableSkeleton} />
      )}
    </section>
  );
}

const JOB_STATUS_CLASS: Record<LiveJob['status'], string | undefined> = {
  queued: styles.muted,
  running: styles.cool,
  completed: styles.good,
  'completed-with-failures': styles.warn,
  failed: styles.bad,
  cancelled: styles.muted,
};

function AuditTrail() {
  const [q, setQ] = useState('');
  const audit = useQuery({
    queryKey: ['/liveops/audit', q],
    queryFn: ({ signal }) =>
      api.get<Page<AuditEntry>>(
        '/liveops/audit',
        { limit: 50, ...(q.trim() ? { q: q.trim() } : {}) },
        signal,
      ),
  });

  if (audit.error) {
    return (
      <ErrorState description="The audit trail could not be loaded." onRetry={audit.refetch} />
    );
  }

  return (
    <section className={styles.card}>
      <div className={styles.sectionHead}>
        <h2 className={styles.panelTitle}>Console Audit Trail</h2>
        <label className={styles.field}>
          <span className={styles.srOnly}>Search the audit trail</span>
          <input
            type="search"
            placeholder="Search actor, action or object…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </label>
      </div>

      {audit.data ? (
        audit.data.items.length === 0 ? (
          <div className={styles.emptyPanel}>
            <h2>No Matching Records</h2>
            <p>Try changing your search or filters.</p>
          </div>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">Time</th>
                <th scope="col">Actor</th>
                <th scope="col">Action</th>
                <th scope="col">Target</th>
                <th scope="col">Result</th>
              </tr>
            </thead>
            <tbody>
              {audit.data.items.map((a) => (
                <tr key={a.id}>
                  <td>{dateTime(a.at)}</td>
                  <td>
                    <b>{a.actor}</b>
                  </td>
                  <td className={styles.mono}>{a.action}</td>
                  <td className={styles.mono}>{a.objectId}</td>
                  <td>
                    <span className={AUDIT_CLASS[a.outcome] ?? styles.muted}>
                      {a.outcome.slice(0, 1).toUpperCase() + a.outcome.slice(1)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )
      ) : (
        <Skeleton className={styles.tableSkeleton} />
      )}
    </section>
  );
}

const AUDIT_CLASS: Record<string, string | undefined> = {
  success: styles.good,
  denied: styles.warn,
  error: styles.bad,
};

function Kpi({ label, value, suffix }: { label: string; value: string; suffix?: string }) {
  return (
    <div className={styles.kpi}>
      <span className={styles.kpiLabel}>{label}</span>
      <strong className={styles.kpiValue}>
        {value}
        {suffix ? <em className={styles.kpiSuffix}>{suffix}</em> : null}
      </strong>
    </div>
  );
}
