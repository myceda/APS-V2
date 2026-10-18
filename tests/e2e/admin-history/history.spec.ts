import { test, expect, type Page, type BrowserContext, type APIRequestContext } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";
import type { Dataset, DatasetHistory } from "../../../src/modules/curriculum/types";
import type { AdminFixture } from "../../../scripts/verification/round-7/fixtures";
const f = JSON.parse(readFileSync("tests/.auth/admin-history.json", "utf8")) as {
  directory: string; projects: Record<string, { manifest: AdminFixture; datasets: Record<string, { id: string; version: number }[]>; states: Record<string, Awaited<ReturnType<BrowserContext["storageState"]>>> }>;
};
const origin = "http://localhost:3108", pageErrors = new WeakMap<Page, string[]>();
const fixture = () => f.projects[test.info().project.name];
const summaries = (page: Page) => page.getByRole("combobox", { name: "ชุดข้อมูลที่เปิดดู", exact: true });
const versions = (page: Page) => page.getByRole("combobox", { name: "หลักสูตรที่ดูแล", exact: true });
const heading = (page: Page, version: number) => page.getByRole("heading", { name: `ชุดข้อมูลฉบับ ${version}`, exact: true });
test.beforeEach(async ({ context, page }, info) => {
  await context.addCookies(f.projects[info.project.name].states.both.cookies);
  const errors: string[] = []; pageErrors.set(page, errors); page.on("pageerror", e => errors.push(e.message));
});
test.afterEach(async ({ page }, info) => {
  expect(pageErrors.get(page)).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: `${f.directory}/${info.project.name}-${info.title}.png`, fullPage: true });
});
function evidence(key: string, data: unknown) { writeFileSync(`${f.directory}/${test.info().project.name}-${key}.json`, JSON.stringify(data, null, 2), { flag: "wx" }); }
async function start(page: Page) { await page.goto("/admin/academic"); await expect(heading(page, 65)).toBeVisible(); }
async function older(page: Page, version: number) { await page.getByRole("button", { name: "เก่ากว่านี้", exact: true }).click(); await expect(heading(page, version)).toBeVisible(); }
async function detail(request: APIRequestContext, id: string): Promise<Dataset> { const r = await request.get(`/api/admin/academic/${id}`); expect(r.status()).toBe(200); return r.json(); }
async function post(request: APIRequestContext, data: unknown, status = 200) { const r = await request.post("/api/admin/academic", { headers: { origin }, data }); expect(r.status()).toBe(status); return r.json(); }
async function visibleVersions(page: Page) { return summaries(page).locator('option:not([value=""])').evaluateAll(rows => rows.map(r => Number(r.textContent!.match(/ฉบับ (\d+)/)![1]))); }

test("paging-65-oldest-and-back", async ({ page, context }) => {
  const detailRequests: string[] = [];
  page.on("request", r => { if (/\/api\/admin\/academic\/[0-9a-f-]{36}$/.test(new URL(r.url()).pathname) && r.method() === "GET") detailRequests.push(r.url()); });
  await start(page);
  await expect(page.getByRole("button", { name: "ใหม่กว่านี้", exact: true })).toBeDisabled();
  const first = await visibleVersions(page); expect(first).toEqual(Array.from({ length: 30 }, (_, i) => 65 - i));
  const list: DatasetHistory = await (await context.request.get(`/api/admin/academic?versionId=${fixture().manifest.curricula[0].versionId}`)).json();
  expect(list.datasets).toHaveLength(30);
  for (const s of list.datasets) expect(Object.keys(s).sort()).toEqual(["id", "curriculumVersionId", "version", "status", "createdAt", "publishedAt"].sort());
  expect(detailRequests).toHaveLength(1);
  await older(page, 35); const second = await visibleVersions(page);
  await older(page, 5); const third = await visibleVersions(page);
  expect([first.length, second.length, third.length]).toEqual([30, 30, 5]);
  expect([...first, ...second, ...third]).toEqual(Array.from({ length: 65 }, (_, i) => 65 - i));
  await expect(page.getByRole("button", { name: "เก่ากว่านี้", exact: true })).toBeDisabled();
  await summaries(page).selectOption(fixture().datasets.a[0].id); await expect(heading(page, 1)).toBeVisible();
  await expect(page.getByLabel("แหล่งข้อมูลหลักสูตร", { exact: true })).toHaveValue(/A\/1$/);
  await expect(page.getByLabel("แหล่งข้อมูลหลักสูตร", { exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "แก้ HIST01", exact: true })).toBeDisabled();
  await page.screenshot({ path: `${f.directory}/${test.info().project.name}-oldest-published.png`, fullPage: true });
  await page.getByRole("button", { name: "ใหม่กว่านี้", exact: true }).click(); await expect(heading(page, 35)).toBeVisible(); expect(await visibleVersions(page)).toEqual(second);
  await page.getByRole("button", { name: "ใหม่กว่านี้", exact: true }).click(); await expect(heading(page, 65)).toBeVisible(); expect(await visibleVersions(page)).toEqual(first);
  expect(detailRequests).toHaveLength(6);
  evidence("paging", { expected: [30, 30, 5], actual: [first, second, third], detailRequests, firstList: list, oldId: fixture().datasets.a[0].id });
});

