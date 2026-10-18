// Isolated fixture graph. No deletes, no real accounts, no authentication endpoint.
import { createHash, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import type { Prisma } from "../../../src/generated/prisma/client";
import type { AccountContext, TrackState } from "../../../src/modules/accounts/types";
import type { StudyTrack } from "../../../src/modules/curriculum/types";
import { transcriptIssues, parsePayload } from "../../../src/modules/transcript/validation";
import { getDatabase } from "../../../src/server/database";
import { requireAccount } from "../../../src/server/account-context";
import { runAnalysis, studentWorkspace } from "../../../src/server/academic";
import { mutateCriteria, studentCriteria } from "../../../src/server/track-criteria";
import { assertTestDatabase, createSessionFixture } from "../../../tests/support/fixtures";
import { catalogue, planParameters, row } from "../../../tests/support/round-5-plans";
import { criteriaInput, transcript } from "../../../tests/support/track-criteria";
import { syntheticTranscript } from "../../../tests/support/synthetic-transcript";

const json = (value: unknown): Prisma.InputJsonValue => JSON.parse(JSON.stringify(value));
export const hash = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const recipes: { key: string; track: StudyTrack | null; state: TrackState; cohort: number; grade?: string }[] = [
  { key: "not-selected", track: null, state: "not_selected", cohort: 2565 },
  { key: "project", track: "project", state: "selected", cohort: 2565 },
  { key: "cooperative", track: "cooperative", state: "selected", cohort: 2565 },
  { key: "unknown", track: null, state: "unknown", cohort: 2565 },
  { key: "absent", track: null, state: "not_selected", cohort: 2566 },
  { key: "wrong-cohort", track: null, state: "not_selected", cohort: 2567 },
  { key: "wrong-round", track: null, state: "not_selected", cohort: 2569 },
  { key: "expired", track: null, state: "not_selected", cohort: 2570 },
  { key: "failed", track: null, state: "not_selected", cohort: 2565, grade: "D" },
  { key: "pending", track: null, state: "not_selected", cohort: 2565, grade: "I" },
];
export interface PlanningFixture {
  run: string; curriculumId: string; versionId: string; datasetId: string; trackIds: Record<StudyTrack, string>;
  admin: { accountId: string; userId: string };
  accounts: { key: string; accountId: string; userId: string; enrollmentId: string; draftId: string; documentId: string; studentCode: string; analysisId: string | null }[];
  outsideBefore: Record<string, unknown>; outsideAfter: Record<string, unknown>; protectedBefore: Record<string, unknown>;
}
// Fixed identifiers only. IDs remain SQL parameters; no rows, names, tokens or URLs leave SQL.
export async function fingerprint(m: PlanningFixture, inside = false) {
  assertTestDatabase(); const db = getDatabase();
  const accounts = [...m.accounts.map(a => a.accountId), m.admin.accountId], users = [...m.accounts.map(a => a.userId), m.admin.userId];
  const criteria = await db.trackCriteria.findMany({ where: { curriculumVersionId: m.versionId }, select: { id: true } });
  const rules: [string, string, string[]][] = [
    ["User", "id", users], ["Account", "userId", users], ["AccountAccess", "id", accounts],
    ["Curriculum", "id", [m.curriculumId]], ["CurriculumVersion", "id", [m.versionId]], ["Track", "curriculumVersionId", [m.versionId]],
    ["StudentEnrollment", "accountAccessId", accounts], ["CurriculumAdmin", "accountAccessId", accounts], ["AuditEvent", "targetAccountId", accounts],
    ["AcademicDataset", "id", [m.datasetId]], ["CatalogCourse", "datasetId", [m.datasetId]], ["CourseOffering", "datasetId", [m.datasetId]],
    ["TrackCriteria", "curriculumVersionId", [m.versionId]], ["TrackCriteriaEvent", "criteriaId", criteria.map(c => c.id)],
    ["PrivateDocument", "ownerAccountId", accounts], ["TranscriptDraft", "ownerAccountId", accounts], ["DraftCourseAttempt", "draftId", m.accounts.map(a => a.draftId)],
    ["TranscriptRevision", "ownerAccountId", accounts], ["StudentAcademicState", "enrollmentId", m.accounts.map(a => a.enrollmentId)],
  ];
  if (!inside) rules.push(["Session", "userId", users], ["Verification", "id", []], ["EnrollmentRequest", "accountAccessId", accounts], ["AnalysisRun", "ownerAccountId", accounts], ["SimulationScenario", "ownerAccountId", accounts]);
  const result: Record<string, unknown> = {};
  for (const [table, column, ids] of rules) {
    const rows = await db.$queryRawUnsafe<{ count: number; hash: string }[]>(`SELECT count(*)::int AS count, md5(COALESCE(string_agg(md5(to_jsonb(r)::text), '' ORDER BY md5(to_jsonb(r)::text)),'')) AS hash FROM "${table}" r WHERE ${inside ? "" : "NOT "}COALESCE(r."${column}" = ANY($1::uuid[]),false)`, ids);
    result[table] = rows[0];
  }
  return result;
}
export async function preparePlanningFixture() {
  assertTestDatabase(); const db = getDatabase();
  const m: PlanningFixture = { run: randomUUID(), curriculumId: randomUUID(), versionId: randomUUID(), datasetId: randomUUID(), trackIds: { project: randomUUID(), cooperative: randomUUID() }, admin: { accountId: randomUUID(), userId: randomUUID() }, accounts: recipes.map((r, i) => ({ key: r.key, accountId: randomUUID(), userId: randomUUID(), enrollmentId: randomUUID(), draftId: randomUUID(), documentId: randomUUID(), studentCode: String(6598000000 + i), analysisId: null })), outsideBefore: {}, outsideAfter: {}, protectedBefore: {} };
  const directory = `storage/planning-audit/round-5/fixtures-${m.run}`;
  await mkdir(directory, { recursive: true });
  await writeFile(`${directory}/manifest.json`, JSON.stringify(m, null, 2), { flag: "wx", mode: 0o600 });
  m.outsideBefore = await fingerprint(m);
  const data = catalogue();
  data.offerings.push(...([
    { courseCode: "517121", year: 2569, semester: 1, availability: "open" as const },
    { courseCode: "517122", year: 2569, semester: 1, availability: "closed" as const },
    { courseCode: "517261", year: 2569, semester: 1, availability: "unknown" as const },
    { courseCode: "517122", year: 2569, semester: 2, availability: "open" as const },
    { courseCode: "517211", year: 2569, semester: 3, availability: "open" as const },
  ] as const).map(o => ({ ...o, confidence: "planned" as const, source: "ข้อมูลทดสอบรอบ 5 ไม่ใช่ตารางมหาวิทยาลัย" })));
  data.offerings.push(...data.courses.filter(c => ["517392", "517393", "517493", "517494", "517496", "517497"].includes(c.code)).flatMap(c => ([1, 2, 3] as const).map(semester => ({ courseCode: c.code, year: 0, semester, availability: "open" as const, confidence: "planned" as const, source: "ข้อมูลทดสอบรอบ 5 วิชาเฉพาะสาย ไม่ใช่ตารางมหาวิทยาลัย" }))));
  await db.$transaction(async tx => {
    await tx.curriculum.create({ data: { id: m.curriculumId, code: `CS2565-ROUND5-${m.run}`, name: "ข้อมูลทดสอบแผนรอบ 5" } });
    await tx.curriculumVersion.create({ data: { id: m.versionId, curriculumId: m.curriculumId, code: `CS2565-ROUND5-${m.run}-v1` } });
    await tx.track.createMany({ data: (["project", "cooperative"] as const).map(code => ({ id: m.trackIds[code], curriculumVersionId: m.versionId, code, name: code === "project" ? "โครงงานวิจัย" : "สหกิจศึกษา" })) });
    await tx.academicDataset.create({ data: { id: m.datasetId, curriculumVersionId: m.versionId, version: 1, status: "published", source: "Synthetic CS2565 copy for Round 5 ONLY", policy: json(data.policy), groups: json(data.groups), unresolved: json(data.unresolved), courses: { create: data.courses.map(c => ({ ...c, prerequisite: json(c.prerequisite) })) }, offerings: { create: data.offerings } } });
    for (const a of [m.admin, ...m.accounts]) {
      const email = `${m.run}.${a.accountId}@aps-tests.invalid`;
      await tx.user.create({ data: { id: a.userId, email, name: "ข้อมูลทดสอบแผนรอบ 5", emailVerified: true } });
      await tx.account.create({ data: { userId: a.userId, providerId: "google", accountId: `round5-fixture:${email}` } });
      await tx.accountAccess.create({ data: { id: a.accountId, email, authUserId: a.userId, role: "key" in a ? "student" : "admin", canManageAccounts: false } });
    }
    await tx.curriculumAdmin.create({ data: { accountAccessId: m.admin.accountId, curriculumId: m.curriculumId } });
    for (const a of m.accounts) {
      const recipe = recipes.find(r => r.key === a.key)!;
      await tx.studentEnrollment.create({ data: { id: a.enrollmentId, accountAccessId: a.accountId, curriculumVersionId: m.versionId, studentCode: a.studentCode, trackState: recipe.state, trackId: recipe.track ? m.trackIds[recipe.track] : null, admissionYear: recipe.cohort, cohortSource: "Synthetic cohort, not registrar evidence" } });
      let payload = transcript([row("517101", recipe.grade ?? "B"), row("511108", recipe.grade ?? "B", 1), row("517121", "W", 2)]);
      // Fixture source explicitly supplies quality points, including zero for W/I.
      payload.attempts = payload.attempts.map(r => ({ ...r, gradePoints: (r.credits ?? 0) * (r.grade === "B" ? 3 : r.grade === "D" ? 1 : 0) }));
      payload.header = { ...payload.header, studentCode: { ...payload.header.studentCode, value: a.studentCode }, program: { ...payload.header.program, value: "Computer Science" }, track: recipe.track, trackState: recipe.state };
      payload = parsePayload(payload, payload);
      const issues = transcriptIssues(payload, { id: a.enrollmentId, studentCode: a.studentCode, curriculumId: m.curriculumId, curriculumCode: `CS2565-ROUND5-${m.run}`, curriculumVersionId: m.versionId, curriculumState: "draft", trackName: recipe.track, trackState: recipe.state, trackId: recipe.track ? m.trackIds[recipe.track] : null });
      if (a.key !== "unknown" && issues.some(i => i.severity === "blocking")) throw new Error(`Invalid synthetic fixture: ${a.key}: ${issues.filter(i => i.severity === "blocking").map(i => i.code).join(",")}`);
      const content = syntheticTranscript(a.studentCode);
      await tx.privateDocument.create({ data: { id: a.documentId, ownerAccountId: a.accountId, content: new Uint8Array(content), sha256: hash(content) } });
      await tx.transcriptDraft.create({ data: { id: a.draftId, documentId: a.documentId, enrollmentId: a.enrollmentId, ownerAccountId: a.accountId, status: a.key === "unknown" ? "draft" : "confirmed", header: json(payload.header), extracted: json(payload), summaries: json(payload.summaries), pages: 1, issues: json(issues), attempts: { create: payload.attempts } } });
      if (a.key !== "unknown") {
        const revision = await tx.transcriptRevision.create({ data: { draftId: a.draftId, ownerAccountId: a.accountId, enrollmentId: a.enrollmentId, payload: json(payload) } });
        await tx.studentAcademicState.create({ data: { enrollmentId: a.enrollmentId, currentRevisionId: revision.id } });
      }
    }
  }, { timeout: 30_000 });
  const adminSession = await createSessionFixture(m.admin.userId), admin = await requireAccount(adminSession.headers);
  for (const [cohort, semester, expired] of [[2565, 1, false], [2568, 1, false], [2569, 2, false], [2570, 1, true]] as const) {
    for (const track of ["project", "cooperative"] as const) {
      const c = criteriaInput(m.versionId, m.datasetId); c.admissionYears = [cohort]; c.semester = semester; c.track = track;
      c.data.gpax = { state: "specified", evidence: "Synthetic 2.50, not university criteria", minimum: 2.5, throughYear: 2568, throughSemester: 2 };
      if (track === "cooperative") c.data.manual = { state: "specified", evidence: "Synthetic", description: "ต้องตรวจเงื่อนไขเพิ่มเติม", responsibleUnit: "เจ้าหน้าที่สาธิต" };
      if (expired) { c.data.effectiveFrom = "2000-01-01"; c.data.effectiveUntil = "2020-12-31"; }
      const draft = await mutateCriteria(admin, { action: "create", criteria: c, reason: "Synthetic Round 5" });
      await mutateCriteria(admin, { action: "publish", id: draft.id, expectedEditVersion: draft.editVersion, reason: "Synthetic Round 5" });
    }
  }
  const contexts: Record<string, AccountContext> = {}, storageStates: Record<string, unknown> = {};
  for (const a of m.accounts) {
    const session = await createSessionFixture(a.userId);
    contexts[a.key] = await requireAccount(session.headers);
    storageStates[a.key] = { cookies: [session.cookie], origins: [] };
    if (a.key !== "unknown") a.analysisId = (await runAnalysis(contexts[a.key], planParameters)).id;
  }
  m.outsideAfter = await fingerprint(m);
  if (JSON.stringify(m.outsideBefore) !== JSON.stringify(m.outsideAfter)) throw new Error("Outside fixture data changed during preparation");
  m.protectedBefore = await fingerprint(m, true);
  await writeFile(`${directory}/manifest.json`, JSON.stringify(m, null, 2), { mode: 0o600 });
  await writeFile(`${directory}/sessions.json`, JSON.stringify(storageStates), { flag: "wx", mode: 0o600 });
  const observations = [];
  for (const a of m.accounts) observations.push({ key: a.key, criteria: await studentCriteria(contexts[a.key], planParameters.currentTerm), workspace: await studentWorkspace(contexts[a.key]) });
  await writeFile(`${directory}/observations.json`, JSON.stringify(observations, null, 2), { flag: "wx", mode: 0o600 });
  return { manifest: m, contexts, directory, storageStates };
}
