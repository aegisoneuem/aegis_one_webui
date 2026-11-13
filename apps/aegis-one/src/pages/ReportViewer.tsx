import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, ErrorState, Skeleton, StatusPill, type StatusTone, useToast } from '@aegis/ui';
import { api } from '../api/client';
import { dateTime, num } from '../app/format';
import { Bars, Columns, Donut, NAVY_RAMP, type Tone } from './shared/Figures';
import type { ReportCard, ReportRowPage, ReportSummary } from '../api/types';
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

/* Ten, as the reference's footer says: "1–10 of 32 computers". */
const PER_PAGE = 10;

/** The columns the reference renders as a link to the device, not as text. */
const DEVICE_LINK_FIELDS = new Set(['name', 'hostname']);

/** The columns the reference sets in its tabular network face. */
const NETWORK_FIELDS = new Set(['ip', 'hostname', 'mac', 'dns', 'publicIp', 'gateway', 'subnet']);

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
 *
 * The ramp is the reference's five navy steps and nothing else. It used to
 * reach for teal, sand and grey once it ran past the third step, which is why
 * "Computers by location" came out navy, teal, sand and grey — four unrelated
 * hues for four equal shares. v129 walks the five steps and then starts
 * again, so a ninth bar is the same navy as the first.
 */
const RAMP = NAVY_RAMP;

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

/**
 * One cell, drawn the way the reference draws it rather than as plain text.
 *
 * Three columns are not text in v129: a computer name is a link to the
 * device, an address is set in the tabular face so the octets line up, and a
 * status carries its own dot in the status colour. Everything else is the
 * value, with an instant printed rather than left as an ISO string.
 */
function renderCell(
  field: string,
  row: Record<string, string | number | boolean | null>,
): JSX.Element {
  const value = row[field] ?? null;
  const text = cell(value);

  if (DEVICE_LINK_FIELDS.has(field) && row['deviceId']) {
    return (
      <Link className={styles.deviceLink} to={`/devices/${String(row['deviceId'])}`}>
        {text}
      </Link>
    );
  }

  /*
   * A status is the shared pill, not a local one: it is the same chip the
   * device grid and the deployment list already use, so the five tones
   * cannot drift apart across pages.
   */
  const tone = STATUS_TONE[text];
  if (field === 'status' && tone) {
    return (
      <StatusPill tone={tone as StatusTone} dot>
        {text}
      </StatusPill>
    );
  }

  if (NETWORK_FIELDS.has(field)) return <span className={styles.network}>{text}</span>;
  return <>{text}</>;
}

/** Where a breakdown is of a status, the reference colours it by outcome. */
const STATUS_TONE: Readonly<Record<string, Tone>> = {
  Online: 'good',
  Offline: 'bad',
  'Pending Restart': 'warn',
  Protected: 'good',
  'Not Protected': 'bad',
  Encrypted: 'good',
  'Not Encrypted': 'bad',
  On: 'good',
  Off: 'bad',
  Successful: 'good',
  Completed: 'good',
  Failed: 'bad',
  'Not Finished': 'warn',
  'In Progress': 'warn',
  Allowed: 'good',
  Blocked: 'bad',
  Normal: 'good',
  'Needs Attention': 'warn',
  Poor: 'bad',
  Healthy: 'good',
  Watch: 'warn',
  'Low Space': 'bad',
  Ready: 'good',
  'Needs Review': 'warn',
  'Up to Date': 'good',
  'Updates Pending': 'warn',
  Critical: 'bad',
  High: 'bad',
  Medium: 'warn',
  Low: 'neutral',
  'Low Risk': 'good',
  'Medium Risk': 'warn',
  'High Risk': 'bad',
};

