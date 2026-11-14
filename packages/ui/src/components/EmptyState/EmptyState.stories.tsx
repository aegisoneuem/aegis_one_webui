import type { Meta, StoryObj } from '@storybook/react-vite';
import { EmptyState } from './EmptyState';
import { ErrorState } from '../ErrorState/ErrorState';
import { Skeleton, TableSkeleton } from '../Skeleton/Skeleton';
import { Button } from '../Button/Button';
import { Card } from '../Card/Card';
import { Stack } from '../../../.storybook/decorators';

const meta: Meta<typeof EmptyState> = {
  title: 'Feedback/States',
  component: EmptyState,
  parameters: {
    docs: {
      description: {
        component: [
          'The three things a list can show instead of rows: loading, empty and failed.',
          '',
          '**EmptyState** should say what would put something here, not just that there is nothing.',
          '"No devices match these filters" with a way to widen them beats a shrug.',
          '',
          '**ErrorState** shows a reference, never a stack trace or the raw server message — those',
          'are written for a developer and can leak internals. `detail` is the one identifier that',
          'lets support find the request.',
          '',
          '**Skeleton** has no size of its own; the caller sizes it, because the library cannot know',
          "the shape of what is loading. `TableSkeleton` matches DataTable's row height.",
          '',
          '**Accessibility** — `ErrorState` is `role="alert"`, so a failure after an action is',
          'announced without the user hunting for it. Skeletons are `aria-hidden` with a labelled',
          '`role="status"` wrapper, so screen readers hear "Loading rows" once instead of reading',
          'out a dozen empty boxes.',
        ].join('\n'),
      },
    },
  },
};
export default meta;

type Story = StoryObj<typeof EmptyState>;

export const Empty: Story = {
  render: () => (
    <Card flush>
      <EmptyState
        title="No devices match these filters"
        description="Three filters are applied, including a 24-hour check-in window. Widen the window or clear a filter to see more."
        actions={<Button variant="primary">Clear all filters</Button>}
      />
    </Card>
  ),
};

export const Error_: Story = {
  name: 'Error',
  render: () => (
    <Stack>
      <Card flush>
        <ErrorState detail="Request 7f3c9a1e-44b2-4c7d-9f10-2a6e8b1d0c55" onRetry={() => {}} />
      </Card>
      <Card flush>
        <ErrorState
          inline
          title="Could not reach the Jaipur Branch relay"
          description="Inventory for this zone is up to 40 minutes stale."
          detail="AEGIS-ZONE-TIMEOUT"
          onRetry={() => {}}
        />
      </Card>
    </Stack>
  ),
};

export const Loading: Story = {
  render: () => (
    <Stack>
      <Card flush>
        <TableSkeleton rows={6} columns={5} />
      </Card>
      <Skeleton className="sb-skeleton-wide" />
      <Skeleton variant="text" className="sb-skeleton-line" />
      <Skeleton variant="circle" className="sb-skeleton-avatar" />
    </Stack>
  ),
};
