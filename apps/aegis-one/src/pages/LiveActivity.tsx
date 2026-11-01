import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  Button,
  Card,
  Checkbox,
  Drawer,
  Field,
  Input,
  PageHeader,
  Select,
  StatusPill,
  Tabs,
  useToast,
  type DataTableColumn,
} from '@aegis/ui';
import { api, ApiError, type Page } from '../api/client';
import { useListController } from '../app/useListController';
import { useCan } from '../app/auth';
import { bytes, duration, humanise, num, relative, toneFor } from '../app/format';
import { ResourceList } from './shared/ResourceList';
import type {
  AuditEntry,
  DeviceGroup,
  LiveJob,
  LiveJobResult,
  LogBundle,
  Zone,
} from '../api/types';
import styles from './LiveActivity.module.css';

/**
 * Live Activity: push and run scripts on selected endpoints, pull live data,
 * and collect log bundles.
 *
 * Every one of those is a job — submitted, polled, and read back per endpoint.
 * There is no interactive session here and no channel to attach to: once a job
 * is submitted the only thing the console can do is watch it and cancel it.
 */

const LIVE_DATA_FIELDS = [
  { id: 'hostname', label: 'Hostname' },
  { id: 'operating-system', label: 'Operating system' },
  { id: 'ip-address', label: 'IP address' },
  { id: 'agent-status', label: 'Agent status' },
  { id: 'last-seen', label: 'Last seen' },
  { id: 'cpu-usage', label: 'CPU usage' },
  { id: 'memory-usage', label: 'Memory usage' },
  { id: 'free-disk-space', label: 'Free disk space' },
];

const LOG_SOURCES = [
  { id: 'agent', label: 'Agent log' },
  { id: 'system-event', label: 'System event log' },
  { id: 'application', label: 'Application log' },
  { id: 'security', label: 'Security log' },
  { id: 'patch-update', label: 'Patch and update log' },
];

const TABS = [
  { id: 'run', label: 'Run' },
  { id: 'results', label: 'Task results' },
  { id: 'history', label: 'Task history' },
  { id: 'logs', label: 'Log collection' },
  { id: 'audit', label: 'Audit trail' },
];

export default function LiveActivity() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') ?? 'run';
  const canRun = useCan('liveops:run');

  const setTab = (next: string) => {
    const updated = new URLSearchParams(params);
    updated.set('tab', next);
    setParams(updated, { replace: true });
  };

  return (
    <div className={styles.page}>
      <PageHeader
        title="Live Activity"
        description="Query endpoints, run scripts and collect logs. Each one is a job you submit and then watch."
      />
      <Tabs label="Live Activity sections" value={tab} onChange={setTab} tabs={TABS} />

      <div className={styles.body}>
        {tab === 'run' ? <RunTab canRun={canRun} /> : null}
        {tab === 'results' ? <ResultsTab /> : null}
        {tab === 'history' ? <HistoryTab /> : null}
        {tab === 'logs' ? <LogsTab /> : null}
        {tab === 'audit' ? <AuditTab /> : null}
      </div>
    </div>
  );
}

