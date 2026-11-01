import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Tabs } from './Tabs';
import { Stack } from '../../../.storybook/decorators';

const meta: Meta<typeof Tabs> = {
  title: 'Structure/Tabs',
  component: Tabs,
  parameters: {
    docs: {
      description: {
        component: [
          'Tab strip. The caller renders the panel, because in this console most tabs are URL',
          'segments — `/devices/:id/vulnerabilities` — and owning the panel here would fight the',
          'router and break deep links.',
          '',
          "`segmented` is the toolbar variant: a control inside a page, not the page's own sections.",
          '',
          '**Accessibility** — `role="tablist"` with roving tabindex, so Tab enters the strip once',
          'and Left/Right/Home/End move between tabs. Keyboard handling lives on the tabs themselves,',
          'where focus actually is. When the panel is a route, give the rendered page a matching',
          '`role="tabpanel"` via `TabPanel`.',
        ].join('\n'),
      },
    },
  },
};
export default meta;

type Story = StoryObj<typeof Tabs>;

export const Underline: Story = {
  render: function Underline() {
    const [tab, setTab] = useState('overview');
    return (
      <Stack>
        <Tabs
          label="Device sections"
          value={tab}
          onChange={setTab}
          tabs={[
            { id: 'overview', label: 'Overview' },
            { id: 'software', label: 'Software', count: 142 },
            { id: 'patches', label: 'Patches', count: 7 },
            { id: 'vulnerabilities', label: 'Vulnerabilities', count: 23 },
            { id: 'diagnostics', label: 'Diagnostics' },
            { id: 'history', label: 'History', disabled: true },
          ]}
        />
      </Stack>
    );
  },
};

export const Segmented: Story = {
  render: function Segmented() {
    const [mode, setMode] = useState('table');
    return (
      <Tabs
        variant="segmented"
        label="View mode"
        value={mode}
        onChange={setMode}
        tabs={[
          { id: 'table', label: 'Table' },
          { id: 'chart', label: 'Chart' },
        ]}
      />
    );
  },
};
