import { useNavigate } from 'react-router-dom';
import { Button, Card, PageHeader, Select, StatusPill, type DataTableColumn } from '@aegis/ui';
import { useListController } from '../app/useListController';
import { useCan } from '../app/auth';
import { relative } from '../app/format';
import { ResourceList } from './shared/ResourceList';
import type { Report } from '../api/types';
import styles from './Overview.module.css';

const COLUMNS: DataTableColumn<Report>[] = [
  {
    id: 'name',
    header: 'Report',
    locked: true,
    sortable: true,
    width: 300,
    cell: (r) => r.name,
    exportValue: (r) => r.name,
  },
  {
    id: 'category',
    header: 'Category',
    sortable: true,
    width: 150,
    cell: (r) => r.category,
    exportValue: (r) => r.category,
  },
  {
    id: 'description',
    header: 'What it covers',
    width: 420,
    cell: (r) => r.description,
    exportValue: (r) => r.description,
  },
  {
    id: 'schedule',
    header: 'Schedule',
    width: 200,
    cell: (r) => r.schedule ?? 'On demand',
    exportValue: (r) => r.schedule ?? 'On demand',
  },
  {
    id: 'lastRunAt',
    header: 'Last run',
    sortable: true,
    width: 140,
    cell: (r) => relative(r.lastRunAt),
    exportValue: (r) => r.lastRunAt,
  },
  {
    id: 'custom',
    header: 'Source',
    width: 130,
    cell: (r) => (
      <StatusPill tone={r.custom ? 'info' : 'neutral'}>
        {r.custom ? 'Custom' : 'Built in'}
      </StatusPill>
    ),
    exportValue: (r) => (r.custom ? 'Custom' : 'Built in'),
  },
];

export default function Reports() {
  const navigate = useNavigate();
  const canCreate = useCan('reports:build');
  const controller = useListController<Report>({
    path: '/reports',
    defaultSort: { id: 'name', desc: false },
  });

  return (
    <ResourceList
      label="Reports"
      description="Built-in and custom reports, scheduled or on demand."
      unit="reports"
      viewKey="reports"
      columns={COLUMNS}
      controller={controller}
      getRowId={(r) => r.id}
      searchPlaceholder="Search report name or description"
      emptyTitle="No reports match these filters"
      emptyDescription="Build one from the custom report builder."
      actions={
        canCreate ? (
          <Button size="sm" variant="primary" onClick={() => void navigate('/reports/custom')}>
            Custom report
          </Button>
        ) : null
      }
      filters={
        <Select
          size="sm"
          aria-label="Category"
          placeholder="All categories"
          options={['Compliance', 'Security', 'Inventory', 'Operations', 'Experience'].map((v) => ({
            value: v,
            label: v,
          }))}
          value={controller.filters['category'] ?? ''}
          onChange={(e) => controller.setFilter('category', e.target.value || undefined)}
        />
      }
    />
  );
}

/**
 * Custom report builder.
 *
 * Full extracts are generated server-side rather than assembled in the
 * browser: a 50,000-row report is exactly the thing the frontend budget rules
 * out, and the server already has the data.
 */
export function CustomReportBuilder() {
  const navigate = useNavigate();

  return (
    <div className={styles.page}>
      <PageHeader
        title="Custom report"
        description="Choose a subject, the columns you need and how often it should run."
        actions={<Button onClick={() => void navigate('/reports')}>Back to Reports</Button>}
      />
      <Card title="Subject" subtitle="What the report is about">
        <div className={styles.kpis}>
          <Select
            aria-label="Subject"
            options={[
              { value: 'devices', label: 'Devices' },
              { value: 'patches', label: 'Patches' },
              { value: 'software', label: 'Software' },
              { value: 'vulnerabilities', label: 'Vulnerabilities' },
              { value: 'deployments', label: 'Deployments' },
              { value: 'config', label: 'Configuration checks' },
            ]}
            defaultValue="devices"
          />
          <Select
            aria-label="Schedule"
            placeholder="On demand"
            options={[
              { value: 'daily', label: 'Daily at 06:00' },
              { value: 'weekly', label: 'Weekly, Monday 07:00' },
              { value: 'monthly', label: 'Monthly, 1st at 06:00' },
            ]}
          />
          <Select
            aria-label="Format"
            options={[
              { value: 'xlsx', label: 'Excel (.xlsx)' },
              { value: 'csv', label: 'CSV' },
              { value: 'pdf', label: 'PDF' },
            ]}
            defaultValue="xlsx"
          />
        </div>
      </Card>
      <Card
        title="Columns"
        subtitle="The same column set the Devices table offers"
        footer="The report is generated on the server and emailed or made available for download."
      >
        <p>
          Pick the columns from the subject&rsquo;s own list. A saved report keeps its columns and
          its filters together, unlike a table view, which keeps only the layout.
        </p>
      </Card>
    </div>
  );
}
