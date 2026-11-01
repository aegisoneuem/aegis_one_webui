import { useState } from 'react';
import { Button, Drawer, Select, StatusPill, type DataTableColumn } from '@aegis/ui';
import { useListController } from '../app/useListController';
import { useCan } from '../app/auth';
import { num, pct } from '../app/format';
import { ResourceList } from './shared/ResourceList';
import type { SoftwareTitle } from '../api/types';

const CATEGORIES = [
  'Browsers',
  'Productivity',
  'Collaboration',
  'Security',
  'Networking',
  'Developer Tools',
  'Runtimes',
  'Utilities',
  'Line of Business',
  'Engineering',
  'Media',
  'Remote Access',
].map((c) => ({ value: c, label: c }));

const COLUMNS: DataTableColumn<SoftwareTitle>[] = [
  {
    id: 'title',
    header: 'Title',
    locked: true,
    sortable: true,
    width: 260,
    cell: (s) => s.title,
    exportValue: (s) => s.title,
  },
  {
    id: 'publisher',
    header: 'Publisher',
    sortable: true,
    width: 210,
    cell: (s) => s.publisher,
    exportValue: (s) => s.publisher,
  },
  {
    id: 'category',
    header: 'Category',
    sortable: true,
    width: 160,
    cell: (s) => s.category,
    exportValue: (s) => s.category,
  },
  {
    id: 'latestVersion',
    header: 'Latest version',
    width: 170,
    cell: (s) => s.latestVersion,
    exportValue: (s) => s.latestVersion,
  },
  {
    id: 'installCount',
    header: 'Installs',
    numeric: true,
    sortable: true,
    width: 120,
    cell: (s) => num(s.installCount),
    exportValue: (s) => s.installCount,
  },
  {
    id: 'outdatedCount',
    header: 'Out of date',
    numeric: true,
    sortable: true,
    width: 150,
    cell: (s) => (
      <StatusPill tone={s.outdatedCount / Math.max(s.installCount, 1) > 0.25 ? 'warn' : 'neutral'}>
        {num(s.outdatedCount)}
      </StatusPill>
    ),
    exportValue: (s) => s.outdatedCount,
  },
  {
    id: 'sizeMb',
    header: 'Package size',
    numeric: true,
    sortable: true,
    width: 140,
    defaultHidden: true,
    cell: (s) => `${num(s.sizeMb)} MB`,
    exportValue: (s) => s.sizeMb,
  },
];

export default function Software() {
  const [selected, setSelected] = useState<SoftwareTitle | null>(null);
  const canDeploy = useCan('software:deploy');
  const controller = useListController<SoftwareTitle>({
    path: '/software',
    defaultSort: { id: 'installCount', desc: true },
  });

  return (
    <>
      <ResourceList
        label="Software"
        description="The installed software catalogue across the estate."
        unit="titles"
        viewKey="software"
        columns={COLUMNS}
        controller={controller}
        getRowId={(s) => s.id}
        searchPlaceholder="Search title or publisher"
        onRowClick={setSelected}
        emptyTitle="No software matches these filters"
        emptyDescription="Clear the category filter or widen the search."
        chips={
          controller.filters['category']
            ? [
                {
                  id: 'category',
                  label: 'Category',
                  value: controller.filters['category'],
                  onRemove: () => controller.setFilter('category', undefined),
                },
              ]
            : []
        }
        filters={
          <Select
            size="sm"
            aria-label="Category"
            placeholder="All categories"
            options={CATEGORIES}
            value={controller.filters['category'] ?? ''}
            onChange={(e) => controller.setFilter('category', e.target.value || undefined)}
          />
        }
      />

      <Drawer
        open={selected !== null}
        onClose={() => setSelected(null)}
        eyebrow="Software"
        title={selected?.title ?? ''}
        size="md"
        footer={
          canDeploy && selected ? <Button variant="primary">Deploy {selected.title}</Button> : null
        }
      >
        {selected ? (
          <dl>
            <dt>Publisher</dt>
            <dd>{selected.publisher}</dd>
            <dt>Category</dt>
            <dd>{selected.category}</dd>
            <dt>Latest version</dt>
            <dd>{selected.latestVersion}</dd>
            <dt>Installed on</dt>
            <dd>{num(selected.installCount)} endpoints</dd>
            <dt>Out of date</dt>
            <dd>
              {num(selected.outdatedCount)} endpoints (
              {pct((selected.outdatedCount / Math.max(selected.installCount, 1)) * 100, 0)})
            </dd>
            <dt>Package size</dt>
            <dd>{num(selected.sizeMb)} MB</dd>
          </dl>
        ) : null}
      </Drawer>
    </>
  );
}
