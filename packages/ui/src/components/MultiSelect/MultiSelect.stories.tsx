import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { MultiSelect } from './MultiSelect';
import { Stack } from '../../../.storybook/decorators';

const ZONES = [
  { value: 'mumbai-hq', label: 'Mumbai HQ', meta: '18,402' },
  { value: 'delhi-branch', label: 'Delhi Branch', meta: '9,118' },
  { value: 'jaipur-branch', label: 'Jaipur Branch', meta: '4,260' },
  { value: 'bengaluru', label: 'Bengaluru', meta: '11,744' },
  { value: 'pune', label: 'Pune', meta: '3,902' },
  { value: 'hyderabad', label: 'Hyderabad', meta: '2,574' },
];

const meta: Meta<typeof MultiSelect> = {
  title: 'Forms/MultiSelect',
  component: MultiSelect,
  parameters: {
    docs: {
      description: {
        component: [
          'Multi-value picker in a popover. Drives filter bars and the DataTable column chooser, so',
          'it has to stay usable at 70+ options — hence the search box and the bulk actions.',
          '',
          'Selection order follows the option order rather than click order, so a saved view or a',
          'shared URL produces the same query every time.',
          '',
          '**Accessibility** — the trigger is a `<button aria-haspopup="dialog">` whose accessible',
          'name is the label plus the current summary ("Zones: 3 selected"), so the value is',
          'announced without opening the popover. Inside, each option is a real checkbox in a',
          '`<label>`. Escape and an outside click both close it, and focus returns to the trigger.',
        ].join('\n'),
      },
    },
  },
};
export default meta;

type Story = StoryObj<typeof MultiSelect>;

export const Default: Story = {
  render: function Default() {
    const [zones, setZones] = useState<string[]>(['mumbai-hq']);
    const [os, setOs] = useState<string[]>([]);
    return (
      <Stack>
        <MultiSelect
          label="Zones"
          options={ZONES}
          value={zones}
          onChange={setZones}
          placeholder="All zones"
        />
        <MultiSelect
          label="Operating system"
          searchable={false}
          options={[
            { value: 'win11', label: 'Windows 11' },
            { value: 'win10', label: 'Windows 10' },
            { value: 'rhel9', label: 'RHEL 9' },
            { value: 'ubuntu2404', label: 'Ubuntu 24.04' },
            { value: 'macos15', label: 'macOS 15' },
          ]}
          value={os}
          onChange={setOs}
          placeholder="Any OS"
        />
      </Stack>
    );
  },
};
