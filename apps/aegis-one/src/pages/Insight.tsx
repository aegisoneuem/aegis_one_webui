import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Button, ErrorState, Skeleton, useToast } from '@aegis/ui';
import { api, type Page } from '../api/client';
import { num } from '../app/format';
import { segment } from '../app/safeNavigate';
import type { Device, InsightRun, InsightTemplate } from '../api/types';
import styles from './Insight.module.css';

/**
 * AEGIS Insight, restored to the approved v129 layout: describe a problem on
 * one endpoint on the left, and read the root cause, the checks and the
 * recommended actions on the right.
 *
 * The right-hand column has the reference's three states — nothing yet, a
 * run in progress, and the result.
 *
 * One deliberate difference from the reference, stated plainly because it is
 * the substance of the page: v129 hard-codes its diagnosis. The root cause
 * and the 91% confidence are string literals in the preview. Here every check
 * reads the endpoint's own measures, the root cause is the checks that
 * actually failed, and the confidence is how far they agree — so an endpoint
 * with nothing wrong says so instead of being told it has high memory
 * pressure.
 */

const SEVERITY_LABEL = {
  critical: 'Critical',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
} as const;

const SEVERITY_RANK: Record<keyof typeof SEVERITY_LABEL, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};

const SEVERITY_CLASS: Record<keyof typeof SEVERITY_LABEL, string> = {
  critical: styles.sevCritical as string,
  high: styles.sevHigh as string,
  medium: styles.sevMedium as string,
  low: styles.sevLow as string,
};

