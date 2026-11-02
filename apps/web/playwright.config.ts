import { defineConfig } from '@playwright/test';

// Uses the Microsoft Edge that ships with Windows, so no browser download is needed.
// Change to 'chrome', or remove the line to use Playwright's bundled Chromium.
const channel = 'msedge';

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  expect: { timeout: 7_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:5173',
    channel,
    headless: true,
    viewport: { width: 1280, height: 900 },
    acceptDownloads: true,
  },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 5173',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
