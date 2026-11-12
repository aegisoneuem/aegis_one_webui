import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Button, ErrorState, Skeleton } from '@aegis/ui';
import { api, type Page } from '../api/client';
import { num } from '../app/format';
import { segment } from '../app/safeNavigate';
import { Columns, Donut, type Tone } from './shared/Figures';
import type { DexDevice, DexSummary } from '../api/types';
import styles from './Dex.module.css';

/**
 * Digital Employee Experience, restored to the approved v129 layout: four
 * counters over three figures, then the endpoints at the bottom of the estate
 * beside either the scoring method or the selected endpoint's own breakdown.
 *
 * The page's whole argument is that the score is explainable. Pick a row and
 * the right-hand panel stops describing the method and starts showing what
 * that endpoint actually lost and why — the same four thresholds, applied to
 * one machine. A score nobody can take apart is a score nobody trusts.
 */

/** The reference's four measures, in its own order and colours. */
const BREAKDOWN_TONE: Record<string, Tone> = {
  Boot: 'info',
  // The reference draws this one in violet, which the console's palette rules
  // rule out. The deep navy keeps it distinct from the blue beside it.
  CPU: 'deep',
  Memory: 'teal',
  Disk: 'sand',
};

/**
 * The four issues, in the reference's order. Its third bar is violet too, so
 * it takes the deep navy here for the same reason.
 */
const ISSUE_TONE: readonly Tone[] = ['warn', 'bad', 'deep', 'info'];

/** High is good; the reference's own bands are 85 and 70. */
const scoreClass = (score: number): string =>
  score >= 85
    ? (styles.scoreGood as string)
    : score >= 70
      ? (styles.scoreWarn as string)
      : (styles.scoreBad as string);

