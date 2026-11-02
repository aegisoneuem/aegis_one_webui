import { defineConfig } from 'vitest/config';

/**
 * Unit tests only.
 *
 * Without this, `vitest run` picks up `e2e/console.spec.ts` — a Playwright
 * spec, which vitest cannot execute — and the whole workspace's `pnpm -r test`
 * fails on a file that is not a unit test. The e2e suite has its own runner
 * and its own config, and needs a dev server this one must not assume.
 */
export default defineConfig({
  test: {
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    passWithNoTests: true,
    environment: 'node',
  },
});
