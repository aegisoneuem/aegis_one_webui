import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Modal } from './Modal';
import { Button } from '../Button/Button';
import { Checkbox } from '../Checkbox/Checkbox';
import { Stack } from '../../../.storybook/decorators';

const meta: Meta<typeof Modal> = {
  title: 'Overlays/Modal',
  component: Modal,
  parameters: {
    docs: {
      description: {
        component: [
          'Blocking dialog for a decision that must be made before anything else. Use `Drawer` for',
          'inspecting a record, where the list behind it should stay visible and usable.',
          '',
          '`dismissible={false}` removes the close button and ignores Escape and overlay clicks —',
          'for a destructive action already in flight, not as a way to force attention.',
          '',
          '**Accessibility** — `role="dialog"` with `aria-modal`, labelled by the title and described',
          'by the description. Focus moves inside on open, Tab is trapped, and the previously',
          'focused element gets focus back on close. Body scrolling is locked while it is open.',
        ].join('\n'),
      },
    },
  },
};
export default meta;

type Story = StoryObj<typeof Modal>;

export const Confirm: Story = {
  render: function Confirm() {
    const [open, setOpen] = useState(false);
    return (
      <>
        <Button variant="danger" onClick={() => setOpen(true)}>
          Revoke token
        </Button>
        <Modal
          open={open}
          onClose={() => setOpen(false)}
          title="Revoke API token"
          description="Anything using this token stops working immediately. This cannot be undone."
          footer={
            <>
              <Button onClick={() => setOpen(false)}>Cancel</Button>
              <Button variant="danger" onClick={() => setOpen(false)}>
                Revoke token
              </Button>
            </>
          }
        >
          <Stack>
            <p>
              <strong>ci-patch-reporting</strong> was last used 11 minutes ago from 10.24.6.18.
            </p>
            <Checkbox label="I have replaced this token where it is used" />
          </Stack>
        </Modal>
      </>
    );
  },
};
