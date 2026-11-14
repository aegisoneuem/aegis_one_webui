import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, ErrorState, Field, Input, Modal, Skeleton, useToast } from '@aegis/ui';
import { ApiError, api, type Page } from '../api/client';
import { useCan } from '../app/auth';
import { date, dateTime, num, relative } from '../app/format';
import type {
  ApiToken,
  ConsoleUser,
  Device,
  IdentityProvider,
  RoleDefinition,
  Zone,
} from '../api/types';
import styles from './Administration.module.css';

/**
 * Administration, restored to the approved v129 layout: Identity & SSO,
 * Users, Roles & Content Access and Agent Enrollment, in that order.
 *
 * The page that was here had four tabs too, but a different fourth one: API
 * access, and no Agent Enrollment. Its Identity & SSO tab was two paragraphs
 * of prose where the reference prints four provider cards, and its role cards
 * showed one of the three content scopes the reference prints.
 *
 * API access is kept as a fifth tab on the owner's explicit instruction. It
 * is not in the approved design — v129 has no API-token surface on any of its
 * nineteen pages — but without it nothing in the console can revoke a leaked
 * token. The departure is deliberate and recorded; see
 * docs/administration-restoration.md.
 */

/**
 * The reference has four tabs. API access is a fifth, kept at the owner's
 * explicit request: v129 has no API-token surface anywhere in its nineteen
 * pages, and without this tab nothing in the console could revoke a leaked
 * token. See docs/administration-restoration.md and handover question 60.
 */
const TABS = [
  { id: 'sso', label: 'Identity & SSO' },
  { id: 'users', label: 'Users' },
  { id: 'roles', label: 'Roles & Content Access' },
  { id: 'enrollment', label: 'Agent Enrollment' },
  { id: 'tokens', label: 'API access' },
] as const;

type TabId = (typeof TABS)[number]['id'];

const PROTOCOL_LABEL: Record<IdentityProvider['protocol'], string> = {
  oidc: 'OIDC',
  saml: 'SAML',
  ldap: 'LDAP',
};

const CONNECTION_LABEL: Record<IdentityProvider['status'], string> = {
  connected: 'Connected',
  'not-configured': 'Setup Required',
  error: 'Error',
};

/**
 * The reference groups a role's permissions by resource and prints the verbs
 * beside the name: "Devices Read", "Software Read, Write". The stored form is
 * a flat list of `resource:verb` strings, so it is grouped here rather than
 * printed raw — a card of twelve `software:write` chips says less than six
 * grouped ones.
 */
function groupPermissions(permissions: string[]): { resource: string; verbs: string[] }[] {
  const byResource = new Map<string, string[]>();
  for (const permission of permissions) {
    const [resource, verb] = permission.split(':', 2);
    if (!resource || !verb) continue;
    const verbs = byResource.get(resource) ?? [];
    verbs.push(verb);
    byResource.set(resource, verbs);
  }
  return [...byResource.entries()].map(([resource, verbs]) => ({
    resource: resource.charAt(0).toUpperCase() + resource.slice(1),
    verbs: verbs.map((v) => v.charAt(0).toUpperCase() + v.slice(1)),
  }));
}

export default function Administration() {
  const [params, setParams] = useSearchParams();
  const tab = (TABS.find((t) => t.id === params.get('tab'))?.id ?? 'sso') as TabId;

  const onTab = (next: TabId) => {
    const p = new URLSearchParams(params);
    if (next === 'sso') p.delete('tab');
    else p.set('tab', next);
    setParams(p, { replace: true });
  };

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <h1>Administration</h1>
      </header>

      <div className={styles.tabs} role="tablist" aria-label="Administration views">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={tab === t.id ? styles.tabOn : styles.tab}
            onClick={() => onTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'sso' ? <IdentityTab /> : null}
      {tab === 'users' ? <UsersTab /> : null}
      {tab === 'roles' ? <RolesTab /> : null}
      {tab === 'enrollment' ? <EnrollmentTab /> : null}
      {tab === 'tokens' ? <TokensTab /> : null}
    </div>
  );
}

/* --- Identity & SSO ------------------------------------------------------- */

