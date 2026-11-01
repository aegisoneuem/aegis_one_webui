import { useParams } from 'react-router-dom';
import { PageHeader } from '@aegis/ui';
import { PAGE_BY_ID, type PageId } from '../app/nav';
import { OUTLINES } from './outline';
import styles from './RouteSkeleton.module.css';

interface Props {
  id: PageId;
  crumbs?: string[];
}

/** Phase 1 stand-in for every route. Lists the sections the page must contain per the feature inventory. */
export default function RouteSkeleton({ id, crumbs }: Props): JSX.Element {
  const params = useParams();
  const page = PAGE_BY_ID[id];
  const outline = OUTLINES[id];
  const sub = crumbs?.[crumbs.length - 1];
  const subject = Object.values(params).filter(Boolean).join(' / ');
  const title = sub ? `${page.label}: ${sub}` : page.label;

  return (
    <section data-page={id}>
      <PageHeader
        title={title}
        description={subject ? `Route parameters: ${subject}` : page.summary}
      />
      <div className={styles.panel}>
        <div className={styles.row}>
          <h2 className={styles.label}>Route</h2>
          <code className={styles.mono}>{window.location.pathname}</code>
        </div>
        {outline.tabs ? (
          <div className={styles.row}>
            <h2 className={styles.label}>Tabs</h2>
            <ul className={styles.chips}>
              {outline.tabs.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          </div>
        ) : null}
        <div className={styles.row}>
          <h2 className={styles.label}>Sections</h2>
          <ul className={styles.list}>
            {outline.sections.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </div>
        {outline.actions ? (
          <div className={styles.row}>
            <h2 className={styles.label}>Actions</h2>
            <ul className={styles.chips}>
              {outline.actions.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </section>
  );
}