export default function Insight() {
  const navigate = useNavigate();
  const toast = useToast();
  const [params] = useSearchParams();

  const deviceId = params.get('device');
  const [description, setDescription] = useState(
    'User reports that the laptop is slow and applications take too long to open.',
  );
  const [run, setRun] = useState<InsightRun | null>(null);

  /**
   * The endpoint under diagnosis. Without one in the URL the page opens on
   * the worst-scoring endpoint, because that is the one a service desk is
   * most likely to be asked about.
   */
  /**
   * The endpoint under diagnosis. A device in the URL is fetched by id, which
   * is the contract's own single-device route; without one the page opens on
   * the worst-scoring endpoint, because that is the one a service desk is
   * most likely to be asked about. `sort=dexScore` is ascending, as the
   * contract defines it — a leading minus would reverse it.
   */
  const devices = useQuery({
    queryKey: ['/devices', 'insight', deviceId],
    queryFn: async ({ signal }) => {
      if (deviceId) return api.get<Device>(`/devices/${segment(deviceId)}`, undefined, signal);
      const page = await api.get<Page<Device>>(
        '/devices',
        { limit: '1', sort: 'dexScore' },
        signal,
      );
      return page.items[0] ?? null;
    },
  });

  const device = devices.data;

  const diagnose = useMutation({
    mutationFn: () =>
      api.post<InsightRun>('/insight/diagnostics', {
        description: description.trim(),
        deviceId: device?.id ?? '',
      }),
    onSuccess: (result) => setRun(result),
    onError: () => toast.show({ title: 'The diagnostics could not be run.', tone: 'error' }),
  });

  const saveTemplate = useMutation({
    mutationFn: () =>
      api.post<InsightTemplate>('/insight/templates', {
        name: description.trim().split(/[.;]/)[0]?.slice(0, 60) ?? 'Saved description',
        description: description.trim(),
      }),
    onSuccess: () =>
      toast.show({
        title: 'Diagnostic template saved',
        message: 'It is kept for reuse; the approved layout has no picker to load it back.',
        tone: 'success',
      }),
    onError: () => toast.show({ title: 'The template could not be saved.', tone: 'error' }),
  });

  const remediate = useMutation({
    mutationFn: () =>
      api.post<{ id: string }>(
        `/insight/diagnostics/${encodeURIComponent(run?.id ?? '')}/remediation`,
        {},
      ),
    onSuccess: () => {
      toast.show({
        title: 'Remediation queued',
        message: 'It runs as a job; the result appears under Live Activity.',
        tone: 'success',
      });
      setRun(run ? { ...run, status: 'remediated' } : null);
    },
    onError: () => toast.show({ title: 'The remediation could not be queued.', tone: 'error' }),
  });

  /**
   * The reference's checks panel lists findings, worst first: a check that
   * passed is not printed. Sorting here rather than on the server keeps the
   * endpoint's own order — the order the checks ran in — intact.
   */
  const findings = (run?.checks ?? [])
    .filter((c) => c.result !== 'pass')
    .sort((a, b) => SEVERITY_RANK[b.severity ?? 'low'] - SEVERITY_RANK[a.severity ?? 'low']);

  if (devices.error) {
    return (
      <ErrorState
        title="AEGIS Insight could not be loaded"
        description="The endpoint to diagnose did not come back."
        retryLabel="Try again"
        onRetry={() => void devices.refetch()}
      />
    );
  }

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <h1>AEGIS Insight</h1>
        <span className={styles.grow} />
        <Button
          onClick={() => {
            setRun(null);
            diagnose.reset();
          }}
        >
          New Diagnosis
        </Button>
      </header>

      <div className={styles.columns}>
        <section className={styles.panelPadded}>
          <h2 className={styles.panelTitle}>Describe the Problem</h2>

          <p className={styles.endpoint}>
            Endpoint:{' '}
            {device ? (
              <>
                <button
                  type="button"
                  className={styles.endpointLink}
                  onClick={() => void navigate(`/devices/${segment(device.id)}`)}
                >
                  {device.hostname}
                </button>
                <span>
                  {' '}
                  · {device.primaryUserName} · {device.osName} · DEX {num(device.dexScore)}
                </span>
              </>
            ) : (
              <span>loading…</span>
            )}
          </p>

          <label className={styles.field}>
            <span className={styles.srOnly}>Describe the problem</span>
            <textarea
              rows={4}
              maxLength={2000}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What did the user report?"
            />
          </label>

          <div className={styles.actions}>
            <Button
              variant="primary"
              disabled={!device || description.trim().length < 5 || diagnose.isPending}
              onClick={() => diagnose.mutate()}
            >
              {diagnose.isPending ? 'Running…' : 'Run Diagnostics'}
            </Button>
            <Button
              disabled={description.trim().length < 5 || saveTemplate.isPending}
              onClick={() => saveTemplate.mutate()}
            >
              Save Diagnostic Template
            </Button>
          </div>
        </section>

        <div className={styles.result}>
          {diagnose.isPending ? (
            <section className={styles.panelPadded}>
              <Skeleton className={styles.runSkeleton} />
              <p className={styles.running}>
                Collecting telemetry · comparing to the fleet · checking configuration drift…
              </p>
            </section>
          ) : run === null ? (
            <section className={styles.idle}>
              <b>No Diagnosis Yet</b>
            </section>
          ) : (
            <>
              {run.rootCause ? (
                <section className={styles.rootCause}>
                  <div>
                    <span className={styles.rootEyebrow}>Likely root cause</span>
                    <p>{run.rootCause.summary}</p>
                  </div>
                  <div className={styles.confidence}>
                    <span>Confidence</span>
                    <strong>{run.rootCause.confidencePct}%</strong>
                  </div>
                </section>
              ) : null}

              <div className={styles.row2}>
                <section className={styles.panelPadded}>
                  <h2 className={styles.panelTitle}>Diagnostic Checks</h2>
                  <ul className={styles.checks}>
                    {findings.map((check) => (
                      <li key={check.name} title={check.detail}>
                        <span className={styles.checkName}>{check.name}</span>
                        <b className={SEVERITY_CLASS[check.severity ?? 'low']}>
                          {SEVERITY_LABEL[check.severity ?? 'low']}
                        </b>
                      </li>
                    ))}
                  </ul>
                  {findings.length === 0 ? (
                    <p className={styles.clean}>
                      Every check this endpoint reports is inside its threshold.
                    </p>
                  ) : null}
                </section>

                <section className={styles.panelPadded}>
                  <h2 className={styles.panelTitle}>Recommended Actions</h2>
                  {run.recommendations.length === 0 ? (
                    <p className={styles.clean}>
                      Nothing to do. Every measure Insight can see is inside its threshold.
                    </p>
                  ) : (
                    <>
                      <ul className={styles.recommendations}>
                        {run.recommendations.map((rec) => (
                          <li key={rec.id}>
                            <b>{rec.title}</b>
                            {rec.expected ? <small>Expected: {rec.expected}</small> : null}
                          </li>
                        ))}
                      </ul>
                      <div className={styles.actionsWide}>
                        <Button
                          variant="primary"
                          disabled={run.status === 'remediated' || remediate.isPending}
                          onClick={() => remediate.mutate()}
                        >
                          {run.status === 'remediated'
                            ? 'Remediation queued'
                            : remediate.isPending
                              ? 'Queueing…'
                              : 'Run Remediation'}
                        </Button>
                        <Button onClick={() => void navigate('/liveops')}>Review</Button>
                      </div>
                    </>
                  )}
                </section>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
