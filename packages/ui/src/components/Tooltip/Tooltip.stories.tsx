import type { Meta, StoryObj } from '@storybook/react-vite';
import { Tooltip } from './Tooltip';
import { Button } from '../Button/Button';
import { IconButton } from '../IconButton/IconButton';
import { Row } from '../../../.storybook/decorators';

const meta: Meta<typeof Tooltip> = {
  title: 'Overlays/Tooltip',
  component: Tooltip,
  parameters: {
    docs: {
      description: {
        component: [
          'Hover and focus hint. Opens after a delay so a cursor crossing a toolbar does not flash',
          'a row of bubbles.',
          '',
          '**Accessibility** — the bubble is referenced with `aria-describedby`, which *supplements*',
          "the trigger's name. Never put the only label for a control in here: an icon button with a",
          'tooltip and no `label` is unnamed to a screen reader and unreachable by voice control.',
          'The tooltip opens on keyboard focus as well as hover, and Escape dismisses it.',
        ].join('\n'),
      },
    },
  },
};
export default meta;

type Story = StoryObj<typeof Tooltip>;

export const Default: Story = {
  render: () => (
    <Row>
      <Tooltip content="Last check-in 4 minutes ago">
        <Button>Hover me</Button>
      </Tooltip>
      <Tooltip content="Re-reads inventory from every selected endpoint. This can take a few minutes.">
        <IconButton bordered label="Refresh inventory" icon={<span>⟳</span>} />
      </Tooltip>
      <Tooltip mono content="C:\\ProgramData\\AegisOne\\agent\\logs\\agent-2026-11-01.log">
        <Button variant="link">agent-2026-11-01.log</Button>
      </Tooltip>
    </Row>
  ),
};
