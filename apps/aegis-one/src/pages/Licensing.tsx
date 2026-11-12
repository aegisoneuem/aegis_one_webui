import { useMutation, useQuery } from '@tanstack/react-query';
import { Button, ErrorState, Skeleton, useToast } from '@aegis/ui';
import { api } from '../api/client';
import { useCan } from '../app/auth';
import { date, num } from '../app/format';
import { Columns, Donut } from './shared/Figures';
import type { License, LicenseModule } from '../api/types';
import styles from './Licensing.module.css';

/**
 * Licensing, restored to the approved v129 layout: four counters over Seat
 * Usage, Seats by Platform and License Term, then the Modules panel.
 *
 * The page that was here was a four-row table of licensed products — one row
 * per product with its own entitlement and expiry. That shape cannot answer
 * either question the approved page leads with: which plan is this, and how
 * many days until it renews.
 *
 * Every figure is counted rather than stored. Seats in use is the number of
 * enrolled endpoints and the platform split is those endpoints grouped, so
 * this page and the Devices page cannot disagree about how large the estate
 * is.
 */

const TIER_LABEL: Record<LicenseModule['tier'], string> = {
  included: 'Included',
  'add-on': 'Add-on · Active',
  preview: 'Preview',
};

/** Whole days from today to the end of the term, never negative. */
function daysLeft(endsAt: string, now: number): number {
  return Math.max(0, Math.ceil((Date.parse(endsAt) - now) / 86_400_000));
}

