import { defineConfig } from "@playwright/test";
const systemChromium = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined;

export default defineConfig({
  testDir: "./tests/release/e2e",
  timeout: 60_000,
  expect: { timeout: 12_000 },
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [["list"], ["html", { outputFolder: "playwright-report", open: "never" }]],
  outputDir: "playwright-artifacts",
  webServer: {
    command: "npm run dev:e2e",
    url: "http://127.0.0.1:8788/api/health",
    reuseExistingServer: false,
    timeout: 90_000,
    stdout: "pipe",
    stderr: "pipe"
  },
  use: {
    baseURL: "http://127.0.0.1:8788",
    browserName: "chromium",
    extraHTTPHeaders: { "X-CWS-Local-User-Email": "local-admin@cws.test" },
    ...(systemChromium ? { launchOptions: { executablePath: systemChromium } } : {}),
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off"
  }
});
