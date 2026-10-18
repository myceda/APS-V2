import { config } from "dotenv";
import { readFile, writeFile } from "node:fs/promises";
config({ quiet: true });
const target = new URL(process.env.TEST_DATABASE_URL || "");
if (target.pathname !== "/aps_v2_test" || !["localhost", "127.0.0.1"].includes(target.hostname)) throw new Error("Admin audit requires local aps_v2_test");
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
const { fingerprint } = await import("./fixtures");
const { getDatabase } = await import("../../../src/server/database");
try {
  const f = JSON.parse(await readFile("tests/.auth/round-7-admin.json", "utf8"));
  const outsideAfter = await fingerprint(f.manifest);
  const result = { outsideUnchanged: JSON.stringify(outsideAfter) === JSON.stringify(f.manifest.outsideBefore), includesAllTranscripts: true, outsideAfter };
  await writeFile(`${f.directory}/browser-integrity-${Date.now()}.json`, JSON.stringify(result, null, 2), { flag: "wx" });
  if (!result.outsideUnchanged) throw new Error("Outside admin fixture changed; inspect private evidence");
  const rows = await getDatabase().academicDataset.findMany({ where: { curriculumVersionId: { in: f.manifest.curricula.map((c: { versionId: string }) => c.versionId) } }, select: { id: true, curriculumVersionId: true, version: true, editVersion: true, status: true } });
  await writeFile(`${f.directory}/datasets-after.json`, JSON.stringify(rows, null, 2), { flag: "wx" });
  console.log(JSON.stringify({ outsideUnchanged: true, allTranscriptsUnchanged: true, ownedDatasets: rows.length }));
} finally { await getDatabase().$disconnect(); }