export default function Licensing() {
  const toast = useToast();
  const canWrite = useCan('licensing:write');

  const license = useQuery({
    queryKey: ['/licensing'],
    queryFn: ({ signal }) => api.get<License>('/licensing', undefined, signal),
  });

  const upload = useMutation({
    mutationFn: () => api.put<License>('/licensing/file', {}),
    onError: (error) =>
      toast.show({
        title: 'The licence was not applied',
        message: error instanceof Error ? error.message : 'Try again.',
        tone: 'error',
      }),
  });

  if (license.error) {
    return (
      <ErrorState
        title="The licence could not be loaded"
        description="The plan, seats and term did not come back."
        retryLabel="Try again"
        onRetry={() => void license.refetch()}
      />
    );
  }

  const data = license.data;
  /*
   * "Now" is the server's, carried on the response. Reading the browser clock
   * during render is forbidden in this console, and a licence figure that
   * changed with whoever was looking at it would not be a licence fact.
   */
  const now = data ? Date.parse(data.asOf) : 0;

  const left = data ? daysLeft(data.term.endsAt, now) : 0;
  const termTotal = data
    ? Math.max(
        1,
        Math.round((Date.parse(data.term.endsAt) - Date.parse(data.term.startsAt)) / 86_400_000),
      )
    : 1;
  const elapsedPct = data ? Math.min(100, Math.round(((termTotal - left) / termTotal) * 100)) : 0;

  const available = data ? Math.max(0, data.seats.total - data.seats.inUse) : 0;
  const usedPct =
    data && data.seats.total > 0 ? Math.round((data.seats.inUse / data.seats.total) * 100) : 0;

  const platforms = data
    ? [
        { key: 'windows', label: 'Windows', value: data.seats.byPlatform.windows ?? 0 },
        { key: 'macos', label: 'macOS', value: data.seats.byPlatform.macos ?? 0 },
        { key: 'linux', label: 'Linux', value: data.seats.byPlatform.linux ?? 0 },
        // A fourth column only where something outside the three is licensed.
        ...(data.seats.byPlatform.other
          ? [{ key: 'other', label: 'Other', value: data.seats.byPlatform.other }]
          : []),
      ]
    : [];
  const activeModules = (data?.modules ?? []).filter((m) => m.enabled).length;

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <h1>Licensing</h1>
        <Button disabled={!canWrite || upload.isPending} onClick={() => upload.mutate()}>
          Upload License
        </Button>
      </header>

      {data ? (
        <div className={styles.kpis}>
          <div className={styles.kpiLead}>
            <span>Plan</span>
            <strong>{data.plan}</strong>
          </div>
          <div className={styles.kpi}>
            <span>Endpoints in Use</span>
            <strong>
              {num(data.seats.inUse)}
              <small> /{num(data.seats.total)}</small>
            </strong>
          </div>
          <div className={styles.kpi}>
            <span>Renews in</span>
            <strong>
              {num(left)}
              <small> days</small>
            </strong>
          </div>
          <div className={styles.kpi}>
            <span>Modules</span>
            <strong>
              {activeModules}
              <small> /{data.modules.length}</small>
            </strong>
          </div>
        </div>
      ) : (
        <Skeleton className={styles.kpiSkeleton} />
      )}

      <div className={styles.row3}>
        <section className={styles.panelPadded}>
          <header className={styles.panelHead}>
            <h2 className={styles.panelTitle}>Seat Usage</h2>
            <span className={usedPct >= 90 ? styles.warn : styles.good}>{usedPct}% used</span>
          </header>
          {data ? (
            <>
              <Donut
                caption="Licensed seats, in use against available"
                stack
                centreValue={num(data.seats.inUse)}
                centreLabel={`of ${num(data.seats.total)} seats`}
                data={[
                  { key: 'in-use', label: 'In Use', value: data.seats.inUse, tone: 'good' },
                  { key: 'available', label: 'Available', value: available, tone: 'neutral' },
                ]}
              />
              <dl className={styles.facts}>
                <div>
                  <dt>In Use</dt>
                  <dd>{num(data.seats.inUse)}</dd>
                </div>
                <div>
                  <dt>Available</dt>
                  <dd>{num(available)}</dd>
                </div>
                <div>
                  <dt>Licensed Seats</dt>
                  <dd>{num(data.seats.total)}</dd>
                </div>
              </dl>
            </>
          ) : (
            <Skeleton className={styles.figureSkeleton} />
          )}
        </section>

        <section className={styles.panelPadded}>
          <header className={styles.panelHead}>
            <h2 className={styles.panelTitle}>Seats by Platform</h2>
          </header>
          {data ? (
            <Columns
              caption="Seats in use, by platform"
              /*
               * Columns scales against `max`, which defaults to 100 for the
               * percentages most of the console plots. These are seat counts,
               * so the ceiling is the largest of them.
               */
              max={Math.max(1, ...platforms.map((p) => p.value))}
              suffix=""
              data={platforms.map((p) => ({
                key: p.key,
                label: `${p.label} · ${Math.round((p.value / Math.max(1, data.seats.inUse)) * 100)}% of used`,
                value: p.value,
                display: num(p.value),
                tone: 'deep',
              }))}
            />
          ) : (
            <Skeleton className={styles.figureSkeleton} />
          )}
        </section>

        <section className={styles.panelPadded}>
          <header className={styles.panelHead}>
            <h2 className={styles.panelTitle}>License Term</h2>
            <span className={left <= 30 ? styles.warn : styles.good}>
              {left === 0 ? 'Expired' : 'Active'}
            </span>
          </header>
          {data ? (
            <>
              <Donut
                caption="How much of the term is left"
                stack
                centreValue={num(left)}
                centreLabel="Days Left"
                data={[
                  { key: 'elapsed', label: 'Elapsed', value: elapsedPct, tone: 'neutral' },
                  { key: 'remaining', label: 'Remaining', value: 100 - elapsedPct, tone: 'warn' },
                ]}
              />
              <dl className={styles.facts}>
                <div>
                  <dt>Started</dt>
                  <dd>{date(data.term.startsAt)}</dd>
                </div>
                <div>
                  <dt>Ends</dt>
                  <dd>{date(data.term.endsAt)}</dd>
                </div>
                <div>
                  <dt>Term Elapsed</dt>
                  <dd>{elapsedPct}%</dd>
                </div>
              </dl>
            </>
          ) : (
            <Skeleton className={styles.figureSkeleton} />
          )}
        </section>
      </div>

      <section className={styles.panel}>
        <header className={styles.panelHead}>
          <h2 className={styles.panelTitle}>Modules</h2>
          <span className={styles.muted}>
            {activeModules} of {data?.modules.length ?? 0} active
          </span>
        </header>

        {license.isPending ? (
          <Skeleton className={styles.figureSkeleton} />
        ) : (
          <div className={styles.modules}>
            {(data?.modules ?? []).map((module) => (
              <article key={module.id} className={styles.module}>
                <span className={styles.moduleMark} aria-hidden="true" />
                <span className={styles.moduleBody}>
                  <b>{module.name}</b>
                  <small className={module.tier === 'preview' ? styles.info : styles.good}>
                    {TIER_LABEL[module.tier]}
                  </small>
                  <small className={styles.muted}>
                    {module.countsAgainstSeats
                      ? `All ${num(data?.seats.total ?? 0)} licensed endpoints`
                      : 'Not Counted in Licensed Seats'}
                  </small>
                </span>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
