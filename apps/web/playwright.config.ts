import { defineConfig } from '@playwright/test';

// Uses the Microsoft Edge that ships with Windows, so no browser download is needed.
// Change to 'chrome', or remove the line to use Playwright's bundled Chromium.
const channel = 'msedge';

// The browser tests run against a real API and a separate, freshly built test database (see scripts/e2e-api.mjs),
// on their own ports, so they never touch the development servers or the development database.
const API_PORT = 3101;
const WEB_PORT = 5273;

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  expect: { timeout: 7_000 },
  fullyParallel: false,
  retries: 1, // one retry: a timing-sensitive test may flake once on a slow machine; a real failure fails twice
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: `http://127.0.0.1:${WEB_PORT}`,
    channel,
    headless: true,
    viewport: { width: 1280, height: 900 },
    acceptDownloads: true,
  },
  webServer: [
    {
      command: 'node ../../scripts/e2e-api.mjs',
      url: `http://127.0.0.1:${API_PORT}/api/health`,
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: `npm run dev -- --host 127.0.0.1 --port ${WEB_PORT} --strictPort`,
      url: `http://127.0.0.1:${WEB_PORT}`,
      reuseExistingServer: false,
      timeout: 60_000,
      env: { API_URL: `http://127.0.0.1:${API_PORT}` },
    },
  ],
});
