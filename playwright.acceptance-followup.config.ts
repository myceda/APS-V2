import { defineConfig } from "@playwright/test";
import auth from "./playwright.auth.config";
export default defineConfig({
  ...auth,
  testDir: "./tests/acceptance-followup",
  outputDir: "storage/acceptance-followup/artifacts",
  reporter: [["list"]],
  use: { ...auth.use, trace: "off", video: "off" },
});
