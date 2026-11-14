import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, ErrorState, Skeleton, useToast } from '@aegis/ui';
import { api, type Page } from '../api/client';
import { useCan } from '../app/auth';
import { dateTime, num, relative } from '../app/format';
import type {
  Connector,
  DeliveryAttempt,
  IntegrationStatus,
  NotificationChannel,
  NotificationRule,
  SiemDestination,
} from '../api/types';
import styles from './Integrations.module.css';

/**
 * Integrations, restored to the approved v129 layout: four tabs —
 * Connectors, SIEM & Syslog, Notifications and Delivery Log.
 *
 * The page that was here was a five-column table over a flat `integrations`
 * list, which could print a name, a kind and an event count. The approved
 * page shows four different kinds of thing, each with its own card and its
 * own actions, and none of them fits a row in one table: a connector has a
 * granted scope, a destination has a transport and a rate, a channel is
 * something an alert rule sends to, and a delivery is one attempt at one
 * event.
 */

const TABS = [
  { id: 'connectors', label: 'Connectors' },
  { id: 'siem', label: 'SIEM & Syslog' },
  { id: 'notifications', label: 'Notifications' },
  { id: 'log', label: 'Delivery Log' },
] as const;

type TabId = (typeof TABS)[number]['id'];

/** The reference's own filter row on the Connectors tab. */
const CONNECTOR_FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'connected', label: 'Connected' },
  { id: 'attention', label: 'Attention' },
  { id: 'disabled', label: 'Disabled' },
] as const;

const STATUS_LABEL: Record<IntegrationStatus, string> = {
  connected: 'Connected',
  attention: 'Attention',
  disabled: 'Disabled',
  'not-configured': 'Not Configured',
  error: 'Error',
};

const EVENT_TYPES = ['Audit Trail', 'Deployments', 'Compliance'] as const;

const RESULTS = [
  { id: 'delivered', label: 'Delivered' },
  { id: 'retrying', label: 'Retrying' },
  { id: 'failed', label: 'Failed' },
] as const;

/** The reference's Event select, in its own order. */
const ALERT_EVENTS = [
  'Deployment Failed',
  'Critical Vulnerability Found',
  'Compliance below 75%',
  'Log Collection Failed',
  'Agent offline over 7 days',
  'Patch Rollback Completed',
  'Device Added to Group',
] as const;

function statusClass(status: string): string {
  if (status === 'connected') return styles.good as string;
  if (status === 'attention' || status === 'error') return styles.warn as string;
  return styles.muted as string;
}

/**
 * The two-letter tile the reference prints beside a destination or channel
 * name. On the Connectors tab v129 uses third-party brand logos; those are
 * not in the repository and are not ours to redraw, so the same monogram is
 * used there — see the restoration note.
 */
function monogram(name: string): string {
  const words = name.split(/[\s-]+/).filter(Boolean);
  if (words.length === 1) return (words[0] ?? '?').slice(0, 1).toUpperCase();
  return `${words[0]?.[0] ?? ''}${words[1]?.[0] ?? ''}`.toUpperCase();
}

export default function Integrations() {
  const [params, setParams] = useSearchParams();
  const tab = (TABS.find((t) => t.id === params.get('tab'))?.id ?? 'connectors') as TabId;

  const onTab = (next: TabId) => {
    const p = new URLSearchParams(params);
    if (next === 'connectors') p.delete('tab');
    else p.set('tab', next);
    setParams(p, { replace: true });
  };

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <h1>Integrations</h1>
      </header>

      <div className={styles.tabs} role="tablist" aria-label="Integration views">
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

      {tab === 'connectors' ? <Connectors /> : null}
      {tab === 'siem' ? <Siem /> : null}
      {tab === 'notifications' ? <Notifications /> : null}
      {tab === 'log' ? <DeliveryLog /> : null}
    </div>
  );
}

/* --- Connectors ----------------------------------------------------------- */

