import { defineConfig } from "@playwright/test";
import auth from "./playwright.auth.config";
export default defineConfig({
  ...auth,
  testDir: "./tests/e2e/ui-recovery",
  outputDir: "storage/ui-recovery/test-results",
  timeout: 60_000,
  reporter: [["list"], ["json", { outputFile: "storage/test-reports/ui-recovery.json" }]],
  use: { ...auth.use, trace: "off", video: "off" },
});
