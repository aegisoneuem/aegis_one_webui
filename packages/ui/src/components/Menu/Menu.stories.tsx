import type { Meta, StoryObj } from '@storybook/react-vite';
import { Menu } from './Menu';
import { Button } from '../Button/Button';
import { IconButton } from '../IconButton/IconButton';
import { Row } from '../../../.storybook/decorators';

const meta: Meta<typeof Menu> = {
  title: 'Actions/Menu',
  component: Menu,
  parameters: {
    docs: {
      description: {
        component: [
          'Action list hanging off a trigger. The trigger is a render prop, so the same menu works',
          'behind a `Button`, an `IconButton` or anything else that forwards a ref and an onClick.',
          '',
          '**Accessibility** — the trigger gets `aria-haspopup="menu"` and `aria-expanded`; the',
          'popup is `role="menu"` with `role="menuitem"` children. Up and Down move between enabled',
          'items, Escape closes, and focus returns to the trigger. `shortcut` is a visual hint only —',
          'the Menu does not bind the key, so whatever owns the shortcut must do that itself.',
        ].join('\n'),
      },
    },
  },
};
export default meta;

type Story = StoryObj<typeof Menu>;

const items = [
  { id: 'view', label: 'View details', onSelect: () => {} },
  { id: 'scan', label: 'Scan now', onSelect: () => {} },
  { separator: true as const, label: 'Jobs' },
  { id: 'script', label: 'Run script…', shortcut: '⌘R', onSelect: () => {} },
  { id: 'logs', label: 'Collect logs', onSelect: () => {} },
  { id: 'restart', label: 'Restart', disabled: true, onSelect: () => {} },
  { separator: true as const },
  { id: 'retire', label: 'Retire device', danger: true, onSelect: () => {} },
];

export const Default: Story = {
  render: () => (
    <Row>
      <Menu items={items} label="Device actions">
        {(trigger) => (
          <Button {...trigger} iconAfter={<span>▾</span>}>
            Actions
          </Button>
        )}
      </Menu>
      <Menu items={items} label="Row actions">
        {(trigger) => <IconButton {...trigger} label="Row actions" icon={<span>⋯</span>} />}
      </Menu>
    </Row>
  ),
};
