import { useState } from 'react';
import { Button, ErrorState, Skeleton } from '@aegis/ui';
import { useResource } from '../app/useListController';
import { useCan } from '../app/auth';
import { date, num } from '../app/format';
import type { EnrollmentMethod, EnrollmentSummary, EnrollmentToken } from '../api/types';
import styles from './Enrollment.module.css';

/**
 * Enrollment, restored to the approved v129 layout: four counters, the ways an
 * endpoint can join beside the platform split, the install command, and the
 * tokens themselves.
 *
 * Every figure comes from `/enrollment/summary`, computed in SQL. The install
 * command keeps both of its placeholders: a console that printed a real token
 * here would put a working credential on a screen people paste into tickets,
 * which is what the caption underneath warns against.
 */

const PLATFORMS = [
  { id: 'windows', label: 'Windows' },
  { id: 'macos', label: 'macOS' },
  { id: 'linux', label: 'Linux' },
] as const;

type PlatformId = (typeof PLATFORMS)[number]['id'];

/** The reference colours a method's state rather than boxing it. */
const STATE_LABEL: Record<EnrollmentMethod['state'], string> = {
  ready: 'Ready',
  configured: 'Configured',
  available: 'Available',
  'not-configured': 'Not Configured',
};

const STATE_CLASS: Record<EnrollmentMethod['state'], string | undefined> = {
  ready: styles.good,
  configured: styles.good,
  available: styles.info,
  'not-configured': styles.muted,
};

const STATUS_CLASS: Record<EnrollmentToken['status'], string | undefined> = {
  active: styles.good,
  expired: styles.muted,
  revoked: styles.bad,
};

