import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // The API tests share one MySQL test database, so test files run one after another.
    globalSetup: ['./test/globalSetup.ts'],
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 60_000,
  },
});
