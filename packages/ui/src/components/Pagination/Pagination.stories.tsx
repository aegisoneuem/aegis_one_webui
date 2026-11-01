import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Pagination } from './Pagination';

const meta: Meta<typeof Pagination> = {
  title: 'Structure/Pagination',
  component: Pagination,
  parameters: {
    docs: {
      description: {
        component: [
          'Previous and next only, with the visible range and the page size.',
          '',
          'There are no page numbers on purpose. The API hands back an opaque cursor, so the client',
          'cannot jump to page 400 — offering a numbered control would promise something the',
          "contract does not do. Page sizes stop at 200, which is the contract's maximum.",
          '',
          '**Accessibility** — the range reads as text, not as a decorative caption, so it is',
          'available to a screen reader without hunting. Both buttons are genuinely disabled at the',
          'ends of the set rather than silently doing nothing.',
        ].join('\n'),
      },
    },
  },
};
export default meta;

type Story = StoryObj<typeof Pagination>;

export const Default: Story = {
  render: function Default() {
    const [size, setSize] = useState(100);
    return (
      <Pagination
        from={101}
        to={200}
        total={48210}
        unit="devices"
        pageSize={size}
        onPageSizeChange={setSize}
        hasPrevious
        hasNext
        onPrevious={() => {}}
        onNext={() => {}}
      />
    );
  },
};

export const Edges: Story = {
  render: () => (
    <>
      <Pagination
        from={1}
        to={100}
        total={100}
        unit="jobs"
        pageSize={100}
        hasNext={false}
        hasPrevious={false}
      />
      <Pagination from={0} to={0} total={0} unit="findings" pageSize={50} />
    </>
  ),
};
