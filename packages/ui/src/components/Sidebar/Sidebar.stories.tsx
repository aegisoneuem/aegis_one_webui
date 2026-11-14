import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Sidebar, NavGroup, NavItem } from './Sidebar';
import { Button } from '../Button/Button';

const GROUPS = [
  {
    id: 'console',
    label: 'CONSOLE',
    items: [
      { id: 'home', label: 'Overview' },
      { id: 'devices', label: 'Devices' },
      { id: 'groups', label: 'Device groups' },
      { id: 'enrollment', label: 'Enrollment' },
    ],
  },
  {
    id: 'operations',
    label: 'OPERATIONS',
    items: [
      { id: 'patches', label: 'Patches' },
      { id: 'software', label: 'Software' },
      { id: 'liveops', label: 'Live Activity' },
      { id: 'deployments', label: 'Deployments' },
    ],
  },
  {
    id: 'security',
    label: 'SECURITY',
    items: [
      { id: 'vulns', label: 'Vulnerabilities' },
      { id: 'profiles', label: 'Configuration', tag: 'Beta' },
    ],
  },
];

const meta: Meta<typeof Sidebar> = {
  title: 'Navigation/Sidebar',
  component: Sidebar,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component: [
          'Collapsible left navigation. The library owns the shell, the groups and the items; the',
          'console owns the brand block in `header` and the page table it maps onto.',
          '',
          'Collapsed, the labels disappear but every group is forced open, so each icon stays one',
          'click away. A collapsed sidebar that also hid half its items would be a worse place to',
          'navigate from than no sidebar at all.',
          '',
          '**Accessibility** — the shell is a labelled `<aside>` containing a `<nav>`. Group headers',
          'are buttons with `aria-expanded` and `aria-controls` pointing at the list they toggle.',
          'Items are real anchors with a real `href`, so middle-click, copy-link and open-in-new-tab',
          'all work; `onNavigate` only intercepts a plain left click for client-side routing. The',
          'active item carries `aria-current="page"`.',
        ].join('\n'),
      },
    },
  },
};
export default meta;

type Story = StoryObj<typeof Sidebar>;

function Demo({ startCollapsed }: { startCollapsed: boolean }) {
  const [collapsed, setCollapsed] = useState(startCollapsed);
  const [active, setActive] = useState('devices');
  const [open, setOpen] = useState<Record<string, boolean>>({
    console: true,
    operations: true,
    security: false,
  });

  return (
    <div className="sb-shell">
      <Sidebar
        collapsed={collapsed}
        header={<strong className="sb-wordmark">CONSOLE</strong>}
        footer={
          <Button size="sm" variant="ghost" onClick={() => setCollapsed((v) => !v)}>
            {collapsed ? '»' : '« Collapse'}
          </Button>
        }
      >
        {GROUPS.map((g) => (
          <NavGroup
            key={g.id}
            label={g.label}
            expanded={open[g.id] ?? false}
            onToggle={() => setOpen((o) => ({ ...o, [g.id]: !o[g.id] }))}
          >
            {g.items.map((item) => (
              <NavItem
                key={item.id}
                href={`/${item.id}`}
                icon={<span>▪</span>}
                label={item.label}
                tag={'tag' in item ? item.tag : undefined}
                active={active === item.id}
                onNavigate={() => setActive(item.id)}
              />
            ))}
          </NavGroup>
        ))}
      </Sidebar>
      <div className="sb-shell-main">Page content</div>
    </div>
  );
}

export const Expanded: Story = { render: () => <Demo startCollapsed={false} /> };
export const Collapsed: Story = { render: () => <Demo startCollapsed /> };
