import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    fileParallelism: false,
    globals: false,
    hookTimeout: 30_000,
    testTimeout: 30_000,
  },
});
