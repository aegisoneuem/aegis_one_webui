import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Button, ErrorState, Skeleton, useToast } from '@aegis/ui';
import { api } from '../api/client';
import { dateTime, num } from '../app/format';
import { Columns, Donut, type Tone } from './shared/Figures';
import type { ReportRowPage, ReportSummary } from '../api/types';
import styles from './ReportViewer.module.css';

/**
 * One report, restored to the approved v129 layout: three counters over the
 * report's own charts, then its rows in the catalogue's column order.
 *
 * Each panel keeps the reference's chart-type selector, because the same
 * breakdown reads differently as a column chart and as a donut and the
 * reference lets the reader choose. The rows below are the same query the
 * charts were grouped from, so a panel and the grid can never disagree.
 */

const PER_PAGE = 50;

/** The forms the console can draw, in the reference's own order. */
const FORMS = [
  { value: 'column', label: 'Column' },
  { value: 'bar', label: 'Bar' },
  { value: 'donut', label: 'Donut' },
  { value: 'pie', label: 'Pie' },
] as const;

type Form = (typeof FORMS)[number]['value'];

/**
 * A chart is a count by category, so the slices take the navy ramp rather
 * than a status ramp: nothing here is good or bad, it is just a share.
 */
const RAMP: readonly Tone[] = ['deep', 'info', 'alt', 'teal', 'sand', 'neutral'];

/**
 * A report column carries whatever its source holds, so an instant arrives as
 * an ISO string. Printing it raw is the one thing that would make an
 * otherwise faithful grid look unfinished.
 */
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

function cell(value: string | number | boolean | null): string {
  if (value === null || value === '') return '—';
  const text = String(value);
  return ISO.test(text) ? dateTime(text) : text;
}

/** Where a breakdown is of a status, the reference colours it by outcome. */
const STATUS_TONE: Readonly<Record<string, Tone>> = {
  Online: 'good',
  Offline: 'bad',
  'Pending restart': 'warn',
  Protected: 'good',
  'Not protected': 'bad',
  Encrypted: 'good',
  'Not encrypted': 'bad',
  On: 'good',
  Off: 'bad',
  Successful: 'good',
  Completed: 'good',
  Failed: 'bad',
  'Not finished': 'warn',
  'In progress': 'warn',
  Allowed: 'good',
  Blocked: 'bad',
  Normal: 'good',
  'Needs attention': 'warn',
  Poor: 'bad',
  Healthy: 'good',
  Watch: 'warn',
  'Low space': 'bad',
  Ready: 'good',
  'Needs review': 'warn',
  'Up to date': 'good',
  'Updates pending': 'warn',
  Critical: 'bad',
  High: 'bad',
  Medium: 'warn',
  Low: 'neutral',
  'Low risk': 'good',
  'Medium risk': 'warn',
  'High risk': 'bad',
};

