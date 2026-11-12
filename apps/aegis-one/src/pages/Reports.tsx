import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, ErrorState, Skeleton } from '@aegis/ui';
import { api } from '../api/client';
import { num } from '../app/format';
import { segment } from '../app/safeNavigate';
import { Donut, type Tone } from './shared/Figures';
import type { ReportCard, ReportCategory } from '../api/types';
import styles from './Reports.module.css';

/**
 * The report library, restored to the approved v129 layout: five category
 * counters over a card per report, each carrying the figure the report would
 * return against the estate right now.
 *
 * That live figure is the point of the page. The reference prints it on every
 * card, and it is the difference between a menu of report names and a page
 * that tells an administrator which report is worth opening this morning.
 */

const CATEGORIES: readonly { id: ReportCategory | 'all'; label: string }[] = [
  { id: 'all', label: 'All Reports' },
  { id: 'computers-software', label: 'Computers & Software' },
  { id: 'daily-operations', label: 'Daily Operations' },
  { id: 'security', label: 'Security' },
  { id: 'leadership', label: 'Leadership' },
];

/** A breakdown is a share, so the slices take the navy ramp, not a status one. */
const RAMP: readonly Tone[] = ['deep', 'info', 'alt', 'teal', 'sand'];

/** Except where the breakdown is of an outcome, which the reference colours. */
const TILE_TONE: Readonly<Record<string, Tone>> = {
  Online: 'good',
  Offline: 'bad',
  Protected: 'good',
  'Not protected': 'bad',
  Encrypted: 'good',
  'Not encrypted': 'bad',
  Successful: 'good',
  Completed: 'good',
  Failed: 'bad',
  Allowed: 'good',
  Blocked: 'bad',
  Normal: 'good',
  Healthy: 'good',
  Ready: 'good',
  'Needs review': 'warn',
  Critical: 'bad',
  High: 'bad',
};

const SORTS = [
  { value: 'default', label: 'Default Order' },
  { value: 'title', label: 'Name (A–Z)' },
  { value: 'rows', label: 'Most rows' },
  { value: 'category', label: 'Category' },
] as const;

