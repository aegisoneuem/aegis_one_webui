import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Button,
  Card,
  Field,
  Input,
  Modal,
  PageHeader,
  StatusPill,
  Tabs,
  useToast,
  type DataTableColumn,
} from '@aegis/ui';
import { api, ApiError } from '../api/client';
import { useListController, useResource } from '../app/useListController';
import { useCan } from '../app/auth';
import { date, dateTime, humanise, num, relative, toneFor } from '../app/format';
import { ResourceList } from './shared/ResourceList';
import type { ApiToken, ConsoleUser, RoleDefinition } from '../api/types';
import styles from './Overview.module.css';
import detailStyles from './DeviceDetail.module.css';

const TABS = [
  { id: 'users', label: 'Users' },
  { id: 'roles', label: 'Roles & content access' },
  { id: 'sso', label: 'Identity & SSO' },
  { id: 'tokens', label: 'API access' },
];

export default function Administration() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') ?? 'users';

  const setTab = (next: string) => {
    const updated = new URLSearchParams(params);
    updated.set('tab', next);
    setParams(updated, { replace: true });
  };

  return (
    <div className={styles.page}>
      <PageHeader
        title="Administration"
        description="Who can sign in, what they can do, and how systems authenticate."
      />
      <Tabs label="Administration sections" value={tab} onChange={setTab} tabs={TABS} />
      {tab === 'users' ? <UsersTab /> : null}
      {tab === 'roles' ? <RolesTab /> : null}
      {tab === 'sso' ? <SsoTab /> : null}
      {tab === 'tokens' ? <TokensTab /> : null}
    </div>
  );
}

const USER_COLUMNS: DataTableColumn<ConsoleUser>[] = [
  {
    id: 'name',
    header: 'Name',
    locked: true,
    sortable: true,
    width: 220,
    cell: (u) => u.name,
    exportValue: (u) => u.name,
  },
  {
    id: 'email',
    header: 'Email',
    sortable: true,
    width: 300,
    cell: (u) => u.email,
    exportValue: (u) => u.email,
  },
  {
    id: 'role',
    header: 'Role',
    sortable: true,
    width: 200,
    cell: (u) => u.role,
    exportValue: (u) => u.role,
  },
  {
    id: 'zoneIds',
    header: 'Zone scope',
    width: 180,
    cell: (u) => (u.zoneIds.length === 0 ? 'All zones' : `${u.zoneIds.length} zone(s)`),
    exportValue: (u) => (u.zoneIds.length === 0 ? 'All zones' : u.zoneIds.join(' ')),
  },
  {
    id: 'status',
    header: 'Status',
    sortable: true,
    width: 130,
    cell: (u) => (
      <StatusPill dot tone={toneFor(u.status)}>
        {humanise(u.status)}
      </StatusPill>
    ),
    exportValue: (u) => u.status,
  },
  {
    id: 'lastSignInAt',
    header: 'Last sign-in',
    sortable: true,
    width: 150,
    cell: (u) => relative(u.lastSignInAt),
    exportValue: (u) => u.lastSignInAt,
  },
];

function UsersTab() {
  const controller = useListController<ConsoleUser>({
    path: '/admin/users',
    defaultSort: { id: 'name', desc: false },
  });
  return (
    <ResourceList
      hideHeading
      label="Users"
      unit="users"
      viewKey="admin-users"
      columns={USER_COLUMNS}
      controller={controller}
      getRowId={(u) => u.id}
      searchPlaceholder="Search name or email"
      emptyTitle="No users match this search"
      emptyDescription="Accounts are provisioned from your identity provider."
    />
  );
}

function RolesTab() {
  const { data, isLoading } = useResource<RoleDefinition[]>('/admin/roles');

  return (
    <div className={styles.grid}>
      {isLoading ? <Card title="Loading roles…">&nbsp;</Card> : null}
      {(data ?? []).map((role) => (
        <Card
          key={role.id}
          title={role.name}
          subtitle={`${num(role.userCount)} user(s)`}
          actions={
            <StatusPill tone={role.system ? 'neutral' : 'info'}>
              {role.system ? 'Built in' : 'Custom'}
            </StatusPill>
          }
          footer={
            role.zoneIds.length === 0
              ? 'Every Aegis Zone'
              : `Scoped to ${role.zoneIds.length} zone(s)`
          }
        >
          <ul>
            {role.permissions.slice(0, 10).map((p) => (
              <li key={p}>
                <code>{p === '*' ? 'Everything' : p}</code>
              </li>
            ))}
            {role.permissions.length > 10 ? <li>and {role.permissions.length - 10} more</li> : null}
          </ul>
        </Card>
      ))}
    </div>
  );
}