export default function Enrollment() {
  const canWrite = useCan('enrollment:write');
  const [platform, setPlatform] = useState<PlatformId>('windows');
  const [copied, setCopied] = useState(false);

  const summary = useResource<EnrollmentSummary>('/enrollment/summary');
  const tokens = useResource<EnrollmentToken[]>('/enrollment/tokens');

  if (summary.error) {
    return <ErrorState description="Enrollment could not be loaded." onRetry={summary.refetch} />;
  }

  const s = summary.data;

  const copy = () => {
    if (!s) return;
    void navigator.clipboard?.writeText(s.installCommands[platform]).then(
      () => setCopied(true),
      () => setCopied(false),
    );
  };

  return (
    <div className={styles.page}>
      <div className={styles.heading}>
        <div>
          <p className={styles.eyebrow}>Aegis One / Endpoint Management</p>
          <h1 className={styles.title}>Enrollment</h1>
          <p className={styles.subtitle}>
            Enrollment tokens and the computers registered with them.
          </p>
        </div>
        <div className={styles.actions}>
          <Button variant="primary" disabled={!canWrite}>
            Create Token
          </Button>
        </div>
      </div>

      <div className={styles.kpis}>
        {s ? (
          <>
            <Kpi
              label="Enrolled Endpoints"
              value={num(s.enrolled)}
              caption={`${num(s.online)} Online Now`}
              dark
            />
            <Kpi
              label="On Latest Agent"
              value={num(s.onLatestAgent)}
              suffix={`/${num(s.enrolled)}`}
              caption={`Agent ${s.latestAgentVersion}`}
            />
            <Kpi
              label="Active Tokens"
              value={num(s.activeTokens)}
              caption={`${num(s.totalTokens)} total`}
            />
            <Kpi
              label="Not Checking in"
              value={num(s.notCheckingIn)}
              caption="Not seen for 7+ days"
              tone={s.notCheckingIn > 0 ? styles.amber : undefined}
            />
          </>
        ) : (
          Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className={styles.kpiSkeleton} />)
        )}
      </div>

      <div className={styles.split}>
        <Panel title="Enrollment Methods">
          {s ? (
            <div className={styles.methods}>
              {s.methods.map((m) => (
                <div key={m.id} className={styles.method}>
                  <div>
                    <b>{m.name}</b>
                    <p>{m.description}</p>
                  </div>
                  <span className={STATE_CLASS[m.state]}>{STATE_LABEL[m.state]}</span>
                </div>
              ))}
            </div>
          ) : (
            <Skeleton className={styles.panelSkeleton} />
          )}
        </Panel>

        <Panel title="Enrolled by Platform">
          {s ? (
            <PlatformBars byPlatform={s.byPlatform} />
          ) : (
            <Skeleton className={styles.panelSkeleton} />
          )}
        </Panel>
      </div>

      <section className={styles.panel}>
        <div className={styles.commandHead}>
          <h2 className={styles.panelTitle}>Install Command</h2>
          <div className={styles.segmented} role="group" aria-label="Platform">
            {PLATFORMS.map((p) => (
              <button
                key={p.id}
                type="button"
                aria-pressed={platform === p.id}
                className={platform === p.id ? styles.segOn : styles.seg}
                onClick={() => {
                  setPlatform(p.id);
                  setCopied(false);
                }}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <pre className={styles.code}>{s ? s.installCommands[platform] : ' '}</pre>

        <div className={styles.commandRow}>
          <Button size="sm" onClick={copy} disabled={!s}>
            {copied ? 'Copied' : 'Copy Command'}
          </Button>
          <span className={styles.muted}>
            Replace &lt;ENROLLMENT_TOKEN&gt; and &lt;CONSOLE_HOST&gt;. Never paste real tokens into
            tickets or chat.
          </span>
        </div>
      </section>

      <section className={styles.panel}>
        <header className={styles.tableHead}>
          <h2 className={styles.panelTitle}>Enrollment Tokens</h2>
          <span className={styles.muted}>Tokens add devices to a group on first check-in</span>
        </header>

        {tokens.data ? (
          tokens.data.length === 0 ? (
            <p className={styles.empty}>
              No enrollment token. Create one per group so new endpoints land in the right place.
            </p>
          ) : (
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">Name</th>
                  <th scope="col">Target Group</th>
                  <th scope="col">Created</th>
                  <th scope="col">Expires</th>
                  <th scope="col" className={styles.numeric}>
                    Uses
                  </th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {tokens.data.map((t) => (
                  <tr key={t.id}>
                    <td>
                      <b>{t.name}</b>
                    </td>
                    <td>{t.targetGroup ?? 'No group'}</td>
                    <td>{date(t.createdAt)}</td>
                    <td>{date(t.expiresAt)}</td>
                    <td className={styles.numeric}>
                      {t.maxUses === null ? num(t.uses) : `${num(t.uses)} / ${num(t.maxUses)}`}
                    </td>
                    <td>
                      <span className={STATUS_CLASS[t.status]}>
                        {t.status.slice(0, 1).toUpperCase() + t.status.slice(1)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        ) : (
          <Skeleton className={styles.panelSkeleton} />
        )}
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Pieces                                                             */
/* ------------------------------------------------------------------ */

function PlatformBars({ byPlatform }: { byPlatform: EnrollmentSummary['byPlatform'] }) {
  const bars = PLATFORMS.map((p) => ({ label: p.label, value: byPlatform[p.id] }));
  const ceiling = Math.max(1, ...bars.map((b) => b.value));

  return (
    <div className={styles.bars}>
      <div className={styles.plot}>
        {bars.map((b) => (
          <div key={b.label} className={styles.column}>
            <b className={styles.columnValue}>{num(b.value)}</b>
            {/* An SVG, as the other figures in this console are: a
                proportional height is data, and inline styles are not
                allowed here. */}
            <span className={styles.columnBox}>
              <svg
                className={styles.columnTrack}
                viewBox="0 0 1 100"
                preserveAspectRatio="none"
                role="img"
                aria-label={`${b.label}: ${num(b.value)} endpoints`}
              >
                <rect
                  x="0"
                  width="1"
                  y={100 - (b.value / ceiling) * 100}
                  height={Math.max(0.5, (b.value / ceiling) * 100)}
                />
              </svg>
            </span>
          </div>
        ))}
      </div>
      <div className={styles.axis}>
        {bars.map((b) => (
          <span key={b.label}>{b.label}</span>
        ))}
      </div>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <article className={styles.panel}>
      <header className={styles.panelHead}>
        <h2 className={styles.panelTitle}>{title}</h2>
      </header>
      {children}
    </article>
  );
}

function Kpi({
  label,
  value,
  suffix,
  caption,
  tone,
  dark = false,
}: {
  label: string;
  value: string;
  suffix?: string;
  caption: string;
  tone?: string;
  dark?: boolean;
}) {
  return (
    <div className={dark ? styles.kpiDark : styles.kpi}>
      <span className={styles.kpiLabel}>{label}</span>
      <strong className={[styles.kpiValue, tone].filter(Boolean).join(' ')}>
        {value}
        {suffix ? <em className={styles.kpiSuffix}>{suffix}</em> : null}
      </strong>
      <small className={styles.kpiCaption}>{caption}</small>
    </div>
  );
}
