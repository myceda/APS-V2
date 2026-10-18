import { beforeAll, afterAll, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { prepareHistoryFixture, fingerprint } from "../../scripts/verification/admin-history/fixtures";
import { listDatasets, getDataset, createDataset, saveDataset, publishDataset } from "@/server/academic";
import { GET as listRoute } from "@/app/api/admin/academic/route";
import { GET as detailRoute } from "@/app/api/admin/academic/[id]/route";
import { createSessionFixture } from "../support/fixtures";
let f: Awaited<ReturnType<typeof prepareHistoryFixture>>;
const results: unknown[] = [];
beforeAll(async () => { f = await prepareHistoryFixture(); }, 60_000);
afterAll(async () => {
  if (!f) return;
  const outsideAfter = await fingerprint(f.manifest), outsideUnchanged = JSON.stringify(outsideAfter) === JSON.stringify(f.manifest.outsideBefore);
  await writeFile(`${f.directory}/integration.json`, JSON.stringify({ results, outsideUnchanged, outsideAfter }, null, 2), { flag: "wx" });
  expect(outsideUnchanged).toBe(true);
});
it("filters before paging: 65 A records traverse 30/30/5 and back without duplicate or missing versions", async () => {
  const versionId = f.manifest.curricula[0].versionId;
  const first = await listDatasets(f.contexts.both, { versionId });
  const second = await listDatasets(f.contexts.both, { versionId, beforeVersion: first.pageInfo.oldestVersion });
  const third = await listDatasets(f.contexts.both, { versionId, beforeVersion: second.pageInfo.oldestVersion });
  expect([first, second, third].map(p => p.datasets.length)).toEqual([30, 30, 5]);
  expect([first, second, third].flatMap(p => p.datasets.map(d => d.version))).toEqual(Array.from({ length: 65 }, (_, i) => 65 - i));
  expect((await listDatasets(f.contexts.both, { versionId, afterVersion: third.pageInfo.newestVersion })).datasets).toEqual(second.datasets);
  expect((await listDatasets(f.contexts.both, { versionId, afterVersion: second.pageInfo.newestVersion })).datasets).toEqual(first.datasets);
  expect(first.pageInfo.hasNewer).toBe(false); expect(third.pageInfo.hasOlder).toBe(false);
  expect(Object.keys(first.datasets[0]).sort()).toEqual(["id", "curriculumVersionId", "version", "status", "createdAt", "publishedAt"].sort());
  const b = await listDatasets(f.contexts.both, { versionId: f.manifest.curricula[1].versionId });
  expect(b.datasets).toHaveLength(7); expect(b.datasets.every(d => d.curriculumVersionId === f.manifest.curricula[1].versionId)).toBe(true);
  results.push({ case: "paging", expected: [30, 30, 5], actual: [first, second, third], otherCurriculum: b });
});
it("loads old details by ID and keeps published immutability and stale edit guards", async () => {
  const published = await getDataset(f.contexts.a, f.datasets.a[0].id), draft = await getDataset(f.contexts.a, f.datasets.a[1].id);
  expect(published.version).toBe(1); expect(published.courses[0].name).toContain("A ฉบับ 1"); expect(published.offerings).toHaveLength(1);
  await expect(saveDataset(f.contexts.a, published.id, { expectedVersion: published.editVersion, dataset: published })).rejects.toMatchObject({ code: "DATASET_IMMUTABLE" });
  const updated = await saveDataset(f.contexts.a, draft.id, { expectedVersion: draft.editVersion, dataset: { ...draft, source: draft.source + " updated" } });
  await expect(saveDataset(f.contexts.both, draft.id, { expectedVersion: draft.editVersion, dataset: draft })).rejects.toMatchObject({ status: 409 });
  await expect(publishDataset(f.contexts.both, draft.id, draft.editVersion)).rejects.toMatchObject({ status: 409 });
  expect(await getDataset(f.contexts.a, draft.id)).toEqual(updated);
  expect(await getDataset(f.contexts.a, published.id)).toEqual(published);
  results.push({ case: "old-details-and-guards", published, updated, rejected: ["immutable", "stale-save", "stale-publish"] });
});
it("rejects cross curriculum list and detail on service and HTTP", async () => {
  await expect(listDatasets(f.contexts.b, { versionId: f.manifest.curricula[0].versionId })).rejects.toMatchObject({ status: 403 });
  await expect(getDataset(f.contexts.b, f.datasets.a[0].id)).rejects.toMatchObject({ status: 403 });
  const headers = (await createSessionFixture(f.manifest.accounts.find(a => a.key === "b")!.userId)).headers;
  expect((await listRoute(new Request(`http://localhost:3101/api/admin/academic?versionId=${f.manifest.curricula[0].versionId}`, { headers }))).status).toBe(403);
  expect((await detailRoute(new Request("http://localhost:3101/api/admin/academic/id", { headers }), { params: Promise.resolve({ id: f.datasets.a[0].id }) })).status).toBe(403);
  await expect(getDataset(f.contexts.a, randomUUID())).rejects.toMatchObject({ status: 404 });
});
it("rejects malformed and duplicate query cursors with HTTP 422", async () => {
  const headers = (await createSessionFixture(f.manifest.accounts.find(a => a.key === "a")!.userId)).headers;
  for (const query of ["beforeVersion=0", "beforeVersion=abc", "beforeVersion=2&afterVersion=1", "beforeVersion=2&beforeVersion=3", "versionId=bad"]) {
    const r = await listRoute(new Request(`http://localhost:3101/api/admin/academic?${query}`, { headers })); expect(r.status).toBe(422);
  }
  expect((await detailRoute(new Request("http://localhost:3101/api/admin/academic/bad", { headers }), { params: Promise.resolve({ id: "bad" }) })).status).toBe(422);
});
it("returns an empty workspace without grants and requires admin authentication", async () => {
  const emptyVersion = await listDatasets(f.contexts.a, { versionId: f.manifest.curricula[2].versionId });
  expect(emptyVersion).toMatchObject({ datasets: [], selectedVersionId: f.manifest.curricula[2].versionId, pageInfo: { hasOlder: false, hasNewer: false, oldestVersion: null, newestVersion: null } });
  const empty = await listDatasets({ ...f.contexts.a, curriculumIds: [] });
  expect(empty).toMatchObject({ versions: [], datasets: [], selectedVersionId: null, pageInfo: { hasOlder: false, hasNewer: false } });
  await expect(listDatasets({ ...f.contexts.a, role: "student" })).rejects.toMatchObject({ status: 403 });
  await expect(getDataset({ ...f.contexts.a, role: "student" }, f.datasets.a[0].id)).rejects.toMatchObject({ status: 403 });
  expect((await listRoute(new Request("http://localhost:3101/api/admin/academic"))).status).toBe(401);
  expect((await detailRoute(new Request("http://localhost:3101/api/admin/academic/id"), { params: Promise.resolve({ id: f.datasets.a[0].id }) })).status).toBe(401);
});
it("inserting a new version while viewing older history does not shift the cursor or repeat records", async () => {
  const versionId = f.manifest.curricula[0].versionId;
  const first = await listDatasets(f.contexts.a, { versionId });
  const created = await createDataset(f.contexts.a, versionId); expect(created.version).toBe(66);
  const older = await listDatasets(f.contexts.a, { versionId, beforeVersion: first.pageInfo.oldestVersion });
  expect(older.datasets.map(d => d.version)).toEqual(Array.from({ length: 30 }, (_, i) => 35 - i));
  const newest = await listDatasets(f.contexts.a, { versionId, afterVersion: first.pageInfo.newestVersion });
  expect(newest.datasets.map(d => d.version)).toEqual([66]);
  results.push({ case: "concurrent-insert", first, older, newest });
});
