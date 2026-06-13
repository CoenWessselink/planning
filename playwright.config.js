import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  retries: 0,
  // Let Playwright manage the server lifecycle.
  // This prevents EADDRINUSE when a server is already running.
  webServer: [
    {
      command: 'npm run start',
      port: 5173,
      reuseExistingServer: true,
      timeout: 120_000,
    },
    {
      command: 'npm run dev',
      port: 8788,
      reuseExistingServer: true,
      timeout: 120_000,
    }
  ],
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright/reports/html', open: 'never' }],
    ['json', { outputFile: 'playwright/reports/results.json' }]
  ],
  use: {
    baseURL: 'http://localhost:5173',
    acceptDownloads: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure'
  },
  outputDir: 'playwright/artifacts'
});
