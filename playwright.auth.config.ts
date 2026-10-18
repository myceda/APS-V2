import { config } from "dotenv";
import { defineConfig, devices } from "@playwright/test";
config({ quiet: true });
const target = new URL(process.env.TEST_DATABASE_URL || "");
if (
  target.pathname !== "/aps_v2_test" ||
  !["localhost", "127.0.0.1"].includes(target.hostname)
)
  throw new Error("Auth browser tests require local aps_v2_test");
if (!process.env.TEST_AUTH_SECRET || process.env.TEST_AUTH_SECRET.length < 32)
  throw new Error("TEST_AUTH_SECRET is required");

export default defineConfig({
  testDir: "./tests/e2e/auth",
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  reporter: [
    ["list"],
    ["json", { outputFile: "storage/test-reports/auth.json" }],
    ["html", { outputFolder: "playwright-report-auth", open: "never" }],
  ],
  outputDir: "test-results-auth",
  use: {
    baseURL: "http://localhost:3101",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "desktop",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 1000 },
      },
    },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: "npm run start -- --port 3101",
    url: "http://localhost:3101",
    reuseExistingServer: false,
    timeout: 60_000,
    env: {
      NEXT_TELEMETRY_DISABLED: "1",
      DATABASE_URL: process.env.TEST_DATABASE_URL!,
      BETTER_AUTH_SECRET: process.env.TEST_AUTH_SECRET,
      BETTER_AUTH_URL: "http://localhost:3101",
      // Synthetic readiness only. Browser tests intercept OAuth navigation;
      // actual Google callbacks are verified separately with signed fixtures.
      GOOGLE_CLIENT_ID: "fixture-client",
      GOOGLE_CLIENT_SECRET: "fixture-client-secret",
    },
  },
});
