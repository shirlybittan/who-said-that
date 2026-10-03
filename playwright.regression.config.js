// Multiplayer regression suite (tests/regression): 1 TV + 3 phones per test,
// driving the real UI. Starts the server and the Vite client automatically
// (or reuses ones already running).
//
//   npm run test:regression                    # everything except the long playlist
//   npm run test:regression -- playlist        # the all-games playlist (slow)
//   GAMES=caption,drawing npm run test:regression -- games
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/regression',
  timeout: 5 * 60_000,
  workers: 1,               // one room at a time keeps timings deterministic
  retries: 0,
  expect: { timeout: 10_000 },
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report/regression' }]],
  use: {
    headless: true,
    actionTimeout: 10_000,
    navigationTimeout: 15_000,
    launchOptions: { args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] },
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
  webServer: [
    {
      command: 'node server/index.js',
      url: 'http://localhost:3001/ping',
      reuseExistingServer: true,
      timeout: 30_000,
      env: { WST_DATA_DIR: '.data-regression' },
    },
    {
      command: 'npm --prefix client run dev -- --port 5173 --strictPort',
      url: 'http://localhost:5173',
      reuseExistingServer: true,
      timeout: 60_000,
    },
  ],
});
