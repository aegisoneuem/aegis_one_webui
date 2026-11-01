import { Card, ErrorState, KpiTile, PageHeader, Skeleton, StatusPill } from '@aegis/ui';
import { useResource } from '../app/useListController';
import { humanise, num, relative, toneFor } from '../app/format';
import type { ServiceHealth, Zone } from '../api/types';
import styles from './Overview.module.css';

type DiagnosticsData = {
  services: ServiceHealth[];
  zones: Pick<Zone, 'id' | 'name' | 'relayStatus' | 'lastSyncAt' | 'deviceCount'>[];
  counts: {
    devices: number;
    softwareInstalls: number;
    patchRecords: number;
    findings: number;
    auditEntries: number;
  };
};

export default function Diagnostics() {
  const { data, isLoading, error, refetch } = useResource<DiagnosticsData>('/diagnostics');

  if (error)
    return (
      <ErrorState description="Diagnostics could not be loaded." onRetry={() => void refetch()} />
    );
  if (isLoading || !data) return <Skeleton className={styles.chart} />;

  const unhealthy = data.services.filter((s) => s.status !== 'healthy');

  return (
    <div className={styles.page}>
      <PageHeader
        title="Diagnostics"
        description="Platform health and what the console is holding. Useful when a figure elsewhere looks wrong."
      />

      <div className={styles.kpis}>
        <KpiTile
          label="Components"
          value={num(data.services.length)}
          tone={unhealthy.length === 0 ? 'good' : 'warn'}
          caption={unhealthy.length === 0 ? 'All healthy' : `${unhealthy.length} need attention`}
        />
        <KpiTile label="Devices" value={num(data.counts.devices)} caption="Inventory records" />
        <KpiTile
          label="Software installs"
          value={num(data.counts.softwareInstalls)}
          caption="Per-endpoint rows"
        />
        <KpiTile
          label="Patch records"
          value={num(data.counts.patchRecords)}
          caption="Endpoint × patch"
        />
        <KpiTile
          label="Audit entries"
          value={num(data.counts.auditEntries)}
          caption="Last 90 days"
        />
      </div>

      <div className={styles.grid}>
        <Card className={styles.wide} title="Component health">
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">Component</th>
                <th scope="col">Status</th>
                <th scope="col" className={styles.numeric}>
                  Latency
                </th>
                <th scope="col">Detail</th>
                <th scope="col">Checked</th>
              </tr>
            </thead>
            <tbody>
              {data.services.map((service) => (
                <tr key={service.id}>
                  <th scope="row">{service.component}</th>
                  <td>
                    <StatusPill dot tone={toneFor(service.status)}>
                      {humanise(service.status)}
                    </StatusPill>
                  </td>
                  <td className={styles.numeric}>{service.latencyMs} ms</td>
                  <td>{service.message ?? '—'}</td>
                  <td>{relative(service.checkedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <Card
          className={styles.wide}
          title="Zone relays"
          subtitle="How current each site's inventory is"
        >
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">Aegis Zone</th>
                <th scope="col">Relay</th>
                <th scope="col" className={styles.numeric}>
                  Endpoints
                </th>
                <th scope="col">Last sync</th>
              </tr>
            </thead>
            <tbody>
              {data.zones.map((zone) => (
                <tr key={zone.id}>
                  <th scope="row">{zone.name}</th>
                  <td>
                    <StatusPill dot tone={toneFor(zone.relayStatus)}>
                      {humanise(zone.relayStatus)}
                    </StatusPill>
                  </td>
                  <td className={styles.numeric}>{num(zone.deviceCount)}</td>
                  <td>{relative(zone.lastSyncAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
    </div>
  );
}
