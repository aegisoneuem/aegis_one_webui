import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Input } from './Input';
import { Field } from '../Field/Field';
import { Stack } from '../../../.storybook/decorators';

const meta: Meta<typeof Input> = {
  title: 'Forms/Input',
  component: Input,
  parameters: {
    docs: {
      description: {
        component: [
          'Single-line text control. The outer element carries the border and focus ring so that a',
          'leading icon or trailing suffix sits inside the same box as the text.',
          '',
          '**Accessibility** — `Input` does not render a label. Wrap it in `Field`, which generates the',
          'id and wires `aria-describedby` to the hint or error, or pass your own `aria-label` for a',
          'toolbar search box where a visible label would be noise. The clear button has its own',
          'accessible name and is reachable by keyboard.',
        ].join('\n'),
      },
    },
  },
};
export default meta;

type Story = StoryObj<typeof Input>;

export const Sizes: Story = {
  render: () => (
    <Stack>
      <Input size="sm" aria-label="Small" placeholder="Small" />
      <Input size="md" aria-label="Medium" placeholder="Medium" />
      <Input size="lg" aria-label="Large" placeholder="Large" />
    </Stack>
  ),
};

export const WithAdornments: Story = {
  render: function WithAdornments() {
    const [value, setValue] = useState('MUM-WS-0421');
    return (
      <Stack>
        <Input
          icon={<span>⌕</span>}
          aria-label="Search devices"
          placeholder="Search devices"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onClear={() => setValue('')}
        />
        <Input aria-label="Timeout" suffix="minutes" defaultValue="30" />
        <Input mono aria-label="Hash" defaultValue="sha256:6b86b273ff34fce1" />
      </Stack>
    );
  },
};

export const InAField: Story = {
  render: () => (
    <Stack>
      <Field label="Task name" required hint="Shown in Task History and in the audit log.">
        {(field) => <Input {...field} placeholder="Collect agent logs — Mumbai HQ" />}
      </Field>
      <Field label="Ticket reference" showOptional error="Must look like CHG-00000.">
        {(field) => <Input {...field} defaultValue="CHG-12" />}
      </Field>
    </Stack>
  ),
};
