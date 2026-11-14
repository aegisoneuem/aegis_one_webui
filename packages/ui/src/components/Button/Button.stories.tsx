import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button } from './Button';
import { Row, Stack } from '../../../.storybook/decorators';

const meta: Meta<typeof Button> = {
  title: 'Actions/Button',
  component: Button,
  parameters: {
    docs: {
      description: {
        component: [
          'The standard action control. `secondary` is the default because most buttons in a',
          'dense console are not the primary action on the screen.',
          '',
          '**Accessibility** — renders a real `<button>` with `type="button"` unless told otherwise,',
          'so it never submits a form by accident. `loading` sets `aria-busy` and disables the',
          'control, and the spinner is `aria-hidden`: the label must still say what the button does.',
          'Icons are decorative and hidden from assistive tech, so a button that is only an icon',
          'belongs in `IconButton`, which requires a label.',
        ].join('\n'),
      },
    },
  },
};
export default meta;

type Story = StoryObj<typeof Button>;

export const Variants: Story = {
  render: () => (
    <Row>
      <Button variant="primary">Deploy now</Button>
      <Button variant="secondary">Cancel</Button>
      <Button variant="ghost">More</Button>
      <Button variant="danger">Revoke token</Button>
      <Button variant="link">View details</Button>
    </Row>
  ),
};

export const Sizes: Story = {
  render: () => (
    <Row>
      <Button size="sm">Small</Button>
      <Button size="md">Medium</Button>
      <Button size="lg">Large</Button>
    </Row>
  ),
};

export const WithIcons: Story = {
  render: () => (
    <Row>
      <Button variant="primary" icon={<span>+</span>}>
        New action
      </Button>
      <Button iconAfter={<span>▾</span>}>Export</Button>
    </Row>
  ),
};

export const States: Story = {
  render: () => (
    <Stack>
      <Row>
        <Button variant="primary" loading>
          Submitting
        </Button>
        <Button disabled>Disabled</Button>
      </Row>
      <Button variant="primary" fullWidth>
        Full width
      </Button>
    </Stack>
  ),
};
