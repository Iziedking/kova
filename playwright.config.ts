import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: true,
  retries: process.env.CI ? 2 : 0,
  reporter: "line",
  // `/login` and `/app` mount the Privy SDK, which initialises over the network
  // against auth.privy.io. At full worker saturation that real dependency pushed
  // past the 5s default and made two tests intermittent, so the budget is raised
  // and concurrency capped rather than the assertions weakened.
  workers: 4,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: "http://127.0.0.1:3000",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // Production build, not `next dev`. The dev server compiles routes on demand,
    // so several parallel workers hitting a cold route intermittently blew the
    // per-test timeout and made the suite non-deterministic. A prebuilt server
    // serves every route immediately and keeps the suite honest as routes grow.
    command: "npm run build && npx next start --hostname 127.0.0.1 --port 3000",
    url: "http://127.0.0.1:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
