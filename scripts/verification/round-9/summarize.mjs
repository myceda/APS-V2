import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve, join, relative } from "node:path";

const root = resolve(import.meta.dirname, "../../..");
const directory = resolve(root, "../aps-v2-doc/deliverables/ui-audit/round-9");
const report = JSON.parse(await readFile(join(root, "storage/test-reports/ui-recovery.json"), "utf8"));
const cases = [];
function visit(suite) {
  for (const spec of suite.specs ?? []) for (const test of spec.tests ?? []) cases.push({
    title: spec.title, device: test.projectName, status: test.status,
    results: test.results.map(r => ({ status: r.status, durationMs: r.duration })),
  });
  for (const child of suite.suites ?? []) visit(child);
}
for (const suite of report.suites) visit(suite);
const images = [];
for (const phase of ["before", "after"]) for (const file of await readdir(join(directory, "images", phase))) {
  if (!file.endsWith(".png")) continue;
  const full = join(directory, "images", phase, file);
  images.push({ path: relative(directory, full).replaceAll("\\", "/"), sha256: createHash("sha256").update(await readFile(full)).digest("hex") });
}
await mkdir(directory, { recursive: true });
await writeFile(join(directory, "checks.json"), JSON.stringify({
  generatedAt: new Date().toISOString(), runStartedAt: report.stats.startTime,
  method: "Chromium production build; signed session fixtures; local aps_v2_test only",
  realGoogle: false, mobileMeaning: "Pixel 7 emulation, not a physical Android/iOS device",
  counts: { total: cases.length, passed: cases.filter(c => c.status === "expected").length, failed: cases.filter(c => c.status !== "expected").length },
  cases, images,
}, null, 2) + "\n");
console.log(JSON.stringify({ cases: cases.length, passed: cases.filter(c => c.status === "expected").length, images: images.length }));
if (!cases.length || cases.some(c => c.status !== "expected")) process.exitCode = 1;
