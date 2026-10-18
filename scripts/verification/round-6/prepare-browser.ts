import { config } from "dotenv";
import { mkdir, writeFile } from "node:fs/promises";
config({ quiet: true });
const target = new URL(process.env.TEST_DATABASE_URL || "");
if (target.pathname !== "/aps_v2_test" || !["localhost", "127.0.0.1"].includes(target.hostname)) throw new Error("Simulation browser requires local aps_v2_test");
if (!process.env.TEST_AUTH_SECRET || process.env.TEST_AUTH_SECRET.length < 32) throw new Error("Test auth secret required");
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
process.env.BETTER_AUTH_SECRET = process.env.TEST_AUTH_SECRET;
process.env.BETTER_AUTH_URL = "http://localhost:3101";
process.env.GOOGLE_CLIENT_ID = "fixture-client"; process.env.GOOGLE_CLIENT_SECRET = "fixture-client-secret";
const { prepareSimulationFixture, fingerprint } = await import("./fixtures");
const { getDatabase } = await import("../../../src/server/database");
try {
  const f = await prepareSimulationFixture();
  await mkdir("tests/.auth", { recursive: true });
  await writeFile("tests/.auth/round-6-simulation.json", JSON.stringify({ directory: f.directory, manifest: f.manifest, states: f.states, parameters: f.parameters, protectedBefore: await fingerprint(f.manifest, true), eligibility: f.eligibility }), { mode: 0o600 });
  console.log(JSON.stringify({ run: f.manifest.run, synthetic: true, realGoogle: false }));
} finally { await getDatabase().$disconnect(); }
