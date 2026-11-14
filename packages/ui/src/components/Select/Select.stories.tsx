import type { Meta, StoryObj } from '@storybook/react-vite';
import { Select } from './Select';
import { Field } from '../Field/Field';
import { Stack } from '../../../.storybook/decorators';

const SEVERITIES = [
  { value: 'critical', label: 'Critical' },
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
];

const meta: Meta<typeof Select> = {
  title: 'Forms/Select',
  component: Select,
  parameters: {
    docs: {
      description: {
        component: [
          'Single choice from a short list, on the native `<select>`.',
          '',
          'This is deliberately not a custom listbox. The browser popup already handles type-ahead,',
          'keyboard, touch and screen readers, and it renders above everything without a portal. A',
          're-implementation would do all of that slightly worse. Reach for `MultiSelect` when more',
          'than one value can be chosen.',
          '',
          '**Accessibility** — no label of its own; use `Field` or pass `aria-label`. `placeholder`',
          'renders a real option with an empty value rather than a greyed-out pseudo-option, so',
          '"Any severity" is selectable and announced like any other choice.',
        ].join('\n'),
      },
    },
  },
};
export default meta;

type Story = StoryObj<typeof Select>;

export const Sizes: Story = {
  render: () => (
    <Stack>
      <Select size="sm" aria-label="Severity" options={SEVERITIES} placeholder="Any severity" />
      <Select size="md" aria-label="Severity" options={SEVERITIES} placeholder="Any severity" />
      <Select size="lg" aria-label="Severity" options={SEVERITIES} placeholder="Any severity" />
    </Stack>
  ),
};

export const States: Story = {
  render: () => (
    <Stack>
      <Field label="Severity" hint="Findings at or above this level.">
        {(field) => <Select {...field} options={SEVERITIES} defaultValue="high" />}
      </Field>
      <Select aria-label="Disabled" options={SEVERITIES} disabled defaultValue="low" />
      <Select
        aria-label="With a disabled option"
        options={[
          ...SEVERITIES,
          { value: 'info', label: 'Informational (not licensed)', disabled: true },
        ]}
      />
    </Stack>
  ),
};
