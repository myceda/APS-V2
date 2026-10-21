// Fixed commands only. Credentials/raw reports remain in ignored storage.
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";
const root = fileURLToPath(new URL("../../../", import.meta.url));
const docs = path.resolve(root, "../aps-v2-doc/deliverables/completion-100");
const run = new Date().toISOString().replace(/[:.]/g, "-");
const directory = path.join(root, "storage/completion-100", run);
mkdirSync(directory, { recursive: true }); mkdirSync(docs, { recursive: true });
const commands = {
  quality: "npm.cmd run check",
  integration: "npm.cmd run test:integration",
  auth: "npm.cmd run test:e2e:auth",
  public: "npm.cmd run test:e2e",
  recovery: "npm.cmd run test:e2e:ui-recovery",
  prepare: "node --conditions=react-server --import tsx scripts/verification/completion-100/prepare.ts",
  completion: "npx.cmd playwright test --config playwright.completion.config.ts",
  rehearsal: "npx.cmd playwright test --config playwright.rehearsal.config.ts",
  demo: "npm.cmd run test:e2e:demo",
  audit: "npm.cmd audit --json",
  "audit-production": "npm.cmd audit --omit=dev --json",
  handoff: "node --conditions=react-server --import tsx scripts/verification/completion-100/prepare-user-trial.ts",
};
const selected = process.argv.slice(2);
if (!selected.length || selected.some(k => !(k in commands))) throw new Error("Provide fixed check names: " + Object.keys(commands).join(", "));
const baselinePath = path.resolve(docs, "../acceptance-followup/2026-10-20/acceptance-results.json");
const digest = file => createHash("sha256").update(readFileSync(file)).digest("hex");
const baselineBefore = digest(baselinePath);
const summaryFile = path.join(docs, "checks.json");
const summary = existsSync(summaryFile) ? JSON.parse(readFileSync(summaryFile, "utf8")) : { scope: "local synthetic tests; not Google, users, CI or peer review", attempts: [] };
for (const key of selected) {
  const start = new Date().toISOString();
  console.log(`Starting ${key}`);
  const result = spawnSync("powershell.exe", ["-NoProfile", "-Command", commands[key]], { cwd: root, encoding: "utf8", windowsHide: true, maxBuffer: 32 * 1024 * 1024,
    env: { ...process.env, APS_COMPLETION_DIR: path.join(directory, "browser"), APS_REHEARSAL_DIR: path.join(directory, "rehearsal"), APS_DEMO_RUN: `c100-${Date.now()}` } });
  const output = (result.stdout || "") + (result.stderr || "");
  const log = path.join(directory, `${key}.log`);
  writeFileSync(log, output, { mode: 0o600 });
  const record = { key, command: commands[key], start, end: new Date().toISOString(), exitCode: result.status, status: result.status === 0 ? "passed" : "failed", privateLog: path.relative(root, log), logSha256: digest(log) };
  if (key.startsWith("audit")) {
    try { const report = JSON.parse(result.stdout); record.vulnerabilities = report.metadata?.vulnerabilities; } catch { record.auditReportUnavailable = true; }
  }
  const counts = output.replace(/\u001b\[[0-9;]*m/g, "").match(/(?:Tests\s+\d+ passed[^\r\n]*|\d+ passed[^\r\n]*|\d+ failed[^\r\n]*)/g);
  if (counts) record.counts = counts;
  summary.attempts.push(record);
  summary.baseline = { sha256Before: baselineBefore, sha256After: digest(baselinePath), unchanged: baselineBefore === digest(baselinePath) };
  writeFileSync(summaryFile, JSON.stringify(summary, null, 2) + "\n");
  console.log(`${key}: ${record.status}, exit ${record.exitCode}${counts ? ", " + counts.join("; ") : ""}`);
  if (result.status !== 0 && !key.startsWith("audit")) { console.log(output.slice(-7000)); process.exitCode = 1; break; }
}
