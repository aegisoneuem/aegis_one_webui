import { Card, ErrorState, KpiTile, PageHeader, Skeleton, StatusPill } from '@aegis/ui';
import { useResource } from '../app/useListController';
import { date, num, pct } from '../app/format';
import type { License } from '../api/types';
import styles from './Overview.module.css';

export default function Licensing() {
  const { data, isLoading, error, refetch } = useResource<{ items: License[] }>('/licensing');

  if (error)
    return (
      <ErrorState
        description="Licence information could not be loaded."
        onRetry={() => void refetch()}
      />
    );
  if (isLoading || !data) return <Skeleton className={styles.chart} />;

  const core = data.items[0];
  const soonest = [...data.items].sort(
    (a, b) => new Date(a.expiresAt).getTime() - new Date(b.expiresAt).getTime(),
  )[0];

  return (
    <div className={styles.page}>
      <PageHeader
        title="Licensing"
        description="What is entitled, what is consumed, and when it renews."
      />

      <div className={styles.kpis}>
        <KpiTile
          label="Core entitlement"
          value={num(core?.entitled ?? 0)}
          caption="Endpoint management seats"
        />
        <KpiTile
          label="Consumed"
          value={num(core?.consumed ?? 0)}
          tone={core && core.consumed / core.entitled > 0.95 ? 'warn' : 'neutral'}
          caption={
            core ? `${pct((core.consumed / core.entitled) * 100, 1)} of entitlement` : undefined
          }
        />
        <KpiTile
          label="Headroom"
          value={num(Math.max((core?.entitled ?? 0) - (core?.consumed ?? 0), 0))}
          caption="Seats available to enrol"
        />
        <KpiTile
          label="Next renewal"
          value={soonest ? date(soonest.expiresAt) : '—'}
          caption={soonest?.product}
        />
      </div>

      <Card title="Licences" flush>
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">Product</th>
              <th scope="col" className={styles.numeric}>
                Entitled
              </th>
              <th scope="col" className={styles.numeric}>
                Consumed
              </th>
              <th scope="col" className={styles.numeric}>
                Usage
              </th>
              <th scope="col">Support</th>
              <th scope="col">Expires</th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((licence) => {
              const usage = (licence.consumed / Math.max(licence.entitled, 1)) * 100;
              return (
                <tr key={licence.id}>
                  <th scope="row">{licence.product}</th>
                  <td className={styles.numeric}>{num(licence.entitled)}</td>
                  <td className={styles.numeric}>{num(licence.consumed)}</td>
                  <td className={styles.numeric}>
                    <StatusPill tone={usage > 95 ? 'bad' : usage > 85 ? 'warn' : 'good'}>
                      {pct(usage, 1)}
                    </StatusPill>
                  </td>
                  <td>{licence.supportTier}</td>
                  <td>{date(licence.expiresAt)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
