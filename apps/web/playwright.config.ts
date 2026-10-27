import { defineConfig, devices } from '@playwright/test';

const PORT = 48777;
const ORIGIN = `http://127.0.0.1:${PORT}`;

// The suite runs against `wrangler dev` serving the built dist/ with public/_headers, so the same
// headers (and therefore the same Content-Security-Policy) apply as in production. Build first:
// `pnpm test:e2e` from the repository root does.
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: { baseURL: ORIGIN, trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `pnpm exec wrangler dev --port ${PORT} --ip 127.0.0.1`,
    url: ORIGIN,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: 'ignore',
    env: { WRANGLER_SEND_METRICS: 'false', CI: 'true' },
  },
});
