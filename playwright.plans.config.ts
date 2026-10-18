import { defineConfig } from "@playwright/test";
import auth from "./playwright.auth.config";
export default defineConfig({
  ...auth, testDir: "./tests/e2e/plans", outputDir: "test-results-plans",
  reporter: [["list"], ["json", { outputFile: "storage/test-reports/plans.json" }]],
  use: { ...auth.use, trace: "off", video: "off" },
});
