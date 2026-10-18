// Private PDFs are read locally; output contains aliases and aggregate results only.
import assert from "node:assert/strict";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { createHash } from "node:crypto";
import type { Dataset, StudyTrack } from "../src/modules/curriculum/types";
import type { TranscriptPayload } from "../src/modules/transcript/types";
import { extractPdf } from "../src/server/pdf-extraction";
import { auditTranscript } from "../src/modules/analysis/engine";
import { makePlan } from "../src/modules/planning/engine";
const beforePath = process.argv[2];
const output = resolve(process.argv[3]);
const before = JSON.parse(await readFile(beforePath, "utf8"));
const after = JSON.parse(await readFile("src/modules/curriculum/data/cs2565.json", "utf8"));
function noNames(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(noNames);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).filter(([key]) => key !== "name" && key !== "source").map(([key, v]) => [key, noNames(v)]));
  return value;
}
assert.deepEqual(noNames(before), noNames(after), "Academic fields must not change");
const dataset = (data: typeof after): Dataset => ({ ...data, id: "read-only-verification", curriculumVersionId: "CS2565", version: 1, editVersion: 1, status: "draft" });
const rows = [];
for (const [index, label] of ["CS_Moss", "CS_F", "CS_Golf", "CS_Neoi", "CS_Minie"].entries()) {
  const payload = await extractPdf(new Uint8Array(await readFile(resolve("../thesis-doc-1_69/example-transcript", `${label}.pdf`))));
  const inputHash = createHash("sha256").update(JSON.stringify(payload)).digest("hex");
  let comparisons = 0;
  for (const state of ["selected", "not_selected"] as const)
    for (const track of ["project", "cooperative"] as StudyTrack[])
      for (const assumeUnknownOfferings of [false, true]) {
        const input: TranscriptPayload = { ...structuredClone(payload), header: { ...payload.header, track: state === "selected" ? track : null, trackState: state } };
        const params = { currentTerm: { year: 2569, semester: 1 as const }, normalLoad: 12, summerLoad: 6, horizon: 8, targetGrade: "B", assumeUnknownOfferings };
        const oldDataset = dataset(before), newDataset = dataset(after);
        const oldAudit = auditTranscript(input, oldDataset, track), newAudit = auditTranscript(input, newDataset, track);
        const oldPlan = makePlan(input, oldDataset, track, params, state === "selected" ? "actual" : "alternative");
        const newPlan = makePlan(input, newDataset, track, params, state === "selected" ? "actual" : "alternative");
        // Returned names may differ; numeric, rule, ordering and forecast results must match.
        assert.deepEqual(noNames(newAudit), noNames(oldAudit));
        assert.deepEqual(noNames(newPlan), noNames(oldPlan));
        assert.equal(newAudit.gpax.confirmed, false, "Unconfirmed policy must remain diagnostic");
        assert.equal(newPlan.graduationTerm, null, "Unresolved rules must not produce a certified completion term");
        comparisons++;
      }
  assert.equal(createHash("sha256").update(JSON.stringify(payload)).digest("hex"), inputHash);
  rows.push({ sampleId: `sample-${index + 1}`, attempts: payload.attempts.length, comparisons, academicResultsUnchanged: true, transcriptUnchanged: true });
}
await mkdir(dirname(output), { recursive: true });
await writeFile(output, JSON.stringify({ checkedAt: new Date().toISOString(), scope: "Pure engine comparison of name-only correction; not official academic or authenticated real-user acceptance", rows, comparisons: rows.reduce((n, r) => n + r.comparisons, 0), assumptions: "No offerings added; explicit unknown-offering assumptions tested separately; policy remains unconfirmed" }, null, 2) + "\n");
console.log(JSON.stringify({ samples: rows.length, comparisons: rows.reduce((n, r) => n + r.comparisons, 0), unchanged: true }));
