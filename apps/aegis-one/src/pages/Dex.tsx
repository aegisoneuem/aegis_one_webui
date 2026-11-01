import { useNavigate } from 'react-router-dom';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
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
import { humanise, num, pct } from '../app/format';
import type { DexSummary } from '../api/types';
import styles from './Overview.module.css';

/** Digital experience: where the estate is slow, full or struggling. */
export default function Dex() {
  const navigate = useNavigate();
  const { data, isLoading, error, refetch } = useResource<DexSummary>('/dex');

  if (error)
    return (
      <ErrorState
        description="The experience summary could not be loaded."
        onRetry={() => void refetch()}
      />
    );
  if (isLoading || !data) return <Skeleton className={styles.chart} />;

  const worstDepartment = data.byDepartment[0];
  const bands = data.distribution.map((b) => ({ name: humanise(b.band), value: b.devices }));

  return (
    <div className={styles.page}>
      <PageHeader
        title="DEX"
        description="Digital experience scores, from agent telemetry. Lower scores mean slower, fuller or less reliable endpoints."
      />

      <div className={styles.kpis}>
        <KpiTile
          label="Estate score"
          value={num(data.overall.score)}
          caption="Mean across reporting endpoints"
        />
        <KpiTile
          label="Lowest department"
          value={worstDepartment ? num(worstDepartment.score) : '—'}
          tone="warn"
          caption={worstDepartment?.department ?? 'No data'}
        />
        <KpiTile
          label="Poor experience"
          value={num(data.distribution.find((b) => b.band === 'poor')?.devices ?? 0)}
          tone="bad"
          caption="Endpoints scoring under 50"
        />
        <KpiTile
          label="Excellent"
          value={num(data.distribution.find((b) => b.band === 'excellent')?.devices ?? 0)}
          tone="good"
          caption="Endpoints scoring 85 or above"
        />
      </div>

      <div className={styles.grid}>
        <Card title="Score by department" subtitle="Lowest first">
          <ChartFrame
            dataTable={
              <table className={`${styles.table} ${styles.srOnly}`}>
                <caption>Score by department</caption>
                <thead>
                  <tr>
                    <th scope="col">Department</th>
                    <th scope="col">Score</th>
                    <th scope="col">Devices</th>
                  </tr>
                </thead>
                <tbody>
                  {data.byDepartment.map((row) => (
                    <tr key={row.department}>
                      <th scope="row">{row.department}</th>
                      <td>{num(row.score)}</td>
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
                  data={data.byDepartment}
                  layout="vertical"
                  margin={{ left: 0, right: 16 }}
                >
                  <CartesianGrid stroke="var(--ui-grid-line)" horizontal={false} />
                  <XAxis
                    type="number"
                    domain={[0, 100]}
                    tick={{ fontSize: 10, fill: 'var(--text-muted)' }}
                  />
                  <YAxis
                    type="category"
                    dataKey="department"
                    width={150}
                    tick={{ fontSize: 10, fill: 'var(--text-muted)' }}
                  />
                  <Tooltip contentStyle={{ fontSize: 12 }} />
                  <Bar dataKey="score" fill={SERIES_VARS[0]} radius={[0, 3, 3, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </ChartFrame>
        </Card>

        <Card title="Score distribution" subtitle="Across the whole estate">
          <ChartFrame
            dataTable={
              <table className={`${styles.table} ${styles.srOnly}`}>
                <caption>Score distribution</caption>
                <thead>
                  <tr>
                    <th scope="col">Band</th>
                    <th scope="col">Devices</th>
                  </tr>
                </thead>
                <tbody>
                  {bands.map((b) => (
                    <tr key={b.name}>
                      <th scope="row">{b.name}</th>
                      <td>{num(b.value)}</td>
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
                    data={bands}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={48}
                    outerRadius={78}
                  >
                    {bands.map((_, i) => (
                      <Cell key={i} fill={SERIES_VARS[i % SERIES_VARS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(v: unknown) => num(Number(v))}
                    contentStyle={{ fontSize: 12 }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </ChartFrame>
        </Card>

        <Card
          className={styles.wide}
          title="Lowest scoring endpoints"
          subtitle="Worth looking at individually"
        >
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">Endpoint</th>
                <th scope="col">Aegis Zone</th>
                <th scope="col">Department</th>
                <th scope="col" className={styles.numeric}>
                  Score
                </th>
                <th scope="col" className={styles.numeric}>
                  Disk free
                </th>
                <th scope="col" className={styles.numeric}>
                  Memory
                </th>
              </tr>
            </thead>
            <tbody>
              {data.lowestScoring.map((d) => (
                <tr
                  key={d.id}
                  className={styles.linkRow}
                  onClick={() => void navigate(`/devices/${d.id}`)}
                >
                  <th scope="row">{d.hostname}</th>
                  <td>{d.zoneName}</td>
                  <td>{d.department}</td>
                  <td className={styles.numeric}>
                    <StatusPill
                      tone={d.dexScore < 50 ? 'bad' : d.dexScore < 70 ? 'warn' : 'neutral'}
                    >
                      {num(d.dexScore)}
                    </StatusPill>
                  </td>
                  <td className={styles.numeric}>{pct(d.diskFreePct, 0)}</td>
                  <td className={styles.numeric}>{d.ramGb} GB</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
    </div>
  );
}