export default function ReportViewer() {
  const { reportId = '' } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const [cursors, setCursors] = useState<string[]>([]);
  const [forms, setForms] = useState<Record<string, Form>>({});
  const [showColumns, setShowColumns] = useState(false);
  const [hidden, setHidden] = useState<Record<string, true>>({});

  /*
   * The pickers live in the query string, so a filtered report is a link
   * someone can send. Changing any of them starts the rows again from the
   * first page, because page three of the old filter means nothing under the
   * new one.
   */
  const location = params.get('location') ?? '';
  const group = params.get('group') ?? '';
  const search = params.get('q') ?? '';
  const sort = params.get('sort') ?? '';
  const dir = params.get('dir') === 'desc' ? 'desc' : 'asc';

  function go(next: Record<string, string | null>): void {
    const merged = new URLSearchParams(params);
    for (const [key, value] of Object.entries(next)) {
      if (value === null || value === '') merged.delete(key);
      else merged.set(key, value);
    }
    setCursors([]);
    setParams(merged, { replace: true });
  }

  const scope: Record<string, string> = {
    ...(location ? { location } : {}),
    ...(group ? { group } : {}),
  };

  const summary = useQuery({
    queryKey: ['/reports', reportId, 'summary', scope],
    queryFn: ({ signal }) =>
      api.get<ReportSummary>(`/reports/${encodeURIComponent(reportId)}/summary`, scope, signal),
  });

  /*
   * The switcher's options. This is the library's own list, under the same
   * key the library page uses, so arriving from there costs nothing.
   */
  const library = useQuery({
    queryKey: ['/reports'],
    queryFn: ({ signal }) => api.get<ReportCard[]>('/reports', undefined, signal),
    staleTime: 60_000,
  });

  const cursor = cursors[cursors.length - 1];
  const query: Record<string, string> = { limit: String(PER_PAGE), ...scope };
  if (cursor) query['cursor'] = cursor;
  if (search) query['q'] = search;
  if (sort) {
    query['sort'] = sort;
    query['dir'] = dir;
  }

  const rows = useQuery({
    queryKey: ['/reports', reportId, 'run', query],
    queryFn: ({ signal }) =>
      api.get<ReportRowPage>(`/reports/${encodeURIComponent(reportId)}/run`, query, signal),
  });

  const favourite = useMutation({
    mutationFn: (value: boolean) =>
      api.put<null>(`/reports/${encodeURIComponent(reportId)}/favorite`, { favorite: value }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['/reports'] });
      void summary.refetch();
    },
    onError: () => toast.show({ title: 'That could not be saved.', tone: 'error' }),
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

  /* The Group picker is a tree in the reference, drawn flat with indents. */
  const groupOptions = useMemo(() => {
    const all = summary.data?.groups ?? [];
    const children = new Map<string, typeof all>();
    for (const g of all) {
      const key = g.parentId ?? '';
      children.set(key, [...(children.get(key) ?? []), g]);
    }
    const out: { id: string; name: string; depth: number }[] = [];
    const walk = (parent: string, depth: number): void => {
      for (const g of children.get(parent) ?? []) {
        out.push({ id: g.id, name: g.name, depth });
        walk(g.id, depth + 1);
      }
    };
    walk('', 0);
    return out;
  }, [summary.data?.groups]);

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
  /*
   * The library's card for this report, which the switcher has already
   * fetched. It carries the title, the unit and how many charts the report
   * has, so the page can draw its own heading and the right number of
   * panels while the counts are still being worked out. Without it the
   * heading read "Report" and the page was a blank sheet until the slowest
   * query in the report came back.
   */
  const card = library.data?.find((c) => c.id === reportId);
  const title = s?.title ?? card?.title ?? 'Report';
  const panelCount = s?.charts.length ?? card?.charts ?? 4;
  const total = rows.data?.page.total ?? s?.total ?? card?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PER_PAGE));
  const page = cursors.length + 1;
  const next = rows.data?.page.nextCursor ?? null;
  const columns = (rows.data?.columns ?? []).filter((c) => !hidden[c.id]);
  /*
   * The footer names the computers behind the rows only where the rows are
   * not computers themselves: v129 says "1-10 of 116 installations . 32
   * computers" for Installed Software and plain "1-10 of 32 computers" for
   * All Computers.
   */
  const unit = s?.unit ?? card?.unit ?? 'rows';
  const devices = unit === 'computers' ? null : (rows.data?.page.devices ?? null);
  /*
   * With no explicit sort the server orders by the first column ascending,
   * so that column shows the ascending arrow rather than the neutral one.
   */
  const sortedBy = sort || (rows.data?.columns[0]?.id ?? '');
  const scoped = location !== '' || group !== '';

  return (
    <div className={styles.page}>
      <div className={styles.nav}>
        <Button size="sm" onClick={() => void navigate('/reports')}>
          All Reports
        </Button>
        <select
          className={styles.switcher}
          aria-label="Report"
          value={reportId}
          onChange={(e) => void navigate(`/reports/${e.target.value}`)}
        >
          {(library.data ?? [{ id: reportId, title }]).map((option) => (
            <option key={option.id} value={option.id}>
              {option.title}
            </option>
          ))}
        </select>
        <span className={styles.grow} />

        <label className={styles.scopeField}>
          Location
          <select
            aria-label="Report location"
            value={location}
            onChange={(e) => go({ location: e.target.value })}
          >
            <option value="">All locations</option>
            {(s?.locations ?? []).map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>

        <label className={styles.scopeField}>
          Group
          <select
            aria-label="Report group"
            value={group}
            onChange={(e) => go({ group: e.target.value })}
          >
            <option value="">All Groups</option>
            {groupOptions.map((g) => (
              <option key={g.id} value={g.id}>
                {'   '.repeat(g.depth) + g.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <header className={styles.head}>
        <h1>{title}</h1>
        <span className={styles.grow} />
        <button
          type="button"
          className={s?.favorite ? styles.starOn : styles.star}
          aria-pressed={s?.favorite ?? false}
          aria-label={s?.favorite ? 'Remove from favourites' : 'Add to favourites'}
          disabled={!s || favourite.isPending}
          onClick={() => favourite.mutate(!s?.favorite)}
        >
          {s?.favorite ? '★' : '☆'}
        </button>
        <Button size="sm" onClick={() => void navigate('/reports/custom')}>
          Schedule
        </Button>
        <Button
          size="sm"
          variant="primary"
          disabled={exportReport.isPending}
          onClick={() => exportReport.mutate('xlsx')}
        >
          <svg
            className={styles.buttonIcon}
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="square"
            strokeLinejoin="miter"
            aria-hidden="true"
          >
            <path d="M12 3v12M7 11l5 5 5-5M4 20h16" />
          </svg>
          {exportReport.isPending ? 'Exporting…' : 'Export'}
        </Button>
      </header>

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
        <div className={styles.kpis}>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className={styles.kpiSkeleton} />
          ))}
        </div>
      )}

      <div className={styles.charts}>
        {s === undefined
          ? Array.from({ length: panelCount }, (_, i) => (
              <section key={i} className={styles.panel}>
                <header className={styles.panelHead}>
                  <Skeleton className={styles.panelTitleSkeleton} />
                </header>
                <div className={styles.panelBody}>
                  <Skeleton className={styles.panelBodySkeleton} />
                </div>
              </section>
            ))
          : null}
        {(s?.charts ?? []).map((chart) => {
          // The catalogue says which form a panel opens in, because v129
          // does: four locations are side-on bars and three computer types
          // are a ring, which no rule about category counts would predict.
          const form = forms[chart.field] ?? chart.form;
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
                    share={false}
                    centreValue={num(chart.data.reduce((a, d) => a + d.value, 0))}
                    centreLabel={unit}
                  />
                ) : form === 'bar' ? (
                  <Bars caption={chart.title} suffix="" axis data={data} />
                ) : (
                  <Columns caption={chart.title} suffix="" axis data={data} />
                )}
              </div>
            </section>
          );
        })}
      </div>

      <section className={styles.panel}>
        <header className={styles.dataHead}>
          {/* "Computer Details" on every report, which is what v129 calls
              it whether the rows are computers, installations or updates. */}
          <h2 className={styles.panelTitle}>
            Computer Details <span className={styles.count}>{num(total)}</span>
          </h2>
          <span className={styles.grow} />
          <div className={styles.search}>
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M20 20l-5-5M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0" />
            </svg>
            <input
              aria-label="Search report details"
              placeholder="Computer, IP, user or keyword…"
              defaultValue={search}
              onChange={(e) => go({ q: e.target.value })}
            />
          </div>
          <Button
            size="sm"
            aria-pressed={scoped}
            disabled={!scoped}
            onClick={() => go({ location: null, group: null })}
          >
            {scoped ? 'Clear filters' : 'Filters'}
          </Button>
          <Button
            size="sm"
            aria-expanded={showColumns}
            onClick={() => setShowColumns(!showColumns)}
          >
            Columns
          </Button>
        </header>

        {showColumns ? (
          <div className={styles.columnChooser}>
            {(rows.data?.columns ?? []).map((c) => (
              <label key={c.id}>
                <input
                  type="checkbox"
                  checked={!hidden[c.id]}
                  onChange={(e) =>
                    setHidden(
                      e.target.checked
                        ? Object.fromEntries(Object.entries(hidden).filter(([id]) => id !== c.id))
                        : { ...hidden, [c.id]: true },
                    )
                  }
                />
                {c.header}
              </label>
            ))}
          </div>
        ) : null}

        <div className={styles.tableWrap}>
          <table className={styles.grid}>
            <thead>
              <tr>
                {columns.map((c) => (
                  <th
                    key={c.id}
                    scope="col"
                    aria-sort={
                      sortedBy === c.id ? (dir === 'desc' ? 'descending' : 'ascending') : 'none'
                    }
                  >
                    <button
                      type="button"
                      className={styles.sortButton}
                      onClick={() =>
                        go({ sort: c.id, dir: sort === c.id && dir === 'asc' ? 'desc' : 'asc' })
                      }
                    >
                      {c.header}
                      <span aria-hidden="true">
                        {sortedBy === c.id ? (dir === 'desc' ? '↓' : '↑') : '↕'}
                      </span>
                    </button>
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
                    {columns.map((c) => (
                      <td key={c.id}>{renderCell(c.id, row)}</td>
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
              ? `No ${unit}`
              : `${num((page - 1) * PER_PAGE + 1)}–${num(Math.min(page * PER_PAGE, total))} of ${num(total)} ${unit}${
                  devices === null ? '' : ` · ${num(devices)} computers`
                }`}
          </span>
          <span className={styles.grow} />
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
