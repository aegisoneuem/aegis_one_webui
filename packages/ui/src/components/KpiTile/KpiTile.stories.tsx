import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { KpiTile } from './KpiTile';

const meta: Meta<typeof KpiTile> = {
  title: 'Status/KpiTile',
  component: KpiTile,
  parameters: {
    docs: {
      description: {
        component: [
          'A single headline figure with its context. Values arrive pre-formatted: the library does',
          "not know whether the caller wants 48,210 or 48.2k, or which locale's grouping applies.",
          '',
          '`delta.direction` is the arrow; `delta.good` says whether that arrow is welcome, because',
          '"vulnerabilities up 12%" and "compliance up 12%" point the same way and mean opposite',
          'things.',
          '',
          '**Accessibility** — a clickable tile is a real button with `aria-pressed`, so a tile that',
          'filters the list below is announced as a toggle. The arrow glyph is `aria-hidden`; the',
          'change is also in the text beside it.',
        ].join('\n'),
      },
    },
  },
};
export default meta;

type Story = StoryObj<typeof KpiTile>;

export const Row_: Story = {
  name: 'Overview row',
  render: () => (
    <div className="sb-grid">
      <KpiTile
        label="Managed endpoints"
        value="48,210"
        caption="of 50,000 licensed"
        delta={{ value: '1.2%', direction: 'up', good: true }}
      />
      <KpiTile
        label="Patch compliance"
        value="92.4"
        unit="%"
        tone="good"
        delta={{ value: '0.8 pts', direction: 'up', good: true }}
      />
      <KpiTile
        label="Critical vulnerabilities"
        value="1,284"
        tone="bad"
        caption="412 exploited in the wild"
        delta={{ value: '6.1%', direction: 'up', good: false }}
      />
      <KpiTile
        label="Not checked in 7 days"
        value="938"
        tone="warn"
        delta={{ value: '0', direction: 'flat' }}
      />
    </div>
  ),
};

export const Clickable: Story = {
  render: function Clickable() {
    const [active, setActive] = useState<string | null>('offline');
    return (
      <div className="sb-grid">
        <KpiTile
          label="Online"
          value="47,272"
          onClick={() => setActive('online')}
          active={active === 'online'}
          caption="Filters the list below"
        />
        <KpiTile
          label="Offline"
          value="938"
          tone="warn"
          onClick={() => setActive('offline')}
          active={active === 'offline'}
          caption="Filters the list below"
        />
      </div>
    );
  },
};
