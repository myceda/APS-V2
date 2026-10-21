import { readFile, writeFile } from "node:fs/promises";
import { resolve, relative } from "node:path";

// Playwright's raw JSON can include webServer.env. Export only reviewable test
// outcomes; credentials, cookies, browser state, traces and runtime config stay
// in the existing private/ignored test storage.
const [input, output] = process.argv.slice(2);
if (!input || !output) throw new Error("Use export-results.mjs <report.json> <evidence.json>");
const source = JSON.parse(await readFile(input, "utf8"));
function suite(value) {
  return {
    title: value.title,
    file: value.file,
    specs: (value.specs ?? []).map(spec => ({
      title: spec.title,
      file: spec.file,
      line: spec.line,
      tests: spec.tests.map(test => ({
        project: test.projectName,
        expectedStatus: test.expectedStatus,
        status: test.status,
        results: test.results.map(result => ({ status: result.status, duration: result.duration })),
      })),
    })),
    suites: (value.suites ?? []).map(suite),
  };
}
const report = {
  format: "aps-redesign-results-v1",
  source: relative(resolve("."), resolve(input)).replaceAll("\\", "/"),
  exportedAt: new Date().toISOString(),
  stats: source.stats,
  suites: source.suites.map(suite),
};
await writeFile(output, JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify({ exported: output, expected: report.stats.expected, unexpected: report.stats.unexpected }));