export default function Dex() {
  const navigate = useNavigate();
  const [picked, setPicked] = useState<string | null>(null);

  const summary = useQuery({
    queryKey: ['/dex/summary'],
    queryFn: ({ signal }) => api.get<DexSummary>('/dex/summary', undefined, signal),
  });

  // Ten rows, which is what the reference shows: this table is a shortlist,
  // not the estate. The Devices page is where the whole estate is ranked.
  const devices = useQuery({
    queryKey: ['/dex/devices', 'lowest'],
    queryFn: ({ signal }) => api.get<Page<DexDevice>>('/dex/devices', { limit: '10' }, signal),
  });

  if (summary.error) {
    return (
      <ErrorState
        title="Digital employee experience could not be loaded"
        description="The experience summary behind the counters did not come back."
        retryLabel="Try again"
        onRetry={() => void summary.refetch()}
      />
    );
  }

  const s = summary.data;
  const rows = devices.data?.items ?? [];
  const selected = rows.find((d) => d.deviceId === picked);
  const total = s ? s.distribution.good + s.distribution.warning + s.distribution.poor : 0;

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <h1>Digital Employee Experience</h1>
        <Button onClick={() => void navigate('/liveops')}>Investigate in Live Activity</Button>
      </header>

      {s ? (
        <div className={styles.kpis}>
          <div className={styles.kpiLead}>
            <span className={styles.kpiLabel}>Experience Score</span>
            <strong>
              {num(s.score)}
              <em>/100</em>
            </strong>
            <small>Average across {num(total)} endpoints</small>
          </div>
          <Kpi label="Good" value={s.distribution.good} total={total} />
          <Kpi label="Warning" value={s.distribution.warning} total={total} tone="warn" />
          <Kpi label="Poor" value={s.distribution.poor} total={total} tone="bad" />
        </div>
      ) : (
        <Skeleton className={styles.kpiSkeleton} />
      )}

      <div className={styles.row3}>
        <Panel title="Distribution">
          {s ? (
            <Donut
              caption="Endpoints by experience band"
              stack
              centreValue={num(s.score)}
              centreLabel="score"
              data={[
                { key: 'good', label: 'Good', value: s.distribution.good, tone: 'good' },
                { key: 'warning', label: 'Warning', value: s.distribution.warning, tone: 'warn' },
                { key: 'poor', label: 'Poor', value: s.distribution.poor, tone: 'bad' },
              ]}
            />
          ) : (
            <Skeleton className={styles.figureSkeleton} />
          )}
        </Panel>

        <Panel title="Score Breakdown">
          {s ? (
            <Columns
              caption="Score by measure"
              suffix=""
              data={s.breakdown.map((b) => ({
                key: b.measure,
                label: b.measure,
                value: b.score,
                tone: BREAKDOWN_TONE[b.measure] ?? 'info',
              }))}
            />
          ) : (
            <Skeleton className={styles.figureSkeleton} />
          )}
        </Panel>

        <Panel title="Top Experience Issues" subtitle="Endpoints affected">
          {s ? (
            <Columns
              caption="Endpoints affected by each issue"
              suffix=""
              max={Math.max(1, ...s.topIssues.map((i) => i.endpoints))}
              data={s.topIssues.map((issue, i) => {
                // The reference splits the threshold out of the label and sets
                // it under the measure, so a count has its rule beside it.
                const [label, rule] = issue.issue.split(' (');
                return {
                  key: issue.issue,
                  label: label ?? issue.issue,
                  value: issue.endpoints,
                  display: num(issue.endpoints),
                  tone: ISSUE_TONE[i] ?? 'info',
                  ...(rule === undefined ? {} : { note: `(${rule}` }),
                };
              })}
            />
          ) : (
            <Skeleton className={styles.figureSkeleton} />
          )}
        </Panel>
      </div>

      <div className={styles.row2}>
        <section className={styles.panel}>
          <header className={styles.panelHead}>
            <h2 className={styles.panelTitle}>Endpoints With the Lowest Scores</h2>
            <span className={styles.grow} />
            <span className={styles.muted}>Select a row to see why</span>
          </header>
          <div className={styles.tableWrap}>
            <table className={styles.grid}>
              <thead>
                <tr>
                  <th scope="col">Computer</th>
                  <th scope="col" className={styles.numeric}>
                    Score
                  </th>
                  <th scope="col" className={styles.numeric}>
                    Boot
                  </th>
                  <th scope="col" className={styles.numeric}>
                    CPU
                  </th>
                  <th scope="col" className={styles.numeric}>
                    Memory
                  </th>
                  <th scope="col" className={styles.numeric}>
                    Disk free
                  </th>
                </tr>
              </thead>
              <tbody>
                {devices.isPending ? (
                  <tr>
                    <td colSpan={6} className={styles.empty}>
                      Loading endpoints…
                    </td>
                  </tr>
                ) : rows.length === 0 ? (
                  <tr>
                    <td colSpan={6} className={styles.empty}>
                      No endpoints are reporting experience telemetry
                    </td>
                  </tr>
                ) : (
                  rows.map((d) => (
                    <tr
                      key={d.deviceId}
                      className={picked === d.deviceId ? styles.rowOn : undefined}
                      onClick={() => setPicked(d.deviceId)}
                    >
                      <td>
                        <button
                          type="button"
                          className={styles.rowLink}
                          onClick={(e) => {
                            e.stopPropagation();
                            void navigate(`/devices/${segment(d.deviceId)}`);
                          }}
                        >
                          {d.name}
                        </button>
                        <small>
                          {d.os} · {d.site}
                        </small>
                      </td>
                      <td className={styles.numeric}>
                        <b className={scoreClass(d.score)}>{num(d.score)}</b>
                      </td>
                      <td className={styles.numeric}>{d.bootSeconds} s</td>
                      <td className={styles.numeric}>{d.cpuPct}%</td>
                      <td className={styles.numeric}>{d.memoryPct}%</td>
                      <td className={styles.numeric}>{d.diskFreePct}%</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        {selected ? (
          <section className={styles.panelPadded}>
            <h2 className={styles.panelTitle}>
              Why is {selected.name} scored {num(selected.score)}?
            </h2>
            {selected.penalties.length === 0 ? (
              <p className={styles.muted}>No penalties. All measures are within thresholds.</p>
            ) : (
              <ul className={styles.penalties}>
                {selected.penalties.map((p) => (
                  <li key={p.reason}>
                    <span>{p.reason}</span>
                    <b>−{p.points}</b>
                  </li>
                ))}
              </ul>
            )}
            {/*
             * A band cap is a ceiling, not a deduction, so an endpoint in the
             * warning or poor band can score below 100 minus the penalties
             * listed. Saying so beats letting the arithmetic look wrong.
             */}
            {selected.band === 'good' ? null : (
              <p className={styles.capNote}>
                Capped at {selected.band === 'poor' ? 55 : 80} by the{' '}
                {selected.band === 'poor' ? 'Poor' : 'Warning'} band.
              </p>
            )}
            <div className={styles.panelActions}>
              <Button
                size="sm"
                onClick={() => void navigate(`/devices/${segment(selected.deviceId)}`)}
              >
                Open Device
              </Button>
              <Button size="sm" onClick={() => void navigate('/liveops?tab=logs')}>
                Collect Logs
              </Button>
            </div>
          </section>
        ) : (
          <section className={styles.panel}>
            <header className={styles.panelHead}>
              <h2 className={styles.panelTitle}>How the Score Works</h2>
            </header>
            <div className={styles.tableWrap}>
              <table className={styles.grid}>
                <thead>
                  <tr>
                    <th scope="col">Measure</th>
                    <th scope="col">Threshold</th>
                    <th scope="col" className={styles.numeric}>
                      Points
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {(s?.method ?? []).map((m, i) => (
                    <tr key={`${m.measure}-${i}`}>
                      <td>
                        <b>{m.measure}</b>
                      </td>
                      <td>{m.threshold}</td>
                      <td className={styles.numeric}>
                        <b className={m.points < 0 ? styles.scoreBad : undefined}>
                          {m.points < 0 ? `−${Math.abs(m.points)}` : m.points}
                        </b>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className={styles.hint}>
              Select an endpoint in the table to see its score breakdown.
            </p>
          </section>
        )}
      </div>
    </div>
  );
}

function Kpi({
  label,
  value,
  total,
  tone,
}: {
  label: string;
  value: number;
  total: number;
  tone?: Tone;
}) {
  return (
    <div className={styles.kpi}>
      <span className={styles.kpiLabel}>{label}</span>
      <strong
        className={tone === 'warn' ? styles.kpiWarn : tone === 'bad' ? styles.kpiBad : undefined}
      >
        {num(value)}
      </strong>
      <small>{total > 0 ? `${Math.round((value / total) * 100)}% of endpoints` : '—'}</small>
    </div>
  );
}

function Panel({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={styles.panelPadded}>
      <h2 className={styles.panelTitle}>{title}</h2>
      {subtitle ? <p className={styles.panelSub}>{subtitle}</p> : null}
      {children}
    </section>
  );
}