function SsoTab() {
  return (
    <div className={styles.grid}>
      <Card title="Identity provider" subtitle="Where sign-in happens">
        <div className={detailStyles.summary}>
          <Fact label="Protocol" value="OpenID Connect" />
          <Fact label="Flow" value="Authorization code with PKCE" />
          <Fact label="Second factor" value="Required for every sign-in" />
          <Fact label="Session length" value="15-minute access token" />
        </div>
      </Card>
      <Card title="What the console stores" subtitle="Deliberately very little">
        <p>
          The console never sees a password or a second factor. The access token lives in memory
          only, and the refresh token is an httpOnly cookie that JavaScript cannot read. Signing out
          revokes the session server-side rather than just clearing the browser.
        </p>
      </Card>
    </div>
  );
}

const TOKEN_COLUMNS: DataTableColumn<ApiToken>[] = [
  {
    id: 'name',
    header: 'Token',
    locked: true,
    sortable: true,
    width: 240,
    cell: (t) => t.name,
    exportValue: (t) => t.name,
  },
  {
    id: 'prefix',
    header: 'Prefix',
    width: 150,
    cell: (t) => <code>{t.prefix}…</code>,
    exportValue: (t) => t.prefix,
  },
  {
    id: 'scopes',
    header: 'Scopes',
    width: 280,
    cell: (t) => t.scopes.join(', '),
    exportValue: (t) => t.scopes.join(' '),
  },
  {
    id: 'revokedAt',
    header: 'State',
    width: 140,
    cell: (t) => {
      const expired = t.expiresAt && new Date(t.expiresAt) < new Date();
      return (
        <StatusPill dot tone={t.revokedAt ? 'bad' : expired ? 'warn' : 'good'}>
          {t.revokedAt ? 'Revoked' : expired ? 'Expired' : 'Active'}
        </StatusPill>
      );
    },
    exportValue: (t) => (t.revokedAt ? 'Revoked' : 'Active'),
  },
  {
    id: 'lastUsedAt',
    header: 'Last used',
    sortable: true,
    width: 150,
    cell: (t) => relative(t.lastUsedAt),
    exportValue: (t) => t.lastUsedAt,
  },
  {
    id: 'expiresAt',
    header: 'Expires',
    sortable: true,
    width: 140,
    cell: (t) => date(t.expiresAt),
    exportValue: (t) => t.expiresAt,
  },
  {
    id: 'createdBy',
    header: 'Created by',
    sortable: true,
    width: 170,
    cell: (t) => t.createdBy,
    exportValue: (t) => t.createdBy,
  },
];

/**
 * API access.
 *
 * A token's secret exists exactly once, in the response to its creation. The
 * server stores only a SHA-256, so there is no endpoint — and no backup —
 * that can hand it back.
 */
function TokensTab() {
  const canManage = useCan('admin:tokens');
  const toast = useToast();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [secret, setSecret] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<ApiToken | null>(null);

  const controller = useListController<ApiToken>({
    path: '/admin/tokens',
    defaultSort: { id: 'createdAt', desc: true },
  });

  const create = useMutation({
    mutationFn: () =>
      api.post<{ secret: string }>('/admin/tokens', {
        name: name.trim(),
        scopes: ['devices:read', 'reports:read'],
      }),
    onSuccess: (result) => {
      setSecret(result.secret);
      setCreating(false);
      setName('');
      void queryClient.invalidateQueries({ queryKey: ['/admin/tokens'] });
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
    mutationFn: (token: ApiToken) => api.delete(`/admin/tokens/${token.id}`),
    onSuccess: () => {
      toast.show({
        tone: 'success',
        title: 'Token revoked',
        message: 'Anything using it stopped working immediately.',
      });
      setRevoking(null);
      void queryClient.invalidateQueries({ queryKey: ['/admin/tokens'] });
    },
    onError: (err) =>
      toast.show({
        tone: 'error',
        title: 'The token could not be revoked',
        message:
          err instanceof ApiError ? `${err.message} Reference ${err.requestId}.` : 'Try again.',
      }),
  });

  return (
    <>
      <ResourceList
        hideHeading
        label="API tokens"
        unit="tokens"
        viewKey="admin-tokens"
        columns={TOKEN_COLUMNS}
        controller={controller}
        getRowId={(t) => t.id}
        searchPlaceholder="Search token name"
        onRowClick={canManage ? setRevoking : undefined}
        emptyTitle="No API tokens"
        emptyDescription="Create one to let a system call the API without a person signing in."
        actions={
          canManage ? (
            <>
              <Button size="sm" onClick={() => void navigate('/admin/api-access')}>
                Open API access
              </Button>
              <Button size="sm" variant="primary" onClick={() => setCreating(true)}>
                New token
              </Button>
            </>
          ) : null
        }
      />

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
        <Field label="Token name" required hint="Name it after the system that will use it.">
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
        <pre>{secret}</pre>
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
            Last used {relative(revoking.lastUsedAt).toLowerCase()}. Created by {revoking.createdBy}{' '}
            on {dateTime(revoking.createdAt)}.
          </p>
        ) : null}
      </Modal>
    </>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className={detailStyles.fact}>
      <span className={detailStyles.factLabel}>{label}</span>
      <span className={detailStyles.factValue}>{value}</span>
    </div>
  );
}