function RunTab({ canRun }: { canRun: boolean }) {
  const [params] = useSearchParams();
  const toast = useToast();

  const [kind, setKind] = useState<'script' | 'live-data' | 'log-collection'>('script');
  const [name, setName] = useState('');
  const [changeRef, setChangeRef] = useState('');
  const [language, setLanguage] = useState('powershell');
  const [script, setScript] = useState('');
  const [fields, setFields] = useState<string[]>(['hostname', 'agent-status', 'free-disk-space']);
  const [sources, setSources] = useState<string[]>(['agent']);
  const [groupId, setGroupId] = useState('');
  const [zone, setZone] = useState('');
  const [outputLimitKb, setOutputLimitKb] = useState(64);

  const deviceIds = params.get('deviceIds')?.split(',').filter(Boolean) ?? [];

  const { data: groups } = useQuery({
    queryKey: ['/groups', 'liveops'],
    queryFn: ({ signal }) =>
      api.get<Page<DeviceGroup>>('/groups', { limit: 100, fields: 'id,name,memberCount' }, signal),
  });
  const { data: zones } = useQuery({
    queryKey: ['/sites', 'liveops'],
    queryFn: ({ signal }) =>
      api.get<Page<Zone>>('/sites', { limit: 100, fields: 'id,name,deviceCount' }, signal),
  });

  const targetCount =
    deviceIds.length ||
    groups?.items.find((g) => g.id === groupId)?.memberCount ||
    zones?.items.find((z) => z.id === zone)?.deviceCount ||
    0;

  const submit = useMutation({
    mutationFn: () =>
      api.post<{ id: string; targetCount: number }>('/liveops/script-jobs', {
        kind,
        name: name.trim(),
        ...(changeRef.trim() ? { changeRef: changeRef.trim() } : {}),
        targets: {
          ...(deviceIds.length ? { deviceIds } : {}),
          ...(groupId ? { groupIds: [groupId] } : {}),
          ...(zone ? { zone } : {}),
        },
        outputLimitKb,
        ...(kind === 'script' ? { script: { language, body: script } } : {}),
        ...(kind === 'live-data' ? { liveData: { fields } } : {}),
        ...(kind === 'log-collection' ? { logCollection: { sources } } : {}),
      }),
    onSuccess: (job) => {
      toast.show({
        tone: 'success',
        title: 'Job submitted',
        message: `${num(job.targetCount)} endpoints targeted. Results appear under Task results as they report back.`,
      });
      setName('');
      setScript('');
    },
    onError: (err) =>
      toast.show({
        tone: 'error',
        title: 'The job could not be submitted',
        message:
          err instanceof ApiError
            ? `${err.message} Nothing ran on any endpoint. Reference ${err.requestId}.`
            : 'Nothing ran on any endpoint.',
      }),
  });

  const ready =
    name.trim().length > 0 &&
    targetCount > 0 &&
    (kind !== 'script' || script.trim().length > 0) &&
    (kind !== 'live-data' || fields.length > 0) &&
    (kind !== 'log-collection' || sources.length > 0);

  return (
    <Card
      title="Submit a job"
      subtitle="Runs once on each selected endpoint and reports back. It is not a session."
    >
      <div className={styles.composer}>
        <Field label="What to do" required>
          {(field) => (
            <Select
              {...field}
              options={[
                { value: 'script', label: 'Run a script' },
                { value: 'live-data', label: 'Query live data' },
                { value: 'log-collection', label: 'Collect logs' },
              ]}
              value={kind}
              onChange={(e) => setKind(e.target.value as typeof kind)}
            />
          )}
        </Field>

        <Field label="Task name" required hint="Shown in Task History and in the audit log.">
          {(field) => (
            <Input
              {...field}
              maxLength={120}
              placeholder="Clear Windows Update cache"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          )}
        </Field>

        <Field label="Reason / ticket" showOptional>
          {(field) => (
            <Input
              {...field}
              maxLength={64}
              placeholder="INC-0092144"
              value={changeRef}
              onChange={(e) => setChangeRef(e.target.value)}
            />
          )}
        </Field>

        <Field label="Device group" showOptional>
          {(field) => (
            <Select
              {...field}
              placeholder="No group"
              options={(groups?.items ?? []).map((g) => ({
                value: g.id,
                label: `${g.name} (${num(g.memberCount)})`,
              }))}
              value={groupId}
              onChange={(e) => setGroupId(e.target.value)}
            />
          )}
        </Field>

        <Field label="Aegis Zone" showOptional>
          {(field) => (
            <Select
              {...field}
              placeholder="All zones"
              options={(zones?.items ?? []).map((z) => ({
                value: z.id,
                label: `${z.name} (${num(z.deviceCount)})`,
              }))}
              value={zone}
              onChange={(e) => setZone(e.target.value)}
            />
          )}
        </Field>

        <Field label="Output limit per endpoint" hint="Output above this is truncated.">
          {(field) => (
            <Select
              {...field}
              options={[16, 64, 128, 256].map((v) => ({ value: String(v), label: `${v} KB` }))}
              value={String(outputLimitKb)}
              onChange={(e) => setOutputLimitKb(Number(e.target.value))}
            />
          )}
        </Field>

        {kind === 'script' ? (
          <>
            <Field label="Language" required>
              {(field) => (
                <Select
                  {...field}
                  options={[
                    { value: 'powershell', label: 'PowerShell' },
                    { value: 'shell', label: 'Shell (bash)' },
                    { value: 'python', label: 'Python' },
                    { value: 'cmd', label: 'Command Prompt' },
                  ]}
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                />
              )}
            </Field>
            <Field
              label="Script"
              required
              className={styles.full}
              hint="Runs once per endpoint and exits. Output is collected and shown under Task results."
            >
              {(field) => (
                <textarea
                  id={field.id}
                  aria-describedby={field['aria-describedby']}
                  className={styles.script}
                  spellCheck={false}
                  maxLength={65_536}
                  placeholder={
                    'Stop-Service wuauserv\nRemove-Item "$env:SystemRoot\\SoftwareDistribution\\Download\\*" -Recurse -Force\nStart-Service wuauserv'
                  }
                  value={script}
                  onChange={(e) => setScript(e.target.value)}
                />
              )}
            </Field>
          </>
        ) : null}

        {kind === 'live-data' ? (
          <div className={`${styles.fieldGrid} ${styles.full}`}>
            {LIVE_DATA_FIELDS.map((f) => (
              <Checkbox
                key={f.id}
                label={f.label}
                checked={fields.includes(f.id)}
                onChange={(e) =>
                  setFields((prev) =>
                    e.target.checked ? [...prev, f.id] : prev.filter((x) => x !== f.id),
                  )
                }
              />
            ))}
          </div>
        ) : null}

        {kind === 'log-collection' ? (
          <div className={`${styles.fieldGrid} ${styles.full}`}>
            {LOG_SOURCES.map((s) => (
              <Checkbox
                key={s.id}
                label={s.label}
                checked={sources.includes(s.id)}
                onChange={(e) =>
                  setSources((prev) =>
                    e.target.checked ? [...prev, s.id] : prev.filter((x) => x !== s.id),
                  )
                }
              />
            ))}
          </div>
        ) : null}

        <p className={`${styles.note} ${styles.full}`}>
          {deviceIds.length > 0
            ? `${num(deviceIds.length)} endpoints were selected on the Devices list.`
            : 'Choose a group or a zone to set the targets.'}{' '}
          The exact set is resolved by the server when the job is submitted, and a job cannot reach
          an endpoint outside the zones you can see.
        </p>
      </div>

      <div className={styles.submitRow}>
        <span className={styles.resultMeta}>{num(targetCount)} endpoints targeted</span>
        <Button
          variant="primary"
          disabled={!ready || !canRun}
          loading={submit.isPending}
          onClick={() => submit.mutate()}
        >
          Submit job
        </Button>
      </div>
    </Card>
  );
}

