import { readFile, writeFile } from "node:fs/promises";
// The existing preparation always creates a new synthetic curriculum and users.
await import("../round-9/prepare-browser");
const { getDatabase } = await import("../../../src/server/database");
const { createIdentity, createSessionFixture, assertTestDatabase } = await import("../../../tests/support/fixtures");
const db = getDatabase();
assertTestDatabase();
try {
  const fixture = JSON.parse(await readFile("tests/.auth/round-9.json", "utf8"));
  await db.catalogCourse.update({ where: { datasetId_code: { datasetId: fixture.datasetId, code: "517122" } }, data: {
    prerequisite: { mode: "any", courses: ["517121", "517101"], concurrent: true, unresolved: null },
  } });
  // Analysis includes an immutable catalogue snapshot. Recalculate after changing
  // this synthetic rule instead of asserting against the old stored result.
  const { requireAccount } = await import("../../../src/server/account-context");
  const { runAnalysis } = await import("../../../src/server/academic");
  const { planParameters } = await import("../../../tests/support/round-5-plans");
  const cookie = fixture.storageStates["not-selected"].cookies[0];
  const context = await requireAccount(new Headers({ cookie: `${cookie.name}=${cookie.value}` }));
  await runAnalysis(context, planParameters);
  const students: Record<string, unknown> = {};
  for (const device of ["desktop", "mobile"]) for (const kind of ["mismatch", "lifecycle"]) {
    const identity = await createIdentity("student");
    const code = `67${String(Math.floor(Math.random() * 90_000_000) + 10_000_000)}`;
    await db.studentEnrollment.update({ where: { accountAccessId: identity.access.id }, data: { studentCode: code, trackState: "not_selected" } });
    const session = await createSessionFixture(identity.user.id);
    const reentries = [];
    for (let i = 0; i < 5; i++) reentries.push((await createSessionFixture(identity.user.id)).cookie);
    students[`${kind}-${device}`] = { code, storageState: { cookies: [session.cookie], origins: [] }, reentries };
  }
  await writeFile("tests/.auth/acceptance-followup.json", JSON.stringify({ ...fixture, students }), { mode: 0o600 });
  console.log("Fresh synthetic follow-up fixtures prepared in local aps_v2_test; no real Google");
} finally { await db.$disconnect(); }
