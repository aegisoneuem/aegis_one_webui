import { useNavigate } from 'react-router-dom';
import { Button, Card, ErrorState, PageHeader, Skeleton, StatusPill } from '@aegis/ui';
import { useResource } from '../app/useListController';
import { humanise, toneFor } from '../app/format';
import { pagePath, query } from '../app/safeNavigate';
import type { InsightFinding } from '../api/types';
import styles from './Overview.module.css';

/**
 * AEGIS Insight: the estate's aggregates, read back as things worth doing.
 *
 * Every figure on this page comes from a query the server ran. Nothing here is
 * predicted, inferred or generated — a finding is a count with a filter
 * attached, and the button takes you to the rows it counted.
 */
export default function Insight() {
  const navigate = useNavigate();
  const { data, isLoading, error, refetch } = useResource<{ findings: InsightFinding[] }>(
    '/insight',
  );

  if (error)
    return <ErrorState description="Insight could not be loaded." onRetry={() => void refetch()} />;
  if (isLoading || !data) return <Skeleton className={styles.chart} />;

  return (
    <div className={styles.page}>
      <PageHeader
        title="AEGIS Insight"
        description="What the current estate data says is worth doing, with the rows behind each figure."
      />

      <div className={styles.grid}>
        {data.findings.map((finding) => (
          <Card
            key={finding.id}
            title={finding.title}
            actions={
              <StatusPill tone={toneFor(finding.severity)}>{humanise(finding.severity)}</StatusPill>
            }
            footer="Counted from live estate data when this page loaded."
          >
            <p>{finding.detail}</p>
            {finding.action ? (
              <Button
                onClick={() =>
                  // The page name comes from the API, so it is checked against
                  // the nineteen real pages before it becomes a path.
                  void navigate(`${pagePath(finding.action?.page ?? '')}${query(finding.action?.filter)}`)
                }
              >
                {finding.action.label}
              </Button>
            ) : null}
          </Card>
        ))}
      </div>
    </div>
  );
}
