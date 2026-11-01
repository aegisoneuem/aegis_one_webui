import { useNavigate } from 'react-router-dom';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  Card,
  ChartFrame,
  ErrorState,
  KpiTile,
  PageHeader,
  SERIES_VARS,
  Skeleton,
  StatusPill,
} from '@aegis/ui';
import { useResource } from '../app/useListController';
import { ApiError } from '../api/client';
import { complianceTone, humanise, num, pct, relative, toneFor } from '../app/format';
import { segment } from '../app/safeNavigate';
import type { Overview as OverviewData } from '../api/types';
import styles from './Overview.module.css';

/**
 * The landing page: what the estate looks like right now, and the two or
 * three things worth doing about it.
 *
 * Every figure comes from one aggregate call. Counting 50,000 rows in the
 * browser is what the performance budget exists to prevent.
 */
export default function Overview() {
  const navigate = useNavigate();
  const { data, isLoading, error, refetch } = useResource<OverviewData>('/overview');

  if (error) {
    return (
      <ErrorState
        description="The estate summary could not be loaded."
        {...(error instanceof ApiError ? { detail: `Request ${error.requestId}` } : {})}
        onRetry={() => void refetch()}
      />
    );
  }

  if (isLoading || !data) {
    return (
      <div className={styles.page}>
        <PageHeader title="Overview" description="Loading the estate summary…" />
        <div className={styles.kpis}>
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className={styles.chart} />
          ))}
        </div>
      </div>
    );
  }

  const {
    endpoints,
    posture,
    byZone,
    byOs,
    patchState,
    topVulnerabilities,
    recentDeployments,
    serviceHealth,
  } = data;

  const osChart = byOs.slice(0, 7).map((row) => ({ name: row.osName, devices: row.devices }));
  const zoneChart = byZone.map((row) => ({
    name: row.zoneName,
    devices: row.devices,
    compliance: row.compliancePct,
  }));
  const patchChart = patchState.map((row) => ({ name: humanise(row.state), value: row.n }));

  const unhealthy = serviceHealth.filter((s) => s.status !== 'healthy');

  return (
    <div className={styles.page}>
      <PageHeader
        title="Overview"
        description={`${num(endpoints.total)} managed endpoints across ${byZone.length} Aegis Zones.`}
      />

      <div className={styles.kpis}>
        <KpiTile
          label="Managed endpoints"
          value={num(endpoints.total)}
          caption={`${num(endpoints.online)} online now`}
          onClick={() => void navigate('/devices')}
        />
        <KpiTile
          label="Patch compliance"
          value={pct(posture.compliancePct)}
          tone={complianceTone(posture.compliancePct)}
          caption="Mean across reporting endpoints"
          onClick={() => void navigate('/patches')}
        />
        <KpiTile
          label="Critical vulnerabilities"
          value={num(posture.criticalVulnerabilities)}
          tone="bad"
          caption="Open findings rated critical"
          onClick={() => void navigate('/vulns?severity=critical')}
        />
        <KpiTile
          label="Not seen in 7 days"
          value={num(endpoints.notSeen7Days)}
          tone={endpoints.notSeen7Days > 0 ? 'warn' : 'neutral'}
          caption="No agent check-in"
          onClick={() => void navigate('/devices?status=offline')}
        />
        <KpiTile
          label="Encrypted"
          value={pct(posture.encryptedPct)}
          tone={complianceTone(posture.encryptedPct)}
          caption="Full-disk encryption enabled"
          onClick={() => void navigate('/devices?encrypted=0')}
        />
      </div>

      <div className={styles.grid}>
        <Card title="Endpoints by Aegis Zone" subtitle="Device count and mean patch compliance">
          <ChartFrame
            dataTable={
              <table className={`${styles.table} ${styles.srOnly}`}>
                <caption>Endpoints by Aegis Zone</caption>
                <thead>
                  <tr>
                    <th scope="col">Zone</th>
                    <th scope="col">Devices</th>
                    <th scope="col">Compliance</th>
                  </tr>
                </thead>
                <tbody>
                  {zoneChart.map((row) => (
                    <tr key={row.name}>
                      <th scope="row">{row.name}</th>
                      <td>{num(row.devices)}</td>
                      <td>{pct(row.compliance)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            }
          >
            <div className={styles.chart}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={zoneChart} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
                  <CartesianGrid stroke="var(--ui-grid-line)" vertical={false} />
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 10, fill: 'var(--text-muted)' }}
                    interval={0}
                    angle={-28}
                    textAnchor="end"
                    height={58}
                  />
                  <YAxis tick={{ fontSize: 10, fill: 'var(--text-muted)' }} width={46} />
                  <RechartsTooltip
                    formatter={(value: unknown) => num(Number(value))}
                    contentStyle={{ fontSize: 12, borderRadius: 6 }}
                  />
                  <Bar dataKey="devices" fill={SERIES_VARS[0]} radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </ChartFrame>
        </Card>

        <Card title="Patch state" subtitle="Across every applicable endpoint and patch">
          <ChartFrame
            dataTable={
              <table className={`${styles.table} ${styles.srOnly}`}>
                <caption>Patch state</caption>
                <thead>
                  <tr>
                    <th scope="col">State</th>
                    <th scope="col">Records</th>
                  </tr>
                </thead>
                <tbody>
                  {patchChart.map((row) => (
                    <tr key={row.name}>
                      <th scope="row">{row.name}</th>
                      <td>{num(row.value)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            }
          >
            <div className={styles.chart}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={patchChart}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={48}
                    outerRadius={78}
                  >
                    {patchChart.map((_, i) => (
                      <Cell key={i} fill={SERIES_VARS[i % SERIES_VARS.length]} />
                    ))}
                  </Pie>
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <RechartsTooltip
                    formatter={(value: unknown) => num(Number(value))}
                    contentStyle={{ fontSize: 12 }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </ChartFrame>
        </Card>

        <Card title="Operating systems" subtitle="Top builds across the estate">
          <ChartFrame
            dataTable={
              <table className={`${styles.table} ${styles.srOnly}`}>
                <caption>Operating systems</caption>
                <thead>
                  <tr>
                    <th scope="col">Build</th>
                    <th scope="col">Devices</th>
                  </tr>
                </thead>
                <tbody>
                  {osChart.map((row) => (
                    <tr key={row.name}>
                      <th scope="row">{row.name}</th>
                      <td>{num(row.devices)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            }
          >
            <div className={styles.chart}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={osChart}
                  layout="vertical"
                  margin={{ top: 4, right: 16, bottom: 4, left: 0 }}
                >
                  <CartesianGrid stroke="var(--ui-grid-line)" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={170}
                    tick={{ fontSize: 10, fill: 'var(--text-muted)' }}
                  />
                  <RechartsTooltip
                    formatter={(value: unknown) => num(Number(value))}
                    contentStyle={{ fontSize: 12 }}
                  />
                  <Bar dataKey="devices" fill={SERIES_VARS[1]} radius={[0, 3, 3, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </ChartFrame>
        </Card>

        <Card
          title="Service health"
          subtitle={
            unhealthy.length === 0 ? 'All components healthy' : `${unhealthy.length} need attention`
          }
        >
          <div className={styles.healthList}>
            {serviceHealth.map((service) => (
              <div key={service.id} className={styles.healthRow}>
                <span className={styles.healthName}>
                  <span>{service.component}</span>
                  {service.message ? (
                    <span className={styles.healthMessage}>{service.message}</span>
                  ) : null}
                </span>
                <span className={styles.healthLatency}>{service.latencyMs} ms</span>
                <StatusPill dot tone={toneFor(service.status)}>
                  {humanise(service.status)}
                </StatusPill>
              </div>
            ))}
          </div>
        </Card>

        <Card
          className={styles.wide}
          title="Vulnerabilities worth acting on"
          subtitle="Known exploits first, then by CVSS"
        >
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">CVE</th>
                <th scope="col">Title</th>
                <th scope="col">Severity</th>
                <th scope="col" className={styles.numeric}>
                  CVSS
                </th>
                <th scope="col" className={styles.numeric}>
                  Endpoints
                </th>
                <th scope="col">Fixed by</th>
              </tr>
            </thead>
            <tbody>
              {topVulnerabilities.map((v) => (
                <tr
                  key={v.id}
                  className={styles.linkRow}
                  onClick={() => void navigate(`/vulns?q=${encodeURIComponent(v.id)}`)}
                >
                  <td>{v.id}</td>
                  <td>
                    <span className={styles.truncate}>{v.title}</span>
                  </td>
                  <td>
                    <StatusPill tone={toneFor(v.severity)}>
                      {v.exploited ? `${humanise(v.severity)} · exploited` : humanise(v.severity)}
                    </StatusPill>
                  </td>
                  <td className={styles.numeric}>{v.cvss.toFixed(1)}</td>
                  <td className={styles.numeric}>{num(v.affectedCount)}</td>
                  <td>{v.fixedBy}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <Card
          className={styles.wide}
          title="Recent deployments"
          subtitle="Last six actions across the estate"
        >
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">Action</th>
                <th scope="col">Type</th>
                <th scope="col">Status</th>
                <th scope="col" className={styles.numeric}>
                  Targets
                </th>
                <th scope="col" className={styles.numeric}>
                  Failed
                </th>
                <th scope="col">Created</th>
              </tr>
            </thead>
            <tbody>
              {recentDeployments.map((d) => (
                <tr
                  key={d.id}
                  className={styles.linkRow}
                  onClick={() => void navigate(`/deployments/${segment(d.id)}`)}
                >
                  <td>
                    <span className={styles.truncate}>{d.name}</span>
                  </td>
                  <td>{humanise(d.type)}</td>
                  <td>
                    <StatusPill dot tone={toneFor(d.status)}>
                      {humanise(d.status)}
                    </StatusPill>
                  </td>
                  <td className={styles.numeric}>{num(d.targetCount)}</td>
                  <td className={styles.numeric}>{num(d.failed)}</td>
                  <td>{relative(d.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
    </div>
  );
}
