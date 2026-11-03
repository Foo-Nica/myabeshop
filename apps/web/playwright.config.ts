import { defineConfig, devices } from '@playwright/test';

/**
 * Browser tests of parcours A, B and C on a low-end phone profile.
 * Needs the API (port 4000) and the web app (port 3000) running; see README.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  fullyParallel: false,
  reporter: [['list']],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    ...devices['Pixel 5'],
    launchOptions: process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : undefined,
    trace: 'retain-on-failure',
  },
});
