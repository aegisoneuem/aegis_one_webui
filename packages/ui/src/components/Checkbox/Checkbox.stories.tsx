import type { Meta, StoryObj } from '@storybook/react-vite';
import { Checkbox } from './Checkbox';
import { Stack } from '../../../.storybook/decorators';

const meta: Meta<typeof Checkbox> = {
  title: 'Forms/Checkbox',
  component: Checkbox,
  parameters: {
    docs: {
      description: {
        component: [
          'Checkbox with an optional label and hint. Use it inside forms that are saved with a',
          'button; use `Toggle` for a setting that applies the moment it changes.',
          '',
          '**Accessibility** — with a `label` the control is wrapped in a `<label>`, so the text is',
          'part of the hit area and the accessible name. Without one, pass `aria-label` — that is the',
          'table-row case, where the visible name is in the next cell. `indeterminate` is set on the',
          'DOM node rather than guessed from props, so a part-selected header checkbox is announced',
          'as mixed rather than as unchecked.',
        ].join('\n'),
      },
    },
  },
};
export default meta;

type Story = StoryObj<typeof Checkbox>;

export const States: Story = {
  render: () => (
    <Stack>
      <Checkbox label="Wake offline computers first" defaultChecked />
      <Checkbox label="Create a restore point" />
      <Checkbox label="Suspend BitLocker for one restart" indeterminate />
      <Checkbox label="Run as the logged-in user" disabled />
      <Checkbox
        label="Authenticated scan"
        hint="Uses the agent where present, and stored credentials elsewhere."
        defaultChecked
      />
      <Checkbox aria-label="Select row MUM-WS-0421" />
    </Stack>
  ),
};
