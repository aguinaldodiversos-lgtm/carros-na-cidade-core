import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  timeout: 240_000,
  expect: { timeout: 25_000 },
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    locale: "pt-BR",
  },
  // Suba o Next manualmente: `npm run dev` (porta 3000). Em CI defina PW_START_SERVER=1.
  ...(process.env.PW_START_SERVER === "1"
    ? {
        webServer: {
          command: "npm run dev -p 3000",
          url: "http://127.0.0.1:3000",
          reuseExistingServer: true,
          timeout: 120_000,
        },
      }
    : {}),
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
