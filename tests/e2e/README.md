# Playwright Multiplayer E2E Suite

This suite uses Playwright Custom Fixtures to spin up a synchronized simulation involving 1 Host and `N` Players (default: 3) concurrently.

## Prerequisites
Before running tests, the backend and frontend MUST be running.
```bash
npm run dev
```

## Running Locally

To run the suite in headless mode:
```bash
npx playwright test tests/e2e/multiplayer-critical-flow.spec.ts
```

To run with UI mode (excellent for debugging multiplayer sync):
```bash
npx playwright test tests/e2e/multiplayer-critical-flow.spec.ts --ui
```

## CI Integration

In a CI environment (e.g. GitHub Actions), ensure the server is booted first.
```yaml
jobs:
  e2e:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci
      - run: npx playwright install --with-deps chromium
      - run: |
          npm run dev &
          sleep 10 # Wait for servers to boot
          npx playwright test tests/e2e
```

## Flakiness Prevention Strategy
- **No hard `sleep()` statements:** Tests rely completely on WebSocket-driven DOM updates. We use `expect(locator).toBeVisible()` or `toBeEnabled()` to let Playwright handle wait times automatically up to 10-15 seconds.
- **Promise.all() Sync Checks:** When verifying real-time synchronization (e.g., Host starting a game and all 3 players moving simultaneously), we map an array of locator assertions into `Promise.all()` to ensure deterministic verification.
- **Context Isolation:** Each player runs in a completely separate `BrowserContext`. No cookies, local storage, or session storage are shared, matching the real-world behavior of distinct mobile devices.
