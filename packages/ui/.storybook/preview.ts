import type { Preview } from '@storybook/react-vite';
import './tokens-neutral.css';

const preview: Preview = {
  parameters: {
    controls: { expanded: true },
    // Every primitive is checked; a failure here is a defect, not a note.
    a11y: { test: 'error' },
    layout: 'padded',
  },
};

export default preview;
