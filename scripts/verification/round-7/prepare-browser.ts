import { config } from "dotenv";
import { mkdir, writeFile } from "node:fs/promises";
import ExcelJS from "exceljs";
config({ quiet: true });
const target = new URL(process.env.TEST_DATABASE_URL || "");
if (target.pathname !== "/aps_v2_test" || !["localhost", "127.0.0.1"].includes(target.hostname)) throw new Error("Admin audit requires local aps_v2_test");
if (!process.env.TEST_AUTH_SECRET || process.env.TEST_AUTH_SECRET.length < 32) throw new Error("Test auth secret required");
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL; process.env.BETTER_AUTH_SECRET = process.env.TEST_AUTH_SECRET;
process.env.BETTER_AUTH_URL = "http://localhost:3107";
process.env.GOOGLE_CLIENT_ID = "fixture-client"; process.env.GOOGLE_CLIENT_SECRET = "fixture-client-secret";
const { prepareAdminFixture } = await import("./fixtures");
const { getDatabase } = await import("../../../src/server/database");
const { createDataset, saveDataset } = await import("../../../src/server/academic");
const { adminData, importValues, importCsv } = await import("../../../tests/support/round-7-admin");
const { COURSE_COLUMNS } = await import("../../../src/modules/curriculum/csv");
try {
  const f = await prepareAdminFixture();
  const initial = [];
  for (const c of f.manifest.curricula) {
    const draft = await createDataset(f.contexts.both, c.versionId);
    initial.push(await saveDataset(f.contexts.both, draft.id, { expectedVersion: draft.editVersion, dataset: adminData(draft) }));
  }
  const imports: Record<string, string> = {};
  for (const [key, rows] of Object.entries({ mixed: [importValues(), importValues("R7102", "bad")], corrected: [importValues(), importValues("R7102")] })) {
    const csv = `${f.directory}/${key}.csv`, xlsx = `${f.directory}/${key}.xlsx`;
    await writeFile(csv, importCsv(rows), { flag: "wx" });
    const wb = new ExcelJS.Workbook(); wb.addWorksheet("Synthetic Round 7").addRows([COURSE_COLUMNS, ...rows]);
    await wb.xlsx.writeFile(xlsx); imports[`${key}Csv`] = csv; imports[`${key}Xlsx`] = xlsx;
  }
  const bad = `${f.directory}/bad.csv`; await writeFile(bad, "wrong,template\n1,2", { flag: "wx" }); imports.bad = bad;
  await mkdir("tests/.auth", { recursive: true });
  await writeFile("tests/.auth/round-7-admin.json", JSON.stringify({ ...f, contexts: undefined, initial, imports, data: adminData(initial[0]) }), { mode: 0o600 });
  console.log(JSON.stringify({ run: f.manifest.run, curricula: 2, syntheticAdmins: 3, realGoogle: false, directory: f.directory }));
} finally { await getDatabase().$disconnect(); }
