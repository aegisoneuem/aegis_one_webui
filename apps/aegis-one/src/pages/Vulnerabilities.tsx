import { useState } from 'react';
import { Button, Drawer, Select, StatusPill, type DataTableColumn } from '@aegis/ui';
import { useListController } from '../app/useListController';
import { useCan } from '../app/auth';
import { date, humanise, num, toneFor } from '../app/format';
import { ResourceList } from './shared/ResourceList';
import type { Vulnerability } from '../api/types';

const COLUMNS: DataTableColumn<Vulnerability>[] = [
  {
    id: 'id',
    header: 'CVE',
    locked: true,
    sortable: true,
    width: 170,
    cell: (v) => v.id,
    exportValue: (v) => v.id,
  },
  {
    id: 'title',
    header: 'Title',
    sortable: true,
    width: 340,
    cell: (v) => v.title,
    exportValue: (v) => v.title,
  },
  {
    id: 'severity',
    header: 'Severity',
    sortable: true,
    width: 160,
    cell: (v) => (
      <StatusPill tone={toneFor(v.severity)}>
        {v.exploited ? `${humanise(v.severity)} · exploited` : humanise(v.severity)}
      </StatusPill>
    ),
    exportValue: (v) => v.severity,
  },
  {
    id: 'cvss',
    header: 'CVSS',
    numeric: true,
    sortable: true,
    width: 100,
    cell: (v) => v.cvss.toFixed(1),
    exportValue: (v) => v.cvss,
  },
  {
    id: 'affectedCount',
    header: 'Open on',
    numeric: true,
    sortable: true,
    width: 130,
    cell: (v) => num(v.affectedCount),
    exportValue: (v) => v.affectedCount,
  },
  {
    id: 'remediatedCount',
    header: 'Remediated',
    numeric: true,
    sortable: true,
    width: 140,
    cell: (v) => num(v.remediatedCount),
    exportValue: (v) => v.remediatedCount,
  },
  {
    id: 'affects',
    header: 'Affects',
    sortable: true,
    width: 230,
    cell: (v) => v.affects,
    exportValue: (v) => v.affects,
  },
  {
    id: 'fixedBy',
    header: 'Fixed by',
    width: 200,
    cell: (v) => v.fixedBy,
    exportValue: (v) => v.fixedBy,
  },
  {
    id: 'publishedAt',
    header: 'Published',
    sortable: true,
    width: 140,
    defaultHidden: true,
    cell: (v) => date(v.publishedAt),
    exportValue: (v) => v.publishedAt,
  },
];

export default function Vulnerabilities() {
  const [finding, setFinding] = useState<Vulnerability | null>(null);
  const canRemediate = useCan('vulns:scan');
  const controller = useListController<Vulnerability>({
    path: '/vulnerabilities',
    defaultSort: { id: 'cvss', desc: true },
  });

  const chips = ['severity', 'exploited']
    .filter((key) => controller.filters[key])
    .map((key) => ({
      id: key,
      label: key === 'exploited' ? 'Exploit' : 'Severity',
      value: key === 'exploited' ? 'Known exploited' : humanise(controller.filters[key]),
      onRemove: () => controller.setFilter(key, undefined),
    }));

  return (
    <>
      <ResourceList
        label="Vulnerabilities"
        description="Open findings, worst first. Known exploits are flagged."
        unit="findings"
        viewKey="vulns"
        columns={COLUMNS}
        controller={controller}
        getRowId={(v) => v.id}
        searchPlaceholder="Search CVE, title or affected product"
        chips={chips}
        onRowClick={setFinding}
        emptyTitle="No findings match these filters"
        emptyDescription="Lower the severity filter or clear the exploited filter."
        filters={
          <>
            <Select
              size="sm"
              aria-label="Severity"
              placeholder="Any severity"
              options={['critical', 'high', 'medium', 'low'].map((v) => ({
                value: v,
                label: humanise(v),
              }))}
              value={controller.filters['severity'] ?? ''}
              onChange={(e) => controller.setFilter('severity', e.target.value || undefined)}
            />
            <Select
              size="sm"
              aria-label="Exploit status"
              placeholder="Any exploit status"
              options={[
                { value: '1', label: 'Known exploited' },
                { value: '0', label: 'No known exploit' },
              ]}
              value={controller.filters['exploited'] ?? ''}
              onChange={(e) => controller.setFilter('exploited', e.target.value || undefined)}
            />
          </>
        }
      />

      <Drawer
        open={finding !== null}
        onClose={() => setFinding(null)}
        eyebrow="Vulnerability"
        title={finding ? `${finding.id} — ${finding.title}` : ''}
        size="md"
        actions={
          finding ? (
            <StatusPill tone={toneFor(finding.severity)}>{humanise(finding.severity)}</StatusPill>
          ) : null
        }
        footer={
          canRemediate && finding ? <Button variant="primary">Create remediation</Button> : null
        }
      >
        {finding ? (
          <dl>
            <dt>CVSS</dt>
            <dd>{finding.cvss.toFixed(1)}</dd>
            <dt>Exploited in the wild</dt>
            <dd>{finding.exploited ? 'Yes — treat as urgent' : 'No known exploit'}</dd>
            <dt>Affects</dt>
            <dd>{finding.affects}</dd>
            <dt>Fixed by</dt>
            <dd>{finding.fixedBy}</dd>
            <dt>Open on</dt>
            <dd>{num(finding.affectedCount)} endpoints</dd>
            <dt>Already remediated on</dt>
            <dd>{num(finding.remediatedCount)} endpoints</dd>
            <dt>Published</dt>
            <dd>{date(finding.publishedAt)}</dd>
          </dl>
        ) : null}
      </Drawer>
    </>
  );
}
