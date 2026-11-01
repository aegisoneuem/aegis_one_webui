import type { Meta, StoryObj } from '@storybook/react-vite';
import { StatusPill } from './StatusPill';
import { Row } from '../../../.storybook/decorators';

const meta: Meta<typeof StatusPill> = {
  title: 'Status/StatusPill',
  component: StatusPill,
  parameters: {
    docs: {
      description: {
        component: [
          'Compact state label for table cells and detail headers.',
          '',
          '**Accessibility** — the pill carries no role: its text is the information, and the tone is',
          'reinforcement, never the only signal. That is why `dot` exists but a dot-only pill does',
          'not. Tone pairs are picked for at least 4.5:1 against their own background, so the label',
          'stays readable for low-vision and colour-blind readers.',
        ].join('\n'),
      },
    },
  },
};
export default meta;

type Story = StoryObj<typeof StatusPill>;

export const Tones: Story = {
  render: () => (
    <Row>
      <StatusPill tone="good">Compliant</StatusPill>
      <StatusPill tone="bad">Failed</StatusPill>
      <StatusPill tone="warn">Pending restart</StatusPill>
      <StatusPill tone="info">Scheduled</StatusPill>
      <StatusPill tone="neutral">Unknown</StatusPill>
    </Row>
  ),
};

export const WithDot: Story = {
  render: () => (
    <Row>
      <StatusPill tone="good" dot>
        Online
      </StatusPill>
      <StatusPill tone="neutral" dot>
        Offline
      </StatusPill>
      <StatusPill tone="warn" dot>
        Checking in
      </StatusPill>
    </Row>
  ),
};
