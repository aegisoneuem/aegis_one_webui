import type { StorybookConfig } from '@storybook/react-vite';

const config: StorybookConfig = {
  stories: ['../src/**/*.stories.tsx'],
  addons: ['@storybook/addon-docs', '@storybook/addon-a11y'],
  framework: { name: '@storybook/react-vite', options: {} },
  // Component names and story titles are internal; nothing leaves the machine.
  core: { disableTelemetry: true },
  typescript: { reactDocgen: 'react-docgen-typescript' },
};

export default config;
