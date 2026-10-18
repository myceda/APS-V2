import { test, expect, type Page, type APIRequestContext } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";
import type { Dataset } from "../../../src/modules/curriculum/types";
import type { AdminFixture } from "../../../scripts/verification/round-7/fixtures";

const f = JSON.parse(readFileSync("tests/.auth/round-7-admin.json", "utf8")) as {
  manifest: AdminFixture; directory: string; states: Record<string, { cookies: { name: string; value: string; domain: string; path: string; httpOnly: boolean; secure: boolean; sameSite: "Lax"; expires: number }[]; origins: [] }>;
  initial: Dataset[]; data: Dataset; imports: Record<string, string>;
};
const origin = "http://localhost:3107";
const source = "ข้อมูลสาธิตรอบ 7 ผ่านฟอร์ม — ไม่ใช่ข้อมูลมหาวิทยาลัย";
const errors = new WeakMap<Page, string[]>();
test.use({ storageState: f.states.both });
test.beforeEach(async ({ context, page }) => {
  await context.addCookies(f.states.both.cookies);
  const list: string[] = []; errors.set(page, list); page.on("pageerror", e => list.push(e.message));
});
test.afterEach(async ({ page }, info) => {
  expect(errors.get(page)).toEqual([]);
  const name = `${info.project.name}-${info.title.replace(/[^a-zA-Z0-9-]/g, "-")}`;
  await page.screenshot({ path: `${f.directory}/${name}.png`, fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
async function api(request: APIRequestContext, body: unknown, status = 200) {
  const r = await request.post("/api/admin/academic", { data: body, headers: { origin } });
  expect(r.status()).toBe(status); return r.json();
}
async function datasets(request: APIRequestContext): Promise<Dataset[]> {
  const r = await request.get("/api/admin/academic"); expect(r.status()).toBe(200);
  const metadata = await r.json(), result: Dataset[] = [];
  for (const version of metadata.versions) {
    let beforeVersion: number | undefined;
    do {
      const params = new URLSearchParams({ versionId: version.id, ...(beforeVersion ? { beforeVersion: String(beforeVersion) } : {}) });
      const page = await (await request.get(`/api/admin/academic?${params}`)).json();
      for (const summary of page.datasets) {
        const detail = await request.get(`/api/admin/academic/${summary.id}`); expect(detail.status()).toBe(200); result.push(await detail.json());
      }
      beforeVersion = page.pageInfo.hasOlder ? page.pageInfo.oldestVersion : undefined;
    } while (beforeVersion !== undefined);
  }
  return result;
}
async function fresh(request: APIRequestContext): Promise<Dataset> {
  const d = await api(request, { action: "create", versionId: f.manifest.curricula[0].versionId }, 201);
  return api(request, { action: "save", id: d.id, expectedVersion: d.editVersion, dataset: { ...f.data, source: source + test.info().title } });
}
async function choose(page: Page, d: Dataset) {
  await page.goto("/admin/academic");
  await page.getByRole("combobox", { name: "หลักสูตรที่ดูแล", exact: true }).selectOption(d.curriculumVersionId);
  await page.getByRole("combobox", { name: "ชุดข้อมูลที่เปิดดู", exact: true }).selectOption(d.id);
}
async function save(page: Page, status = 200): Promise<Dataset> {
  const reply = page.waitForResponse(r => r.url().endsWith("/api/admin/academic") && r.request().method() === "POST");
  await page.getByRole("button", { name: "บันทึกร่างข้อมูล", exact: true }).click();
  const r = await reply; expect(r.status()).toBe(status);
  if (status === 200) await expect(page.getByText("บันทึกร่างแล้ว ยังไม่เผยแพร่", { exact: true })).toBeVisible();
  return r.json();
}
function evidence(key: string, value: unknown) {
  writeFileSync(`${f.directory}/${test.info().project.name}-${key}.json`, JSON.stringify(value, null, 2), { flag: "wx" });
}

test("forms-and-correction", async ({ page, request }) => {
  await page.goto("/admin/academic");
  await page.getByRole("combobox", { name: "หลักสูตรที่ดูแล", exact: true }).selectOption(f.manifest.curricula[0].versionId);
  await page.getByRole("button", { name: "สร้างร่างว่างของหลักสูตรนี้", exact: true }).click();
  await expect(page.getByText("สร้างร่างแล้ว ตรวจข้อมูลและค่าเริ่มต้นก่อนเผยแพร่", { exact: true })).toBeVisible();
  const id = await page.getByRole("combobox", { name: "ชุดข้อมูลที่เปิดดู", exact: true }).inputValue();
  const blank = (await datasets(request)).find(d => d.id === id)!;
  expect(blank.courses).toEqual([]); expect(blank.policy.repeat).toBe("unconfirmed");
  await page.getByLabel("แหล่งข้อมูลหลักสูตร", { exact: true }).fill(source);
  for (const code of ["R7001", "R7002"]) {
    await page.getByLabel("รหัสวิชา", { exact: true }).fill(code);
    await page.getByLabel("ชื่อรายวิชา", { exact: true }).fill("ข้อมูลสาธิต " + code);
    await page.getByLabel("หน่วยกิต", { exact: true }).fill("3");
    await page.getByRole("combobox", { name: "หมวดที่จัดสรร", exact: true }).selectOption("core_required");
    await page.getByRole("combobox", { name: "นโยบายเกรดรายวิชา", exact: true }).selectOption(code === "R7002" ? "su" : "numeric");
    await page.getByLabel("แหล่งกฎ / หน้าเอกสาร", { exact: true }).fill(source);
    await page.getByLabel("นับเป็นวิชาเฉพาะด้านสำหรับ GPA แม้จัดสรรหน่วยกิตเป็นเลือกเสรี", { exact: true }).check();
    if (code === "R7002") {
      await page.getByLabel("รหัสวิชาก่อน คั่นด้วยจุลภาค", { exact: true }).fill("MISSING");
      await page.getByRole("combobox", { name: "เงื่อนไขวิชาก่อน", exact: true }).selectOption("any");
      await page.getByLabel("เอกสารระบุให้เรียนพร้อมวิชาก่อนได้", { exact: true }).check();
      await page.getByLabel("ต้องได้รับความยินยอมจากผู้มีอำนาจทางวิชาการ", { exact: true }).check();
    }
    await page.getByRole("button", { name: "เพิ่มรายวิชาในร่าง", exact: true }).click();
  }
  await save(page, 422);
  await expect(page.getByRole("main").getByRole("alert")).toContainText("ไม่พบวิชาเงื่อนไข MISSING");
  await page.screenshot({ path: `${f.directory}/${test.info().project.name}-validation-error.png`, fullPage: true });
  expect((await datasets(request)).find(d => d.id === id)).toEqual(blank);
  await page.getByRole("button", { name: "แก้ R7002", exact: true }).click();
  await page.getByLabel("รหัสวิชาก่อน คั่นด้วยจุลภาค", { exact: true }).fill("R7001");
  await page.getByLabel("ชื่อรายวิชา", { exact: true }).fill("ข้อมูลสาธิต แก้ชื่อแล้ว");
  await page.getByRole("combobox", { name: "หมวดที่จัดสรร", exact: true }).selectOption("specific_elective");
  await page.getByRole("combobox", { name: "สายที่ใช้วิชานี้", exact: true }).selectOption("cooperative");
  await page.getByRole("button", { name: "ใช้การแก้รายวิชาในร่าง", exact: true }).click();
  await page.getByRole("button", { name: "เงื่อนไขการเรียน", exact: true }).click();
  await page.getByLabel("หน่วยกิตขั้นต่ำทั้งหมด", { exact: true }).fill("6");
  await page.getByLabel("GPA ขั้นต่ำ", { exact: true }).fill("2.25");
  await page.getByLabel("คะแนนเกรดสูงสุดที่อาจเรียนซ้ำได้", { exact: true }).fill("1.5");
  for (const [label, value] of [["นโยบาย GPA เรียนซ้ำ", "latest_numeric"], ["การปัด GPA เพื่อแสดงผล", "half_up_2"], ["การจัดหมวดวิชาเลือก", "specific_then_free_earliest_pass"], ["การเทียบเกณฑ์ GPA", "raw"], ["ขอบเขต GPA เฉพาะด้าน", "all_specific"], ["สิทธิ์วิชาต่อเนื่องเมื่อเรียนซ้ำ", "latest_assessed"]])
    await page.getByRole("combobox", { name: label, exact: true }).selectOption(value);
  await page.getByLabel("รหัสวิชาที่รับรอง S*/U* เทียบ S/U คั่นด้วยจุลภาค", { exact: true }).fill("R7002");
  await page.getByLabel("เพดานหน่วยกิตภาคปกติ", { exact: true }).fill("18");
  await page.getByLabel("เพดานฤดูร้อน", { exact: true }).fill("6");
  await page.getByLabel("ขั้นต่ำทั่วไปภาคปกติ (ว่าง = ยังไม่ยืนยัน)", { exact: true }).fill("0");
  await page.getByLabel("แหล่งนโยบาย", { exact: true }).fill(source);
  await page.getByLabel("ขั้นต่ำหมวด 3", { exact: true }).fill("3");
  await page.getByLabel("แหล่งหมวด 3", { exact: true }).fill(source);
  const actual = await save(page);
  expect(actual.courses.find(c => c.code === "R7002")).toMatchObject({ name: "ข้อมูลสาธิต แก้ชื่อแล้ว", category: "specific_elective", grading: "su", tracks: ["cooperative"], prerequisite: { courses: ["R7001"], mode: "any", concurrent: true }, requiresConsent: true });
  expect(actual.policy).toMatchObject({ degreeCredits: 6, gpaMinimum: 2.25, repeat: "latest_numeric", rounding: "half_up_2", gpaComparison: "raw", normalMax: 18, normalMin: 0, summerMax: 6, starGradeCourses: ["R7002"] });
  expect(actual.groups[2]).toMatchObject({ category: "core_required", minimum: 3, source });
  await page.reload(); await expect(page.getByLabel("แหล่งข้อมูลหลักสูตร", { exact: true })).toHaveValue(source);
  evidence("forms", { input: "UI course/group/grading/prerequisite/policy", expected: "invalid draft blocked; correction persists", actual });
});

test("imports-csv-and-excel", async ({ page, request }) => {
  const d = await fresh(request); await choose(page, d);
  await page.getByRole("button", { name: "นำเข้า Excel/CSV", exact: true }).click();
  for (const ext of ["Csv", "Xlsx"]) {
    await page.getByLabel("ไฟล์รายวิชา CSV UTF-8 หรือ Excel", { exact: true }).setInputFiles(f.imports[`mixed${ext}`]);
    await page.getByRole("button", { name: "ตรวจตัวอย่างไฟล์", exact: true }).click();
    await expect(page.getByText("1/2 แถวอ่านได้ ยังไม่ได้บันทึกหรือเผยแพร่", { exact: true })).toBeVisible();
    await expect(page.getByRole("cell", { name: /ตัวเลขต้องอยู่ระหว่าง/ })).toBeVisible();
    await page.screenshot({ path: `${f.directory}/${test.info().project.name}-import-${ext}-mixed.png`, fullPage: true });
    await expect(page.getByRole("button", { name: "นำแถวที่ตรวจผ่านเข้าสู่ร่าง", exact: true })).toBeDisabled();
    expect((await datasets(request)).find(x => x.id === d.id)).toEqual(d);
    await page.getByLabel("ไฟล์รายวิชา CSV UTF-8 หรือ Excel", { exact: true }).setInputFiles(f.imports[`corrected${ext}`]);
    await expect(page.getByRole("button", { name: "นำแถวที่ตรวจผ่านเข้าสู่ร่าง", exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "ตรวจตัวอย่างไฟล์", exact: true }).click();
    await expect(page.getByText("2/2 แถวอ่านได้ ยังไม่ได้บันทึกหรือเผยแพร่", { exact: true })).toBeVisible();
    if (ext === "Csv") {
      await page.getByLabel("ไฟล์รายวิชา CSV UTF-8 หรือ Excel", { exact: true }).setInputFiles(f.imports.bad);
      await page.getByRole("button", { name: "ตรวจตัวอย่างไฟล์", exact: true }).click();
      await expect(page.getByRole("main").getByRole("alert")).toContainText("ชื่อและลำดับคอลัมน์ไม่ตรงแม่แบบ");
      await expect(page.getByRole("button", { name: "นำแถวที่ตรวจผ่านเข้าสู่ร่าง", exact: true })).toHaveCount(0);
    }
  }
  await page.getByRole("button", { name: "นำแถวที่ตรวจผ่านเข้าสู่ร่าง", exact: true }).click();
  expect((await datasets(request)).find(x => x.id === d.id)).toEqual(d);
  const saved = await save(page); expect(saved.courses.map(c => c.code)).toEqual(["R7001", "R7002", "R7101", "R7102"]);
  evidence("imports", { expected: "mixed rows blocked, file corrected and reuploaded, preview never writes; explicit save", before: d, actual: saved });
});

test("offerings-two-years-three-terms", async ({ page, request }) => {
  const d = await fresh(request);
  d.offerings.push(...([1, 2, 3] as const).map(semester => ({ courseCode: "R7001", year: 0, semester, availability: "open" as const, confidence: "planned" as const, source })), { courseCode: "R7001", year: 2571, semester: 2, availability: "unknown", confidence: "confirmed", source });
  const before: Dataset = await api(request, { action: "save", id: d.id, expectedVersion: d.editVersion, dataset: d });
  await choose(page, before); await page.getByRole("button", { name: "การเปิดสอน", exact: true }).click();
  await page.getByLabel("แหล่งข้อมูลหรือสมมติฐาน", { exact: true }).fill(source);
  const matrix: Record<string, string[]> = { "2569": ["open", "closed", "unknown"], "2570": ["unknown", "open", "closed"] };
  for (const [year, values] of Object.entries(matrix)) {
    await page.getByLabel("ปี พ.ศ.", { exact: true }).fill(year);
    for (const [i, v] of values.entries()) await page.getByLabel(`เปิดสอน R7001 ภาค ${i + 1}`, { exact: true }).selectOption(v);
  }
  const actual = await save(page);
  for (const [year, values] of Object.entries(matrix)) for (const [i, availability] of values.entries())
    expect(actual.offerings.find(o => o.courseCode === "R7001" && o.year === Number(year) && o.semester === i + 1)).toMatchObject({ availability, confidence: "planned", source });
  expect(actual.offerings.filter(o => ![2569, 2570].includes(o.year))).toEqual(before.offerings);
  expect(actual.courses).toEqual(before.courses); expect(actual.policy).toEqual(before.policy);
  await page.reload(); await page.getByRole("button", { name: "การเปิดสอน", exact: true }).click();
  await page.getByLabel("ปี พ.ศ.", { exact: true }).fill("2569");
  await expect(page.getByLabel("เปิดสอน R7001 ภาค 3", { exact: true })).toHaveValue("unknown");
  evidence("offerings", { expected: matrix, preservedYears: [0, 2568, 2571], before, actual });
});

test("publish-copy-history", async ({ page, request }) => {
  const d = await fresh(request); await choose(page, d);
  await page.getByRole("button", { name: "ตรวจและเผยแพร่", exact: true }).click();
  await page.getByRole("button", { name: "ตรวจและเผยแพร่ฉบับ", exact: true }).click();
  await expect(page.getByText("ฉบับเผยแพร่ อ่านได้อย่างเดียว", { exact: false })).toBeVisible();
  const published = (await datasets(request)).find(x => x.id === d.id)!;
  await expect(page.getByLabel("แหล่งข้อมูลหลักสูตร", { exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "สร้างสำเนาเป็นร่างใหม่", exact: true }).click();
  await expect(page.getByText("สร้างร่างฉบับใหม่แล้ว ฉบับเดิมไม่เปลี่ยน", { exact: true })).toBeVisible();
  const copyId = await page.getByRole("combobox", { name: "ชุดข้อมูลที่เปิดดู", exact: true }).inputValue();
  await page.getByLabel("แหล่งข้อมูลหลักสูตร", { exact: true }).fill(source + " สำเนาใหม่");
  const copied = await save(page);
  expect(copyId).not.toBe(published.id); expect(copied.version).toBe(published.version + 1);
  expect(copied.courses).toEqual(published.courses); expect(copied.status).toBe("draft");
  await page.getByRole("combobox", { name: "ชุดข้อมูลที่เปิดดู", exact: true }).selectOption(published.id);
  await expect(page.getByLabel("แหล่งข้อมูลหลักสูตร", { exact: true })).toHaveValue(published.source);
  expect((await datasets(request)).find(x => x.id === published.id)).toEqual(published);
  await api(request, { action: "save", id: published.id, expectedVersion: published.editVersion, dataset: copied }, 409);
  evidence("history", { expected: "published immutable; copy has new version; old version remains selectable", published, copied });
});

test("scope-and-curriculum-switch", async ({ page, request, browser }) => {
  const d = await fresh(request), b = (await datasets(request)).find(x => x.curriculumVersionId === f.initial[1].curriculumVersionId)!; await choose(page, d);
  await page.getByRole("combobox", { name: "หลักสูตรที่ดูแล", exact: true }).selectOption(b.curriculumVersionId);
  await expect(page.getByRole("combobox", { name: "ชุดข้อมูลที่เปิดดู", exact: true })).toHaveValue(b.id);
  await expect(page.getByLabel("แหล่งข้อมูลหลักสูตร", { exact: true })).toHaveValue(b.source);
  await page.getByRole("button", { name: "สร้างร่างว่างของหลักสูตรนี้", exact: true }).click();
  await expect(page.getByText("สร้างร่างแล้ว ตรวจข้อมูลและค่าเริ่มต้นก่อนเผยแพร่", { exact: true })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "ชุดข้อมูลที่เปิดดู", exact: true })).not.toHaveValue(d.id);
  expect((await datasets(request)).find(x => x.id === d.id)).toEqual(d);
  const outsider = await browser.newContext({ baseURL: origin, storageState: f.states.b });
  try {
    const p = await outsider.newPage(); await p.goto("/admin/academic");
    await expect(p.getByRole("combobox", { name: "หลักสูตรที่ดูแล", exact: true }).locator("option")).toHaveCount(1);
    const list = await datasets(outsider.request); expect(list.every(x => x.curriculumVersionId === b.curriculumVersionId)).toBe(true);
    const denied = [];
    for (const body of [
      { action: "create", versionId: d.curriculumVersionId }, { action: "create", versionId: b.curriculumVersionId, copyId: d.id },
      { action: "save", id: d.id, expectedVersion: d.editVersion, dataset: d }, { action: "publish", id: d.id, expectedVersion: d.editVersion },
    ]) { const out = await api(outsider.request, body, 403); denied.push(out.error.code); }
    const r = await outsider.request.post("/api/admin/academic/import", { headers: { origin }, multipart: { datasetId: d.id, file: { name: "synthetic.csv", mimeType: "text/csv", buffer: readFileSync(f.imports.correctedCsv) } } });
    expect(r.status()).toBe(403);
    await api(request, { action: "create", versionId: b.curriculumVersionId, copyId: d.id }, 422);
    expect((await datasets(request)).find(x => x.id === d.id)).toEqual(d);
    evidence("scope", { expected: "switch selects only matching curriculum; foreign create/save/publish/copy/import denied", denied, importStatus: r.status(), crossCopyStatus: 422, protectedDataset: d });
  } finally { await outsider.close(); }
});

test("two-windows-stale-save-and-publish", async ({ page, request, context }) => {
  const d = await fresh(request); await choose(page, d);
  const other = await context.newPage(); await choose(other, d);
  try {
    await other.getByLabel("แหล่งข้อมูลหลักสูตร", { exact: true }).fill(source + " หน้าต่างใหม่");
    const newer = await save(other);
    await page.getByLabel("แหล่งข้อมูลหลักสูตร", { exact: true }).fill(source + " หน้าต่างเก่า");
    await save(page, 409); await expect(page.getByRole("main").getByRole("alert")).toContainText("ข้อมูลเปลี่ยนจากอีกหน้าต่าง");
    await page.screenshot({ path: `${f.directory}/${test.info().project.name}-conflict-error.png`, fullPage: true });
    const actual = (await datasets(request)).find(x => x.id === d.id)!; expect(actual).toEqual(newer);
    await api(request, { action: "publish", id: d.id, expectedVersion: d.editVersion }, 409);
    await page.reload(); await page.getByRole("combobox", { name: "ชุดข้อมูลที่เปิดดู", exact: true }).selectOption(d.id);
    await expect(page.getByLabel("แหล่งข้อมูลหลักสูตร", { exact: true })).toHaveValue(newer.source);
    evidence("conflict", { expected: "stale window cannot overwrite or publish; reload shows newer work", before: d, actual, staleSaveStatus: 409, stalePublishStatus: 409 });
  } finally { await other.close(); }
});
