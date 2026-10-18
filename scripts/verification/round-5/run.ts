// Capture hand-specified expected before evaluating actual; no database or sessions.
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { planCases, eligibilityCases } from "../../../tests/support/round-5-plans";
import { makePlan } from "../../../src/modules/planning/engine";
import { evaluateEligibility } from "../../../src/modules/track-criteria/evaluate";
import { ENGINE_VERSION } from "../../../src/modules/analysis/engine";
import path from "node:path";

const root = path.resolve(process.env.APS_PLAN_AUDIT_ROOT || "storage/planning-audit/round-5");
const relative = path.relative(path.resolve("storage/planning-audit"), root);
if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("Outputs must stay in ignored storage/planning-audit");
const stage = process.argv[2];
if (stage !== "before" && stage !== "after") throw new Error("Use before or after");
const digest = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const plans = planCases(), criteria = eligibilityCases();
const inputs = JSON.stringify({ plans, criteria }, null, 2);
const expected = JSON.stringify({ plans: plans.map(c => ({ id: c.id, ...c.expected })), criteria: criteria.map(c => ({ id: c.id, status: c.expected, approval: "not_verified" })) }, null, 2);
await mkdir(root, { recursive: true });
if (stage === "before") {
  await writeFile(`${root}/inputs.json`, inputs, { flag: "wx" });
  await writeFile(`${root}/expected.json`, expected, { flag: "wx" });
  await writeFile(`${root}/frozen.json`, JSON.stringify({ preparedAt: new Date().toISOString(), inputsSha256: digest(inputs), expectedSha256: digest(expected), expectedMethod: "Explicit placements from graph/credit arithmetic; independent invariant checks for full seed" }, null, 2), { flag: "wx" });
} else {
  if (digest(await readFile(`${root}/inputs.json`)) !== digest(inputs) || digest(await readFile(`${root}/expected.json`)) !== digest(expected)) throw new Error("Frozen cases changed");
}
const actualPlans = plans.map(c => {
  const before = digest(JSON.stringify(c));
  const plan = makePlan(c.payload, c.data, c.track, c.parameters, "alternative");
  return { id: c.id, plan, inputUnchanged: before === digest(JSON.stringify(c)) };
});
const actualCriteria = criteria.map(c => {
  const before = digest(JSON.stringify(c));
  const result = evaluateEligibility({ ...c, curriculumVersionId: "CS2565", term: { year: 2569, semester: 1 }, track: "project", today: "2026-10-18" });
  return { id: c.id, result, inputUnchanged: before === digest(JSON.stringify(c)) };
});
await writeFile(`${root}/actual-${stage}.json`, JSON.stringify({ recordedAt: new Date().toISOString(), engineVersion: ENGINE_VERSION, plans: actualPlans, criteria: actualCriteria }, null, 2), { flag: "wx" });
console.log(JSON.stringify({ plans: actualPlans.length, criteria: actualCriteria.length, stage, engineVersion: ENGINE_VERSION, databaseUsed: false }));
