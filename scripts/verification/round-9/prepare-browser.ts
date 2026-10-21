import { config } from "dotenv";
import { mkdir, writeFile } from "node:fs/promises";
config({ quiet: true });
const target = new URL(process.env.TEST_DATABASE_URL || "");
if (target.pathname !== "/aps_v2_test" || !["localhost", "127.0.0.1"].includes(target.hostname)) throw new Error("Round 9 requires local aps_v2_test");
if (!process.env.TEST_AUTH_SECRET || process.env.TEST_AUTH_SECRET.length < 32) throw new Error("Test secret required");
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
process.env.BETTER_AUTH_SECRET = process.env.TEST_AUTH_SECRET;
process.env.BETTER_AUTH_URL = "http://localhost:3101";
process.env.GOOGLE_CLIENT_ID = "fixture-client";
process.env.GOOGLE_CLIENT_SECRET = "fixture-client-secret";
const { preparePlanningFixture } = await import("../round-5/fixtures");
const { createIdentity, createSessionFixture } = await import("../../../tests/support/fixtures");
const { getDatabase } = await import("../../../src/server/database");
const { runAnalysis } = await import("../../../src/server/academic");
const { planParameters } = await import("../../../tests/support/round-5-plans");
try {
  const fixture = await preparePlanningFixture();
  // Deliberately synthetic combinations, never changes to the CS2565 source.
  for (const [code, data] of [
    ["517121", { name: "รายวิชาทดสอบชื่อยาวสำหรับตรวจการตัดบรรทัดและการอ่านบนโทรศัพท์ ".repeat(3).trim() }],
    ["517122", { prerequisite: { mode: "any", courses: ["517121", "517101"], concurrent: false, unresolved: null } }],
    ["517211", { prerequisite: { mode: "all", courses: ["517121", "517122"], concurrent: false, unresolved: null } }],
    ["517392", { requiresConsent: true }],
    ["517494", { prerequisite: { mode: "all", courses: ["517493"], concurrent: false, unresolved: "เงื่อนไขเพิ่มเติมยังไม่ยืนยัน — ข้อมูลทดสอบรอบ 9" } }],
  ] as const) await getDatabase().catalogCourse.update({ where: { datasetId_code: { datasetId: fixture.manifest.datasetId, code } }, data: JSON.parse(JSON.stringify(data)) });
  await runAnalysis(fixture.contexts["not-selected"], planParameters);
  const existing = await getDatabase().accountAccess.findFirst({ where: { canManageAccounts: true } });
  if (existing && !existing.email.endsWith("@aps-tests.invalid")) throw new Error("Refusing to use a non-synthetic test manager");
  const manager = await createIdentity("admin", true, existing?.email ?? "fixture-manager@aps-tests.invalid");
  await getDatabase().curriculumAdmin.create({ data: { accountAccessId: manager.access.id, curriculumId: fixture.manifest.curriculumId } });
  const session = await createSessionFixture(manager.user.id);
  const expired = await createSessionFixture(manager.user.id);
  await getDatabase().session.update({ where: { id: expired.session.id }, data: { expiresAt: new Date(Date.now() - 60_000) } });
  const expiredStudent = await createSessionFixture(fixture.manifest.accounts.find(a => a.key === "unknown")!.userId);
  await getDatabase().session.update({ where: { id: expiredStudent.session.id }, data: { expiresAt: new Date(Date.now() - 60_000) } });
  await mkdir("tests/.auth", { recursive: true });
  await writeFile("tests/.auth/round-9.json", JSON.stringify({
    storageStates: { ...fixture.storageStates, manager: { cookies: [session.cookie], origins: [] }, expiredManager: { cookies: [{ ...expired.cookie, expires: Math.floor(Date.now() / 1000) + 3600 }], origins: [] }, expiredStudent: { cookies: [{ ...expiredStudent.cookie, expires: Math.floor(Date.now() / 1000) + 3600 }], origins: [] } },
    versionId: fixture.manifest.versionId,
    datasetId: fixture.manifest.datasetId,
  }), { mode: 0o600 });
  console.log("Round 9: isolated synthetic planning accounts and manager ready in aps_v2_test; not real Google");
} finally { await getDatabase().$disconnect(); }
