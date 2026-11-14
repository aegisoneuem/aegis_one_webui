import { useMutation, useQuery } from '@tanstack/react-query';
import { Button, ErrorState, Skeleton, useToast } from '@aegis/ui';
import { api } from '../api/client';
import { dateTime, num, relative } from '../app/format';
import { Columns, Donut, type Tone } from './shared/Figures';
import type { Zone, ZoneList } from '../api/types';
import styles from './Zones.module.css';

/**
 * Aegis Zones, restored to the approved v129 layout: five counters over the
 * delivery distribution, the per-zone efficiency and the content delivery
 * path, then a row per zone.
 *
 * The page answers one question — where content comes from, and what that
 * saves. Content reaches a zone once as a seed copy, its peers then serve it
 * locally, and whatever an endpoint could not get locally it pulls from the
 * central repository. Every percentage here divides two of those three
 * figures, so the counters, the donut, the bars and the path are all the same
 * arithmetic shown four ways.
 */

/** High is good, and a zone with no cache reads as a gap rather than a fault. */
const efficiencyTone = (pct: number): Tone =>
  pct >= 85 ? 'good' : pct >= 60 ? 'warn' : pct > 0 ? 'bad' : 'neutral';

const CONNECTIVITY: readonly { from: number; label: string; className: string }[] = [
  { from: 90, label: 'Healthy', className: 'good' },
  { from: 75, label: 'Constrained', className: 'warn' },
  { from: 0, label: 'Poor', className: 'bad' },
];

/** The reference prints a link as a band, not a number. */
function bandwidthLabel(mbps: number): string {
  if (mbps >= 1000) return 'High bandwidth';
  if (mbps >= 400) return 'Medium bandwidth';
  return 'Low bandwidth';
}

const PEER_LABEL: Record<Zone['peerCache'], string> = {
  elected: 'Peer cache active',
  none: 'Not required',
  disabled: 'Disabled',
};

const STATUS_LABEL: Record<Zone['status'], string> = {
  healthy: 'Healthy',
  degraded: 'Warning',
  offline: 'Offline',
};

export default function Zones() {
  const toast = useToast();

  const zones = useQuery({
    queryKey: ['/zones'],
    queryFn: ({ signal }) => api.get<ZoneList>('/zones', undefined, signal),
  });

  const discovery = useMutation({
    mutationFn: () => api.post<{ id: string }>('/zones/discovery', {}),
    onSuccess: () =>
      toast.show({
        title: 'Discovery queued',
        message: 'Zones are re-read from the estate’s own check-ins.',
        tone: 'success',
      }),
    onError: () => toast.show({ title: 'Discovery could not be queued.', tone: 'error' }),
  });

  if (zones.error) {
    return (
      <ErrorState
        title="Aegis Zones could not be loaded"
        description="The delivery figures behind the counters did not come back."
        retryLabel="Try again"
        onRetry={() => void zones.refetch()}
      />
    );
  }

  const data = zones.data;

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <h1>Aegis Zones</h1>
        <Button disabled={discovery.isPending} onClick={() => discovery.mutate()}>
          {discovery.isPending ? 'Refreshing…' : 'Refresh Discovery'}
        </Button>
      </header>

      {data ? (
        <div className={styles.kpis}>
          <div className={styles.kpiLead}>
            <span>WAN Saved</span>
            <strong>{data.summary.wanSavedPct}%</strong>
          </div>
          <Kpi label="WAN Avoided This Week" value={`${num(data.summary.avoidedThisWeekGb)} GB`} />
          <Kpi label="Peer Cache Hit Rate" value={`${data.summary.hitRatePct}%`} />
          <Kpi label="Direct Downloads" value={`${data.summary.directPct}%`} />
          <Kpi label="Avg Local Delivery" value={`${data.summary.avgLocalMbps} MB/s`} />
        </div>
      ) : (
        <Skeleton className={styles.kpiSkeleton} />
      )}

      <div className={styles.row3}>
        <section className={styles.panelPadded}>
          <h2 className={styles.panelTitle}>Delivery Distribution</h2>
          {data ? (
            <Donut
              caption="Where content came from"
              stack
              centreValue={`${data.summary.hitRatePct}%`}
              centreLabel="local"
              data={data.delivery.distribution.map((d, i) => ({
                key: d.source,
                label: d.source,
                value: d.pct,
                tone: i === 0 ? 'good' : 'neutral',
              }))}
            />
          ) : (
            <Skeleton className={styles.figureSkeleton} />
          )}
        </section>

        <section className={styles.panelPadded}>
          <h2 className={styles.panelTitle}>Aegis Zone Delivery Efficiency</h2>
          {data ? (
            <Columns
              caption="Share served locally, by zone"
              data={data.delivery.efficiency.map((e) => ({
                key: e.zone,
                label: e.zone,
                value: e.pct,
                tone: efficiencyTone(e.pct),
              }))}
            />
          ) : (
            <Skeleton className={styles.figureSkeleton} />
          )}
        </section>

        <section className={styles.panel}>
          <header className={styles.panelHead}>
            <h2 className={styles.panelTitle}>Content Delivery Path</h2>
          </header>
          {data ? (
            <ol className={styles.path}>
              {data.delivery.path.map((hop) => (
                <li key={hop.hop}>
                  <span className={styles.hopNumber} aria-hidden="true">
                    {hop.hop}
                  </span>
                  <span className={styles.hopBody}>
                    <b>{hop.label}</b>
                    <small>{hop.detail}</small>
                  </span>
                  <span className={styles.hopMetric}>{hop.metric ?? '—'}</span>
                </li>
              ))}
            </ol>
          ) : (
            <Skeleton className={styles.figureSkeleton} />
          )}
        </section>
      </div>

      <section className={styles.panel}>
        <div className={styles.tableWrap}>
          <table className={styles.grid}>
            <thead>
              <tr>
                <th scope="col">Aegis Zone</th>
                <th scope="col" className={styles.numeric}>
                  Devices
                </th>
                <th scope="col">Connectivity</th>
                <th scope="col">Bandwidth</th>
                <th scope="col">Peer Cache</th>
                <th scope="col">Last Sync</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {zones.isPending ? (
                <tr>
                  <td colSpan={7} className={styles.empty}>
                    Loading zones…
                  </td>
                </tr>
              ) : (
                (data?.items ?? []).map((zone) => {
                  const band =
                    CONNECTIVITY.find((c) => zone.connectivityPct >= c.from) ?? CONNECTIVITY[2];
                  return (
                    <tr key={zone.id}>
                      <td>
                        <b>{zone.name}</b>
                        <small>{zone.city}</small>
                      </td>
                      <td className={styles.numeric}>{num(zone.devices)}</td>
                      <td>
                        <b className={styles[band?.className ?? 'good']}>
                          {band?.label ?? 'Healthy'}
                        </b>
                        <small>{zone.connectivityPct}% reporting</small>
                      </td>
                      <td>
                        {bandwidthLabel(zone.bandwidthMbps)}
                        <small>{num(zone.bandwidthMbps)} Mbps</small>
                      </td>
                      <td>
                        <b className={zone.peerCache === 'elected' ? styles.good : styles.muted}>
                          {PEER_LABEL[zone.peerCache]}
                        </b>
                      </td>
                      <td title={dateTime(zone.lastSync)}>{relative(zone.lastSync)}</td>
                      <td>
                        <b
                          className={
                            zone.status === 'healthy'
                              ? styles.good
                              : zone.status === 'degraded'
                                ? styles.warn
                                : styles.bad
                          }
                        >
                          {STATUS_LABEL[zone.status]}
                        </b>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.kpi}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
