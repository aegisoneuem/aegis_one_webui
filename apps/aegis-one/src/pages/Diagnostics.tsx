import { useMutation, useQuery } from '@tanstack/react-query';
import { Button, ErrorState, Skeleton, useToast } from '@aegis/ui';
import { api } from '../api/client';
import { useCan } from '../app/auth';
import { num } from '../app/format';
import type { Health } from '../api/types';
import styles from './Diagnostics.module.css';

/**
 * System Health, restored to the approved v129 layout: four counters over the
 * Services table and the day's events.
 *
 * The page is titled System Health, as the reference titles it, while the nav
 * and the breadcrumb still read Diagnostics — that is the reference's own
 * split, not a slip.
 *
 * The page that was here read an undeclared `/diagnostics` aggregate and
 * printed component health, zone relays and some counts in three cards. The
 * contract has always declared `/diagnostics/health` with a summary, the
 * services and the events of the last 24 hours, which is exactly this layout.
 */

const STATUS_LABEL: Record<string, string> = {
  healthy: 'Healthy',
  degraded: 'Degraded',
  down: 'Down',
};

/** The 24 hourly buckets the Events panel draws, oldest first. */
function bucketByHour(
  events: Health['events'],
  now: number,
): { hour: number; warnings: number; errors: number }[] {
  const buckets = Array.from({ length: 24 }, (_, i) => ({ hour: 23 - i, warnings: 0, errors: 0 }));
  for (const event of events) {
    const hoursAgo = Math.floor((now - Date.parse(event.at)) / 3_600_000);
    if (hoursAgo < 0 || hoursAgo > 23) continue;
    const bucket = buckets[23 - hoursAgo];
    if (!bucket) continue;
    if (event.level === 'error') bucket.errors += 1;
    else if (event.level === 'warning') bucket.warnings += 1;
  }
  return buckets;
}

