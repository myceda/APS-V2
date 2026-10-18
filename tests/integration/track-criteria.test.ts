import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { createIdentity, createSessionFixture, assertTestDatabase } from "../support/fixtures";
import { criteriaInput } from "../support/track-criteria";
import { getDatabase } from "@/server/database";
import { requireAccount } from "@/server/account-context";
import type { AccountContext } from "@/modules/accounts/types";
import { mutateCriteria, criteriaHistory, listCriteria, confirmCohort, cohortRecord, studentCriteria } from "@/server/track-criteria";
import { uploadTranscript, saveDraft, confirmDraft, runAnalysis } from "@/server/academic";
import seed from "@/modules/curriculum/data/cs2565.json";
import type { Dataset } from "@/modules/curriculum/types";
import type { Prisma } from "@/generated/prisma/client";
import { academicDataset } from "../support/academic-fixtures";
import { syntheticTranscript } from "../support/synthetic-transcript";
import type { CriteriaView } from "@/modules/track-criteria/types";
import { GET as studentRoute } from "@/app/api/student/track-criteria/route";
import { POST as adminRoute } from "@/app/api/admin/track-criteria/route";
const db = getDatabase();
let admin: AccountContext, student: AccountContext, headers: Headers, studentHeaders: Headers, versionId: string, curriculumId: string, datasetId: string, incomplete: CriteriaView, published: CriteriaView;
const ownerIds: string[] = [], users: string[] = [];
async function syntheticCatalogue(status: string) {
  const fixture = academicDataset(seed as unknown as Dataset);
  const asJson = (v: unknown): Prisma.InputJsonValue => JSON.parse(JSON.stringify(v));
  return db.academicDataset.create({data:{ curriculumVersionId:versionId, version: await db.academicDataset.count({where:{curriculumVersionId:versionId}})+1, status, source:"Synthetic fixture only", policy:asJson(fixture.policy), groups:asJson(fixture.groups), unresolved:[], courses:{create:fixture.courses.map(c=>({...c,prerequisite:asJson(c.prerequisite)}))}, offerings:{create:fixture.offerings} }});
}
beforeAll(async () => {
  assertTestDatabase();
  const curriculum = await db.curriculum.create({ data: { code: `criteria-${randomUUID()}`, name: "Synthetic Criteria", versions: { create: { code: `criteria-${randomUUID()}` } } }, include: { versions: true } });
  versionId = curriculum.versions[0].id; curriculumId = curriculum.id;
  for (const role of ["admin", "student"] as const) {
    const identity = await createIdentity(role); ownerIds.push(identity.access.id); users.push(identity.user.id);
    if (role === "admin") await db.curriculumAdmin.create({ data: { accountAccessId: identity.access.id, curriculumId } });
    else await db.studentEnrollment.update({ where: { accountAccessId: identity.access.id }, data: { curriculumVersionId: versionId, trackState: "not_selected", trackId: null, studentCode: "6500000799" } });
    const f = await createSessionFixture(identity.user.id), context = await requireAccount(f.headers);
    if (role === "admin") { admin = context; headers = f.headers; } else { student = context; studentHeaders = f.headers; }
  }
  const catalogue = await syntheticCatalogue("published");
  datasetId = catalogue.id;
  const pdf = await uploadTranscript(student, syntheticTranscript("6500000799"));
  const revised = await saveDraft(student, pdf.id, { expectedVersion: pdf.editVersion, payload: { ...pdf, header: { ...pdf.header, track: null, trackState: "not_selected" } } });
  await confirmDraft(student, pdf.id, revised.editVersion);
});
afterAll(async () => {
  await db.trackCriteriaEvent.deleteMany({ where: { criteria: { curriculumVersionId: versionId } } });
  await db.$executeRaw`UPDATE "TrackCriteria" SET "basedOnId" = NULL WHERE "curriculumVersionId" = ${versionId}::uuid`;
  await db.trackCriteria.deleteMany({ where: { curriculumVersionId: versionId } });
  await db.simulationScenario.deleteMany({ where: { ownerAccountId: { in: ownerIds } } });
  await db.analysisRun.deleteMany({ where: { ownerAccountId: { in: ownerIds } } });
  await db.studentAcademicState.deleteMany({ where: { enrollment: { accountAccessId: { in: ownerIds } } } });
  await db.transcriptRevision.deleteMany({ where: { ownerAccountId: { in: ownerIds } } });
  await db.transcriptDraft.deleteMany({ where: { ownerAccountId: { in: ownerIds } } });
  await db.privateDocument.deleteMany({ where: { ownerAccountId: { in: ownerIds } } });
  await db.academicDataset.deleteMany({ where: { curriculumVersionId: versionId } });
  await db.studentEnrollment.deleteMany({ where: { accountAccessId: { in: ownerIds } } });
  await db.curriculumAdmin.deleteMany({ where: { accountAccessId: { in: ownerIds } } });
  await db.auditEvent.deleteMany({ where: { targetAccountId: { in: ownerIds } } });
  await db.accountAccess.deleteMany({ where: { id: { in: ownerIds } } });
  await db.user.deleteMany({ where: { id: { in: users } } });
  await db.curriculumVersion.deleteMany({ where: { curriculumId } });
  await db.curriculum.delete({ where: { id: curriculumId } });
});
const complete = () => { const v = criteriaInput(versionId, datasetId); v.data.targetCourseCodes = ["101001"]; return v; };
const create = (criteria = complete()) => mutateCriteria(admin, { action: "create", criteria, reason: "Synthetic fixture only" });
const command = (action: string, c: CriteriaView, extra = {}) => mutateCriteria(admin, { action, id: c.id, expectedEditVersion: c.editVersion, reason: "Synthetic change only", ...extra });
describe("track criteria services, identity and transactions", () => {
  it("requires signed identity, origin and curriculum grants", async () => {
    expect((await studentRoute(new Request("http://localhost:3101/api/student/track-criteria?year=2569&semester=1"))).status).toBe(401);
    await expect(listCriteria(student)).rejects.toMatchObject({ status: 403 });
    await expect(mutateCriteria({ ...admin, curriculumIds: [] }, { action: "create", criteria: complete(), reason: "Synthetic" })).rejects.toMatchObject({ status: 403 });
    const response = await adminRoute(new Request("http://localhost:3101/api/admin/track-criteria", { method: "POST", headers, body: JSON.stringify({}) }));
    expect(response.status).toBe(403);
  });
  it("allows incomplete drafts but prevents publication and stale writes", async () => {
    const v = complete(); v.data.gpax.state = "unknown";
    incomplete = await create(v);
    await expect(command("publish", incomplete)).rejects.toMatchObject({ status: 422 });
    const saved = await command("save", incomplete, { criteria: v });
    await expect(command("save", incomplete, { criteria: v })).rejects.toMatchObject({ status: 409 });
    incomplete = saved;
    expect((await criteriaHistory(admin, saved.id)).events).toHaveLength(2);
    await expect(criteriaHistory({ ...admin, curriculumIds: [] }, saved.id)).rejects.toMatchObject({ status: 403 });
  });
  it("publishes explicitly and protects the published payload", async () => {
    published = await command("publish", await create());
    await expect(command("save", published, { criteria: complete() })).rejects.toMatchObject({ status: 409 });
    const rows = await listCriteria(admin); expect(rows.items.find(r => r.id === published.id)?.status).toBe("published");
  });
  it("waits for verified cohort and never prevents comparing two plans", async () => {
    expect((await studentCriteria(student, { year: 2569, semester: 1 })).results.every(r => r.status === "awaiting_criteria")).toBe(true);
    const result = await runAnalysis(student, { currentTerm: { year: 2569, semester: 1 }, normalLoad: 6, summerLoad: 6, horizon: 8, targetGrade: "B", assumeUnknownOfferings: false });
    expect(result.result.plans.map(p => p.track)).toEqual(["project", "cooperative"]);
  });
  it("confirms cohort with optimistic concurrency and never changes the actual track", async () => {
    const record = await cohortRecord(admin, versionId, "6500000799");
    const value = { curriculumVersionId: versionId, studentCode: record.studentCode, admissionYear: 2565, source: "Synthetic Registrar record", expectedVersion: record.version };
    await confirmCohort(admin, value);
    await expect(confirmCohort(admin, value)).rejects.toMatchObject({ status: 409 });
    const row = await db.studentEnrollment.findUniqueOrThrow({ where: { id: record.id } });
    expect(row).toMatchObject({ admissionYear: 2565, trackState: "not_selected", trackId: null });
  });
  it("returns preliminary result separately from approval and uses exact cohort and term", async () => {
    const result = await studentCriteria(student, { year: 2569, semester: 1 });
    expect(result.results[0]).toMatchObject({ status: "preliminary_pass", approval: "not_verified", criteriaId: published.id });
    expect(result.results[1].status).toBe("awaiting_criteria");
    expect((await studentCriteria(student, { year: 2569, semester: 2 })).results[0].status).toBe("awaiting_criteria");
    const r = await studentRoute(new Request("http://localhost:3101/api/student/track-criteria?year=2569&semester=1&admissionYear=2564&accountId=other", { headers: studentHeaders }));
    expect(r.status).toBe(200); expect((await r.json()).admissionYear).toBe(2565);
  });
  it("rejects invalid course codes and unpublished catalogue evidence", async () => {
    const invalid = complete(); invalid.data.targetCourseCodes = ["NO-SUCH-CODE"];
    await expect(create(invalid)).rejects.toMatchObject({ status: 422 });
    const draft = await syntheticCatalogue("draft"), value = criteriaInput(versionId, draft.id); value.data.targetCourseCodes = ["101001"]; const c = await create(value);
    await expect(command("publish", c)).rejects.toMatchObject({ status: 422 });
  });
  it("does not publish overlapping scopes concurrently", async () => {
    const a = complete(); a.semester = 2;
    const x = await create(a), y = await create(a);
    const results = await Promise.allSettled([command("publish", x), command("publish", y)]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect(await db.trackCriteria.count({ where: { curriculumVersionId: versionId, status: "published", semester: 2 } })).toBe(1);
  });
  it("rolls back all replacement work on conflict and preserves old history", async () => {
    const copy = await command("copy", published), before = await criteriaHistory(admin, published.id);
    await expect(command("publish", copy, { replacesId: published.id, expectedReplacedEditVersion: published.editVersion + 1 })).rejects.toMatchObject({ status: 409 });
    expect((await criteriaHistory(admin, published.id)).events).toHaveLength(before.events.length);
    const replacement = await command("publish", copy, { replacesId: published.id, expectedReplacedEditVersion: published.editVersion });
    expect((await criteriaHistory(admin, published.id)).criteria.status).toBe("withdrawn");
    expect((await criteriaHistory(admin, replacement.id)).criteria.status).toBe("published");
    published = replacement;
  });
  it("resets copied rules when changing cohort and does not reuse original confirmation", async () => {
    const copy = await command("copy", published);
    const updated = await command("save", copy, { criteria: { ...copy, admissionYears: [2566] } });
    expect(updated.data.gpax.state).toBe("unknown");
    await expect(command("publish", updated)).rejects.toMatchObject({ status: 422 });
  });
  it("withdraws without deleting and no longer evaluates that rule", async () => {
    const withdrawn = await command("withdraw", published);
    expect(withdrawn.status).toBe("withdrawn");
    expect((await criteriaHistory(admin, withdrawn.id)).events.length).toBeGreaterThan(1);
    expect((await studentCriteria(student, { year: 2569, semester: 1 })).results[0].status).toBe("awaiting_criteria");
  });
});
