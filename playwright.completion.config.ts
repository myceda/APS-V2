import { defineConfig } from "@playwright/test";
import auth from "./playwright.auth.config";
const output = process.env.APS_COMPLETION_DIR || "storage/completion-100/browser";
export default defineConfig({
  ...auth,
  testDir: "./tests/completion-100",
  outputDir: `${output}/artifacts`,
  reporter: [["list"], ["json", { outputFile: `${output}/results.json` }]],
  use: { ...auth.use, trace: "off", video: "off" },
});
