import type { Meta, StoryObj } from '@storybook/react-vite';
import { Stepper } from './Stepper';

const meta: Meta<typeof Stepper> = {
  title: 'Structure/Stepper',
  component: Stepper,
  parameters: {
    docs: {
      description: {
        component: [
          'Progress through a multi-step flow — in this console, the deployment wizard.',
          '',
          'Steps behind the current one are clickable so the user can go back and change an answer;',
          'steps ahead stay locked until their prerequisites are filled in. `hint` carries the',
          'choice already made, so the strip doubles as a summary.',
          '',
          '**Accessibility** — an ordered list, with `aria-current="step"` on the active item. The',
          'tick and the number are decorative; the state is also in the label and the hint, so it',
          'does not rely on colour. Locked steps are genuinely disabled buttons rather than',
          'click-swallowing divs.',
        ].join('\n'),
      },
    },
  },
};
export default meta;

type Story = StoryObj<typeof Stepper>;

const STEPS = [
  { id: 'content', label: 'Content', hint: 'Google Chrome 142.0' },
  { id: 'targets', label: 'Targets', hint: '1,284 computers' },
  { id: 'schedule', label: 'Schedule', hint: 'Tonight, 02:00 IST' },
  { id: 'network', label: 'Network' },
  { id: 'options', label: 'Options' },
  { id: 'review', label: 'Review' },
];

export const MidFlow: Story = {
  render: () => (
    <Stepper
      label="New action"
      steps={STEPS}
      current="network"
      completed={['content', 'targets', 'schedule']}
      onStepClick={() => {}}
    />
  ),
};

export const WithInvalidStep: Story = {
  render: () => (
    <Stepper
      label="New action"
      steps={STEPS.map((s) =>
        s.id === 'targets' ? { ...s, invalid: true, hint: 'No computers selected' } : s,
      )}
      current="review"
      completed={['content', 'targets', 'schedule', 'network', 'options']}
      onStepClick={() => {}}
    />
  ),
};
