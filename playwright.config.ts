import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './e2e',
  workers: 1,
  use: { baseURL: 'http://localhost:5177', headless: true },
  webServer: process.env.E2E_EXTERNAL
    ? undefined
    : {
        command: 'npm run dev',
        url: 'http://localhost:5177',
        reuseExistingServer: !process.env.CI,
        timeout: 60000,
      },
});
