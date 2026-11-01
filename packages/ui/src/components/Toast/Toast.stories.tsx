import type { Meta, StoryObj } from '@storybook/react-vite';
import { ToastProvider, useToast } from './Toast';
import { Button } from '../Button/Button';
import { Row } from '../../../.storybook/decorators';

const meta: Meta<typeof ToastProvider> = {
  title: 'Overlays/Toast',
  component: ToastProvider,
  parameters: {
    docs: {
      description: {
        component: [
          'Transient confirmation of something that already happened. Wrap the app once in',
          '`ToastProvider` and call `useToast().show(...)` from anywhere below it.',
          '',
          'Errors do not auto-dismiss: a message that disappears before it is read is worse than no',
          'message. Everything else clears after five seconds.',
          '',
          '**Accessibility** — the region is labelled; error toasts use `role="alert"` so they',
          'interrupt, and the rest use `role="status"` so they wait for a pause in speech. The',
          'action and dismiss buttons are real buttons, reachable by keyboard — which is why a toast',
          'is never the only way to reach something.',
        ].join('\n'),
      },
    },
  },
};
export default meta;

type Story = StoryObj<typeof ToastProvider>;

function Demo() {
  const toast = useToast();
  return (
    <Row>
      <Button
        onClick={() =>
          toast.show({
            tone: 'success',
            title: 'Action queued',
            message: '1,284 endpoints targeted. Results appear in Task History.',
            action: { label: 'View job', onClick: () => {} },
          })
        }
      >
        Success
      </Button>
      <Button
        onClick={() =>
          toast.show({
            tone: 'error',
            title: 'Could not queue the action',
            message: 'Request 7f3c9a1e failed validation. Nothing was sent to any endpoint.',
          })
        }
      >
        Error
      </Button>
      <Button
        onClick={() =>
          toast.show({
            tone: 'warning',
            title: 'Partial result',
            message: '38 endpoints did not report back.',
          })
        }
      >
        Warning
      </Button>
      <Button
        onClick={() => toast.show({ title: 'Export started', message: 'Preparing 12,480 rows.' })}
      >
        Info
      </Button>
    </Row>
  );
}

export const Default: Story = {
  render: () => (
    <ToastProvider>
      <Demo />
    </ToastProvider>
  ),
};
