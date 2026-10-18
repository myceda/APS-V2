import { beforeAll, describe, expect, it } from "vitest";
import { writeFile } from "node:fs/promises";
import { createCatalogue, fingerprint, prepareSimulationFixture } from "../../scripts/verification/round-6/fixtures";
import { runAnalysis, runScenario, studentWorkspace, reviseTranscript, confirmDraft } from "@/server/academic";
import { studentCriteria } from "@/server/track-criteria";
import { getDatabase } from "@/server/database";
import { simulationParameters } from "../support/round-6-simulation";
let fixture: Awaited<ReturnType<typeof prepareSimulationFixture>>;
const observations: unknown[] = [];
beforeAll(async () => { fixture = await prepareSimulationFixture(); }, 60_000);
describe("Round 6 persisted What-if and real academic state", () => {
  it("changes hypothetical grades and events on both tracks while real eligibility and revision stay fixed", async () => {
    const student = fixture.contexts.student, a = fixture.manifest.accounts.find(a => a.key === "student")!;
    const workspace = await studentWorkspace(student), before = await fingerprint(fixture.manifest, true), real = workspace.revision;
    const criteria = await studentCriteria(student, simulationParameters.currentTerm);
    expect(criteria.results.every(r => r.status === "not_met")).toBe(true);
    for (const track of ["project", "cooperative"] as const) for (const [action, code, grade] of [["add", "517121", "A"], ["drop", "517121", null], ["fail", "517121", null], ["fail", "517392", null], ["add", "517392", "U"]] as const) {
      const result = await runScenario(student, { analysisId: a.analysisId, track, events: [{ action, courseCode: code, term: simulationParameters.currentTerm, grade }] });
      expect(result.comparison.baseline).toEqual(workspace.analysis!.result.plans.find(p => p.track === track));
      if (grade === "A") expect(result.comparison.simulatedAudit.gpax.raw).toBeGreaterThan(3.1);
      expect((await studentCriteria(student, simulationParameters.currentTerm)).results).toEqual(criteria.results);
      expect((await studentWorkspace(student)).revision).toEqual(real);
      observations.push({ track, action, code, grade, simulatedGpax: result.comparison.simulatedAudit.gpax.raw, realCriteria: criteria.results.map(r => r.status) });
    }
    expect(await fingerprint(fixture.manifest, true)).toEqual(before);
  });
  it("saves term-scoped offering assumptions without overwriting known offerings", async () => {
    const a = fixture.manifest.accounts[0], before = await fingerprint(fixture.manifest, true);
    const result = await runScenario(fixture.contexts.student, { analysisId: a.analysisId, track: "project", events: [], offeringAssumptions: [{ courseCode: "517122", term: { year: 2569, semester: 1 }, availability: "open" }] });
    expect(result.comparison.offeringAssumptions).toHaveLength(1);
    await expect(runScenario(fixture.contexts.student, { analysisId: a.analysisId, track: "project", events: [], offeringAssumptions: [{ courseCode: "517121", term: { year: 2569, semester: 1 }, availability: "closed" }] })).rejects.toMatchObject({ status: 422 });
    expect(await fingerprint(fixture.manifest, true)).toEqual(before);
  });
  it("refuses invalid letter grades and ownership without creating a scenario", async () => {
    const a = fixture.manifest.accounts[0], db = getDatabase(), count = await db.simulationScenario.count({ where: { ownerAccountId: a.accountId } });
    await expect(runScenario(fixture.contexts.student, { analysisId: a.analysisId, track: "project", events: [{ action: "add", courseCode: "517121", term: simulationParameters.currentTerm, grade: "constructor" }] })).rejects.toMatchObject({ status: 422 });
    await expect(runScenario(fixture.contexts.other, { analysisId: a.analysisId, track: "project", events: [] })).rejects.toMatchObject({ status: 404 });
    expect(await db.simulationScenario.count({ where: { ownerAccountId: a.accountId } })).toBe(count);
  });
  it("refuses a baseline whose confirmed revision has been replaced", async () => {
    const c = fixture.contexts.changing, a = fixture.manifest.accounts.find(a => a.key === "changing")!;
    const draft = await reviseTranscript(c); await confirmDraft(c, draft.id, draft.editVersion);
    const before = await fingerprint(fixture.manifest, true);
    await expect(runScenario(c, { analysisId: a.analysisId, track: "project", events: [{ action: "drop", courseCode: "517121", term: simulationParameters.currentTerm, grade: null }] })).rejects.toMatchObject({ status: 409, code: "BASELINE_CHANGED" });
    expect(await fingerprint(fixture.manifest, true)).toEqual(before);
  });
  it("refuses a baseline whose published dataset has been replaced", async () => {
    const c = fixture.contexts.changing, analysis = await runAnalysis(c, simulationParameters);
    await createCatalogue(fixture.manifest, 2);
    const before = await fingerprint(fixture.manifest, true);
    await expect(runScenario(c, { analysisId: analysis.id, track: "project", events: [{ action: "drop", courseCode: "517121", term: simulationParameters.currentTerm, grade: null }] })).rejects.toMatchObject({ status: 409, code: "BASELINE_CHANGED" });
    expect(await fingerprint(fixture.manifest, true)).toEqual(before);
  });
  it("keeps every record outside fixture IDs unchanged; saves only scenarios during What-if", async () => {
    const outside = await fingerprint(fixture.manifest);
    expect(outside).toEqual(fixture.manifest.outsideBefore);
    await writeFile(`${fixture.directory}/integration-integrity.json`, JSON.stringify({ outsideUnchanged: true, whatIfProtectedBusinessUnchanged: true, outsideAfter: outside, observations, deliberateFixtureChanges: "changing profile confirms a new revision and publishes a synthetic dataset for stale-baseline regression; those operations are separate from What-if" }, null, 2), { flag: "wx" });
  });
});
