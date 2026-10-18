import { beforeAll, afterAll, it, expect } from "vitest";
import { writeFile } from "node:fs/promises";
import { prepareAdminFixture, fingerprint } from "../../scripts/verification/round-7/fixtures";
import { createDataset, saveDataset, publishDataset, listDatasets, getDataset, uploadTranscript, saveDraft, confirmDraft, runAnalysis } from "@/server/academic";
import { adminCourse, adminData, syntheticSource } from "../support/round-7-admin";
import { syntheticTranscript } from "../support/synthetic-transcript";
import type { Dataset } from "@/modules/curriculum/types";

let f: Awaited<ReturnType<typeof prepareAdminFixture>>, draft: Dataset;
beforeAll(async () => { f = await prepareAdminFixture(true); }, 60_000);
afterAll(async () => {
  if (!f) return;
  const outsideAfter = await fingerprint(f.manifest);
  const result = { outsideUnchanged: JSON.stringify(outsideAfter) === JSON.stringify(f.manifest.outsideBefore), outsideAfter };
  await writeFile(`${f.directory}/integration-integrity.json`, JSON.stringify(result, null, 2), { flag: "wx" });
  expect(result.outsideUnchanged).toBe(true);
});
it("creates a neutral first draft in the authorized synthetic curriculum, with no CS seed", async () => {
  draft = await createDataset(f.contexts.a, f.manifest.curricula[0].versionId);
  expect(draft.status).toBe("draft"); expect(draft.courses).toEqual([]); expect(draft.offerings).toEqual([]);
  expect(draft.policy.repeat).toBe("unconfirmed"); expect(draft.unresolved.length).toBeGreaterThan(0);
  await expect(publishDataset(f.contexts.a, draft.id, draft.editVersion)).rejects.toMatchObject({ status: 422 });
});
it("saves supported fields, offerings and group rules without changing the other curriculum", async () => {
  const b = await createDataset(f.contexts.b, f.manifest.curricula[1].versionId);
  const before = { history: await listDatasets(f.contexts.b), detail: await getDataset(f.contexts.b, b.id) };
  draft = await saveDataset(f.contexts.a, draft.id, { expectedVersion: draft.editVersion, dataset: adminData(draft) });
  expect(draft.courses).toHaveLength(2); expect(draft.groups[0].minimum).toBe(6);
  expect({ history: await listDatasets(f.contexts.b), detail: await getDataset(f.contexts.b, b.id) }).toEqual(before);
  await expect(createDataset(f.contexts.both, b.curriculumVersionId, draft.id)).rejects.toMatchObject({ code: "DATASET_SCOPE_MISMATCH" });
});
it("rejects out of curriculum list/create/save/publish/copy", async () => {
  expect((await listDatasets(f.contexts.b)).datasets.some(d => d.id === draft.id)).toBe(false);
  await expect(createDataset(f.contexts.b, draft.curriculumVersionId)).rejects.toMatchObject({ status: 403 });
  await expect(createDataset(f.contexts.b, f.manifest.curricula[1].versionId, draft.id)).rejects.toMatchObject({ status: 403 });
  await expect(saveDataset(f.contexts.b, draft.id, { expectedVersion: draft.editVersion, dataset: draft })).rejects.toMatchObject({ status: 403 });
  await expect(publishDataset(f.contexts.b, draft.id, draft.editVersion)).rejects.toMatchObject({ status: 403 });
});
it("blocks invalid references and keeps the saved draft intact", async () => {
  const invalid = structuredClone(draft); invalid.courses[0].prerequisite.courses = ["MISSING"];
  await expect(saveDataset(f.contexts.a, draft.id, { expectedVersion: draft.editVersion, dataset: invalid })).rejects.toMatchObject({ status: 422 });
  expect(await getDataset(f.contexts.a, draft.id)).toEqual(draft);
});
it("allows exactly one concurrent editor and rejects stale save and publish", async () => {
  const results = await Promise.allSettled([f.contexts.a, f.contexts.both].map(c => saveDataset(c, draft.id, { expectedVersion: draft.editVersion, dataset: { ...draft, source: syntheticSource + c.accountId } })));
  expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
  expect(results.find(r => r.status === "rejected")).toMatchObject({ reason: { status: 409, code: "ACADEMIC_CONFLICT" } });
  await expect(publishDataset(f.contexts.a, draft.id, draft.editVersion)).rejects.toMatchObject({ status: 409 });
  draft = (results.find(r => r.status === "fulfilled") as PromiseFulfilledResult<Dataset>).value;
});
it("publishes immutable history, copies to a new draft and preserves the original", async () => {
  await publishDataset(f.contexts.a, draft.id, draft.editVersion);
  const before = await getDataset(f.contexts.a, draft.id);
  await expect(saveDataset(f.contexts.a, draft.id, { expectedVersion: before.editVersion, dataset: before })).rejects.toMatchObject({ code: "DATASET_IMMUTABLE" });
  const copy = await createDataset(f.contexts.a, draft.curriculumVersionId, draft.id);
  expect(copy.version).toBe(before.version + 1); expect(copy.status).toBe("draft"); expect(copy.courses).toEqual(before.courses);
  await saveDataset(f.contexts.a, copy.id, { expectedVersion: copy.editVersion, dataset: { ...copy, source: syntheticSource + " สำเนา" } });
  expect(await getDataset(f.contexts.a, draft.id)).toEqual(before);
});
it("AC-ADMIN-04: analyzes the same CS course code in two isolated synthetic curricula with the unchanged engine", async () => {
  const evidence = [];
  for (const [index, key] of ["student-a", "student-b"].entries()) {
    const c = f.manifest.curricula[index], account = f.contexts[key];
    const empty = await createDataset(f.contexts.both, c.versionId), data = adminData(empty);
    const category = index === 0 ? "core_required" : "specific_required";
    data.courses = [{ ...adminCourse("517101"), name: `Synthetic Curriculum ${index + 1}`, category }, adminCourse(index === 0 ? "R7A" : "R7B")];
    data.groups = [{ category, minimum: 3, track: "both", source: syntheticSource }]; data.offerings = [];
    const saved = await saveDataset(f.contexts.both, empty.id, { expectedVersion: empty.editVersion, dataset: data });
    await publishDataset(f.contexts.both, saved.id, saved.editVersion);
    let review = await uploadTranscript(account, syntheticTranscript(account.enrollment!.studentCode, "B", [{ code: "517101", name: "Synthetic Shared Course" }]));
    review = await saveDraft(account, review.id, { expectedVersion: review.editVersion, payload: { ...review, header: { ...review.header, trackState: "not_selected" } } });
    await confirmDraft(account, review.id, review.editVersion);
    const actual = (await runAnalysis(account, { currentTerm: { year: 2569, semester: 1 }, normalLoad: 6, summerLoad: 3, horizon: 2, targetGrade: "B", assumeUnknownOfferings: false })).result;
    expect(actual.datasetId).toBe(saved.id); expect(actual.catalogue.find(course => course.code === "517101")?.name).toBe(`Synthetic Curriculum ${index + 1}`);
    expect(actual.audits).toHaveLength(2);
    for (const audit of actual.audits) {
      expect(audit.gpax.raw).toBe(3); expect(audit.earnedCredits).toBe(3);
      expect(audit.courses.find(course => course.code === "517101")?.category).toBe(category);
    }
    evidence.push({ curriculumAlias: index === 0 ? "A" : "B", expected: { courseCode: "517101", category, gpax: 3, earnedCredits: 3 }, actual });
  }
  await writeFile(`${f.directory}/curriculum-isolation.json`, JSON.stringify({ synthetic: true, realITAcceptance: false, evidence }, null, 2), { flag: "wx" });
});
