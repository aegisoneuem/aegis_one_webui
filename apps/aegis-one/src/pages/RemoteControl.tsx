import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, ErrorState, Icon, Skeleton, StatusPill, useToast } from '@aegis/ui';
import { api, ApiError } from '../api/client';
import { useCan } from '../app/auth';
import { dateTime, num } from '../app/format';
import type {
  Device,
  RemotePolicy,
  RemoteSession,
  RemoteSessionMode,
  RemoteSessionPage,
} from '../api/types';
import styles from './RemoteControl.module.css';

/**
 * Remote Control, taken from v130 — v129 has no such page.
 *
 * The console's README used to say there must be no remote control at all.
 * The requirement changed; the caution behind that line did not, so the page
 * leads with the thing that makes remote access defensible rather than
 * burying it in a settings tab: who may connect, whether the person at the
 * keyboard has to agree first, and what is recorded.
 *
 * Nothing here moves pixels. A session is its record — requested, agreed to
 * or declined, open, ended, with an operator and a reason against it. The
 * stream itself needs the endpoint agent, which this estate's mock server
 * does not have, and a page that drew a fake screen would be lying about the
 * one thing a reader most needs to trust.
 */

const TABS = [
  { id: 'new', label: 'New Session' },
  { id: 'active', label: 'Active Sessions' },
  { id: 'history', label: 'Session History' },
  { id: 'recordings', label: 'Recordings' },
  { id: 'policy', label: 'Policy' },
] as const;

type TabId = (typeof TABS)[number]['id'];

/** The three modes, with the reference's own wording. */
const MODES: readonly {
  id: RemoteSessionMode;
  icon: 'overview' | 'remote-control' | 'script';
  label: string;
  blurb: string;
}[] = [
  {
    id: 'view',
    icon: 'overview',
    label: 'View Only',
    blurb: 'Watch the screen. Mouse and keyboard input stay disabled.',
  },
  {
    id: 'control',
    icon: 'remote-control',
    label: 'Full Control',
    blurb: 'Mouse, keyboard, command line and reboot in the session.',
  },
  {
    id: 'chat',
    icon: 'script',
    label: 'Chat Only',
    blurb: 'Message the logged-in user without opening the screen.',
  },
];

/** The three rules an administrator can actually change. */
const RULES: readonly {
  key: 'requireReason' | 'record' | 'chat';
  label: string;
  blurb: string;
}[] = [
  {
    key: 'requireReason',
    label: 'Require reason or ticket',
    blurb: 'The operator must state why before a session can start.',
  },
  {
    key: 'record',
    label: 'Record every session',
    blurb: 'Operators cannot turn recording off for their own session.',
  },
  {
    key: 'chat',
    label: 'Allow chat',
    blurb: 'Operator and end user can message during a session.',
  },
];

const MODE_LABEL: Record<RemoteSessionMode, string> = {
  view: 'View Only',
  control: 'Full Control',
  chat: 'Chat Only',
};

function stateTone(state: RemoteSession['state']): 'good' | 'warn' | 'neutral' {
  if (state === 'open') return 'good';
  if (state === 'pending-consent') return 'warn';
  return 'neutral';
}

function stateLabel(session: RemoteSession): string {
  if (session.state === 'open') return 'In session';
  if (session.state === 'pending-consent') return 'Waiting for the user';
  return 'Ended';
}

