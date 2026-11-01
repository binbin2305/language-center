import { defineConfig } from '@playwright/test';

/** D31. Started by e2e/run.sh (`pnpm e2e`), which brings up mongo + api :3100 + web preview :4173 first. */
export default defineConfig({
  testDir: '.',
  testMatch: ['**/*.spec.ts'],
  outputDir: './test-results',
  workers: 1,
  fullyParallel: false,
  retries: 0,
  forbidOnly: true,
  timeout: 60_000,
  reporter: [['list']],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:4173',
    channel: 'chrome',
    viewport: { width: 1280, height: 800 },
    locale: 'vi-VN',
    timezoneId: 'Asia/Ho_Chi_Minh',
    trace: 'retain-on-failure',
  },
});