export default function Reports() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const [view, setView] = useState<'grid' | 'list'>('grid');

  const category = (params.get('category') ?? 'all') as ReportCategory | 'all';
  const search = params.get('q') ?? '';
  const sort = params.get('sort') ?? 'default';
  const favouritesOnly = params.get('favorites') === '1';

  const go = (next: Record<string, string | null>): void => {
    const updated = new URLSearchParams(params);
    for (const [key, value] of Object.entries(next)) {
      if (value === null) updated.delete(key);
      else updated.set(key, value);
    }
    setParams(updated, { replace: true });
  };

  const reports = useQuery({
    queryKey: ['/reports'],
    queryFn: ({ signal }) => api.get<ReportCard[]>('/reports', undefined, signal),
  });

  const favourite = useMutation({
    mutationFn: ({ id, value }: { id: string; value: boolean }) =>
      api.put<null>(`/reports/${encodeURIComponent(id)}/favorite`, { favorite: value }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['/reports'] }),
  });

  if (reports.error) {
    return (
      <ErrorState
        title="The report library could not be loaded"
        description="The catalogue behind the cards did not come back."
        retryLabel="Try again"
        onRetry={() => void reports.refetch()}
      />
    );
  }

  const all = reports.data ?? [];
  const starred = all.filter((r) => r.favorite).length;

  const needle = search.trim().toLowerCase();
  const shown = all
    .filter((r) => category === 'all' || r.category === category)
    .filter((r) => !favouritesOnly || r.favorite)
    .filter(
      (r) =>
        needle === '' ||
        r.title.toLowerCase().includes(needle) ||
        r.description.toLowerCase().includes(needle),
    );

  const sorted =
    sort === 'title'
      ? [...shown].sort((a, b) => a.title.localeCompare(b.title))
      : sort === 'rows'
        ? [...shown].sort((a, b) => b.total - a.total)
        : sort === 'category'
          ? [...shown].sort(
              (a, b) => a.category.localeCompare(b.category) || a.title.localeCompare(b.title),
            )
          : shown;

  const countOf = (id: ReportCategory | 'all'): number =>
    id === 'all' ? all.length : all.filter((r) => r.category === id).length;

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <h1>Reports</h1>
        <Button onClick={() => void navigate('/reports/custom')}>+ Custom report</Button>
      </header>

      <div className={styles.categories} role="tablist" aria-label="Report categories">
        {CATEGORIES.map((c) => (
          <button
            key={c.id}
            type="button"
            role="tab"
            aria-selected={category === c.id}
            className={category === c.id ? styles.categoryOn : styles.category}
            onClick={() => go({ category: c.id === 'all' ? null : c.id })}
          >
            <span>{c.label}</span>
            <strong>{reports.isPending ? '—' : num(countOf(c.id))}</strong>
          </button>
        ))}
      </div>

      <section className={styles.toolbar} aria-label="Find a report">
        <label className={styles.search}>
          <span className={styles.srOnly}>Find a report</span>
          <input
            type="search"
            placeholder="Find a report — computers, updates, SEBI…"
            value={search}
            onChange={(e) => go({ q: e.target.value || null })}
          />
          <span className={styles.searchCount}>{num(sorted.length)} reports</span>
        </label>

        <button
          type="button"
          aria-pressed={favouritesOnly}
          className={favouritesOnly ? styles.favOn : styles.fav}
          onClick={() => go({ favorites: favouritesOnly ? null : '1' })}
        >
          ☆ Favorites <strong>{num(starred)}</strong>
        </button>

        <span className={styles.grow} />

        <label className={styles.sort}>
          <span>Sort by</span>
          <select
            aria-label="Sort by"
            value={sort}
            onChange={(e) => go({ sort: e.target.value === 'default' ? null : e.target.value })}
          >
            {SORTS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </label>

        <div className={styles.viewToggle} role="group" aria-label="Layout">
          <button
            type="button"
            aria-pressed={view === 'grid'}
            className={view === 'grid' ? styles.viewOn : styles.viewOff}
            onClick={() => setView('grid')}
          >
            Grid
          </button>
          <button
            type="button"
            aria-pressed={view === 'list'}
            className={view === 'list' ? styles.viewOn : styles.viewOff}
            onClick={() => setView('list')}
          >
            List
          </button>
        </div>
      </section>

      {reports.isPending ? (
        <Skeleton className={styles.gridSkeleton} />
      ) : sorted.length === 0 ? (
        <p className={styles.empty}>No report matches that search.</p>
      ) : view === 'grid' ? (
        <div className={styles.cards}>
          {sorted.map((report) => (
            <ReportTile
              key={report.id}
              report={report}
              onOpen={() => void navigate(`/reports/${segment(report.id)}`)}
              onStar={() => favourite.mutate({ id: report.id, value: !report.favorite })}
            />
          ))}
        </div>
      ) : (
        <section className={styles.panel}>
          <div className={styles.tableWrap}>
            <table className={styles.grid}>
              <thead>
                <tr>
                  <th scope="col">Report</th>
                  <th scope="col">Category</th>
                  <th scope="col" className={styles.numeric}>
                    Rows
                  </th>
                  <th scope="col" className={styles.numeric}>
                    Charts
                  </th>
                  <th scope="col" className={styles.numeric}>
                    Columns
                  </th>
                  <th scope="col" aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {sorted.map((report) => (
                  <tr key={report.id}>
                    <td>
                      <button
                        type="button"
                        className={styles.rowLink}
                        onClick={() => void navigate(`/reports/${segment(report.id)}`)}
                      >
                        {report.title}
                      </button>
                      <small>{report.description}</small>
                    </td>
                    <td>{CATEGORIES.find((c) => c.id === report.category)?.label ?? '—'}</td>
                    <td className={styles.numeric}>
                      {num(report.total)} {report.unit}
                    </td>
                    <td className={styles.numeric}>{num(report.charts)}</td>
                    <td className={styles.numeric}>{num(report.columns)}</td>
                    <td className={styles.numeric}>
                      <button
                        type="button"
                        className={styles.rowLink}
                        onClick={() => void navigate(`/reports/${segment(report.id)}`)}
                      >
                        Open Report
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

function ReportTile({
  report,
  onOpen,
  onStar,
}: {
  report: ReportCard;
  onOpen: () => void;
  onStar: () => void;
}) {
  return (
    <article className={styles.card}>
      <header className={styles.cardHead}>
        <div>
          <h2>{report.title}</h2>
          <p>{report.description}</p>
        </div>
        <button
          type="button"
          className={report.favorite ? styles.starOn : styles.star}
          aria-pressed={report.favorite}
          aria-label={report.favorite ? `Unstar ${report.title}` : `Star ${report.title}`}
          onClick={onStar}
        >
          {report.favorite ? '★' : '☆'}
        </button>
      </header>

      {/*
       * The preview the reference prints: what the report would return now,
       * and the largest single group inside it. A card with no figure is a
       * label, and the whole point of this page is to choose between twenty.
       */}
      <div className={styles.preview}>
        <div className={styles.previewFigures}>
          <p className={styles.previewTotal}>
            <strong>{num(report.total)}</strong>
            <span>{report.headline.label}</span>
          </p>
          {report.secondary ? (
            <p className={styles.previewTop}>
              <span>{report.secondary.label}</span>
              <b>{num(Number(report.secondary.value))}</b>
            </p>
          ) : null}
        </div>
        {report.preview.length > 1 ? (
          <div className={styles.previewChart}>
            <Donut
              caption={`${report.title}: first breakdown`}
              centreValue=""
              centreLabel=""
              data={report.preview.map((d, i) => ({
                key: d.label,
                label: d.label,
                value: d.value,
                tone: TILE_TONE[d.label] ?? RAMP[i % RAMP.length] ?? 'info',
              }))}
            />
          </div>
        ) : null}
      </div>

      <footer className={styles.cardFoot}>
        <span className={styles.cardMeta}>
          {num(report.charts)} charts · {num(report.columns)} columns
        </span>
        <button type="button" className={styles.openLink} onClick={onOpen}>
          Open Report →
        </button>
      </footer>
    </article>
  );
}
