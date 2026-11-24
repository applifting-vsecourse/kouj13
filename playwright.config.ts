import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: ['e2e/**/*.spec.ts', 'apps/frontend/e2e/**/*.spec.ts'],
  workers: 1,
  retries: 0,
  timeout: 60_000,
  use: {
    baseURL: process.env.E2E_FRONTEND_URL ?? 'http://localhost:3050',
    channel: process.env.CI ? undefined : 'chrome',
    headless: true,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: process.env.CI
    ? [
        {
          command: 'node apps/backend/dist/main.js',
          env: { NODE_ENV: 'test' },
          url: 'http://localhost:4050/api/docs',
          reuseExistingServer: false,
          timeout: 60_000,
        },
        {
          command: 'pnpm frontend dev --host 127.0.0.1',
          url: 'http://localhost:3050',
          reuseExistingServer: false,
          timeout: 60_000,
        },
      ]
    : undefined,
});