const JOB_COLUMNS: DataTableColumn<LiveJob>[] = [
  {
    id: 'name',
    header: 'Task',
    locked: true,
    sortable: true,
    width: 300,
    cell: (j) => j.name,
    exportValue: (j) => j.name,
  },
  {
    id: 'kind',
    header: 'Kind',
    sortable: true,
    width: 160,
    cell: (j) => humanise(j.kind),
    exportValue: (j) => j.kind,
  },
  {
    id: 'status',
    header: 'Status',
    sortable: true,
    width: 140,
    cell: (j) => (
      <StatusPill dot tone={toneFor(j.status)}>
        {humanise(j.status)}
      </StatusPill>
    ),
    exportValue: (j) => j.status,
  },
  {
    id: 'targetCount',
    header: 'Targets',
    numeric: true,
    sortable: true,
    width: 110,
    cell: (j) => num(j.targetCount),
    exportValue: (j) => j.targetCount,
  },
  {
    id: 'completed',
    header: 'Completed',
    numeric: true,
    sortable: true,
    width: 130,
    cell: (j) => num(j.completed),
    exportValue: (j) => j.completed,
  },
  {
    id: 'failed',
    header: 'Failed',
    numeric: true,
    sortable: true,
    width: 110,
    cell: (j) => (j.failed > 0 ? <StatusPill tone="bad">{num(j.failed)}</StatusPill> : '0'),
    exportValue: (j) => j.failed,
  },
  {
    id: 'createdBy',
    header: 'Submitted by',
    sortable: true,
    width: 160,
    cell: (j) => j.createdBy,
    exportValue: (j) => j.createdBy,
  },
  {
    id: 'createdAt',
    header: 'Submitted',
    sortable: true,
    width: 140,
    cell: (j) => relative(j.createdAt),
    exportValue: (j) => j.createdAt,
  },
  {
    id: 'reason',
    header: 'Reason',
    width: 150,
    defaultHidden: true,
    cell: (j) => j.reason ?? '—',
    exportValue: (j) => j.reason,
  },
];