function Connectors() {
  const toast = useToast();
  const canWrite = useCan('integrations:write');
  const [filter, setFilter] = useState<(typeof CONNECTOR_FILTERS)[number]['id']>('all');
  const [open, setOpen] = useState<string | null>(null);

  const connectors = useQuery({
    queryKey: ['/integrations/connectors'],
    queryFn: ({ signal }) => api.get<Connector[]>('/integrations/connectors', undefined, signal),
  });

  const test = useMutation({
    mutationFn: (id: string) =>
      api.post<DeliveryAttempt>(`/integrations/connectors/${encodeURIComponent(id)}/test`, {}),
    onSuccess: (attempt) =>
      toast.show({
        title: 'Test event sent',
        message: `It is in the delivery log as ${attempt.event}.`,
        tone: 'success',
      }),
    onError: () => toast.show({ title: 'The test event could not be sent.', tone: 'error' }),
  });

  if (connectors.error) {
    return (
      <ErrorState
        title="The connectors could not be loaded"
        description="The list of connected systems did not come back."
        retryLabel="Try again"
        onRetry={() => void connectors.refetch()}
      />
    );
  }

  const items = (connectors.data ?? []).filter((c) =>
    filter === 'all' ? true : c.status === filter,
  );

  return (
    <>
      <div className={styles.toolbar}>
        <Button variant="primary" disabled={!canWrite}>
          + Custom Webhook
        </Button>
      </div>

      <div className={styles.tabs} role="tablist" aria-label="Connectors by status">
        {CONNECTOR_FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            role="tab"
            aria-selected={filter === f.id}
            className={filter === f.id ? styles.tabOn : styles.tab}
            onClick={() => setFilter(f.id)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {connectors.isPending ? (
        <Skeleton className={styles.gridSkeleton} />
      ) : items.length === 0 ? (
        <p className={styles.empty}>No connectors are in this state.</p>
      ) : (
        <div className={styles.cards}>
          {items.map((c) => (
            <section key={c.id} className={styles.card}>
              <header className={styles.cardHead}>
                <span className={styles.mark} aria-hidden="true">
                  {monogram(c.name)}
                </span>
                <b>{c.name}</b>
                <span className={statusClass(c.status)}>{STATUS_LABEL[c.status]}</span>
              </header>

              <p className={styles.purpose}>{c.purpose}</p>

              <dl className={styles.meta}>
                <dt>Last Sync</dt>
                <dd title={c.lastActivity ? dateTime(c.lastActivity) : undefined}>
                  {c.lastActivity ? relative(c.lastActivity) : '—'}
                </dd>
                <dt>Scope</dt>
                <dd>{c.scope ?? '—'}</dd>
              </dl>

              <div className={styles.cardActions}>
                <Button variant="primary" disabled={!canWrite}>
                  Configure
                </Button>
                <div className={styles.menuWrap}>
                  <Button
                    aria-label={`More actions for ${c.name}`}
                    aria-expanded={open === c.id}
                    onClick={() => setOpen(open === c.id ? null : c.id)}
                  >
                    ⋯
                  </Button>
                  {open === c.id ? (
                    <ul className={styles.menu}>
                      <li>
                        <button
                          type="button"
                          disabled={!canWrite || test.isPending}
                          onClick={() => {
                            setOpen(null);
                            test.mutate(c.id);
                          }}
                        >
                          Test
                        </button>
                      </li>
                      <li>
                        <button type="button" disabled>
                          Activity
                        </button>
                      </li>
                    </ul>
                  ) : null}
                </div>
              </div>
            </section>
          ))}
        </div>
      )}
    </>
  );
}

/* --- SIEM & Syslog -------------------------------------------------------- */

function Siem() {
  const toast = useToast();
  const canWrite = useCan('integrations:write');

  const destinations = useQuery({
    queryKey: ['/integrations/siem'],
    queryFn: ({ signal }) => api.get<SiemDestination[]>('/integrations/siem', undefined, signal),
  });

  /**
   * The counters read the delivery log rather than the destinations, because
   * "Events Forwarded", "Retrying" and "Errors" are counts of attempts, not
   * of targets. One query per outcome would be three round trips, so the page
   * asks for the totals the log already reports.
   */
  const forwarded = useQuery({
    queryKey: ['/integrations/deliveries', 'counts'],
    queryFn: async ({ signal }) => {
      const [all, retrying, failed] = await Promise.all([
        api.get<Page<DeliveryAttempt>>('/integrations/deliveries', { limit: '1' }, signal),
        api.get<Page<DeliveryAttempt>>(
          '/integrations/deliveries',
          { limit: '1', result: 'retrying' },
          signal,
        ),
        api.get<Page<DeliveryAttempt>>(
          '/integrations/deliveries',
          { limit: '1', result: 'failed' },
          signal,
        ),
      ]);
      return {
        total: all.page.total ?? 0,
        retrying: retrying.page.total ?? 0,
        failed: failed.page.total ?? 0,
      };
    },
  });

  const test = useMutation({
    mutationFn: (id: string) =>
      api.post<DeliveryAttempt>(`/integrations/siem/${encodeURIComponent(id)}/test`, {}),
    onSuccess: () =>
      toast.show({
        title: 'Test event sent',
        message: 'It is in the delivery log.',
        tone: 'success',
      }),
    onError: () => toast.show({ title: 'The test event could not be sent.', tone: 'error' }),
  });

  if (destinations.error) {
    return (
      <ErrorState
        title="The destinations could not be loaded"
        description="The SIEM and syslog targets did not come back."
        retryLabel="Try again"
        onRetry={() => void destinations.refetch()}
      />
    );
  }

  const items = destinations.data ?? [];
  const connected = items.filter((d) => d.status === 'connected').length;

  return (
    <>
      <div className={styles.kpis}>
        <div className={styles.kpi}>
          <span>Connected</span>
          <strong>
            {connected}
            <small> /{items.length}</small>
          </strong>
        </div>
        <Kpi label="Events Forwarded" value={num(forwarded.data?.total ?? 0)} />
        <Kpi label="Retrying" value={num(forwarded.data?.retrying ?? 0)} />
        <Kpi label="Errors" value={num(forwarded.data?.failed ?? 0)} />
      </div>

      {destinations.isPending ? (
        <Skeleton className={styles.gridSkeleton} />
      ) : (
        <div className={styles.targets}>
          {items.map((d) => (
            <TargetCard
              key={d.id}
              name={d.name}
              transport={d.transport}
              status={d.status}
              eventTypes={d.eventTypes}
              lastSentAt={d.lastSentAt}
              ratePerHour={d.ratePerHour}
              canWrite={canWrite}
              onTest={() => test.mutate(d.id)}
              testing={test.isPending}
            />
          ))}
        </div>
      )}

      {/* The reference's own footnote, which is the page's security claim. */}
      <p className={styles.note}>
        Tokens, keys and passwords are sent to the server vault and are never stored in this
        browser.
      </p>
    </>
  );
}

/* --- Notifications -------------------------------------------------------- */

function Notifications() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const canWrite = useCan('integrations:write');
  const [event, setEvent] = useState<string>(ALERT_EVENTS[0]);
  const [channelId, setChannelId] = useState('');

  const channels = useQuery({
    queryKey: ['/integrations/channels'],
    queryFn: ({ signal }) =>
      api.get<NotificationChannel[]>('/integrations/channels', undefined, signal),
  });

  const rules = useQuery({
    queryKey: ['/integrations/notifications'],
    queryFn: ({ signal }) =>
      api.get<NotificationRule[]>('/integrations/notifications', undefined, signal),
  });

  const invalidate = () =>
    void queryClient.invalidateQueries({ queryKey: ['/integrations/notifications'] });

  const test = useMutation({
    mutationFn: (id: string) =>
      api.post<DeliveryAttempt>(`/integrations/channels/${encodeURIComponent(id)}/test`, {}),
    onSuccess: () =>
      toast.show({
        title: 'Test notification sent',
        message: 'It is in the delivery log.',
        tone: 'success',
      }),
    onError: () => toast.show({ title: 'The test could not be sent.', tone: 'error' }),
  });

  const addRule = useMutation({
    mutationFn: () =>
      api.post<NotificationRule>('/integrations/notifications', {
        event,
        channelIds: [channelId],
      }),
    onSuccess: () => {
      toast.show({ title: 'Alert rule added', tone: 'success' });
      invalidate();
    },
    onError: () => toast.show({ title: 'The rule could not be added.', tone: 'error' }),
  });

  const toggleRule = useMutation({
    mutationFn: (rule: NotificationRule) =>
      api.patch<NotificationRule>(`/integrations/notifications/${encodeURIComponent(rule.id)}`, {
        enabled: !rule.enabled,
      }),
    onSuccess: invalidate,
    onError: () => toast.show({ title: 'The rule could not be changed.', tone: 'error' }),
  });

  const removeRule = useMutation({
    mutationFn: (id: string) => api.delete(`/integrations/notifications/${encodeURIComponent(id)}`),
    onSuccess: () => {
      toast.show({ title: 'Alert rule removed', tone: 'success' });
      invalidate();
    },
    onError: () => toast.show({ title: 'The rule could not be removed.', tone: 'error' }),
  });

  if (channels.error || rules.error) {
    return (
      <ErrorState
        title="The notification settings could not be loaded"
        description="The channels and alert rules did not come back."
        retryLabel="Try again"
        onRetry={() => {
          void channels.refetch();
          void rules.refetch();
        }}
      />
    );
  }

  const channelList = channels.data ?? [];
  const firstChannel = channelList[0]?.id ?? '';

  return (
    <>
      {channels.isPending ? (
        <Skeleton className={styles.gridSkeleton} />
      ) : (
        <div className={styles.targets}>
          {channelList.map((c) => (
            <TargetCard
              key={c.id}
              name={c.name}
              transport={c.transport}
              status={c.status}
              eventTypes={c.eventTypes}
              lastSentAt={c.lastSentAt}
              ratePerHour={c.ratePerHour}
              canWrite={canWrite}
              onTest={() => test.mutate(c.id)}
              testing={test.isPending}
            />
          ))}
        </div>
      )}

      <section className={styles.panel}>
        <header className={styles.panelHead}>
          <h2 className={styles.panelTitle}>Alert Rules</h2>
          <label className={styles.srOnly} htmlFor="int-event">
            Event
          </label>
          <select
            id="int-event"
            aria-label="Event"
            className={styles.select}
            value={event}
            onChange={(e) => setEvent(e.target.value)}
          >
            {ALERT_EVENTS.map((e) => (
              <option key={e} value={e}>
                {e}
              </option>
            ))}
          </select>
          <select
            aria-label="Channel"
            className={styles.select}
            value={channelId || firstChannel}
            onChange={(e) => setChannelId(e.target.value)}
          >
            {channelList.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <Button
            variant="primary"
            disabled={!canWrite || channelList.length === 0 || addRule.isPending}
            onClick={() => {
              setChannelId(channelId || firstChannel);
              addRule.mutate();
            }}
          >
            Add Rule
          </Button>
        </header>

        <div className={styles.tableWrap}>
          <table className={styles.grid}>
            <thead>
              <tr>
                <th scope="col">When</th>
                <th scope="col">Send To</th>
                <th scope="col">Channel Status</th>
                <th scope="col">Enabled</th>
                <th scope="col">
                  <span className={styles.srOnly}>Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rules.isPending ? (
                <tr>
                  <td colSpan={5} className={styles.empty}>
                    Loading rules…
                  </td>
                </tr>
              ) : (rules.data ?? []).length === 0 ? (
                <tr>
                  <td colSpan={5} className={styles.empty}>
                    No alert rules yet. Pick an event and a channel to add one.
                  </td>
                </tr>
              ) : (
                (rules.data ?? []).map((rule) => (
                  <tr key={rule.id}>
                    <td>
                      <b>{rule.event}</b>
                    </td>
                    <td>{rule.channels.map((c) => c.name).join(', ')}</td>
                    <td>
                      {rule.channels.map((c, i) => (
                        <span key={c.id} className={statusClass(c.status)}>
                          {i > 0 ? ', ' : ''}
                          {STATUS_LABEL[c.status]}
                        </span>
                      ))}
                    </td>
                    <td>
                      <Button
                        variant={rule.enabled ? 'primary' : undefined}
                        disabled={!canWrite || toggleRule.isPending}
                        aria-pressed={rule.enabled}
                        onClick={() => toggleRule.mutate(rule)}
                      >
                        {rule.enabled ? 'On' : 'Off'}
                      </Button>
                    </td>
                    <td>
                      <button
                        type="button"
                        className={styles.remove}
                        disabled={!canWrite || removeRule.isPending}
                        onClick={() => removeRule.mutate(rule.id)}
                      >
                        Remove
                      </button>
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

/* --- Delivery Log --------------------------------------------------------- */

function DeliveryLog() {
  const [q, setQ] = useState('');
  const [connector, setConnector] = useState('');
  const [eventType, setEventType] = useState('');
  const [result, setResult] = useState('');

  /*
   * The Connector filter has to offer every target that can appear in the
   * log, and a notification channel delivers just as a SIEM destination
   * does — so both lists feed it, not only the destinations.
   */
  const targets = useQuery({
    queryKey: ['/integrations/targets'],
    queryFn: async ({ signal }) => {
      const [destinations, channels] = await Promise.all([
        api.get<SiemDestination[]>('/integrations/siem', undefined, signal),
        api.get<NotificationChannel[]>('/integrations/channels', undefined, signal),
      ]);
      return [...destinations, ...channels]
        .filter((t) => t.status === 'connected')
        .map((t) => ({ value: t.id, label: t.name }));
    },
  });

  const log = useQuery({
    queryKey: ['/integrations/deliveries', q, connector, eventType, result],
    queryFn: ({ signal }) =>
      api.get<Page<DeliveryAttempt>>(
        '/integrations/deliveries',
        {
          limit: '50',
          ...(q ? { q } : {}),
          ...(connector ? { connector } : {}),
          ...(eventType ? { eventType } : {}),
          ...(result ? { result } : {}),
        },
        signal,
      ),
  });

  if (log.error) {
    return (
      <ErrorState
        title="The delivery log could not be loaded"
        description="The forwarded events did not come back."
        retryLabel="Try again"
        onRetry={() => void log.refetch()}
      />
    );
  }

  return (
    <>
      <div className={styles.filters}>
        <label className={styles.search}>
          <span className={styles.srOnly}>Search event</span>
          <input
            type="search"
            placeholder="Search event"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </label>

        <Filter
          label="Connector"
          value={connector}
          onChange={setConnector}
          options={targets.data ?? []}
        />
        <Filter
          label="Event Type"
          value={eventType}
          onChange={setEventType}
          options={EVENT_TYPES.map((t) => ({ value: t, label: t }))}
        />
        <Filter
          label="Result"
          value={result}
          onChange={setResult}
          options={RESULTS.map((r) => ({ value: r.id, label: r.label }))}
        />
      </div>

      <section className={styles.panel}>
        <header className={styles.panelHead}>
          <h2 className={styles.panelTitle}>Delivery Log</h2>
          <span className={styles.count}>{num(log.data?.page.total ?? 0)}</span>
          <span className={styles.grow} />
          <Button disabled>Export</Button>
        </header>

        <div className={styles.tableWrap}>
          <table className={styles.grid}>
            <thead>
              <tr>
                <th scope="col">Time</th>
                <th scope="col">Connector</th>
                <th scope="col">Event Type</th>
                <th scope="col">Event</th>
                <th scope="col">Result</th>
              </tr>
            </thead>
            <tbody>
              {log.isPending ? (
                <tr>
                  <td colSpan={5} className={styles.empty}>
                    Loading the log…
                  </td>
                </tr>
              ) : (log.data?.items ?? []).length === 0 ? (
                <tr>
                  <td colSpan={5} className={styles.empty}>
                    Connect a SIEM or Syslog target to start forwarding
                  </td>
                </tr>
              ) : (
                (log.data?.items ?? []).map((d) => (
                  <tr key={d.id}>
                    <td title={dateTime(d.at)}>{relative(d.at)}</td>
                    <td>{d.connector}</td>
                    <td>{d.eventType}</td>
                    <td>
                      <code className={styles.event}>{d.event}</code>
                    </td>
                    <td>
                      <b
                        className={
                          d.outcome === 'delivered'
                            ? styles.good
                            : d.outcome === 'retrying'
                              ? styles.warn
                              : styles.bad
                        }
                      >
                        {d.outcome === 'delivered'
                          ? 'Delivered'
                          : d.outcome === 'retrying'
                            ? 'Retrying'
                            : 'Failed'}
                        {d.httpStatus !== null ? <small> {d.httpStatus}</small> : null}
                      </b>
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

/* --- Shared pieces -------------------------------------------------------- */

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.kpi}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

/**
 * The card the SIEM and Notifications tabs share. Both print a monogram, a
 * name over its transport, a status, a three-field meta row and the same
 * Set Up / Test pair — so they are one component, as the reference's own
 * markup is.
 */
function TargetCard({
  name,
  transport,
  status,
  eventTypes,
  lastSentAt,
  ratePerHour,
  canWrite,
  onTest,
  testing,
}: {
  name: string;
  transport: string;
  status: string;
  eventTypes: number | null;
  lastSentAt: string | null;
  ratePerHour: number | null;
  canWrite: boolean;
  onTest: () => void;
  testing: boolean;
}) {
  const configured = status === 'connected';
  return (
    <section className={styles.target}>
      <header className={styles.targetHead}>
        <span className={styles.mark} aria-hidden="true">
          {monogram(name)}
        </span>
        <span className={styles.targetName}>
          <b>{name}</b>
          <small>{transport}</small>
        </span>
        <span className={statusClass(status)}>{STATUS_LABEL[status as IntegrationStatus]}</span>
      </header>

      <p className={styles.targetMeta}>
        <span>
          Events <b>{eventTypes === null ? '—' : `${eventTypes} types`}</b>
        </span>
        <span title={lastSentAt ? dateTime(lastSentAt) : undefined}>
          Last Sent <b>{lastSentAt ? relative(lastSentAt) : '—'}</b>
        </span>
        <span>
          Rate <b>{ratePerHour === null ? '—' : `${num(ratePerHour)}/h`}</b>
        </span>
      </p>

      <div className={styles.targetActions}>
        <Button disabled={!canWrite}>Set Up</Button>
        <Button disabled={!canWrite || !configured || testing} onClick={onTest}>
          Test
        </Button>
      </div>
    </section>
  );
}

function Filter({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className={styles.filter}>
      <span>{label}</span>
      <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">All</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
