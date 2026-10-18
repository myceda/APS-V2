import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { getDatabase } from "../../../src/server/database";
import { requireAccount } from "../../../src/server/account-context";
import { assertTestDatabase, createSessionFixture } from "../../../tests/support/fixtures";

export interface AdminFixture {
  run: string;
  curricula: { id: string; versionId: string; code: string }[];
  accounts: { key: string; userId: string; accountId: string }[];
  outsideBefore: Record<string, unknown>;
}
// All identifiers are fixed application tables/columns; only UUID lists are parameters.
export async function fingerprint(m: AdminFixture) {
  assertTestDatabase(); const db = getDatabase();
  const curricula = m.curricula.map(c => c.id), versions = m.curricula.map(c => c.versionId);
  const accounts = m.accounts.map(a => a.accountId), users = m.accounts.map(a => a.userId);
  const datasets = (await db.academicDataset.findMany({ where: { curriculumVersionId: { in: versions } }, select: { id: true } })).map(r => r.id);
  const criteria = (await db.trackCriteria.findMany({ where: { curriculumVersionId: { in: versions } }, select: { id: true } })).map(r => r.id);
  const drafts = (await db.transcriptDraft.findMany({ where: { ownerAccountId: { in: accounts } }, select: { id: true } })).map(r => r.id);
  const enrollments = (await db.studentEnrollment.findMany({ where: { accountAccessId: { in: accounts } }, select: { id: true } })).map(r => r.id);
  const rules: [string, string, string[]][] = [
    ["User", "id", users], ["Account", "userId", users], ["Session", "userId", users], ["Verification", "id", []], ["AccountAccess", "id", accounts],
    ["Curriculum", "id", curricula], ["CurriculumVersion", "id", versions], ["Track", "curriculumVersionId", versions],
    ["CurriculumAdmin", "accountAccessId", accounts], ["AuditEvent", "targetAccountId", accounts],
    ["AcademicDataset", "curriculumVersionId", versions], ["CatalogCourse", "datasetId", datasets], ["CourseOffering", "datasetId", datasets],
    ["TrackCriteria", "curriculumVersionId", versions], ["TrackCriteriaEvent", "criteriaId", criteria],
    // Browser fixtures contain only admins: all transcript rows are protected.
    // Integration may add new synthetic students, excluded strictly by manifest ownership.
    ["StudentEnrollment", "accountAccessId", accounts], ["EnrollmentRequest", "accountAccessId", accounts], ["PrivateDocument", "ownerAccountId", accounts], ["TranscriptDraft", "ownerAccountId", accounts],
    ["DraftCourseAttempt", "draftId", drafts], ["TranscriptRevision", "ownerAccountId", accounts], ["StudentAcademicState", "enrollmentId", enrollments], ["AnalysisRun", "ownerAccountId", accounts], ["SimulationScenario", "ownerAccountId", accounts],
  ];
  const result: Record<string, unknown> = {};
  for (const [table, column, ids] of rules) {
    result[table] = (await db.$queryRawUnsafe<{ count: number; hash: string }[]>(`SELECT count(*)::int AS count, md5(COALESCE(string_agg(md5(to_jsonb(r)::text), '' ORDER BY md5(to_jsonb(r)::text)),'')) AS hash FROM "${table}" r WHERE NOT COALESCE(r."${column}" = ANY($1::uuid[]),false)`, ids))[0];
  }
  return result;
}
export async function prepareAdminFixture(withStudents = false) {
  assertTestDatabase(); const db = getDatabase(), run = randomUUID();
  const m: AdminFixture = { run, curricula: ["A", "B"].map(k => ({ id: randomUUID(), versionId: randomUUID(), code: `SYN-R7-${k}-${run}` })),
    accounts: ["both", "a", "b", ...(withStudents ? ["student-a", "student-b"] : [])].map(key => ({ key, userId: randomUUID(), accountId: randomUUID() })), outsideBefore: {} };
  const directory = `storage/admin-audit/round-7/fixtures-${run}`;
  await mkdir(directory, { recursive: true });
  await writeFile(`${directory}/manifest.json`, JSON.stringify(m, null, 2), { flag: "wx", mode: 0o600 });
  m.outsideBefore = await fingerprint(m);
  await db.$transaction(async tx => {
    for (const c of m.curricula) {
      await tx.curriculum.create({ data: { id: c.id, code: c.code, name: "ข้อมูลสาธิตหลักสูตรแยก รอบ 7" } });
      await tx.curriculumVersion.create({ data: { id: c.versionId, curriculumId: c.id, code: `${c.code}-v1` } });
      await tx.track.createMany({ data: ["project", "cooperative"].map(code => ({ curriculumVersionId: c.versionId, code, name: code })) });
    }
    for (const a of m.accounts) {
      const email = `${a.accountId}@aps-tests.invalid`;
      await tx.user.create({ data: { id: a.userId, email, emailVerified: true, name: "ข้อมูลสาธิตผู้ดูแล รอบ 7" } });
      await tx.account.create({ data: { userId: a.userId, providerId: "google", accountId: `fixture-r7:${email}` } });
      const student = a.key.startsWith("student-");
      await tx.accountAccess.create({ data: { id: a.accountId, authUserId: a.userId, email, role: student ? "student" : "admin", canManageAccounts: false } });
      if (student) {
        await tx.studentEnrollment.create({ data: { accountAccessId: a.accountId, studentCode: a.key === "student-a" ? "6599700001" : "6599700002", curriculumVersionId: m.curricula[a.key === "student-a" ? 0 : 1].versionId, trackState: "not_selected", admissionYear: 2565, cohortSource: "Synthetic Round 7 isolation" } });
        continue;
      }
      const grants = a.key === "both" ? m.curricula : [m.curricula[a.key === "a" ? 0 : 1]];
      await tx.curriculumAdmin.createMany({ data: grants.map(c => ({ accountAccessId: a.accountId, curriculumId: c.id })) });
    }
  });
  const states: Record<string, { cookies: Awaited<ReturnType<typeof createSessionFixture>>["cookie"][]; origins: [] }> = {};
  const contexts: Record<string, Awaited<ReturnType<typeof requireAccount>>> = {};
  for (const a of m.accounts) {
    const s = await createSessionFixture(a.userId); contexts[a.key] = await requireAccount(s.headers);
    states[a.key] = { cookies: [s.cookie], origins: [] };
  }
  const outsideAfter = await fingerprint(m);
  if (JSON.stringify(outsideAfter) !== JSON.stringify(m.outsideBefore)) throw new Error("Outside admin fixture changed during setup");
  await writeFile(`${directory}/manifest.json`, JSON.stringify(m, null, 2), { mode: 0o600 });
  return { manifest: m, directory, contexts, states };
}
