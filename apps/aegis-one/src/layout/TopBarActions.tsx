import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Icon, Menu, Popover } from '@aegis/ui';
import { api, type Page } from '../api/client';
import { useAuth, useCan } from '../app/auth';
import { dateTime } from '../app/format';
import type { AuditEntry } from '../api/types';
import styles from './TopBarActions.module.css';

/**
 * The right-hand end of the top bar: search, notifications, help, and the
 * signed-in user as an initials tile.
 *
 * v129 draws these four and the console drew the user's name as text, which
 * is the most visible difference left after the Reports work — it is on
 * every page. The geometry here is the reference's: 32px icon buttons, a
 * 36px tile in #20272D with #ECC57C initials, and a 5px square gold dot on
 * the bell.
 *
 * What is behind each control is narrower than the reference's, and says so
 * rather than promising more. v129's search is a command palette across
 * every entity in the console; this one searches endpoints, because that is
 * a search this console can actually run today. The bell shows the audit
 * log, which is the one record of "what just happened" that exists, and the
 * dot means entries newer than the last time this browser opened it — not a
 * decoration that is always lit.
 */

/** How many audit entries the bell shows before asking you to open the log. */
const RECENT = 8;

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '??';
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : (parts[0]?.[1] ?? '');
  return `${first}${last}`.toUpperCase();
}

const SEEN_KEY = 'aegis.notifications.seen';

function lastSeen(): string {
  try {
    return window.localStorage.getItem(SEEN_KEY) ?? '';
  } catch {
    // A browser with storage blocked simply never marks anything read.
    return '';
  }
}

export function TopBarActions() {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const canAudit = useCan('audit:read');

  const searchAnchor = useRef<HTMLButtonElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const bellAnchor = useRef<HTMLButtonElement>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [bellOpen, setBellOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [seen, setSeen] = useState(lastSeen);

  /*
   * The panel is portalled, so the input only exists once it is open. Focus
   * moves there when the reader asks for it, which is the point of the
   * control; `autoFocus` would be the wrong tool, and the lint rule says so.
   */
  useEffect(() => {
    if (searchOpen) searchInput.current?.focus();
  }, [searchOpen]);

  /*
   * `/liveops/audit`, not the contract's `/audit`: the second is declared and
   * no server implements it, so asking for it is a 404 on every page. Worth
   * closing in its own right — noted in docs/sweep-v129.md.
   */
  const audit = useQuery({
    queryKey: ['/liveops/audit', 'recent'],
    queryFn: ({ signal }) =>
      api.get<Page<AuditEntry>>('/liveops/audit', { limit: String(RECENT) }, signal),
    enabled: canAudit,
    staleTime: 60_000,
  });

  const entries = audit.data?.items ?? [];
  const unread = entries.filter((e) => e.at > seen).length;

  function openBell(): void {
    setBellOpen(true);
    const newest = entries[0]?.at;
    if (newest !== undefined) {
      setSeen(newest);
      try {
        window.localStorage.setItem(SEEN_KEY, newest);
      } catch {
        // Nothing to do: the dot simply comes back next time.
      }
    }
  }

  function search(): void {
    const q = query.trim();
    setSearchOpen(false);
    setQuery('');
    navigate(q === '' ? '/devices' : `/devices?q=${encodeURIComponent(q)}`);
  }

  return (
    <div className={styles.actions}>
      <button
        ref={searchAnchor}
        type="button"
        className={styles.iconButton}
        aria-label="Search endpoints"
        aria-expanded={searchOpen}
        title="Search endpoints"
        onClick={() => setSearchOpen(!searchOpen)}
      >
        <Icon name="search" size={18} />
      </button>
      <Popover
        anchorRef={searchAnchor}
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        align="end"
        className={styles.searchPanel}
      >
        <label className={styles.searchField}>
          <Icon name="search" size={16} />
          <input
            ref={searchInput}
            value={query}
            placeholder="Search endpoints by name, IP, serial or user…"
            aria-label="Search endpoints"
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') search();
            }}
          />
        </label>
        <p className={styles.searchNote}>Enter opens Devices with this search applied.</p>
      </Popover>

      {canAudit ? (
        <>
          <button
            ref={bellAnchor}
            type="button"
            className={styles.iconButton}
            aria-label={unread > 0 ? `Open notifications, ${unread} unread` : 'Open notifications'}
            aria-expanded={bellOpen}
            title="Notifications"
            onClick={() => (bellOpen ? setBellOpen(false) : openBell())}
          >
            <Icon name="bell" size={18} />
            {unread > 0 ? <i className={styles.dot} aria-hidden="true" /> : null}
          </button>
          <Popover
            anchorRef={bellAnchor}
            open={bellOpen}
            onClose={() => setBellOpen(false)}
            align="end"
            className={styles.bellPanel}
          >
            <h2 className={styles.panelTitle}>Recent activity</h2>
            {entries.length === 0 ? (
              <p className={styles.searchNote}>
                {audit.isPending ? 'Loading…' : 'Nothing has been recorded yet.'}
              </p>
            ) : (
              <ul className={styles.feed}>
                {entries.map((entry) => (
                  <li key={entry.id}>
                    <b>{entry.action}</b>
                    <span>
                      {entry.actor} · {entry.objectType} · {dateTime(entry.at)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <button
              type="button"
              className={styles.panelLink}
              onClick={() => {
                setBellOpen(false);
                navigate('/liveops?tab=audit');
              }}
            >
              Open the audit log
            </button>
          </Popover>
        </>
      ) : null}

      <Menu
        label="Help"
        items={[
          { separator: true, label: 'Keyboard' },
          { id: 'back', label: 'Alt + Left — go back', onSelect: () => navigate(-1) },
          {
            id: 'diagnostics',
            label: 'System health and diagnostics',
            onSelect: () => navigate('/diagnostics'),
          },
        ]}
      >
        {(trigger) => (
          <button
            type="button"
            className={styles.iconButton}
            aria-label="Help"
            title="Help"
            {...trigger}
          >
            <Icon name="help" size={18} />
          </button>
        )}
      </Menu>

      {user ? (
        <Menu
          label="Account"
          items={[
            { separator: true, label: `${user.name} — ${user.role}` },
            {
              id: 'administration',
              label: 'Open Administration',
              onSelect: () => navigate('/admin'),
            },
            {
              id: 'sign-out',
              label: 'Sign out',
              icon: <Icon name="sign-out" size={15} />,
              onSelect: () => void signOut(),
            },
          ]}
        >
          {(trigger) => (
            <button
              type="button"
              className={styles.avatar}
              aria-label={`Open profile for ${user.name}`}
              title={`${user.name} — ${user.role}`}
              {...trigger}
            >
              {initials(user.name)}
            </button>
          )}
        </Menu>
      ) : null}
    </div>
  );
}
