import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests', workers: 1, timeout: 60_000,
  use: { headless: true, browserName: 'chromium', channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge' },
  reporter: 'list',
});
