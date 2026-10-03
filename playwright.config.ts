import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './e2e',
  workers: 1,
  use: { baseURL: 'http://localhost:5177', headless: true },
  webServer: process.env.E2E_EXTERNAL
    ? undefined
    : {
        command: process.env.E2E_STUB_AI
          ? 'npx concurrently "node --import tsx server/tests/e2e-server.ts" "npm run dev -w client"'
          : 'npm run dev',
        url: 'http://localhost:5177',
        reuseExistingServer: !process.env.CI && !process.env.E2E_STUB_AI,
        timeout: 60000,
      },
});