function JobList({
  onOpen,
  statusFilter,
}: {
  onOpen: (job: LiveJob) => void;
  statusFilter?: string;
}) {
  const controller = useListController<LiveJob>({
    path: '/liveops/script-jobs',
    defaultSort: { id: 'createdAt', desc: true },
    ...(statusFilter ? { fixedFilters: { status: statusFilter } } : {}),
  });

  return (
    <ResourceList
      hideHeading
      label="Jobs"
      unit="jobs"
      viewKey="liveops-jobs"
      columns={JOB_COLUMNS}
      controller={controller}
      getRowId={(j) => j.id}
      searchPlaceholder="Search task name"
      onRowClick={onOpen}
      emptyTitle="No jobs yet"
      emptyDescription="Submit one from the Run tab and it will appear here."
    />
  );
}

function ResultsTab() {
  const [job, setJob] = useState<LiveJob | null>(null);
  return (
    <>
      <JobList onOpen={setJob} statusFilter="running,queued,completed" />
      <JobResultsDrawer job={job} onClose={() => setJob(null)} />
    </>
  );
}

function HistoryTab() {
  const [job, setJob] = useState<LiveJob | null>(null);
  return (
    <>
      <JobList onOpen={setJob} />
      <JobResultsDrawer job={job} onClose={() => setJob(null)} />
    </>
  );
}

/** Per-endpoint output. Rendered as text, never as markup: it comes from the endpoint. */
function JobResultsDrawer({ job, onClose }: { job: LiveJob | null; onClose: () => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ['/liveops/script-jobs', job?.id, 'results'],
    enabled: job !== null,
    queryFn: ({ signal }) =>
      api.get<Page<LiveJobResult>>(`/liveops/script-jobs/${job?.id}/results`, undefined, signal),
  });

  return (
    <Drawer
      open={job !== null}
      onClose={onClose}
      eyebrow={job ? humanise(job.kind) : ''}
      title={job?.name ?? ''}
      size="xl"
      actions={
        job ? (
          <StatusPill dot tone={toneFor(job.status)}>
            {humanise(job.status)}
          </StatusPill>
        ) : null
      }
    >
      {isLoading ? (
        <p>Loading results…</p>
      ) : (
        <div className={styles.resultList}>
          {(data?.items ?? []).length === 0 ? (
            <p>No endpoints have reported back yet.</p>
          ) : (
            (data?.items ?? []).map((result) => (
              <Card key={result.deviceId}>
                <div className={styles.resultHead}>
                  <span className={styles.resultHost}>{result.hostname}</span>
                  <span className={styles.resultMeta}>
                    exit {result.exitCode ?? '—'} · {duration(result.durationMs)} ·{' '}
                    {relative(result.finishedAt)}
                  </span>
                  <StatusPill dot tone={toneFor(result.state)}>
                    {humanise(result.state)}
                  </StatusPill>
                </div>
                {result.stdout ? <pre className={styles.output}>{result.stdout}</pre> : null}
                {result.stderr ? (
                  <pre className={`${styles.output} ${styles.stderr}`}>{result.stderr}</pre>
                ) : null}
              </Card>
            ))
          )}
        </div>
      )}
    </Drawer>
  );
}

const LOG_COLUMNS: DataTableColumn<LogBundle>[] = [
  {
    id: 'hostname',
    header: 'Endpoint',
    locked: true,
    sortable: true,
    width: 200,
    cell: (l) => l.hostname,
    exportValue: (l) => l.hostname,
  },
  {
    id: 'fileTypes',
    header: 'Contents',
    width: 260,
    cell: (l) => {
      try {
        return (JSON.parse(l.fileTypes) as string[]).map(humanise).join(', ');
      } catch {
        return l.fileTypes;
      }
    },
    exportValue: (l) => l.fileTypes,
  },
  {
    id: 'status',
    header: 'Status',
    sortable: true,
    width: 130,
    cell: (l) => (
      <StatusPill dot tone={toneFor(l.status)}>
        {humanise(l.status)}
      </StatusPill>
    ),
    exportValue: (l) => l.status,
  },
  {
    id: 'sizeBytes',
    header: 'Size',
    numeric: true,
    sortable: true,
    width: 120,
    cell: (l) => bytes(l.sizeBytes),
    exportValue: (l) => l.sizeBytes,
  },
  {
    id: 'collectedAt',
    header: 'Collected',
    sortable: true,
    width: 150,
    cell: (l) => relative(l.collectedAt),
    exportValue: (l) => l.collectedAt,
  },
  {
    id: 'emailed',
    header: 'Emailed',
    width: 110,
    defaultHidden: true,
    cell: (l) => (l.emailed ? 'Yes' : 'No'),
    exportValue: (l) => (l.emailed ? 'Yes' : 'No'),
  },
];

