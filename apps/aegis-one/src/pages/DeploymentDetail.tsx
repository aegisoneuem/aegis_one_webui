import { useNavigate, useParams } from 'react-router-dom';
import { Button, Card, ErrorState, KpiTile, PageHeader, Skeleton, StatusPill } from '@aegis/ui';
import { useResource } from '../app/useListController';
import { dateTime, humanise, num, pct, relative, toneFor } from '../app/format';
import { segment } from '../app/safeNavigate';
import type { Deployment } from '../api/types';
import styles from './DeviceDetail.module.css';
import wizardStyles from './DeploymentWizard.module.css';

type Result = {
  deviceId: string;
  hostname: string;
  zoneName: string;
  state: string;
  message: string | null;
  finishedAt: string | null;
};

export default function DeploymentDetail() {
  const { deploymentId = '' } = useParams();
  const navigate = useNavigate();

  const deployment = useResource<Deployment>(`/deployments/${deploymentId}`);
  const results = useResource<{ items: Result[]; page: { total: number } }>(
    `/deployments/${deploymentId}/results`,
  );

  if (deployment.error) {
    return (
      <ErrorState
        title="Deployment not found"
        description="It may have been removed, or it may belong to a zone you cannot see."
        retryLabel="Back to Deployments"
        onRetry={() => void navigate('/deployments')}
      />
    );
  }

  if (deployment.isLoading || !deployment.data) return <Skeleton className={styles.summary} />;

  const d = deployment.data;
  const reported = d.counts.done + d.counts.failed;
  const rows = results.data?.items ?? [];

  return (
    <div className={styles.page}>
      <PageHeader
        title={d.name}
        description={`${humanise(d.type)} · ${d.package} · triggered by ${d.triggeredBy} ${relative(d.triggeredAt).toLowerCase()}`}
        actions={
          <StatusPill dot tone={toneFor(d.status)}>
            {humanise(d.status)}
          </StatusPill>
        }
      />

      <div className={wizardStyles.review}>
        <KpiTile label="Targets" value={num(d.targetCount)} />
        <KpiTile
          label="Succeeded"
          value={num(d.counts.done)}
          tone="good"
          caption={
            reported > 0 ? `${pct((d.counts.done / reported) * 100, 0)} of reported` : undefined
          }
        />
        <KpiTile
          label="Failed"
          value={num(d.counts.failed)}
          tone={d.counts.failed > 0 ? 'bad' : 'neutral'}
        />
        <KpiTile
          label="Pending"
          value={num(d.counts.pending)}
          tone={d.counts.pending > 0 ? 'warn' : 'neutral'}
        />
      </div>

      <div className={styles.diagnosticsGrid}>
        <Card title="Action settings">
          <div className={styles.summary}>
            <Fact label="Type" value={humanise(d.type)} />
            <Fact label="Package" value={d.package} />
            <Fact label="Triggered" value={dateTime(d.triggeredAt)} />
            <Fact
              label="Scheduled for"
              value={d.startsAt ? dateTime(d.startsAt) : 'Queued immediately'}
            />
            <Fact label="Completed" value={d.completedAt ? dateTime(d.completedAt) : 'Not yet'} />
            <Fact label="Wake offline first" value={d.wakeOfflineFirst ? 'Yes' : 'No'} />
          </div>
          {d.notes ? <p className={styles.factValue}>{d.notes}</p> : null}
        </Card>
      </div>

      <Card
        title="Per-endpoint results"
        subtitle={`${num(results.data?.page.total ?? 0)} reported so far`}
        flush
      >
        <div className={styles.scroll}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">Endpoint</th>
                <th scope="col">Aegis Zone</th>
                <th scope="col">Result</th>
                <th scope="col">Message</th>
                <th scope="col">Finished</th>
              </tr>
            </thead>
            <tbody>
              {results.isLoading ? (
                <tr>
                  <td colSpan={5}>Loading results…</td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={5}>No endpoints have reported yet.</td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.deviceId}>
                    <th scope="row">
                      <Button
                        variant="link"
                        size="sm"
                        onClick={() => void navigate(`/devices/${segment(row.deviceId)}`)}
                      >
                        {row.hostname}
                      </Button>
                    </th>
                    <td>{row.zoneName}</td>
                    <td>
                      <StatusPill dot tone={toneFor(row.state)}>
                        {humanise(row.state)}
                      </StatusPill>
                    </td>
                    <td>{row.message ?? '—'}</td>
                    <td>{relative(row.finishedAt)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.fact}>
      <span className={styles.factLabel}>{label}</span>
      <span className={styles.factValue} title={value}>
        {value}
      </span>
    </div>
  );
}

/** Success page after the wizard, so the action id is never only in a toast. */
export function DeploymentCreated() {
  const { deploymentId = '' } = useParams();
  const navigate = useNavigate();
  const { data } = useResource<Deployment>(`/deployments/${deploymentId}`);

  return (
    <div className={wizardStyles.created}>
      <StatusPill tone="good">Action created</StatusPill>
      <h1 className={wizardStyles.createdTitle}>{data?.name ?? 'Action created'}</h1>
      <p className={wizardStyles.createdBody}>
        {data
          ? `${num(data.targetCount)} endpoints were resolved for this action. ${
              data.status === 'scheduled'
                ? `It is scheduled and will start at ${dateTime(data.startsAt)}.`
                : 'It has been queued and will start as endpoints check in.'
            }`
          : 'The action was created.'}
      </p>
      <p className={wizardStyles.createdBody}>
        Reference <strong>{deploymentId}</strong>. Progress appears on the deployment page as
        endpoints report back.
      </p>
      <div className={wizardStyles.createdActions}>
        <Button
          variant="primary"
          onClick={() => void navigate(`/deployments/${segment(deploymentId)}`)}
        >
          View progress
        </Button>
        <Button onClick={() => void navigate('/deployments/new')}>Create another</Button>
        <Button variant="ghost" onClick={() => void navigate('/deployments')}>
          Back to Deployments
        </Button>
      </div>
    </div>
  );
}
