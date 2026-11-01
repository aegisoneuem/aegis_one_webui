import type { Meta, StoryObj } from '@storybook/react-vite';
import { Breadcrumb } from './Breadcrumb';
import { PageHeader } from '../PageHeader/PageHeader';
import { Button } from '../Button/Button';
import { StatusPill } from '../StatusPill/StatusPill';

const meta: Meta<typeof Breadcrumb> = {
  title: 'Navigation/Breadcrumb',
  component: Breadcrumb,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component: [
          'The bar across the top of every page: Back, Home, the trail, and whatever the console',
          'wants on the right.',
          '',
          'Back walks browser history rather than the trail, which is what people expect from a',
          'button in that position — the trail is for jumping up a level, and those are different',
          'moves. The console binds Alt+Left to the same thing.',
          '',
          '**Accessibility** — a labelled `<nav>` around an ordered list; the last crumb is plain',
          'text with `aria-current="page"` rather than a dead link. The Back button advertises its',
          'shortcut in the title, so it is discoverable without documentation.',
        ].join('\n'),
      },
    },
  },
};
export default meta;

type Story = StoryObj<typeof Breadcrumb>;

export const WithPageHeader: Story = {
  render: () => (
    <div className="sb-page">
      <Breadcrumb
        onBack={() => {}}
        onHome={() => {}}
        backIcon={<span aria-hidden="true">←</span>}
        homeIcon={<span aria-hidden="true">⌂</span>}
        items={[
          { label: 'Overview', onSelect: () => {} },
          { label: 'Devices', onSelect: () => {} },
          { label: 'MUM-WS-0421' },
        ]}
        trailing={<span>r.deshpande — Operator</span>}
      />
      <div className="sb-page-body">
        <PageHeader
          title="MUM-WS-0421"
          description="Windows 11 24H2 · Mumbai HQ · last seen 4 minutes ago"
          actions={
            <>
              <StatusPill tone="good" dot>
                Online
              </StatusPill>
              <Button size="sm">Collect logs</Button>
              <Button size="sm" variant="primary">
                New action
              </Button>
            </>
          }
        />
      </div>
    </div>
  ),
};