function IdentityTab() {
  const canConfigure = useCan('admin:idp');

  const providers = useQuery({
    queryKey: ['/admin/identity-providers'],
    queryFn: ({ signal }) =>
      api.get<IdentityProvider[]>('/admin/identity-providers', undefined, signal),
  });

  if (providers.error) {
    return (
      <ErrorState
        title="The identity providers could not be loaded"
        description="The sign-in configuration did not come back."
        retryLabel="Try again"
        onRetry={() => void providers.refetch()}
      />
    );
  }

  if (providers.isPending) return <Skeleton className={styles.gridSkeleton} />;

  return (
    <div className={styles.cards}>
      {(providers.data ?? []).map((p) => (
        <section key={p.id} className={styles.card}>
          <header className={styles.cardHead}>
            <span className={styles.mark} aria-hidden="true">
              {PROTOCOL_LABEL[p.protocol]}
            </span>
            <span className={styles.cardName}>
              <b>{p.name}</b>
              <small>{p.description}</small>
            </span>
          </header>

          <dl className={styles.facts}>
            <div>
              <dt>Status</dt>
              <dd className={p.enabled ? styles.good : styles.muted}>
                {p.enabled ? 'Enabled' : 'Disabled'}
              </dd>
            </div>
            <div>
              <dt>Connection</dt>
              <dd className={p.status === 'connected' ? styles.good : styles.warn}>
                {CONNECTION_LABEL[p.status]}
              </dd>
            </div>
          </dl>

          <div className={styles.cardFoot}>
            <Button disabled={!canConfigure}>Configure</Button>
          </div>
        </section>
      ))}
    </div>
  );
}

/* --- Users ---------------------------------------------------------------- */

