import { config } from "dotenv";
import { mkdir, writeFile } from "node:fs/promises";
config({ quiet: true });
const target = new URL(process.env.TEST_DATABASE_URL || "");
if (target.pathname !== "/aps_v2_test" || !["localhost", "127.0.0.1"].includes(target.hostname)) throw new Error("History browser requires local aps_v2_test");
if (!process.env.TEST_AUTH_SECRET || process.env.TEST_AUTH_SECRET.length < 32) throw new Error("Test auth secret required");
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL; process.env.BETTER_AUTH_SECRET = process.env.TEST_AUTH_SECRET;
process.env.BETTER_AUTH_URL = "http://localhost:3108";
process.env.GOOGLE_CLIENT_ID = "fixture-client"; process.env.GOOGLE_CLIENT_SECRET = "fixture-client-secret";
const { prepareHistoryFixture, fingerprint } = await import("./fixtures");
const { getDatabase } = await import("../../../src/server/database");
try {
  const desktop = await prepareHistoryFixture(), mobile = await prepareHistoryFixture();
  const manifest = { run: desktop.manifest.run, curricula: [...desktop.manifest.curricula, ...mobile.manifest.curricula], accounts: [...desktop.manifest.accounts, ...mobile.manifest.accounts], outsideBefore: desktop.manifest.outsideBefore };
  const directory = `${desktop.directory}/browser`;
  await mkdir(directory, { recursive: true });
  const outsideAfter = await fingerprint(manifest);
  if (JSON.stringify(outsideAfter) !== JSON.stringify(manifest.outsideBefore)) throw new Error("Outside combined history fixture changed");
  await writeFile(`${directory}/manifest.json`, JSON.stringify({ ...manifest, projects: { desktop: { manifest: desktop.manifest, datasets: desktop.datasets }, mobile: { manifest: mobile.manifest, datasets: mobile.datasets } }, outsideAfter }, null, 2), { flag: "wx", mode: 0o600 });
  await mkdir("tests/.auth", { recursive: true });
  await writeFile("tests/.auth/admin-history.json", JSON.stringify({ manifest, directory, projects: { desktop: { ...desktop, contexts: undefined }, mobile: { ...mobile, contexts: undefined } } }), { mode: 0o600 });
  console.log(JSON.stringify({ run: manifest.run, directory, countsPerProject: { a: 65, b: 7 }, synthetic: true, realGoogle: false }));
} finally { await getDatabase().$disconnect(); }
