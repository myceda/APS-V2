import path from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { simulationCases } from "../../../tests/support/round-6-simulation";
import { simulate } from "../../../src/modules/simulation/engine";
import { ENGINE_VERSION } from "../../../src/modules/analysis/engine";
const root = path.resolve(process.env.APS_SIM_AUDIT_ROOT || "storage/simulation-audit/round-6");
const relative = path.relative(path.resolve("storage/simulation-audit"), root);
if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("Outputs must stay in ignored storage/simulation-audit");
const stage = process.argv[2];
if (!["before", "after"].includes(stage)) throw new Error("Use before or after");
const hash = (v: string | Buffer) => createHash("sha256").update(v).digest("hex");
const cases = simulationCases(), inputs = JSON.stringify(cases, null, 2), expected = JSON.stringify(cases.map(c => ({ id: c.id, ...c.expected })), null, 2);
await mkdir(root, { recursive: true });
if (stage === "before") {
  await writeFile(`${root}/inputs.json`, inputs, { flag: "wx" });
  await writeFile(`${root}/expected.json`, expected, { flag: "wx" });
  await writeFile(`${root}/frozen.json`, JSON.stringify({ preparedAt: new Date().toISOString(), inputsSha256: hash(inputs), expectedSha256: hash(expected), expectedSource: "Hand-written term/grade placements and rational GPA, no engine output" }, null, 2), { flag: "wx" });
} else if (hash(await readFile(`${root}/inputs.json`)) !== hash(inputs) || hash(await readFile(`${root}/expected.json`)) !== hash(expected)) throw new Error("Frozen expected/input changed");
const actual = cases.map(c => {
  const original = hash(JSON.stringify(c));
  try { return { id: c.id, result: simulate(c.payload, c.data, c.track, c.parameters, c.events, c.offerings), error: null, inputUnchanged: original === hash(JSON.stringify(c)) }; }
  catch (error) { return { id: c.id, result: null, error: error instanceof Error ? error.message : "Unknown error", inputUnchanged: original === hash(JSON.stringify(c)) }; }
});
await writeFile(`${root}/actual-${stage}.json`, JSON.stringify({ recordedAt: new Date().toISOString(), engineVersion: ENGINE_VERSION, cases: actual }, null, 2), { flag: "wx" });
console.log(JSON.stringify({ stage, cases: actual.length, engineVersion: ENGINE_VERSION, databaseUsed: false }));
