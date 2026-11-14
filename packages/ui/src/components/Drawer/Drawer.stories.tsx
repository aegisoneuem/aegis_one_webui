import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Drawer } from './Drawer';
import { Button } from '../Button/Button';
import { StatusPill } from '../StatusPill/StatusPill';
import { Stack } from '../../../.storybook/decorators';

const meta: Meta<typeof Drawer> = {
  title: 'Overlays/Drawer',
  component: Drawer,
  parameters: {
    docs: {
      description: {
        component: [
          'Right-hand panel for inspecting a record — a vulnerability finding, a job result, a',
          'software package — without losing your place in the list behind it.',
          '',
          '`flush` drops the body padding for a drawer that is mostly a table or a tab strip.',
          '',
          '**Accessibility** — same contract as `Modal`: `aria-modal`, focus trapped inside, focus',
          'restored on close, Escape closes, body scroll locked. The slide-in is removed under',
          '`prefers-reduced-motion`.',
        ].join('\n'),
      },
    },
  },
};
export default meta;

type Story = StoryObj<typeof Drawer>;

export const FindingDetail: Story = {
  render: function FindingDetail() {
    const [open, setOpen] = useState(false);
    return (
      <>
        <Button onClick={() => setOpen(true)}>Open finding</Button>
        <Drawer
          open={open}
          onClose={() => setOpen(false)}
          eyebrow="Vulnerability"
          title="CVE-2026-20881 — Windows LSASS elevation of privilege"
          size="md"
          actions={<StatusPill tone="bad">Critical</StatusPill>}
          footer={
            <>
              <Button onClick={() => setOpen(false)}>Close</Button>
              <Button variant="primary">Create remediation</Button>
            </>
          }
        >
          <Stack>
            <p>
              Affects 1,284 endpoints across Mumbai HQ, Delhi Branch and Bengaluru. Exploitation
              detected in the wild on 2026-10-24.
            </p>
            <p>Fixed by KB5041585, superseded by KB5043098.</p>
          </Stack>
        </Drawer>
      </>
    );
  },
};