function LogsTab() {
  const controller = useListController<LogBundle>({
    path: '/liveops/logs',
    defaultSort: { id: 'collectedAt', desc: true },
  });
  return (
    <ResourceList
      hideHeading
      label="Collected logs"
      unit="bundles"
      viewKey="liveops-logs"
      columns={LOG_COLUMNS}
      controller={controller}
      getRowId={(l) => l.id}
      searchPlaceholder="Search endpoint"
      emptyTitle="No log bundles collected"
      emptyDescription="Submit a log-collection job from the Run tab."
      filters={
        <Select
          size="sm"
          aria-label="Status"
          placeholder="Any status"
          options={['uploaded', 'waiting', 'failed', 'skipped'].map((v) => ({
            value: v,
            label: humanise(v),
          }))}
          value={controller.filters['status'] ?? ''}
          onChange={(e) => controller.setFilter('status', e.target.value || undefined)}
        />
      }
    />
  );
}

const AUDIT_COLUMNS: DataTableColumn<AuditEntry>[] = [
  {
    id: 'at',
    header: 'When',
    locked: true,
    sortable: true,
    width: 170,
    cell: (a) => relative(a.at),
    exportValue: (a) => a.at,
  },
  {
    id: 'actor',
    header: 'Who',
    sortable: true,
    width: 180,
    cell: (a) => a.actor,
    exportValue: (a) => a.actor,
  },
  {
    id: 'actorRole',
    header: 'Role',
    sortable: true,
    width: 150,
    cell: (a) => a.actorRole,
    exportValue: (a) => a.actorRole,
  },
  {
    id: 'action',
    header: 'Action',
    sortable: true,
    width: 220,
    cell: (a) => a.action,
    exportValue: (a) => a.action,
  },
  {
    id: 'objectType',
    header: 'Object',
    sortable: true,
    width: 140,
    cell: (a) => humanise(a.objectType),
    exportValue: (a) => a.objectType,
  },
  {
    id: 'objectId',
    header: 'Object id',
    width: 150,
    cell: (a) => a.objectId,
    exportValue: (a) => a.objectId,
  },
  {
    id: 'outcome',
    header: 'Outcome',
    sortable: true,
    width: 130,
    cell: (a) => (
      <StatusPill
        dot
        tone={a.outcome === 'success' ? 'good' : a.outcome === 'denied' ? 'warn' : 'bad'}
      >
        {humanise(a.outcome)}
      </StatusPill>
    ),
    exportValue: (a) => a.outcome,
  },
  {
    id: 'ip',
    header: 'Source IP',
    width: 150,
    defaultHidden: true,
    cell: (a) => a.ip,
    exportValue: (a) => a.ip,
  },
];

function AuditTab() {
  const controller = useListController<AuditEntry>({
    path: '/liveops/audit',
    defaultSort: { id: 'at', desc: true },
  });
  return (
    <ResourceList
      hideHeading
      label="Audit trail"
      unit="entries"
      viewKey="liveops-audit"
      columns={AUDIT_COLUMNS}
      controller={controller}
      getRowId={(a) => a.id}
      searchPlaceholder="Search actor, action or object"
      emptyTitle="No audit entries match these filters"
      emptyDescription="Widen the search or clear the outcome filter."
      filters={
        <Select
          size="sm"
          aria-label="Outcome"
          placeholder="Any outcome"
          options={['success', 'denied', 'error'].map((v) => ({ value: v, label: humanise(v) }))}
          value={controller.filters['outcome'] ?? ''}
          onChange={(e) => controller.setFilter('outcome', e.target.value || undefined)}
        />
      }
    />
  );
}