function UsersTab() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const canManage = useCan('admin:users');
  const [open, setOpen] = useState<string | null>(null);

  const users = useQuery({
    queryKey: ['/admin/users'],
    queryFn: ({ signal }) => api.get<Page<ConsoleUser>>('/admin/users', { limit: '50' }, signal),
  });

  const setDisabled = useMutation({
    mutationFn: (vars: { id: string; disabled: boolean }) =>
      api.patch<ConsoleUser>(`/admin/users/${encodeURIComponent(vars.id)}`, {
        disabled: vars.disabled,
      }),
    onSuccess: (user) => {
      toast.show({
        title: user.disabled ? `${user.name} can no longer sign in` : `${user.name} re-enabled`,
        tone: 'success',
      });
      void queryClient.invalidateQueries({ queryKey: ['/admin/users'] });
    },
    onError: (error) =>
      toast.show({
        title: 'The account could not be changed.',
        message: error instanceof Error ? error.message : undefined,
        tone: 'error',
      }),
  });

  if (users.error) {
    return (
      <ErrorState
        title="The console users could not be loaded"
        description="The account list did not come back."
        retryLabel="Try again"
        onRetry={() => void users.refetch()}
      />
    );
  }

  return (
    <>
      <div className={styles.toolbar}>
        <Button variant="primary" disabled={!canManage}>
          + Add user
        </Button>
      </div>

      <section className={styles.panel}>
        <div className={styles.tableWrap}>
          <table className={styles.grid}>
            <thead>
              <tr>
                <th scope="col">User</th>
                <th scope="col">Role</th>
                <th scope="col">Access</th>
                <th scope="col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.isPending ? (
                <tr>
                  <td colSpan={4} className={styles.empty}>
                    Loading accounts…
                  </td>
                </tr>
              ) : (
                (users.data?.items ?? []).map((user) => (
                  <tr key={user.id}>
                    <td>
                      <b>{user.name}</b>
                      <small>{user.email}</small>
                    </td>
                    <td>{user.role}</td>
                    <td>
                      <b className={user.disabled ? styles.muted : styles.good}>
                        {user.disabled ? 'Disabled' : 'Active'}
                      </b>
                      {!user.mfaEnrolled && !user.disabled ? (
                        <small className={styles.warn}>No second factor</small>
                      ) : null}
                    </td>
                    <td className={styles.actions}>
                      <div>
                        <Button disabled={!canManage}>Edit Access</Button>
                        <div className={styles.menuWrap}>
                          <Button
                            aria-label={`More actions for ${user.name}`}
                            aria-expanded={open === user.id}
                            onClick={() => setOpen(open === user.id ? null : user.id)}
                          >
                            ⋯
                          </Button>
                          {open === user.id ? (
                            <ul className={styles.menu}>
                              <li>
                                <button
                                  type="button"
                                  disabled={!canManage || setDisabled.isPending}
                                  onClick={() => {
                                    setOpen(null);
                                    setDisabled.mutate({ id: user.id, disabled: !user.disabled });
                                  }}
                                >
                                  {user.disabled ? 'Enable account' : 'Revoke Sessions'}
                                </button>
                              </li>
                            </ul>
                          ) : null}
                        </div>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

/* --- Roles & Content Access ----------------------------------------------- */

function RolesTab() {
  const canManage = useCan('admin:roles');

  const roles = useQuery({
    queryKey: ['/admin/roles'],
    queryFn: ({ signal }) => api.get<RoleDefinition[]>('/admin/roles', undefined, signal),
  });

  /**
   * The scope columns print zone *names*, not ids, so the zones come along
   * for the ride. A role scoped to two zones should say which two.
   */
  const zones = useQuery({
    queryKey: ['/zones', 'admin'],
    queryFn: ({ signal }) =>
      api.get<{ items: Zone[] }>('/zones', undefined, signal).then((z) => z.items),
  });

  if (roles.error) {
    return (
      <ErrorState
        title="The roles could not be loaded"
        description="The permission and content scopes did not come back."
        retryLabel="Try again"
        onRetry={() => void roles.refetch()}
      />
    );
  }

  if (roles.isPending) return <Skeleton className={styles.gridSkeleton} />;

  const zoneName = (id: string) => zones.data?.find((z) => z.id === id)?.name ?? id;

  return (
    <>
      <div className={styles.toolbar}>
        <Button variant="primary" disabled={!canManage}>
          + Create role
        </Button>
      </div>

      <div className={styles.cards}>
        {(roles.data ?? []).map((role) => (
          <section key={role.id} className={styles.card}>
            <header className={styles.roleHead}>
              <b>{role.name}</b>
              <span className={styles.muted}>{role.system ? 'System Role' : 'Scoped Role'}</span>
            </header>

            {role.permissions.includes('*') ? (
              <p className={styles.fullAccess}>Full Console Access</p>
            ) : (
              <ul className={styles.chips}>
                {groupPermissions(role.permissions).map((g) => (
                  <li key={g.resource}>
                    <b>{g.resource}</b> <span>{g.verbs.join(', ')}</span>
                  </li>
                ))}
              </ul>
            )}

            <dl className={styles.scopes}>
              <div>
                <dt>Endpoint Zones</dt>
                <dd>
                  {role.zoneIds.length === 0 ? 'All Zones' : role.zoneIds.map(zoneName).join(', ')}
                </dd>
              </div>
              <div>
                <dt>Software Content</dt>
                <dd>
                  {role.softwareCategories.length === 0
                    ? 'All Categories'
                    : role.softwareCategories.join(', ')}
                </dd>
              </div>
              <div>
                <dt>Device Groups</dt>
                <dd>
                  {role.groupIds.length === 0 ? 'All Groups' : `${role.groupIds.length} groups`}
                </dd>
              </div>
            </dl>

            <div className={styles.cardFoot}>
              {/* A built-in role cannot be edited, which the contract states. */}
              <Button disabled={!canManage || role.system}>Edit Permissions</Button>
            </div>
          </section>
        ))}
      </div>
    </>
  );
}

/* --- Agent Enrollment ------------------------------------------------------ */

function EnrollmentTab() {
  const canManage = useCan('admin:users');

  /**
   * The reference's table is a list of endpoints with their agent and
   * connection state, which is the declared `/devices` list narrowed to the
   * five columns it prints. There is no separate enrollment-roster endpoint,
   * and inventing one would mean two sources of truth for the same rows.
   */
  const devices = useQuery({
    queryKey: ['/devices', 'enrollment'],
    queryFn: ({ signal }) =>
      api.get<Page<Device>>(
        '/devices',
        // `-lastSeenAt` is the column id the devices list sorts by; the
        // contract's own example abbreviates it, and the server refuses it.
        {
          limit: '25',
          sort: '-lastSeenAt',
          fields: 'id,hostname,zoneName,agentVersion,lastSeenAt,status',
        },
        signal,
      ),
  });

  if (devices.error) {
    return (
      <ErrorState
        title="The enrolled endpoints could not be loaded"
        description="The agent roster did not come back."
        retryLabel="Try again"
        onRetry={() => void devices.refetch()}
      />
    );
  }

  return (
    <>
      <div className={styles.toolbar}>
        <Button variant="primary" disabled={!canManage}>
          + Register endpoint
        </Button>
      </div>

      <section className={styles.panel}>
        <div className={styles.tableWrap}>
          <table className={styles.grid}>
            <thead>
              <tr>
                <th scope="col">Endpoint</th>
                <th scope="col">Zone</th>
                <th scope="col">Agent Version</th>
                <th scope="col">Last Seen</th>
                <th scope="col">Connection</th>
              </tr>
            </thead>
            <tbody>
              {devices.isPending ? (
                <tr>
                  <td colSpan={5} className={styles.empty}>
                    Loading endpoints…
                  </td>
                </tr>
              ) : (
                (devices.data?.items ?? []).map((device) => (
                  <tr key={device.id}>
                    <td>
                      <b>{device.hostname}</b>
                    </td>
                    <td>{device.zoneName}</td>
                    <td>{device.agentVersion}</td>
                    <td title={dateTime(device.lastSeenAt)}>{relative(device.lastSeenAt)}</td>
                    <td>
                      <b className={device.status === 'online' ? styles.good : styles.muted}>
                        {device.status === 'online' ? 'Online' : 'Offline'}
                      </b>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {devices.data ? (
          <p className={styles.footnote}>
            Showing the {num(devices.data.items.length)} most recently seen of{' '}
            {num(devices.data.page.total ?? 0)} enrolled endpoints. The Devices page lists them all.
          </p>
        ) : null}
      </section>
    </>
  );
}

/* --- API access ----------------------------------------------------------- */

/**
 * API access.
 *
 * A token's secret exists exactly once, in the response that creates it. The
 * server stores a SHA-256 and a display prefix, so there is no endpoint — and
 * no backup — that can hand the secret back. That is why the dialog says so
 * plainly and why revoking is the only remedy for a leak.
 *
 * Not part of the approved v129 design; restored on the owner's instruction
 * because its absence left no way to revoke a token from the console.
 */
function TokensTab() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const canManage = useCan('admin:tokens');

  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [secret, setSecret] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<ApiToken | null>(null);

  const tokens = useQuery({
    queryKey: ['/admin/api-tokens'],
    queryFn: ({ signal }) =>
      api.get<Page<ApiToken>>('/admin/api-tokens', { limit: '50', sort: '-createdAt' }, signal),
  });

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ['/admin/api-tokens'] });

  const create = useMutation({
    mutationFn: () =>
      // No expiry is sent, so the server applies its documented default of
      // one year. A token that never expires is a credential nobody retires.
      api.post<{ secret: string }>('/admin/api-tokens', {
        name: name.trim(),
        scopes: ['devices:read', 'reports:read'],
      }),
    onSuccess: (result) => {
      setSecret(result.secret);
      setCreating(false);
      setName('');
      invalidate();
    },
    onError: (err) =>
      toast.show({
        tone: 'error',
        title: 'The token could not be created',
        message:
          err instanceof ApiError ? `${err.message} Reference ${err.requestId}.` : 'Try again.',
      }),
  });

  const revoke = useMutation({
    mutationFn: (token: ApiToken) => api.delete(`/admin/api-tokens/${token.id}`),
    onSuccess: () => {
      toast.show({
        tone: 'success',
        title: 'Token revoked',
        message: 'Anything using it stopped working immediately.',
      });
      setRevoking(null);
      invalidate();
    },
    onError: (err) =>
      toast.show({
        tone: 'error',
        title: 'The token could not be revoked',
        message:
          err instanceof ApiError ? `${err.message} Reference ${err.requestId}.` : 'Try again.',
      }),
  });

  if (tokens.error) {
    return (
      <ErrorState
        title="The API tokens could not be loaded"
        description="The token list did not come back."
        retryLabel="Try again"
        onRetry={() => void tokens.refetch()}
      />
    );
  }

  const stateOf = (token: ApiToken): { label: string; tone: string } => {
    if (token.revokedAt) return { label: 'Revoked', tone: styles.bad as string };
    if (token.expiresAt && new Date(token.expiresAt) < new Date())
      return { label: 'Expired', tone: styles.warn as string };
    return { label: 'Active', tone: styles.good as string };
  };

  return (
    <>
      <div className={styles.toolbar}>
        <Button variant="primary" disabled={!canManage} onClick={() => setCreating(true)}>
          + New token
        </Button>
      </div>

      <section className={styles.panel}>
        <div className={styles.tableWrap}>
          <table className={styles.grid}>
            <thead>
              <tr>
                <th scope="col">Token</th>
                <th scope="col">Prefix</th>
                <th scope="col">Scopes</th>
                <th scope="col">State</th>
                <th scope="col">Last used</th>
                <th scope="col">Expires</th>
                <th scope="col">Created by</th>
                <th scope="col">
                  <span className={styles.srOnly}>Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {tokens.isPending ? (
                <tr>
                  <td colSpan={8} className={styles.empty}>
                    Loading tokens…
                  </td>
                </tr>
              ) : (tokens.data?.items ?? []).length === 0 ? (
                <tr>
                  <td colSpan={8} className={styles.empty}>
                    No API tokens. Create one to let a system call the API without a person signing
                    in.
                  </td>
                </tr>
              ) : (
                (tokens.data?.items ?? []).map((token) => {
                  const state = stateOf(token);
                  return (
                    <tr key={token.id}>
                      <td>
                        <b>{token.name}</b>
                      </td>
                      <td>
                        <code className={styles.prefix}>{token.prefix}…</code>
                      </td>
                      <td>{token.scopes.join(', ')}</td>
                      <td>
                        <b className={state.tone}>{state.label}</b>
                      </td>
                      <td title={token.lastUsedAt ? dateTime(token.lastUsedAt) : undefined}>
                        {token.lastUsedAt ? relative(token.lastUsedAt) : 'Never'}
                      </td>
                      <td>{token.expiresAt ? date(token.expiresAt) : 'No expiry'}</td>
                      <td>{token.createdBy}</td>
                      <td className={styles.actions}>
                        <div>
                          <Button
                            disabled={!canManage || token.revokedAt !== null}
                            onClick={() => setRevoking(token)}
                          >
                            Revoke
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      <Modal
        open={creating}
        onClose={() => setCreating(false)}
        title="New API token"
        description="The secret is shown once, when the token is created. It cannot be retrieved later."
        footer={
          <>
            <Button onClick={() => setCreating(false)}>Cancel</Button>
            <Button
              variant="primary"
              loading={create.isPending}
              disabled={!name.trim()}
              onClick={() => create.mutate()}
            >
              Create token
            </Button>
          </>
        }
      >
        <Field
          label="Token name"
          required
          hint="Name it after the system that will use it. The token expires in one year."
        >
          {(field) => (
            <Input
              {...field}
              maxLength={64}
              placeholder="servicenow-sync"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          )}
        </Field>
      </Modal>

      <Modal
        open={secret !== null}
        onClose={() => setSecret(null)}
        title="Copy this token now"
        description="This is the only time it will be shown. Store it in your secret manager before closing."
        footer={
          <Button variant="primary" onClick={() => setSecret(null)}>
            I have stored it
          </Button>
        }
      >
        <pre className={styles.secret}>{secret}</pre>
      </Modal>

      <Modal
        open={revoking !== null}
        onClose={() => setRevoking(null)}
        title={`Revoke ${revoking?.name ?? ''}?`}
        description="Anything using this token stops working immediately. This cannot be undone."
        footer={
          <>
            <Button onClick={() => setRevoking(null)}>Cancel</Button>
            <Button
              variant="danger"
              loading={revoke.isPending}
              onClick={() => revoking && revoke.mutate(revoking)}
            >
              Revoke token
            </Button>
          </>
        }
      >
        {revoking ? (
          <p>
            Last used {revoking.lastUsedAt ? relative(revoking.lastUsedAt).toLowerCase() : 'never'}.
            Created by {revoking.createdBy} on {dateTime(revoking.createdAt)}.
          </p>
        ) : null}
      </Modal>
    </>
  );
}
