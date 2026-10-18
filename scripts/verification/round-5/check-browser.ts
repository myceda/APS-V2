import { readFile, writeFile } from "node:fs/promises";
import { config } from "dotenv";
config({ quiet: true });
const target = new URL(process.env.TEST_DATABASE_URL || "");
if (target.pathname !== "/aps_v2_test" || !["localhost", "127.0.0.1"].includes(target.hostname)) throw new Error("Plans audit requires local aps_v2_test");
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
const { fingerprint } = await import("./fixtures");
const { getDatabase } = await import("../../../src/server/database");
const fixture = JSON.parse(await readFile("tests/.auth/round-5-plans.json", "utf8"));
try {
  const outside = await fingerprint(fixture.manifest), business = await fingerprint(fixture.manifest, true);
  const result = { run: fixture.manifest.run, outsideUnchanged: JSON.stringify(outside) === JSON.stringify(fixture.manifest.outsideBefore), protectedBusinessUnchanged: JSON.stringify(business) === JSON.stringify(fixture.manifest.protectedBefore), outsideAfter: outside, protectedAfter: business };
  await writeFile(`${fixture.directory}/browser-integrity-${Date.now()}.json`, JSON.stringify(result, null, 2), { flag: "wx" });
  if (!result.outsideUnchanged || !result.protectedBusinessUnchanged) throw new Error("Planning browser changed protected data; inspect private evidence");
  console.log(JSON.stringify({ outsideUnchanged: true, protectedBusinessUnchanged: true }));
} finally { await getDatabase().$disconnect(); }