test("scope-and-seven-records", async ({ page, browser, context }) => {
  await start(page); const versionId = fixture().manifest.curricula[1].versionId;
  await versions(page).selectOption(versionId); await expect(heading(page, 7)).toBeVisible();
  expect(await visibleVersions(page)).toEqual([7, 6, 5, 4, 3, 2, 1]);
  await expect(page.getByLabel("แหล่งข้อมูลหลักสูตร", { exact: true })).toHaveValue(/B\/7$/);
  await expect(page.getByRole("button", { name: "เก่ากว่านี้", exact: true })).toBeDisabled();
  const outsider = await browser.newContext({ baseURL: origin, storageState: fixture().states.b });
  try {
    const deniedList = await outsider.request.get(`/api/admin/academic?versionId=${fixture().manifest.curricula[0].versionId}`);
    const deniedDetail = await outsider.request.get(`/api/admin/academic/${fixture().datasets.a[0].id}`);
    expect(deniedList.status()).toBe(403); expect(deniedDetail.status()).toBe(403);
    const a = await detail(context.request, fixture().datasets.a[0].id), b = await detail(outsider.request, fixture().datasets.b[0].id);
    expect(a.courses[0].name).toContain("A ฉบับ 1"); expect(b.courses[0].name).toContain("B ฉบับ 1");
    evidence("scope", { expected: 7, actual: await visibleVersions(page), deniedList: deniedList.status(), deniedDetail: deniedDetail.status(), a, b });
  } finally { await outsider.close(); }
});

test("empty-version", async ({ page, context }) => {
  await start(page);
  const id = fixture().manifest.curricula[2].versionId;
  await versions(page).selectOption(id);
  await expect(page.getByText("ยังไม่มีชุดข้อมูลของฉบับหลักสูตรนี้", { exact: true })).toBeVisible();
  expect(await visibleVersions(page)).toEqual([]);
  await expect(page.getByLabel("แหล่งข้อมูลหลักสูตร", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "เก่ากว่านี้", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "ใหม่กว่านี้", exact: true })).toBeDisabled();
  const actual = await (await context.request.get(`/api/admin/academic?versionId=${id}`)).json();
  expect(actual.datasets).toEqual([]); expect(actual.selectedVersionId).toBe(id);
  evidence("empty", { expected: [], actual });
});

test("loading-error-and-retry", async ({ page }) => {
  let calls = 0, release: (() => void) | undefined;
  await page.route("**/api/admin/academic/*", async route => {
    calls++;
    if (calls === 1) { await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: { message: "โหลดฉบับข้อมูลไม่สำเร็จ (กรณีสังเคราะห์)" } }) }); return; }
    if (calls === 2) await new Promise<void>(resolve => { release = resolve; });
    await route.continue();
  });
  try {
    await page.goto("/admin/academic"); await expect(page.getByRole("main").getByRole("alert")).toContainText("โหลดฉบับข้อมูลไม่สำเร็จ");
    await summaries(page).selectOption(fixture().datasets.a[64].id);
    await expect(summaries(page)).toBeDisabled(); await expect(versions(page)).toBeDisabled();
    await expect(page.getByRole("button", { name: "เก่ากว่านี้", exact: true })).toBeDisabled();
    await expect.poll(() => Boolean(release)).toBe(true); release!();
    await expect(heading(page, 65)).toBeVisible(); await expect(page.getByRole("main").getByRole("alert")).toHaveCount(0);
    evidence("error-retry", { syntheticHttpFailure: 503, requests: calls, retriedVersion: 65, controlsBlockedDuringLoad: true });
  } finally { release?.(); await page.unrouteAll({ behavior: "wait" }); }
});

