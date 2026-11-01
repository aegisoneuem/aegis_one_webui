import { Card, PageHeader, Select, StatusPill, type DataTableColumn } from '@aegis/ui';
import { useListController } from '../app/useListController';
import { date, humanise, num, relative } from '../app/format';
import { ResourceList } from './shared/ResourceList';
import type { EnrollmentToken } from '../api/types';
import styles from './Overview.module.css';

const COLUMNS: DataTableColumn<EnrollmentToken>[] = [
  {
    id: 'name',
    header: 'Token',
    locked: true,
    sortable: true,
    width: 280,
    cell: (t) => t.name,
    exportValue: (t) => t.name,
  },
  {
    id: 'platform',
    header: 'Platform',
    sortable: true,
    width: 140,
    cell: (t) => humanise(t.platform),
    exportValue: (t) => t.platform,
  },
  {
    id: 'prefix',
    header: 'Prefix',
    width: 150,
    cell: (t) => <code>{t.prefix}…</code>,
    exportValue: (t) => t.prefix,
  },
  {
    id: 'uses',
    header: 'Enrolments',
    numeric: true,
    sortable: true,
    width: 150,
    cell: (t) => (t.maxUses ? `${num(t.uses)} / ${num(t.maxUses)}` : num(t.uses)),
    exportValue: (t) => t.uses,
  },
  {
    id: 'revokedAt',
    header: 'State',
    width: 130,
    cell: (t) => {
      const expired = new Date(t.expiresAt) < new Date();
      return (
        <StatusPill dot tone={t.revokedAt ? 'bad' : expired ? 'warn' : 'good'}>
          {t.revokedAt ? 'Revoked' : expired ? 'Expired' : 'Active'}
        </StatusPill>
      );
    },
    exportValue: (t) => (t.revokedAt ? 'Revoked' : 'Active'),
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
    width: 160,
    cell: (t) => t.createdBy,
    exportValue: (t) => t.createdBy,
  },
  {
    id: 'createdAt',
    header: 'Created',
    sortable: true,
    width: 140,
    defaultHidden: true,
    cell: (t) => relative(t.createdAt),
    exportValue: (t) => t.createdAt,
  },
];

export default function Enrollment() {
  const controller = useListController<EnrollmentToken>({
    path: '/enrollment/tokens',
    defaultSort: { id: 'createdAt', desc: true },
  });

  return (
    <div className={styles.page}>
      <PageHeader
        title="Enrollment"
        description="How endpoints join the estate. A token names the zone the endpoint lands in."
      />

      <div className={styles.grid}>
        <Card title="Windows" subtitle="Silent install, per zone">
          <p>
            Deploy the agent with your usual software distribution tool and pass the zone token on
            the command line. The endpoint appears in Devices once it checks in, usually within a
            minute.
          </p>
        </Card>
        <Card title="Linux and macOS" subtitle="Package or script">
          <p>
            The installer takes the same token. On Linux the agent runs as a system service; on
            macOS it needs the management profile approved once per device.
          </p>
        </Card>
      </div>

      <ResourceList
        hideHeading
        label="Enrollment tokens"
        unit="tokens"
        viewKey="enrollment"
        columns={COLUMNS}
        controller={controller}
        getRowId={(t) => t.id}
        searchPlaceholder="Search token name"
        emptyTitle="No enrollment tokens"
        emptyDescription="Create one per zone so new endpoints land in the right place."
        filters={
          <Select
            size="sm"
            aria-label="Platform"
            placeholder="All platforms"
            options={['windows', 'linux', 'macos'].map((v) => ({ value: v, label: humanise(v) }))}
            value={controller.filters['platform'] ?? ''}
            onChange={(e) => controller.setFilter('platform', e.target.value || undefined)}
          />
        }
      />
    </div>
  );
}
