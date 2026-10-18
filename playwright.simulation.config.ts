import { defineConfig } from "@playwright/test";
import auth from "./playwright.auth.config";
export default defineConfig({
  ...auth, testDir: "./tests/e2e/simulation", outputDir: "test-results-simulation",
  reporter: [["list"], ["json", { outputFile: "storage/test-reports/simulation.json" }]],
  use: { ...auth.use, trace: "off", video: "off" },
});
