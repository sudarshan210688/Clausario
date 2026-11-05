import { defineConfig, devices } from '@playwright/test';

// P15 browser smoke tests. Starts the e2e backend (fake engines, _test_ Qdrant collections; needs backend/.env)
// and a Vite dev server that proxies /api to it.
const BACKEND_PORT = 5055;
const UI_PORT = 5174;

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${UI_PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: process.env.E2E_BACKEND_CMD ?? 'npm --prefix ../backend run e2e:server',
      url: `http://localhost:${BACKEND_PORT}/api/health`,
      env: { E2E_PORT: String(BACKEND_PORT) },
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: `npx vite --port ${UI_PORT} --strictPort`,
      url: `http://localhost:${UI_PORT}`,
      env: { VITE_API_PROXY_TARGET: `http://localhost:${BACKEND_PORT}`, VITE_API_BASE_URL: '' },
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
