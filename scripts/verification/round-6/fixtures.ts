import { createHash, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import type { Prisma } from "../../../src/generated/prisma/client";
import { getDatabase } from "../../../src/server/database";
import { requireAccount } from "../../../src/server/account-context";
import { runAnalysis } from "../../../src/server/academic";
import { mutateCriteria, studentCriteria } from "../../../src/server/track-criteria";
import { parsePayload, transcriptIssues } from "../../../src/modules/transcript/validation";
import { createSessionFixture, assertTestDatabase } from "../../../tests/support/fixtures";
import { simulationData, simulationPayload, simulationParameters } from "../../../tests/support/round-6-simulation";
import { criteriaInput } from "../../../tests/support/track-criteria";
import { syntheticTranscript } from "../../../tests/support/synthetic-transcript";

export const asJson = (v: unknown): Prisma.InputJsonValue => JSON.parse(JSON.stringify(v));
export const hash = (v: string | Buffer) => createHash("sha256").update(v).digest("hex");
export interface SimulationFixture {
  run: string; curriculumId: string; versionId: string; datasetId: string;
  admin: { userId: string; accountId: string };
  accounts: { key: string; userId: string; accountId: string; enrollmentId: string; draftId: string; studentCode: string; analysisId: string | null }[];
  outsideBefore: Record<string, unknown>; outsideAfter: Record<string, unknown>;
}
export async function fingerprint(m: SimulationFixture, inside = false) {
  assertTestDatabase(); const db = getDatabase();
  const owners = [...m.accounts.map(a => a.accountId), m.admin.accountId], users = [...m.accounts.map(a => a.userId), m.admin.userId];
  const datasets = (await db.academicDataset.findMany({ where: { curriculumVersionId: m.versionId }, select: { id: true } })).map(r => r.id);
  const drafts = (await db.transcriptDraft.findMany({ where: { ownerAccountId: { in: owners } }, select: { id: true } })).map(r => r.id);
  const criteria = (await db.trackCriteria.findMany({ where: { curriculumVersionId: m.versionId }, select: { id: true } })).map(r => r.id);
  const rules: [string, string, string[]][] = [
    ["User", "id", users], ["Account", "userId", users], ["AccountAccess", "id", owners],
    ["Curriculum", "id", [m.curriculumId]], ["CurriculumVersion", "id", [m.versionId]], ["Track", "curriculumVersionId", [m.versionId]],
    ["StudentEnrollment", "accountAccessId", owners], ["CurriculumAdmin", "accountAccessId", owners], ["AuditEvent", "targetAccountId", owners],
    ["AcademicDataset", "curriculumVersionId", [m.versionId]], ["CatalogCourse", "datasetId", datasets], ["CourseOffering", "datasetId", datasets],
    ["TrackCriteria", "curriculumVersionId", [m.versionId]], ["TrackCriteriaEvent", "criteriaId", criteria],
    ["PrivateDocument", "ownerAccountId", owners], ["TranscriptDraft", "ownerAccountId", owners], ["DraftCourseAttempt", "draftId", drafts],
    ["TranscriptRevision", "ownerAccountId", owners], ["StudentAcademicState", "enrollmentId", m.accounts.map(a => a.enrollmentId)],
  ];
  if (!inside) rules.push(["Session", "userId", users], ["Verification", "id", []], ["EnrollmentRequest", "accountAccessId", owners], ["AnalysisRun", "ownerAccountId", owners], ["SimulationScenario", "ownerAccountId", owners]);
  const result: Record<string, unknown> = {};
  for (const [table, column, ids] of rules) {
    const rows = await db.$queryRawUnsafe<{ count: number; hash: string }[]>(`SELECT count(*)::int AS count, md5(COALESCE(string_agg(md5(to_jsonb(r)::text), '' ORDER BY md5(to_jsonb(r)::text)),'')) AS hash FROM "${table}" r WHERE ${inside ? "" : "NOT "}COALESCE(r."${column}" = ANY($1::uuid[]),false)`, ids);
    result[table] = rows[0];
  }
  return result;
}
export async function createCatalogue(m: SimulationFixture, version: number) {
  assertTestDatabase(); const data = simulationData();
  data.offerings.push({ courseCode: "517122", year: 2569, semester: 1, availability: "unknown", confidence: "planned", source: "Synthetic explicit unknown for What-if" });
  return getDatabase().academicDataset.create({ data: { ...(version === 1 ? { id: m.datasetId } : {}), curriculumVersionId: m.versionId, version, status: "published", source: "Synthetic mathematical subset, NOT full curriculum", policy: asJson(data.policy), groups: asJson(data.groups), unresolved: asJson(data.unresolved), courses: { create: data.courses.map(c => ({ ...c, prerequisite: asJson(c.prerequisite) })) }, offerings: { create: data.offerings } } });
}
export async function prepareSimulationFixture() {
  assertTestDatabase(); const db = getDatabase();
  const m: SimulationFixture = { run: randomUUID(), curriculumId: randomUUID(), versionId: randomUUID(), datasetId: randomUUID(), admin: { userId: randomUUID(), accountId: randomUUID() }, accounts: ["student", "other", "changing"].map((key, i) => ({ key, userId: randomUUID(), accountId: randomUUID(), enrollmentId: randomUUID(), draftId: randomUUID(), studentCode: String(6599000000 + i), analysisId: null })), outsideBefore: {}, outsideAfter: {} };
  const directory = `storage/simulation-audit/round-6/fixtures-${m.run}`;
  await mkdir(directory, { recursive: true });
  await writeFile(`${directory}/manifest.json`, JSON.stringify(m, null, 2), { flag: "wx", mode: 0o600 });
  m.outsideBefore = await fingerprint(m);
  await db.$transaction(async tx => {
    await tx.curriculum.create({ data: { id: m.curriculumId, code: `CS2565-WHATIF-${m.run}`, name: "ข้อมูลสาธิต What-if รอบ 6" } });
    await tx.curriculumVersion.create({ data: { id: m.versionId, curriculumId: m.curriculumId, code: `CS2565-WHATIF-${m.run}-v1` } });
    await tx.track.createMany({ data: ["project", "cooperative"].map(code => ({ curriculumVersionId: m.versionId, code, name: code === "project" ? "โครงงานวิจัย" : "สหกิจศึกษา" })) });
    for (const a of [m.admin, ...m.accounts]) {
      const email = `${m.run}.${a.accountId}@aps-tests.invalid`;
      await tx.user.create({ data: { id: a.userId, email, emailVerified: true, name: "ข้อมูลสาธิต What-if รอบ 6" } });
      await tx.account.create({ data: { userId: a.userId, providerId: "google", accountId: `round6-fixture:${email}` } });
      await tx.accountAccess.create({ data: { id: a.accountId, authUserId: a.userId, email, role: "key" in a ? "student" : "admin", canManageAccounts: false } });
    }
    await tx.curriculumAdmin.create({ data: { accountAccessId: m.admin.accountId, curriculumId: m.curriculumId } });
    for (const a of m.accounts) {
      await tx.studentEnrollment.create({ data: { id: a.enrollmentId, accountAccessId: a.accountId, curriculumVersionId: m.versionId, studentCode: a.studentCode, trackState: "not_selected", admissionYear: 2565, cohortSource: "Synthetic Round 6" } });
      let payload = simulationPayload();
      payload.header = { ...payload.header, studentCode: { ...payload.header.studentCode, value: a.studentCode }, program: { ...payload.header.program, value: "Computer Science" } };
      payload.attempts = payload.attempts.map(r => ({ ...r, gradePoints: (r.credits ?? 0) * (r.grade === "B" ? 3 : 0) }));
      payload = parsePayload(payload, payload);
      const issues = transcriptIssues(payload, { id: a.enrollmentId, studentCode: a.studentCode, curriculumId: m.curriculumId, curriculumCode: `CS2565-WHATIF-${m.run}`, curriculumVersionId: m.versionId, curriculumState: "draft", trackState: "not_selected", trackId: null, trackName: null });
      if (issues.some(i => i.severity === "blocking")) throw new Error("Synthetic transcript rejected by original validation");
      const content = syntheticTranscript(a.studentCode);
      const document = await tx.privateDocument.create({ data: { ownerAccountId: a.accountId, content: new Uint8Array(content), sha256: hash(content) } });
      await tx.transcriptDraft.create({ data: { id: a.draftId, documentId: document.id, ownerAccountId: a.accountId, enrollmentId: a.enrollmentId, status: "confirmed", header: asJson(payload.header), extracted: asJson(payload), summaries: asJson(payload.summaries), issues: asJson(issues), pages: 1, attempts: { create: payload.attempts } } });
      const revision = await tx.transcriptRevision.create({ data: { ownerAccountId: a.accountId, enrollmentId: a.enrollmentId, draftId: a.draftId, payload: asJson(payload) } });
      await tx.studentAcademicState.create({ data: { enrollmentId: a.enrollmentId, currentRevisionId: revision.id } });
    }
  }, { timeout: 30_000 });
  await createCatalogue(m, 1);
  const adminSession = await createSessionFixture(m.admin.userId), admin = await requireAccount(adminSession.headers);
  for (const track of ["project", "cooperative"] as const) {
    const c = criteriaInput(m.versionId, m.datasetId); c.track = track;
    c.data.gpax = { state: "specified", evidence: "Synthetic 3.10, NOT university rule", minimum: 3.1, throughYear: 2568, throughSemester: 2 };
    const draft = await mutateCriteria(admin, { action: "create", criteria: c, reason: "Synthetic Round 6" });
    await mutateCriteria(admin, { action: "publish", id: draft.id, expectedEditVersion: draft.editVersion, reason: "Synthetic Round 6" });
  }
  const contexts: Record<string, Awaited<ReturnType<typeof requireAccount>>> = {}, states: Record<string, unknown> = {};
  for (const a of m.accounts) {
    const session = await createSessionFixture(a.userId); contexts[a.key] = await requireAccount(session.headers);
    states[a.key] = { cookies: [session.cookie], origins: [] };
    a.analysisId = (await runAnalysis(contexts[a.key], simulationParameters)).id;
  }
  const eligibility = await studentCriteria(contexts.student, simulationParameters.currentTerm);
  m.outsideAfter = await fingerprint(m);
  if (JSON.stringify(m.outsideBefore) !== JSON.stringify(m.outsideAfter)) throw new Error("Outside fixture changed during preparation");
  await writeFile(`${directory}/manifest.json`, JSON.stringify(m, null, 2), { mode: 0o600 });
  await writeFile(`${directory}/sessions.json`, JSON.stringify(states), { flag: "wx", mode: 0o600 });
  return { manifest: m, contexts, states, directory, eligibility, parameters: simulationParameters };
}