export default function ReportViewer() {
  const { reportId = '' } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [cursors, setCursors] = useState<string[]>([]);
  const [forms, setForms] = useState<Record<string, Form>>({});

  const summary = useQuery({
    queryKey: ['/reports', reportId, 'summary'],
    queryFn: ({ signal }) =>
      api.get<ReportSummary>(`/reports/${encodeURIComponent(reportId)}/summary`, undefined, signal),
  });

  const cursor = cursors[cursors.length - 1];
  const query: Record<string, string> = { limit: String(PER_PAGE) };
  if (cursor) query['cursor'] = cursor;

  const rows = useQuery({
    queryKey: ['/reports', reportId, 'run', query],
    queryFn: ({ signal }) =>
      api.get<ReportRowPage>(`/reports/${encodeURIComponent(reportId)}/run`, query, signal),
  });

  const exportReport = useMutation({
    mutationFn: (format: string) =>
      api.post<{ id: string }>(`/reports/${encodeURIComponent(reportId)}/export`, { format }),
    onSuccess: () =>
      toast.show({
        title: 'Export queued',
        message: 'It will appear under Exports when the file is ready.',
        tone: 'success',
      }),
    onError: () => toast.show({ title: 'The export could not be queued.', tone: 'error' }),
  });

  if (summary.error) {
    return (
      <ErrorState
        title="That report could not be loaded"
        description="The report's own summary did not come back."
        retryLabel="Try again"
        onRetry={() => void summary.refetch()}
      />
    );
  }

  const s = summary.data;
  const total = rows.data?.page.total ?? s?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PER_PAGE));
  const page = cursors.length + 1;
  const next = rows.data?.page.nextCursor ?? null;

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <Button size="sm" onClick={() => void navigate('/reports')}>
          All Reports
        </Button>
        <h1>{s ? s.title : 'Report'}</h1>
        <span className={styles.grow} />
        <Button size="sm" onClick={() => void navigate('/reports/custom')}>
          Schedule
        </Button>
        <Button
          size="sm"
          variant="primary"
          disabled={exportReport.isPending}
          onClick={() => exportReport.mutate('xlsx')}
        >
          {exportReport.isPending ? 'Exporting…' : 'Export'}
        </Button>
      </header>

      {s ? <p className={styles.lead}>{s.description}</p> : null}

      {s ? (
        <div className={styles.kpis}>
          {s.kpis.map((kpi, i) => (
            <div key={kpi.label} className={i === 0 ? styles.kpiLead : styles.kpi}>
              <span>{kpi.label}</span>
              <strong>{num(kpi.value)}</strong>
            </div>
          ))}
        </div>
      ) : (
        <Skeleton className={styles.kpiSkeleton} />
      )}

      <div className={styles.charts}>
        {(s?.charts ?? []).map((chart) => {
          const form = forms[chart.field] ?? (chart.data.length <= 4 ? 'donut' : 'column');
          const data = chart.data.map((d, i) => ({
            key: d.label,
            label: d.label,
            value: d.value,
            display: num(d.value),
            tone: STATUS_TONE[d.label] ?? RAMP[i % RAMP.length] ?? 'info',
          }));
          return (
            <section key={chart.field} className={styles.panel}>
              <header className={styles.panelHead}>
                <h2 className={styles.panelTitle}>{chart.title}</h2>
                <span className={styles.grow} />
                <select
                  className={styles.formPicker}
                  aria-label={`Chart type: ${chart.title}`}
                  value={form}
                  onChange={(e) => setForms({ ...forms, [chart.field]: e.target.value as Form })}
                >
                  {FORMS.map((f) => (
                    <option key={f.value} value={f.value}>
                      {f.label}
                    </option>
                  ))}
                </select>
              </header>
              <div className={styles.panelBody}>
                {form === 'donut' || form === 'pie' ? (
                  <Donut
                    caption={chart.title}
                    data={data}
                    pie={form === 'pie'}
                    centreValue={num(chart.data.reduce((a, d) => a + d.value, 0))}
                    centreLabel={s?.unit ?? ''}
                  />
                ) : (
                  <Columns
                    caption={chart.title}
                    suffix=""
                    max={Math.max(1, ...chart.data.map((d) => d.value))}
                    data={data}
                  />
                )}
              </div>
            </section>
          );
        })}
      </div>

      <section className={styles.panel}>
        <header className={styles.panelHead}>
          <h2 className={styles.panelTitle}>
            {s ? `${s.title} details` : 'Details'}{' '}
            <span className={styles.count}>{num(total)}</span>
          </h2>
        </header>
        <div className={styles.tableWrap}>
          <table className={styles.grid}>
            <thead>
              <tr>
                {(rows.data?.columns ?? []).map((c) => (
                  <th key={c.id} scope="col">
                    {c.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.isPending ? (
                <tr>
                  <td className={styles.empty}>Loading rows…</td>
                </tr>
              ) : (
                (rows.data?.rows ?? []).map((row, i) => (
                  <tr key={String(row['deviceId'] ?? i) + String(i)}>
                    {(rows.data?.columns ?? []).map((c) => (
                      <td key={c.id}>{cell(row[c.id] ?? null)}</td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <footer className={styles.pager}>
          <span className={styles.pagerCount}>
            {total === 0
              ? `No ${s?.unit ?? 'rows'}`
              : `${num((page - 1) * PER_PAGE + 1)}–${num(Math.min(page * PER_PAGE, total))} of ${num(total)} ${s?.unit ?? ''}`}
          </span>
          <span className={styles.grow} />
          <Button size="sm" disabled={page === 1} onClick={() => setCursors([])}>
            First
          </Button>
          <Button size="sm" disabled={page === 1} onClick={() => setCursors(cursors.slice(0, -1))}>
            Previous
          </Button>
          <span className={styles.pagerPage}>
            Page {num(page)} of {num(pages)}
          </span>
          <Button
            size="sm"
            disabled={next === null}
            onClick={() => next !== null && setCursors([...cursors, next])}
          >
            Next
          </Button>
        </footer>
      </section>
    </div>
  );
}
