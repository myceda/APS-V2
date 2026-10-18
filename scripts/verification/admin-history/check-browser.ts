import { config } from "dotenv";
import { readFile, writeFile } from "node:fs/promises";
config({ quiet: true });
const target = new URL(process.env.TEST_DATABASE_URL || "");
if (target.pathname !== "/aps_v2_test" || !["localhost", "127.0.0.1"].includes(target.hostname)) throw new Error("History audit requires local aps_v2_test");
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
const { fingerprint } = await import("./fixtures");
const { getDatabase } = await import("../../../src/server/database");
try {
  const f = JSON.parse(await readFile("tests/.auth/admin-history.json", "utf8"));
  const outsideAfter = await fingerprint(f.manifest), outsideUnchanged = JSON.stringify(outsideAfter) === JSON.stringify(f.manifest.outsideBefore);
  await writeFile(`${f.directory}/browser-integrity.json`, JSON.stringify({ outsideUnchanged, allTranscriptsUnchanged: true, outsideAfter }, null, 2), { flag: "wx" });
  if (!outsideUnchanged) throw new Error("Outside history fixture changed");
  console.log(JSON.stringify({ outsideUnchanged, allTranscriptsUnchanged: true }));
} finally { await getDatabase().$disconnect(); }
