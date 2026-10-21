import { defineConfig, devices } from "@playwright/test";
import demo from "./playwright.demo.config";
export default defineConfig({
  ...demo, testDir: "./tests/rehearsal",
  globalSetup: "./tests/rehearsal/setup.ts", globalTeardown: "./tests/rehearsal/teardown.ts",
  timeout: 90_000, reporter: [["list"]],
  use: { ...demo.use, trace: "off", video: "off" },
  projects: [{ name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 1000 } } }],
});
