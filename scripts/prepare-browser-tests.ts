import { mkdir, writeFile } from "node:fs/promises";
import { config } from "dotenv";
config({ quiet: true });
const target = new URL(process.env.TEST_DATABASE_URL || "");
if (
  target.pathname !== "/aps_v2_test" ||
  !["localhost", "127.0.0.1"].includes(target.hostname)
)
  throw new Error("Browser fixtures require local aps_v2_test");
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
if (!process.env.TEST_AUTH_SECRET || process.env.TEST_AUTH_SECRET.length < 32)
  throw new Error("TEST_AUTH_SECRET is required");
process.env.BETTER_AUTH_SECRET = process.env.TEST_AUTH_SECRET;
process.env.BETTER_AUTH_URL = "http://localhost:3101";
process.env.GOOGLE_CLIENT_ID = "";
process.env.GOOGLE_CLIENT_SECRET = "";
const { createIdentity, createSessionFixture } = await import(
  "../tests/support/fixtures"
);
const { getDatabase } = await import("../src/server/database");
const { syntheticTranscript } = await import(
  "../tests/support/synthetic-transcript"
);
try {
  await mkdir("tests/.auth", { recursive: true });
  for (const [name, role, manager] of [
    ["manager", "admin", true],
    ["admin", "admin", false],
    ["student", "student", false],
  ] as const) {
    const identity = await createIdentity(
      role,
      manager,
      `fixture-${name}@aps-tests.invalid`,
    );
    await getDatabase().session.deleteMany({
      where: { userId: identity.user.id },
    });
    const fixture = await createSessionFixture(identity.user.id);
    await writeFile(
      `tests/.auth/${name}.json`,
      JSON.stringify({ cookies: [fixture.cookie], origins: [] }),
      { mode: 0o600 },
    );
  }
  console.log(
    "เตรียม session fixtures ใน aps_v2_test แล้ว; ไม่ใช่ผลทดสอบ Google OAuth",
  );
  for (const device of ["desktop", "mobile"]) {
    // Dedicated track-criteria fixtures: no real accounts, no inferred admission year.
    const criteriaIdentity = await createIdentity("student", false, `fixture-criteria-${device}@aps-tests.invalid`);
    await getDatabase().simulationScenario.deleteMany({where:{ownerAccountId:criteriaIdentity.access.id}});
    await getDatabase().analysisRun.deleteMany({where:{ownerAccountId:criteriaIdentity.access.id}});
    await getDatabase().studentAcademicState.deleteMany({where:{enrollment:{accountAccessId:criteriaIdentity.access.id}}});
    await getDatabase().transcriptRevision.deleteMany({where:{ownerAccountId:criteriaIdentity.access.id}});
    await getDatabase().transcriptDraft.deleteMany({where:{ownerAccountId:criteriaIdentity.access.id}});
    await getDatabase().privateDocument.deleteMany({where:{ownerAccountId:criteriaIdentity.access.id}});
    await getDatabase().studentEnrollment.update({where:{accountAccessId:criteriaIdentity.access.id},data:{trackState:"not_selected",trackId:null,admissionYear:null,cohortSource:null,studentCode:device==="desktop"?"6500000701":"6500000702"}});
    await getDatabase().session.deleteMany({where:{userId:criteriaIdentity.user.id}});
    const criteriaSession = await createSessionFixture(criteriaIdentity.user.id);
    await writeFile(`tests/.auth/criteria-${device}.json`,JSON.stringify({cookies:[criteriaSession.cookie],origins:[]}),{mode:0o600});
    await writeFile(`tests/.auth/criteria-${device}.pdf`,syntheticTranscript(device==="desktop"?"6500000701":"6500000702"),{mode:0o600});

    const academic = await createIdentity(
      "student",
      false,
      `fixture-academic-${device}@aps-tests.invalid`,
    );
    const academicDatabase = getDatabase();
    await academicDatabase.simulationScenario.deleteMany({
      where: { ownerAccountId: academic.access.id },
    });
    await academicDatabase.analysisRun.deleteMany({
      where: { ownerAccountId: academic.access.id },
    });
    await academicDatabase.studentAcademicState.deleteMany({
      where: { enrollment: { accountAccessId: academic.access.id } },
    });
    await academicDatabase.transcriptRevision.deleteMany({
      where: { ownerAccountId: academic.access.id },
    });
    await academicDatabase.transcriptDraft.deleteMany({
      where: { ownerAccountId: academic.access.id },
    });
    await academicDatabase.privateDocument.deleteMany({
      where: { ownerAccountId: academic.access.id },
    });
    const syntheticCode = device === "desktop" ? "6500000001" : "6500000002";
    await academicDatabase.studentEnrollment.update({
      where: { accountAccessId: academic.access.id },
      data: {
        trackState: "not_selected",
        trackId: null,
        studentCode: syntheticCode,
      },
    });
    await academicDatabase.session.deleteMany({
      where: { userId: academic.user.id },
    });
    const academicFixture = await createSessionFixture(academic.user.id);
    await writeFile(
      `tests/.auth/academic-${device}.json`,
      JSON.stringify({ cookies: [academicFixture.cookie], origins: [] }),
      { mode: 0o600 },
    );
    await writeFile(
      `tests/.auth/academic-${device}.pdf`,
      syntheticTranscript(syntheticCode),
      { mode: 0o600 },
    );
    const allocationStudent = await createIdentity(
      "student",
      false,
      `fixture-allocation-${device}@aps-tests.invalid`,
    );
    const allocationDatabase = getDatabase();
    await allocationDatabase.simulationScenario.deleteMany({
      where: { ownerAccountId: allocationStudent.access.id },
    });
    await allocationDatabase.analysisRun.deleteMany({
      where: { ownerAccountId: allocationStudent.access.id },
    });
    await allocationDatabase.studentAcademicState.deleteMany({
      where: { enrollment: { accountAccessId: allocationStudent.access.id } },
    });
    await allocationDatabase.transcriptRevision.deleteMany({
      where: { ownerAccountId: allocationStudent.access.id },
    });
    await allocationDatabase.transcriptDraft.deleteMany({
      where: { ownerAccountId: allocationStudent.access.id },
    });
    await allocationDatabase.privateDocument.deleteMany({
      where: { ownerAccountId: allocationStudent.access.id },
    });
    const allocationCode = device === "desktop" ? "6500000101" : "6500000102";
    await allocationDatabase.studentEnrollment.update({
      where: { accountAccessId: allocationStudent.access.id },
      data: {
        trackState: "not_selected",
        trackId: null,
        studentCode: allocationCode,
      },
    });
    await allocationDatabase.session.deleteMany({
      where: { userId: allocationStudent.user.id },
    });
    const allocationFixture = await createSessionFixture(allocationStudent.user.id);
    await writeFile(
      `tests/.auth/allocation-${device}.json`,
      JSON.stringify({ cookies: [allocationFixture.cookie], origins: [] }),
      { mode: 0o600 },
    );
    await writeFile(
      `tests/.auth/allocation-${device}.pdf`,
      syntheticTranscript(allocationCode, "B", Array.from({ length: 7 }, (_, i) => ({ code: `99100${i+1}`, name: `Allocation Course ${i+1}` }))),
      { mode: 0o600 },
    );
    const switching = await createIdentity(
      "student",
      false,
      `fixture-switch-${device}@aps-tests.invalid`,
    );
    await getDatabase().session.deleteMany({
      where: { userId: switching.user.id },
    });
    const switchFixture = await createSessionFixture(switching.user.id);
    await writeFile(
      `tests/.auth/switch-${device}.json`,
      JSON.stringify({ cookies: [switchFixture.cookie], origins: [] }),
      { mode: 0o600 },
    );
    const identity = await createIdentity(
      "student",
      false,
      `fixture-onboarding-${device}@aps-tests.invalid`,
    );
    const database = getDatabase();
    // Reset only this named synthetic fixture, never demo accounts or the test DB.
    await database.simulationScenario.deleteMany({where:{ownerAccountId:identity.access.id}});
    await database.analysisRun.deleteMany({where:{ownerAccountId:identity.access.id}});
    await database.studentAcademicState.deleteMany({where:{enrollment:{accountAccessId:identity.access.id}}});
    await database.transcriptRevision.deleteMany({where:{ownerAccountId:identity.access.id}});
    await database.transcriptDraft.deleteMany({where:{ownerAccountId:identity.access.id}});
    await database.privateDocument.deleteMany({where:{ownerAccountId:identity.access.id}});
    await database.enrollmentRequest.deleteMany({
      where: { accountAccessId: identity.access.id },
    });
    await database.studentEnrollment.deleteMany({
      where: { accountAccessId: identity.access.id },
    });
    await database.session.deleteMany({ where: { userId: identity.user.id } });
    const fixture = await createSessionFixture(identity.user.id);
    await writeFile(
      `tests/.auth/onboarding-${device}.json`,
      JSON.stringify({ cookies: [fixture.cookie], origins: [] }),
      { mode: 0o600 },
    );
  }
} finally {
  await getDatabase().$disconnect();
}
