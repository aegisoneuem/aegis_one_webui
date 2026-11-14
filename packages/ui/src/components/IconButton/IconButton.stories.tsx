import type { Meta, StoryObj } from '@storybook/react-vite';
import { IconButton } from './IconButton';
import { Row } from '../../../.storybook/decorators';

const meta: Meta<typeof IconButton> = {
  title: 'Actions/IconButton',
  component: IconButton,
  parameters: {
    docs: {
      description: {
        component: [
          'A square button whose content is an icon. Used in table rows, drawer headers and toolbars.',
          '',
          '**Accessibility** — `label` is required and becomes both the accessible name and the',
          'tooltip, because an icon on its own names nothing. `active` maps to `aria-pressed`, so a',
          'screen reader announces a toggled filter button as pressed rather than as a plain button.',
        ].join('\n'),
      },
    },
  },
};
export default meta;

type Story = StoryObj<typeof IconButton>;

export const Sizes: Story = {
  render: () => (
    <Row>
      <IconButton size="sm" label="Refresh" icon={<span>⟳</span>} />
      <IconButton size="md" label="Refresh" icon={<span>⟳</span>} />
      <IconButton size="lg" label="Refresh" icon={<span>⟳</span>} />
    </Row>
  ),
};

export const States: Story = {
  render: () => (
    <Row>
      <IconButton label="Row actions" icon={<span>⋯</span>} />
      <IconButton bordered label="Filters" icon={<span>⚙</span>} />
      <IconButton bordered active label="Filters" icon={<span>⚙</span>} />
      <IconButton disabled label="Delete" icon={<span>🗑</span>} />
    </Row>
  ),
};
