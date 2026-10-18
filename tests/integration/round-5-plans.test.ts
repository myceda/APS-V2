import { beforeAll, describe, expect, it } from "vitest";
import { writeFile } from "node:fs/promises";
import { fingerprint, preparePlanningFixture } from "../../scripts/verification/round-5/fixtures";
import { runAnalysis, runScenario, confirmDraft, studentWorkspace } from "@/server/academic";
import { studentCriteria } from "@/server/track-criteria";
import { planParameters } from "../support/round-5-plans";
import { getDatabase } from "@/server/database";
import { createSessionFixture } from "../support/fixtures";
import { requireAccount } from "@/server/account-context";

let fixture: Awaited<ReturnType<typeof preparePlanningFixture>>;
beforeAll(async () => { fixture = await preparePlanningFixture(); }, 60_000);
describe("Round 5 account track, criteria scope and persisted ownership", () => {
  it("returns two alternatives without a criterion and without changing actual track", async () => {
    for (const key of ["not-selected", "absent", "wrong-cohort", "wrong-round", "expired"]) {
      const result = await runAnalysis(fixture.contexts[key], planParameters);
      expect(result.result.trackState).toBe("not_selected");
      expect(result.result.plans.map(p => [p.track, p.basis])).toEqual([["project", "alternative"], ["cooperative", "alternative"]]);
      if (key !== "not-selected") expect((await studentCriteria(fixture.contexts[key], planParameters.currentTerm)).results.every(r => r.status === "awaiting_criteria" && r.criteriaId === null)).toBe(true);
    }
  });
  it.each(["project", "cooperative"])("uses only the confirmed %s track and rejects another track in What-if", async key => {
    const result = await runAnalysis(fixture.contexts[key], planParameters);
    expect(result.result.plans.map(p => [p.track, p.basis])).toEqual([[key, "actual"]]);
    await expect(runScenario(fixture.contexts[key], { analysisId: result.id, track: key === "project" ? "cooperative" : "project", events: [] })).rejects.toMatchObject({ status: 422, code: "SCENARIO_INVALID" });
  });
  it("keeps unknown as a blocked draft; also rejects ambiguous enrollment with an otherwise confirmed transcript", async () => {
    const unknown = fixture.manifest.accounts.find(a => a.key === "unknown")!;
    await expect(confirmDraft(fixture.contexts.unknown, unknown.draftId, 1)).rejects.toMatchObject({ status: 422 });
    const context = fixture.contexts["not-selected"];
    await expect(runAnalysis({ ...context, enrollment: { ...context.enrollment!, trackState: "unknown" } }, planParameters)).rejects.toMatchObject({ status: 422, code: "ENROLLMENT_TRACK_UNKNOWN" });
    expect((await studentWorkspace(fixture.contexts.unknown)).revision).toBeNull();
  });
  it("does not conflate preliminary pass, manual review, insufficient data and failure with approval", async () => {
    for (const [key, statuses] of [["not-selected", ["preliminary_pass", "manual_review"]], ["failed", ["not_met", "not_met"]], ["pending", ["insufficient_data", "insufficient_data"]]] as const) {
      const result = await studentCriteria(fixture.contexts[key], planParameters.currentTerm);
      expect(result.results.map(r => r.status)).toEqual(statuses);
      expect(result.results.every(r => r.approval === "not_verified")).toBe(true);
    }
  });
  it("refuses a conflicting transcript and another account's analysis", async () => {
    const context = fixture.contexts.project;
    await expect(runAnalysis({ ...context, enrollment: { ...context.enrollment!, trackId: fixture.manifest.trackIds.cooperative } }, planParameters)).rejects.toMatchObject({ status: 422, code: "TRANSCRIPT_TRACK_CONFLICT" });
    const other = fixture.manifest.accounts.find(a => a.key === "not-selected")!;
    await expect(runScenario(context, { analysisId: other.analysisId, track: "project", events: [] })).rejects.toMatchObject({ status: 404 });
  });
  it.each(["project", "cooperative", "unknown"] as const)("invalidates old alternatives after this fixture's enrollment changes to %s", async track => {
    const a = fixture.manifest.accounts.find(a => a.key === "not-selected")!;
    const db = getDatabase();
    try {
      await db.studentEnrollment.update({ where: { id: a.enrollmentId }, data: { trackState: track === "unknown" ? "unknown" : "selected", trackId: track === "unknown" ? null : fixture.manifest.trackIds[track] } });
      const session = await createSessionFixture(a.userId), context = await requireAccount(session.headers);
      const workspace = await studentWorkspace(context);
      let scenarioError: string | null = null;
      try { await runScenario(context, { analysisId: a.analysisId, track: "project", events: [{ action: "drop", courseCode: "517121", term: planParameters.currentTerm, grade: null }] }); }
      catch (error) { scenarioError = (error as { code: string }).code; }
      expect({ stale: workspace.analysis?.stale, scenarioError }).toEqual({ stale: true, scenarioError: "ENROLLMENT_CHANGED" });
    } finally {
      await db.studentEnrollment.update({ where: { id: a.enrollmentId }, data: { trackState: "not_selected", trackId: null } });
    }
  });
  it("invalidates a selected project's old plan when the selected track changes to cooperative", async () => {
    const a = fixture.manifest.accounts.find(a => a.key === "project")!, db = getDatabase();
    try {
      await db.studentEnrollment.update({ where: { id: a.enrollmentId }, data: { trackId: fixture.manifest.trackIds.cooperative } });
      const session = await createSessionFixture(a.userId), context = await requireAccount(session.headers);
      expect((await studentWorkspace(context)).analysis?.stale).toBe(true);
      await expect(runScenario(context, { analysisId: a.analysisId, track: "project", events: [] })).rejects.toMatchObject({ status: 409, code: "ENROLLMENT_CHANGED" });
    } finally {
      await db.studentEnrollment.update({ where: { id: a.enrollmentId }, data: { trackId: fixture.manifest.trackIds.project } });
    }
  });
  it("preserves transcripts, account tracks and every row outside the fixture IDs", async () => {
    const outside = await fingerprint(fixture.manifest), protectedAfter = await fingerprint(fixture.manifest, true);
    expect(outside).toEqual(fixture.manifest.outsideBefore);
    expect(protectedAfter).toEqual(fixture.manifest.protectedBefore);
    await writeFile(`${fixture.directory}/integration-integrity.json`, JSON.stringify({ outsideUnchanged: true, protectedBusinessUnchanged: true, outsideBefore: fixture.manifest.outsideBefore, outsideAfter: outside, protectedAfter }, null, 2), { flag: "wx" });
  });
});
