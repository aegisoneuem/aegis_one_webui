import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { DatePicker, DateRangePicker, type DateRange } from './DatePicker';
import { Field } from '../Field/Field';
import { Stack } from '../../../.storybook/decorators';

const meta: Meta<typeof DatePicker> = {
  title: 'Forms/DatePicker',
  component: DatePicker,
  parameters: {
    docs: {
      description: {
        component: [
          '`DatePicker` is the native date input in the shared control box. `DateRangePicker` adds',
          'the relative presets the console uses everywhere — last 24 hours, 7, 30 and 90 days —',
          'with a custom from/to pair beside them.',
          '',
          'Presets resolve when they are picked, not when the component mounts, so "Last 7 days"',
          'stays relative rather than freezing at the moment the page loaded.',
          '',
          '**Accessibility** — the native input brings its own calendar, keyboard handling and',
          'locale. The range trigger announces the resolved summary as part of its name, and the two',
          'custom inputs constrain each other with `min`/`max` so an inverted range cannot be typed.',
        ].join('\n'),
      },
    },
  },
};
export default meta;

type Story = StoryObj<typeof DatePicker>;

export const SingleDate: Story = {
  render: () => (
    <Stack>
      <Field label="Start on" hint="The job is queued at 02:00 in the zone's local time.">
        {(field) => <DatePicker {...field} defaultValue="2026-11-15" />}
      </Field>
      <DatePicker size="sm" aria-label="Small" />
    </Stack>
  ),
};

export const Range: Story = {
  render: function Range() {
    const [range, setRange] = useState<DateRange>({ from: '', to: '' });
    const [preset, setPreset] = useState<string | null>('7d');
    return (
      <Stack>
        <DateRangePicker
          label="Collected"
          value={range}
          presetId={preset}
          onChange={(next, id) => {
            setRange(next);
            setPreset(id);
          }}
        />
      </Stack>
    );
  },
};
