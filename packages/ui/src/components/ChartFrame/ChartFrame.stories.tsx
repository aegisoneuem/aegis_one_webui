import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { ChartFrame, SERIES_VARS } from './ChartFrame';
import { Button } from '../Button/Button';

const meta: Meta<typeof ChartFrame> = {
  title: 'Status/ChartFrame',
  component: ChartFrame,
  parameters: {
    docs: {
      description: {
        component: [
          'The furniture around a chart — title, actions, interactive legend, caption and the',
          'equivalent data table. The chart itself (Recharts, in this console) goes in as children,',
          'so the frame stays library-agnostic.',
          '',
          'Series colours come from `SERIES_VARS`, which resolve to `--ui-series-N`. A sibling',
          'console restyles every chart by redefining those, without touching any chart code.',
          '',
          '**Accessibility** — `dataTable` is the point of this component. A chart is unreadable to',
          'a screen reader and hard for anyone who needs the exact figure, so the frame makes the',
          'equivalent table a first-class slot rather than an afterthought. The legend is made of',
          'real buttons with `aria-pressed`, so hiding a series works from the keyboard.',
        ].join('\n'),
      },
    },
  },
};
export default meta;

type Story = StoryObj<typeof ChartFrame>;

const SERIES = [
  { id: 'installed', label: 'Installed', value: '44,620' },
  { id: 'pending', label: 'Pending restart', value: '2,306' },
  { id: 'failed', label: 'Failed', value: '1,284' },
];

export const WithLegendAndTable: Story = {
  render: function WithLegendAndTable() {
    const [hidden, setHidden] = useState<string[]>([]);
    return (
      <ChartFrame
        title="Patch rollout, last 14 days"
        subtitle="Windows endpoints across all zones"
        actions={<Button size="sm">Export</Button>}
        legend={SERIES.map((s, i) => ({
          ...s,
          color: SERIES_VARS[i] ?? SERIES_VARS[0],
          hidden: hidden.includes(s.id),
        }))}
        onLegendToggle={(id) =>
          setHidden((h) => (h.includes(id) ? h.filter((x) => x !== id) : [...h, id]))
        }
        caption="Failures are concentrated in Jaipur Branch, where 412 endpoints have under 10% free disk."
        dataTable={
          <table>
            <caption>Patch rollout by state</caption>
            <thead>
              <tr>
                <th scope="col">State</th>
                <th scope="col">Endpoints</th>
              </tr>
            </thead>
            <tbody>
              {SERIES.map((s) => (
                <tr key={s.id}>
                  <th scope="row">{s.label}</th>
                  <td>{s.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        }
      >
        <p>Chart goes here — Recharts in the console, a placeholder in the story.</p>
      </ChartFrame>
    );
  },
};
