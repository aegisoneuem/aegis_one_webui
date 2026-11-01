import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { FilterBar } from './FilterBar';
import { Button } from '../Button/Button';
import { MultiSelect } from '../MultiSelect/MultiSelect';
import { Select } from '../Select/Select';

const meta: Meta<typeof FilterBar> = {
  title: 'Structure/FilterBar',
  component: FilterBar,
  parameters: {
    docs: {
      description: {
        component: [
          'The toolbar above every list: search, the filter controls, the result count and the',
          'table-level actions.',
          '',
          'Applied filters repeat as removable chips underneath. That redundancy is deliberate —',
          'at six controls it stops being obvious why a list has 42 rows instead of 48,210, and a',
          'chip row is the cheapest way to make the result set explainable.',
          '',
          '**Accessibility** — the search box gets an accessible name from `label` or the',
          'placeholder. Each chip\'s remove button names the filter it clears ("Remove Zone filter"),',
          'so they are distinguishable when tabbed through or listed out of context.',
        ].join('\n'),
      },
    },
  },
};
export default meta;

type Story = StoryObj<typeof FilterBar>;

export const Default: Story = {
  render: function Default() {
    const [q, setQ] = useState('');
    const [zones, setZones] = useState<string[]>(['mumbai-hq', 'delhi-branch']);
    const [status, setStatus] = useState('offline');

    const chips = [
      ...(zones.length
        ? [
            {
              id: 'zones',
              label: 'Zone',
              value: `${zones.length} selected`,
              onRemove: () => setZones([]),
            },
          ]
        : []),
      ...(status
        ? [{ id: 'status', label: 'Status', value: 'Offline', onRemove: () => setStatus('') }]
        : []),
    ];

    return (
      <FilterBar
        search={{ value: q, onChange: setQ, placeholder: 'Search hostname, IP, serial or user' }}
        count="1,284 of 48,210"
        chips={chips}
        onClearAll={() => {
          setZones([]);
          setStatus('');
        }}
        actions={
          <>
            <Button size="sm">Columns</Button>
            <Button size="sm">Export</Button>
            <Button size="sm" variant="primary">
              New action
            </Button>
          </>
        }
      >
        <MultiSelect
          size="sm"
          label="Zones"
          value={zones}
          onChange={setZones}
          placeholder="All zones"
          options={[
            { value: 'mumbai-hq', label: 'Mumbai HQ' },
            { value: 'delhi-branch', label: 'Delhi Branch' },
            { value: 'jaipur-branch', label: 'Jaipur Branch' },
            { value: 'bengaluru', label: 'Bengaluru' },
          ]}
        />
        <Select
          size="sm"
          aria-label="Status"
          placeholder="Any status"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          options={[
            { value: 'online', label: 'Online' },
            { value: 'offline', label: 'Offline' },
            { value: 'pending', label: 'Pending restart' },
          ]}
        />
      </FilterBar>
    );
  },
};
