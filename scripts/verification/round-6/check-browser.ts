import { config } from "dotenv";
import { readFile, writeFile } from "node:fs/promises";
config({ quiet: true });
const target = new URL(process.env.TEST_DATABASE_URL || "");
if (target.pathname !== "/aps_v2_test" || !["localhost", "127.0.0.1"].includes(target.hostname)) throw new Error("Simulation audit requires local aps_v2_test");
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
const { fingerprint } = await import("./fixtures");
const { getDatabase } = await import("../../../src/server/database");
try {
  const f = JSON.parse(await readFile("tests/.auth/round-6-simulation.json", "utf8"));
  const outsideAfter = await fingerprint(f.manifest), protectedAfter = await fingerprint(f.manifest, true);
  const result = { outsideUnchanged: JSON.stringify(outsideAfter) === JSON.stringify(f.manifest.outsideBefore), protectedBusinessUnchanged: JSON.stringify(protectedAfter) === JSON.stringify(f.protectedBefore), outsideAfter, protectedAfter };
  await writeFile(`${f.directory}/browser-integrity-${Date.now()}.json`, JSON.stringify(result, null, 2), { flag: "wx" });
  if (!result.outsideUnchanged || !result.protectedBusinessUnchanged) throw new Error("Protected What-if fixture changed; inspect private evidence");
  console.log(JSON.stringify({ outsideUnchanged: true, protectedBusinessUnchanged: true }));
} finally { await getDatabase().$disconnect(); }