export default function RemoteControl() {
  const canControl = useCan('remote:control');
  const canConfigure = useCan('remote:configure');
  const toast = useToast();
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const tab = (TABS.find((t) => t.id === params.get('tab'))?.id ?? 'new') as TabId;

  const [deviceId, setDeviceId] = useState('');
  const [mode, setMode] = useState<RemoteSessionMode>('control');
  const [reason, setReason] = useState('');
  const [search, setSearch] = useState('');

  const policy = useQuery({
    queryKey: ['/remote-control/policy'],
    queryFn: ({ signal }) => api.get<RemotePolicy>('/remote-control/policy', undefined, signal),
  });

  const open = useQuery({
    queryKey: ['/remote-control/sessions', 'open'],
    queryFn: ({ signal }) =>
      api.get<RemoteSessionPage>('/remote-control/sessions', { state: 'open' }, signal),
    // An operator needs to see a colleague's session appear, and a pending
    // one change the moment the user accepts.
    refetchInterval: 5_000,
  });

  const finished = useQuery({
    queryKey: ['/remote-control/sessions', 'finished'],
    queryFn: ({ signal }) =>
      api.get<RemoteSessionPage>(
        '/remote-control/sessions',
        { state: 'finished', limit: '50' },
        signal,
      ),
    enabled: tab === 'history' || tab === 'recordings',
  });

  const devices = useQuery({
    queryKey: ['/devices', 'remote', search],
    queryFn: ({ signal }) =>
      api.get<{ items: Device[] }>(
        '/devices',
        { limit: '10', ...(search ? { q: search } : {}) },
        signal,
      ),
    enabled: tab === 'new',
  });

  const refreshSessions = (): void => {
    void queryClient.invalidateQueries({ queryKey: ['/remote-control/sessions'] });
  };

  const start = useMutation({
    mutationFn: () =>
      api.post<RemoteSession>('/remote-control/sessions', {
        deviceId,
        mode,
        ...(reason.trim() ? { reason: reason.trim() } : {}),
      }),
    onSuccess: (session) => {
      setReason('');
      setDeviceId('');
      refreshSessions();
      setParams({ tab: 'active' }, { replace: true });
      toast.show({
        title: session.state === 'pending-consent' ? 'Waiting for the user' : 'Session open',
        message:
          session.state === 'pending-consent'
            ? `${session.hostname} is showing the request. Nothing is visible until it is accepted.`
            : `${session.hostname} is showing the on-screen indicator.`,
        tone: 'success',
      });
    },
    onError: (error: unknown) =>
      toast.show({
        title: 'That session could not be started',
        message: error instanceof ApiError ? error.message : undefined,
        tone: 'error',
      }),
  });

  const end = useMutation({
    mutationFn: (id: string) =>
      api.post<RemoteSession>(`/remote-control/sessions/${encodeURIComponent(id)}`, {
        endReason: 'operator',
      }),
    onSuccess: () => {
      refreshSessions();
      toast.show({ title: 'Session ended', tone: 'success' });
    },
    onError: () => toast.show({ title: 'That session could not be ended.', tone: 'error' }),
  });

  const [draft, setDraft] = useState<RemotePolicy | null>(null);
  const savePolicy = useMutation({
    mutationFn: (next: RemotePolicy) =>
      api.put<RemotePolicy>('/remote-control/policy', {
        consent: next.consent,
        requireReason: next.requireReason,
        record: next.record,
        chat: next.chat,
        idleMinutes: next.idleMinutes,
        maxMinutes: next.maxMinutes,
      }),
    onSuccess: () => {
      setDraft(null);
      void queryClient.invalidateQueries({ queryKey: ['/remote-control/policy'] });
      toast.show({ title: 'Policy saved', tone: 'success' });
    },
    onError: (error: unknown) =>
      toast.show({
        title: 'The policy could not be saved',
        message: error instanceof ApiError ? error.message : undefined,
        tone: 'error',
      }),
  });

  if (policy.error) {
    return (
      <ErrorState
        title="Remote Control could not be loaded"
        description="The session policy did not come back, and nothing should be offered without it."
        retryLabel="Try again"
        onRetry={() => void policy.refetch()}
      />
    );
  }

  const p = policy.data;
  const form = draft ?? p ?? null;
  const openSessions = open.data?.sessions ?? [];
  const recorded = (finished.data?.sessions ?? []).filter((s) => s.recorded);

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <div>
          <h1>Remote Control</h1>
          <p>
            View and control managed endpoints for service desk support. Every session is visible to
            the end user, audited and, by policy, recorded.
          </p>
        </div>
      </header>

      {p ? (
        <div className={styles.assurance}>
          <span className={styles.assuranceItem}>
            <Icon name="shield" size={16} />
            <b>{p.consent === 'ask' ? 'User accepts first' : 'User is notified'}</b>
            {p.consent === 'ask'
              ? 'Nothing is shown until the person at the keyboard agrees.'
              : 'Unattended: the endpoint says a session has begun.'}
          </span>
          <span className={styles.assuranceItem}>
            <Icon name="activity" size={16} />
            <b>On-screen indicator</b>
            Always on. It cannot be switched off by policy or by the operator.
          </span>
          <span className={styles.assuranceItem}>
            <Icon name="lock" size={16} />
            <b>TLS 1.3</b>
            Sessions are carried over TLS 1.3 and recorded when the policy says so.
          </span>
        </div>
      ) : (
        <Skeleton className={styles.assuranceSkeleton} />
      )}

      <div className={styles.tabs} role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={tab === t.id ? styles.tabOn : styles.tab}
            onClick={() => setParams({ tab: t.id }, { replace: true })}
          >
            {t.label}
            {t.id === 'active' && openSessions.length > 0 ? (
              <span className={styles.count}>{num(openSessions.length)}</span>
            ) : null}
          </button>
        ))}
      </div>

      {tab === 'new' ? (
        <section className={styles.panel}>
          <header className={styles.panelHead}>
            <h2 className={styles.panelTitle}>Start a session</h2>
          </header>
          <div className={styles.panelBody}>
            {!canControl ? (
              <p className={styles.note}>
                Your role can watch remote sessions and read their history, but not start one.
              </p>
            ) : (
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
                      <Icon name={m.icon} size={20} />
                      <b>{m.label}</b>
                      <small>{m.blurb}</small>
                    </button>
                  ))}
                </div>

                <label className={styles.field}>
                  Endpoint
                  <input
                    value={search}
                    placeholder="Computer, IP or user…"
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </label>

                <ul className={styles.devices}>
                  {(devices.data?.items ?? []).map((d) => (
                    <li key={d.id}>
                      {/* An offline endpoint cannot accept a session, and the
                          reference says so rather than letting the request
                          fail after the fact. */}
                      <button
                        type="button"
                        aria-pressed={deviceId === d.id}
                        disabled={d.status !== 'online'}
                        title={d.status === 'online' ? undefined : 'This endpoint is offline'}
                        className={deviceId === d.id ? styles.deviceOn : styles.device}
                        onClick={() => setDeviceId(d.id)}
                      >
                        <b>{d.hostname}</b>
                        <span>{d.osName}</span>
                        <StatusPill tone={d.status === 'online' ? 'good' : 'neutral'} dot>
                          {d.status === 'online' ? 'Online' : 'Offline'}
                        </StatusPill>
                      </button>
                    </li>
                  ))}
                </ul>

                <label className={styles.field}>
                  Reason or ticket
                  {p?.requireReason ? <em> — required by policy</em> : null}
                  <input
                    value={reason}
                    placeholder="INC-10482 — printer spooler keeps stopping"
                    onChange={(e) => setReason(e.target.value)}
                  />
                </label>

                <footer className={styles.actions}>
                  <p className={styles.note}>
                    {p?.consent === 'ask'
                      ? 'The endpoint will show the request and stay dark until the user accepts.'
                      : 'The endpoint will show that a session has begun.'}
                    {p?.record ? ' This session will be recorded.' : ''}
                  </p>
                  <Button
                    variant="primary"
                    disabled={
                      deviceId === '' ||
                      start.isPending ||
                      (p?.requireReason === true && reason.trim() === '')
                    }
                    onClick={() => start.mutate()}
                  >
                    {start.isPending ? 'Requesting…' : 'Request session'}
                  </Button>
                </footer>
              </>
            )}
          </div>
        </section>
      ) : null}

      {tab === 'active' ? (
        <section className={styles.panel}>
          <header className={styles.panelHead}>
            <h2 className={styles.panelTitle}>Active sessions</h2>
          </header>
          {openSessions.length === 0 ? (
            <p className={styles.empty}>No session is open on any endpoint.</p>
          ) : (
            <ul className={styles.sessions}>
              {openSessions.map((s) => (
                <li key={s.id}>
                  <div>
                    <b>{s.hostname}</b>
                    <span>
                      {MODE_LABEL[s.mode]} · {s.operator} · started {dateTime(s.startedAt)}
                    </span>
                    {s.reason ? <small>{s.reason}</small> : null}
                  </div>
                  <StatusPill tone={stateTone(s.state)} dot>
                    {stateLabel(s)}
                  </StatusPill>
                  {s.recorded ? <span className={styles.rec}>Recording</span> : null}
                  <Button
                    size="sm"
                    disabled={!canControl || end.isPending}
                    onClick={() => end.mutate(s.id)}
                  >
                    End session
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      {tab === 'history' || tab === 'recordings' ? (
        <section className={styles.panel}>
          <header className={styles.panelHead}>
            <h2 className={styles.panelTitle}>
              {tab === 'history' ? 'Session history' : 'Recordings'}
            </h2>
          </header>
          {tab === 'recordings' ? (
            <p className={styles.note}>
              A recording is held by the endpoint agent and fetched on request, so this estate lists
              the sessions that were recorded rather than offering a file to play.
            </p>
          ) : null}
          <div className={styles.tableWrap}>
            <table className={styles.grid}>
              <thead>
                <tr>
                  <th scope="col">Endpoint</th>
                  <th scope="col">Operator</th>
                  <th scope="col">Mode</th>
                  <th scope="col">Reason</th>
                  <th scope="col">Started</th>
                  <th scope="col">Ended</th>
                  <th scope="col">How it ended</th>
                  <th scope="col">Recorded</th>
                </tr>
              </thead>
              <tbody>
                {(tab === 'history' ? (finished.data?.sessions ?? []) : recorded).map((s) => (
                  <tr key={s.id}>
                    <td>{s.hostname}</td>
                    <td>{s.operator}</td>
                    <td>{MODE_LABEL[s.mode]}</td>
                    <td>{s.reason === '' ? '—' : s.reason}</td>
                    <td>{dateTime(s.startedAt)}</td>
                    <td>{s.endedAt === null ? '—' : dateTime(s.endedAt)}</td>
                    <td>{s.endReason ?? '—'}</td>
                    <td>{s.recorded ? 'Yes' : 'No'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {(tab === 'history' ? (finished.data?.sessions ?? []) : recorded).length === 0 ? (
            <p className={styles.empty}>
              {finished.isPending ? 'Loading…' : 'No session has been held on this estate yet.'}
            </p>
          ) : null}
        </section>
      ) : null}

      {tab === 'policy' && form ? (
        <section className={styles.panel}>
          <header className={styles.panelHead}>
            <h2 className={styles.panelTitle}>Session policy</h2>
          </header>
          <div className={styles.panelBody}>
            <fieldset className={styles.checks} disabled={!canConfigure}>
              <legend>Requirements</legend>
              {RULES.map((rule) => (
                <label key={rule.key} htmlFor={`rc-${rule.key}`}>
                  <input
                    id={`rc-${rule.key}`}
                    type="checkbox"
                    checked={form[rule.key]}
                    onChange={(e) => setDraft({ ...form, [rule.key]: e.target.checked })}
                  />
                  <b>{rule.label}</b>
                  <small>{rule.blurb}</small>
                </label>
              ))}
              {/*
               * Drawn as a checked box that cannot be cleared, because that
               * is the honest shape: the indicator is a rule, not a
               * preference, and leaving it out of the list would make a
               * reader wonder whether it exists at all.
               */}
              <label className={styles.locked} htmlFor="rc-indicator">
                <input id="rc-indicator" type="checkbox" checked disabled readOnly />
                <b>On-screen indicator</b>
                <small>Always on. Not a setting, here or on the server.</small>
              </label>
            </fieldset>

            <label className={styles.field}>
              End-user consent
              <select
                value={form.consent}
                disabled={!canConfigure}
                onChange={(e) =>
                  setDraft({ ...form, consent: e.target.value as RemotePolicy['consent'] })
                }
              >
                <option value="ask">
                  Attended: the user must accept before the session starts
                </option>
                <option value="notify">Unattended: notify the user, no approval needed</option>
              </select>
            </label>

            <div className={styles.limits}>
              <label className={styles.field}>
                Idle timeout (minutes)
                <input
                  type="number"
                  min={1}
                  max={240}
                  value={form.idleMinutes}
                  disabled={!canConfigure}
                  onChange={(e) => setDraft({ ...form, idleMinutes: Number(e.target.value) })}
                />
              </label>
              <label className={styles.field}>
                Maximum session (minutes)
                <input
                  type="number"
                  min={5}
                  max={720}
                  value={form.maxMinutes}
                  disabled={!canConfigure}
                  onChange={(e) => setDraft({ ...form, maxMinutes: Number(e.target.value) })}
                />
              </label>
            </div>

            <p className={styles.note}>
              Who can start sessions, take control and read recordings is set per role in
              Administration › Roles. Last changed {dateTime(form.updatedAt)} by {form.updatedBy}.
            </p>

            {canConfigure ? (
              <footer className={styles.actions}>
                <span />
                <Button
                  variant="primary"
                  disabled={draft === null || savePolicy.isPending}
                  onClick={() => draft && savePolicy.mutate(draft)}
                >
                  {savePolicy.isPending ? 'Saving…' : 'Save policy'}
                </Button>
              </footer>
            ) : (
              <p className={styles.note}>Your role can read this policy but not change it.</p>
            )}
          </div>
        </section>
      ) : null}
    </div>
  );
}
