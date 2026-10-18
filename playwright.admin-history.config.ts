import { defineConfig } from "@playwright/test";
import auth from "./playwright.auth.config";
export default defineConfig({
  ...auth, testDir: "./tests/e2e/admin-history", outputDir: "test-results-admin-history", timeout: 90_000,
  reporter: [["list"], ["json", { outputFile: "storage/test-reports/admin-history.json" }]],
  use: { ...auth.use, baseURL: "http://localhost:3108", trace: "off", video: "off" },
  webServer: { ...auth.webServer, command: "npm run start -- --port 3108", url: "http://localhost:3108", reuseExistingServer: false,
    env: { NEXT_TELEMETRY_DISABLED: "1", DATABASE_URL: process.env.TEST_DATABASE_URL!, BETTER_AUTH_SECRET: process.env.TEST_AUTH_SECRET!, BETTER_AUTH_URL: "http://localhost:3108", GOOGLE_CLIENT_ID: "fixture-client", GOOGLE_CLIENT_SECRET: "fixture-client-secret" } },
});
