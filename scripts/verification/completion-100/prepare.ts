import { config } from "dotenv";
import { mkdir, writeFile } from "node:fs/promises";
config({ quiet: true });
const target = new URL(process.env.TEST_DATABASE_URL || "");
if (target.pathname !== "/aps_v2_test" || !["localhost", "127.0.0.1"].includes(target.hostname)) throw new Error("Completion requires local aps_v2_test");
if (!process.env.TEST_AUTH_SECRET || process.env.TEST_AUTH_SECRET.length < 32) throw new Error("Test secret required");
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
process.env.BETTER_AUTH_SECRET = process.env.TEST_AUTH_SECRET;
process.env.BETTER_AUTH_URL = "http://localhost:3101";
process.env.GOOGLE_CLIENT_ID = "fixture-client";
process.env.GOOGLE_CLIENT_SECRET = "fixture-client-secret";
const { preparePlanningFixture } = await import("../round-5/fixtures");
const { getDatabase } = await import("../../../src/server/database");
const { createSessionFixture } = await import("../../../tests/support/fixtures");
const fixtures: Record<string, unknown> = {};
try {
  for (const device of ["desktop", "mobile"]) {
    const fixture = await preparePlanningFixture();
    const session = await createSessionFixture(fixture.manifest.admin.userId);
    fixture.storageStates.admin = { cookies: [session.cookie], origins: [] };
    // A historical JSON result genuinely lacking the additive policy field.
    const oldId = fixture.manifest.accounts.find(a => a.key === "project")!.analysisId!;
    const old = await getDatabase().analysisRun.findUniqueOrThrow({ where: { id: oldId } });
    const result = JSON.parse(JSON.stringify(old.result));
    delete result.policy;
    await getDatabase().analysisRun.update({ where: { id: oldId }, data: { result } });
    fixtures[device] = { versionId: fixture.manifest.versionId, datasetId: fixture.manifest.datasetId, storageStates: fixture.storageStates };
  }
  await mkdir("tests/.auth", { recursive: true });
  await writeFile("tests/.auth/completion-100.json", JSON.stringify(fixtures), { mode: 0o600 });
  console.log("Completion: fresh per-device synthetic curricula and signed fixtures prepared in aps_v2_test; not real Google");
} finally { await getDatabase().$disconnect(); }
