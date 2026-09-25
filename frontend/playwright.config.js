import { defineConfig, devices } from "@playwright/test";

// Keep the default origin identical to the specs' frontendUrl default
// (127.0.0.1, not localhost) — localhost vs 127.0.0.1 are different origins
// with separate localStorage, which splits auth state mid-test.
const baseURL = process.env.E2E_BASE_URL || "http://127.0.0.1:3000";
const startFrontend = process.env.PW_START_FRONTEND === "true";

// This suite requires the live dev stack (backend :8000 + frontend :3000) —
// most specs log in through the real API. Default E2E_LIVE so dashboard specs
// use real sessions instead of mock tokens that 401 and redirect to /login.
// Opt out explicitly with E2E_LIVE=0 / E2E_LIVE=false for backendless mock runs.
if (process.env.E2E_LIVE === undefined) {
  process.env.E2E_LIVE = "true";
} else if (process.env.E2E_LIVE === "0" || process.env.E2E_LIVE === "false") {
  delete process.env.E2E_LIVE;
}

export default defineConfig({
  testDir: "./e2e",
  outputDir: "./test-results",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 1,
  workers: process.env.CI ? 1 : undefined,
  reporter: [["list"], ["html", { outputFolder: "playwright-report", open: "never" }]],
  use: {
    baseURL,
    screenshot: "only-on-failure",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    ...[
      ["mobile-360", 360, 800],
      ["mobile-390", 390, 844],
      ["mobile-412", 412, 915],
      ["tablet-portrait-768", 768, 1024],
    ].map(([name, width, height]) => ({
      name,
      testMatch: /mobile-portrait-audit\.spec\.js/,
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width, height },
        isMobile: true,
        hasTouch: true,
      },
    })),
  ],
  webServer: startFrontend
    ? {
        command: "npm run dev -- --host 127.0.0.1 --port 3000",
        url: baseURL,
        reuseExistingServer: !process.env.CI,
      }
    : undefined,
});
