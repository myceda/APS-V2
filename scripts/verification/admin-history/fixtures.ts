import { mkdir, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import type { Prisma } from "../../../src/generated/prisma/client";
import { prepareAdminFixture, fingerprint } from "../round-7/fixtures";
import { assertTestDatabase } from "../../../tests/support/fixtures";
import { adminCourse, adminData, syntheticSource } from "../../../tests/support/round-7-admin";
import { blankDraft } from "../../../src/modules/curriculum/blank-draft";
import type { Dataset } from "../../../src/modules/curriculum/types";
import { getDatabase } from "../../../src/server/database";

export { fingerprint };
const json = (v: unknown): Prisma.InputJsonValue => JSON.parse(JSON.stringify(v));
export async function prepareHistoryFixture() {
  assertTestDatabase(); const f = await prepareAdminFixture();
  const directory = `storage/admin-history/fixtures-${f.manifest.run}`;
  await mkdir(directory, { recursive: true });
  await writeFile(`${directory}/manifest.json`, JSON.stringify({ ...f.manifest, datasetIds: [] }, null, 2), { flag: "wx", mode: 0o600 });
  const datasets: Record<string, { id: string; version: number }[]> = { a: [], b: [] };
  const emptyVersion = { id: f.manifest.curricula[0].id, versionId: randomUUID(), code: `ZZ-HISTORY-EMPTY-${f.manifest.run}` };
  f.manifest.curricula.push(emptyVersion);
  await getDatabase().$transaction(async db => {
    await db.curriculumVersion.create({ data: { id: emptyVersion.versionId, curriculumId: emptyVersion.id, code: emptyVersion.code } });
    for (const [index, count] of [65, 7].entries()) {
      const key = index === 0 ? "a" : "b", versionId = f.manifest.curricula[index].versionId;
      for (let version = 1; version <= count; version++) {
        const course = { ...adminCourse("HIST01"), name: `ข้อมูลสาธิต ${key.toUpperCase()} ฉบับ ${version}` };
        const data = adminData({ ...blankDraft(), id: "fixture", curriculumVersionId: versionId, version, editVersion: 1, status: "draft" } as Dataset);
        data.courses = [course]; data.groups[0].minimum = 3; data.policy.degreeCredits = 3;
        const row = await db.academicDataset.create({ data: {
          curriculumVersionId: versionId, version, status: version === 1 ? "published" : "draft", publishedAt: version === 1 ? new Date("2026-10-18T00:00:00Z") : null,
          source: `${syntheticSource} — ${key.toUpperCase()}/${version}`, policy: json(data.policy), groups: json(data.groups), unresolved: json(data.unresolved),
          courses: { create: [{ ...course, prerequisite: json(course.prerequisite) }] },
          offerings: { create: [{ courseCode: "HIST01", year: 2569, semester: 1, availability: "unknown", confidence: "planned", source: syntheticSource }] },
        }, select: { id: true, version: true } });
        datasets[key].push(row);
      }
    }
  }, { timeout: 30_000 });
  const outsideAfter = await fingerprint(f.manifest);
  if (JSON.stringify(outsideAfter) !== JSON.stringify(f.manifest.outsideBefore)) throw new Error("Outside history fixture changed during preparation");
  await writeFile(`${directory}/manifest.json`, JSON.stringify({ ...f.manifest, datasets, outsideAfter }, null, 2), { mode: 0o600 });
  return { ...f, directory, datasets };
}
