import { defineConfig, devices } from '@playwright/test';
import { E2E_BASE_URL, E2E_JWT_SECRET } from './tests/e2e/support/env';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,

  reporter: [
    ['html'],
    ['json', { outputFile: 'test-results/e2e-results.json' }],
    ['junit', { outputFile: 'test-results/e2e-results.xml' }],
  ],

  use: {
    baseURL: E2E_BASE_URL,
    actionTimeout: 15 * 1000,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  webServer: {
    command: 'npm run dev',
    url: E2E_BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
    env: {
      // Lets specs inject a mocked Stellar wallet (src/providers/WalletProvider.jsx)
      // and mint session cookies that pass the dashboard auth gate (src/proxy.js).
      NEXT_PUBLIC_E2E_WALLET_MOCK: 'true',
      JWT_SECRET: E2E_JWT_SECRET,
      // Inert values so next.config's env check passes outside CI. Specs
      // intercept every /api and off-origin request, so none are contacted.
      NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL || E2E_BASE_URL,
      MONGODB_URI: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/scholarmarket-e2e',
      PINATA_JWT: process.env.PINATA_JWT || 'e2e-unused-pinata-jwt',
      NEXT_PUBLIC_GATEWAY_URL: process.env.NEXT_PUBLIC_GATEWAY_URL || 'e2e-gateway.invalid',
    },
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
  ],
});
