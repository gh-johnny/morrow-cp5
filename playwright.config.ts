import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './e2e', timeout: 150_000, expect: { timeout: 20_000 }, workers: 1, retries: 0,
  use: { baseURL: process.env.E2E_BASE_URL || 'http://localhost:8081', viewport: { width: 1440, height: 1000 }, trace: 'retain-on-failure', screenshot: 'only-on-failure', launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] } },
  reporter: [['list'], ['html', { open: 'never' }]],
});
