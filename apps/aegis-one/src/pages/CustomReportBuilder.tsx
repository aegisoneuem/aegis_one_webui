import { useNavigate } from 'react-router-dom';
import { Button, Card, PageHeader, Select } from '@aegis/ui';
import styles from './Reports.module.css';

/**
 * The custom report builder, reached from the library's "+ Custom report".
 *
 * It was previously a second export of the Reports page; it moved here when
 * the library became the approved card grid, because the two screens now
 * share nothing but a stylesheet.
 */
export default function CustomReportBuilder() {
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
