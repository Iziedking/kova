import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: true,
  retries: process.env.CI ? 2 : 1,
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
    // NEXT_PUBLIC_* values are inlined at build time, so they are set for the build
    // step. Fixtures give every screen data to render,
    // and the auth stub replaces Privy so the Kova sign-in UI is exercised
    // deterministically and offline. The preview viewer is deliberately off: the
    // suite starts as a guest, which exercises public browsing and every auth gate.
    env: {
      NEXT_PUBLIC_KOVA_DATA_SOURCE: "fixtures",
      NEXT_PUBLIC_KOVA_AUTH_STUB: "1",
    },
    url: "http://127.0.0.1:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
