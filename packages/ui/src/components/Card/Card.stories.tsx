import type { Meta, StoryObj } from '@storybook/react-vite';
import { Card } from './Card';
import { Button } from '../Button/Button';
import { StatusPill } from '../StatusPill/StatusPill';

const meta: Meta<typeof Card> = {
  title: 'Structure/Card',
  component: Card,
  parameters: {
    docs: {
      description: {
        component: [
          'Panel with an optional header, body and footer. The header rule only appears when there',
          'is a title or an action, so a bare `Card` is just a surface.',
          '',
          '**Accessibility** — the title renders as `<h3>`, which assumes the page has an `<h1>` and',
          'the section has an `<h2>` above it. Pass `as="section"` when the card is a landmark worth',
          'navigating to, and give it a title or an `aria-label` when you do.',
        ].join('\n'),
      },
    },
  },
};
export default meta;

type Story = StoryObj<typeof Card>;

export const Default: Story = {
  render: () => (
    <Card
      title="Patch compliance"
      subtitle="Windows endpoints, last 30 days"
      actions={<Button size="sm">Open report</Button>}
      footer="Updated 6 minutes ago from 48,210 reporting endpoints."
    >
      <p>
        92.4% of Windows endpoints are within the two-cycle window. 1,284 are more than 60 days
        behind, concentrated in Jaipur Branch.
      </p>
    </Card>
  ),
};

export const Variants: Story = {
  render: () => (
    <div className="sb-grid">
      <Card title="With a status" actions={<StatusPill tone="good">Healthy</StatusPill>}>
        Body content.
      </Card>
      <Card>No header at all — just a surface.</Card>
      <Card title="Flush body" flush>
        <p className="sb-flush-body">Padding is the caller&rsquo;s when `flush` is set.</p>
      </Card>
    </div>
  ),
};
