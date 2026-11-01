import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Toggle } from './Toggle';
import { Stack } from '../../../.storybook/decorators';

const meta: Meta<typeof Toggle> = {
  title: 'Forms/Toggle',
  component: Toggle,
  parameters: {
    docs: {
      description: {
        component: [
          'Switch for a setting that takes effect immediately — peer caching on a zone, a',
          'notification channel, an integration.',
          '',
          '**Accessibility** — a `<button role="switch">` with `aria-checked`, not a styled checkbox,',
          'because a switch is announced as on/off rather than checked/unchecked, which matches what',
          'it does. The visible label is tied on with `aria-labelledby`; without one, `aria-label` is',
          'required. Space and Enter both activate it, as they do for any button.',
        ].join('\n'),
      },
    },
  },
};
export default meta;

type Story = StoryObj<typeof Toggle>;

export const States: Story = {
  render: function States() {
    const [peer, setPeer] = useState(true);
    const [bandwidth, setBandwidth] = useState(false);
    return (
      <Stack>
        <Toggle checked={peer} onChange={setPeer} label="Peer-to-peer distribution" />
        <Toggle checked={bandwidth} onChange={setBandwidth} label="Throttle to 20% of the link" />
        <Toggle checked disabled onChange={() => {}} label="Managed by policy" />
        <Toggle checked={false} onChange={() => {}} aria-label="No visible label" />
      </Stack>
    );
  },
};