test("old-save-publish-and-conflict", async ({ page, context }) => {
  await start(page); await older(page, 35); await older(page, 5);
  const original = await detail(context.request, fixture().datasets.a[0].id), before = await detail(context.request, fixture().datasets.a[1].id);
  await summaries(page).selectOption(before.id); await expect(heading(page, 2)).toBeVisible();
  await page.getByLabel("แหล่งข้อมูลหลักสูตร", { exact: true }).fill("ข้อมูลสาธิต บันทึกฉบับเก่า");
  await expect(page.getByRole("button", { name: "ใหม่กว่านี้", exact: true })).toBeDisabled();
  await expect(summaries(page)).toBeDisabled(); await expect(versions(page)).toBeDisabled();
  await page.getByRole("button", { name: "บันทึกร่างข้อมูล", exact: true }).click();
  await expect(page.getByText("บันทึกร่างแล้ว ยังไม่เผยแพร่", { exact: true })).toBeVisible();
  await expect(heading(page, 2)).toBeVisible(); expect(await visibleVersions(page)).toEqual([5, 4, 3, 2, 1]);
  const saved = await detail(context.request, before.id);
  await post(context.request, { action: "save", id: before.id, expectedVersion: before.editVersion, dataset: before }, 409);
  await page.getByRole("button", { name: "ตรวจและเผยแพร่", exact: true }).click();
  await page.getByRole("button", { name: "ตรวจและเผยแพร่ฉบับ", exact: true }).click();
  await expect(page.getByLabel("แหล่งข้อมูลหลักสูตร", { exact: true })).toBeDisabled();
  await expect(heading(page, 2)).toBeVisible(); expect(await visibleVersions(page)).toEqual([5, 4, 3, 2, 1]);
  const published = await detail(context.request, before.id);
  await post(context.request, { action: "save", id: original.id, expectedVersion: original.editVersion, dataset: original }, 409);
  expect(await detail(context.request, original.id)).toEqual(original);
  evidence("old-edit", { before, saved, published, preservedOriginal: original, currentVersions: await visibleVersions(page), staleSaveStatus: 409, immutableStatus: 409 });
});

test("concurrent-insert-copy-create", async ({ page, context }) => {
  await start(page); const versionId = fixture().manifest.curricula[0].versionId;
  const inserted: Dataset = await post(context.request, { action: "create", versionId }, 201); expect(inserted.version).toBe(66);
  await older(page, 35); const olderVersions = await visibleVersions(page);
  expect(olderVersions).toEqual(Array.from({ length: 30 }, (_, i) => 35 - i));
  const original = await detail(context.request, fixture().datasets.a[34].id);
  await page.getByRole("button", { name: "สร้างสำเนาเป็นร่างใหม่", exact: true }).click();
  await expect(page.getByText("สร้างร่างฉบับใหม่แล้ว ฉบับเดิมไม่เปลี่ยน", { exact: true })).toBeVisible(); await expect(heading(page, 67)).toBeVisible();
  const copyId = await summaries(page).inputValue(), copied = await detail(context.request, copyId);
  expect(copied.courses).toEqual(original.courses); expect(copied.id).not.toBe(original.id); expect((await visibleVersions(page))[0]).toBe(67);
  expect(await detail(context.request, original.id)).toEqual(original);
  await page.getByRole("button", { name: "สร้างร่างว่างของหลักสูตรนี้", exact: true }).click();
  await expect(page.getByText("สร้างร่างแล้ว ตรวจข้อมูลและค่าเริ่มต้นก่อนเผยแพร่", { exact: true })).toBeVisible(); await expect(heading(page, 68)).toBeVisible();
  const created = await detail(context.request, await summaries(page).inputValue()); expect(created.courses).toEqual([]); expect((await visibleVersions(page))[0]).toBe(68);
  evidence("mutations", { originalLatest: 65, inserted: inserted.version, unchangedOlderPage: olderVersions, original, copied, created });
});