export default function Diagnostics() {
  const toast = useToast();
  const canRun = useCan('diagnostics:run');

  const health = useQuery({
    queryKey: ['/diagnostics/health'],
    queryFn: ({ signal }) => api.get<Health>('/diagnostics/health', undefined, signal),
  });

  const check = useMutation({
    mutationFn: () => api.post<{ id: string }>('/diagnostics/health-check', {}),
    onSuccess: () => {
      toast.show({
        title: 'Health check queued',
        message: 'It re-runs the same checks this page reports.',
        tone: 'success',
      });
      void health.refetch();
    },
    onError: () => toast.show({ title: 'The health check could not be queued.', tone: 'error' }),
  });

  const bundle = useMutation({
    mutationFn: () => api.post<{ id: string }>('/diagnostics/bundle', {}),
    onSuccess: () =>
      toast.show({
        title: 'Diagnostic bundle queued',
        message: 'It is built server-side; the download appears when it is ready.',
        tone: 'success',
      }),
    onError: () => toast.show({ title: 'The bundle could not be requested.', tone: 'error' }),
  });

  if (health.error) {
    return (
      <ErrorState
        title="System health could not be loaded"
        description="The service checks did not come back."
        retryLabel="Try again"
        onRetry={() => void health.refetch()}
      />
    );
  }

  const data = health.data;
  // When the checks ran, as the server reports it — not the browser's clock.
  const now = data ? Date.parse(data.asOf) : 0;
  const buckets = data ? bucketByHour(data.events, now) : [];
  const peak = Math.max(1, ...buckets.map((b) => b.warnings + b.errors));
  const errors = data ? data.events.filter((e) => e.level === 'error').length : 0;

  /** The hour with the most events, as the reference labels it. */
  const busiest = buckets.reduce(
    (worst, b) => (b.warnings + b.errors > worst.warnings + worst.errors ? b : worst),
    { hour: 0, warnings: -1, errors: 0 },
  );

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <h1>System Health</h1>
        <Button disabled={!canRun || bundle.isPending} onClick={() => bundle.mutate()}>
          Download Diagnostic Bundle
        </Button>
        <Button
          variant="primary"
          disabled={!canRun || check.isPending}
          onClick={() => check.mutate()}
        >
          {check.isPending ? 'Checking…' : 'Run Health Check'}
        </Button>
      </header>

      {data ? (
        <div className={styles.kpis}>
          <div className={styles.kpiLead}>
            <span>Services Healthy</span>
            <strong>
              {data.summary.servicesHealthy}
              <small> /{data.summary.servicesTotal}</small>
            </strong>
          </div>
          <div className={styles.kpi}>
            <span>Degraded</span>
            <strong className={data.summary.degraded > 0 ? styles.warn : undefined}>
              {data.summary.degraded}
            </strong>
          </div>
          <div className={styles.kpi}>
            <span>Agents Connected</span>
            <strong>
              {num(data.summary.agentsConnected)}
              <small> /{num(data.summary.agentsTotal)}</small>
            </strong>
          </div>
          <div className={styles.kpi}>
            <span>Warnings (24 h)</span>
            <strong>{num(data.summary.warnings24h)}</strong>
          </div>
        </div>
      ) : (
        <Skeleton className={styles.kpiSkeleton} />
      )}

      <div className={styles.row2}>
        <section className={styles.panel}>
          <header className={styles.panelHead}>
            <h2 className={styles.panelTitle}>Services</h2>
          </header>
          <div className={styles.tableWrap}>
            <table className={styles.grid}>
              <thead>
                <tr>
                  <th scope="col">Service</th>
                  <th scope="col">Status</th>
                  <th scope="col">Signal</th>
                  <th scope="col">Detail</th>
                </tr>
              </thead>
              <tbody>
                {health.isPending ? (
                  <tr>
                    <td colSpan={4} className={styles.empty}>
                      Checking services…
                    </td>
                  </tr>
                ) : (
                  (data?.services ?? []).map((service) => (
                    <tr key={service.name}>
                      <td>
                        <b>{service.name}</b>
                      </td>
                      <td>
                        <b
                          className={
                            service.status === 'healthy'
                              ? styles.good
                              : service.status === 'degraded'
                                ? styles.warn
                                : styles.bad
                          }
                        >
                          {STATUS_LABEL[service.status] ?? service.status}
                        </b>
                      </td>
                      <td>{service.signal}</td>
                      <td>{service.detail}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className={styles.panelPadded}>
          <header className={styles.panelHead}>
            <h2 className={styles.panelTitle}>Events, Last 24 Hours</h2>
          </header>

          {health.isPending ? (
            <Skeleton className={styles.figureSkeleton} />
          ) : (
            <>
              {/*
               * One column per hour, warnings stacked under errors. Heights go
               * into the SVG's own attributes rather than inline styles, which
               * the console forbids; `preserveAspectRatio="none"` lets the
               * chart stretch to the panel without distorting the labels.
               */}
              <svg
                className={styles.chart}
                viewBox="0 0 240 100"
                preserveAspectRatio="none"
                role="img"
                aria-label={`${num(data?.summary.warnings24h ?? 0)} warnings and ${num(errors)} errors in the last 24 hours`}
              >
                {buckets.map((bucket, i) => {
                  const total = bucket.warnings + bucket.errors;
                  const height = total === 0 ? 1 : Math.round((total / peak) * 92);
                  const errorHeight =
                    bucket.errors === 0
                      ? 0
                      : Math.round((bucket.errors / Math.max(1, total)) * height);
                  return (
                    <g key={bucket.hour}>
                      <rect
                        x={i * 10 + 1}
                        y={100 - height}
                        width={8}
                        height={height - errorHeight}
                        className={total === 0 ? styles.barNone : styles.barWarn}
                      />
                      {errorHeight > 0 ? (
                        <rect
                          x={i * 10 + 1}
                          y={100 - height}
                          width={8}
                          height={errorHeight}
                          className={styles.barError}
                        />
                      ) : null}
                    </g>
                  );
                })}
              </svg>

              <p className={styles.axis}>
                <span>24 h ago</span>
                <span>Now</span>
              </p>

              <p className={styles.legend}>
                <span className={styles.keyWarn}>Warnings</span>
                <span className={styles.keyError}>Errors</span>
              </p>

              <dl className={styles.eventFacts}>
                <div>
                  <dt>Warnings</dt>
                  <dd>{num(data?.summary.warnings24h ?? 0)}</dd>
                </div>
                <div>
                  <dt>Errors</dt>
                  <dd className={errors > 0 ? styles.bad : undefined}>{num(errors)}</dd>
                </div>
                <div>
                  <dt>Busiest Hour</dt>
                  <dd>
                    {busiest.warnings + busiest.errors <= 0
                      ? '—'
                      : busiest.hour === 0
                        ? 'This hour'
                        : `${busiest.hour} h ago`}
                  </dd>
                </div>
              </dl>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
