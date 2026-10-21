import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { configureDemo, cliOptions } from "../../demo/runtime";
import type { DemoCase } from "../../../src/modules/demo/config";
configureDemo();
const { run } = cliOptions(process.argv.slice(2));
const { readManifest, runDirectory, fingerprint, demoContext, digest } = await import("../../demo/store");
const { studentWorkspace } = await import("../../../src/server/academic");
const { getDatabase } = await import("../../../src/server/database");
try {
  const manifest = await readManifest(run);
  const before = JSON.parse(await readFile(path.join(runDirectory(run), "rehearsal-before.json"), "utf8"));
  const outside = await fingerprint(manifest, false);
  assert.deepEqual(outside, before.outside, "Data outside this demo run changed");
  for (const [key, hash] of Object.entries(before.otherWorkspaces)) assert.equal(digest(JSON.stringify(await studentWorkspace(demoContext(manifest, key as DemoCase)))), hash, "Another demo student's workspace changed");
  const originals = await getDatabase().transcriptRevision.findMany({ where: { id: { in: before.originalRevisionIds } }, orderBy: { id: "asc" } });
  assert.equal(digest(JSON.stringify(originals)), before.originalRevisionsHash, "Original revisions changed");
  const after = await fingerprint(manifest, true);
  const allowed = ["PrivateDocument", "TranscriptDraft", "DraftCourseAttempt", "TranscriptRevision", "StudentAcademicState", "AnalysisRun", "SimulationScenario"];
  for (const key of Object.keys(before.inside).filter(k => !allowed.includes(k))) assert.deepEqual(after[key], before.inside[key], `Protected business table changed: ${key}`);
  const changes = Object.keys(after).filter(k => JSON.stringify(after[k]) !== JSON.stringify(before.inside[k]));
  const result = { checkedAt: new Date().toISOString(), run, outsideUnchanged: true, otherDemoStudentsUnchanged: true, originalRevisionsUnchanged: true, catalogueCriteriaAndRolesUnchanged: true, expectedChangedTables: changes, reason: "Student uploaded and confirmed a new revision and saved a What-if; these changes are intentional", synthetic: true, realGoogle: false, credentialsExported: false };
  if (!process.env.APS_REHEARSAL_DIR) throw new Error("Isolated output directory required");
  await writeFile(path.join(process.env.APS_REHEARSAL_DIR, "integrity.json"), JSON.stringify(result, null, 2), { flag: "wx" });
  console.log("Round 12: outside data, other demo students, original revisions, roles and academic sources unchanged");
} finally { await getDatabase().$disconnect(); }
