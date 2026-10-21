import { test, expect, type Page, type TestInfo } from "@playwright/test";
import { readFile } from "node:fs/promises";
import type { Dataset } from "@/modules/curriculum/types";
test.use({ reducedMotion: "reduce" });
const fixture = async (info: TestInfo) => JSON.parse(await readFile("tests/.auth/completion-100.json", "utf8"))[info.project.name];
const workspace = async (page: Page) => (await page.request.get("/api/student/transcripts")).json();
const dataset = async (page: Page, id: string): Promise<Dataset> => (await page.request.get(`/api/admin/academic/${id}`)).json();

test("C100 GPA/OR: administrator edits, publishes and preserves old analysis", async ({ page, browser }, info) => {
  const f = await fixture(info);
  await page.context().addCookies(f.storageStates.admin.cookies);
  const student = await browser.newContext({ storageState: f.storageStates["not-selected"], baseURL: "http://localhost:3101", viewport: info.project.use.viewport });
  const p = await student.newPage();
  try {
    const before = await workspace(p);
    const publishedBefore = await dataset(page, f.datasetId);
    await page.goto("/admin/academic");
    await page.getByRole("combobox", { name: "หลักสูตรที่ดูแล", exact: true }).selectOption(f.versionId);
    await page.getByRole("button", { name: "สร้างสำเนาเป็นร่างใหม่", exact: true }).click();
    await page.getByLabel("ค้นหารหัสหรือชื่อวิชา", { exact: true }).fill("517111");
    await page.getByRole("button", { name: "แก้ 517111", exact: true }).click();
    await page.getByLabel("หน่วยกิต", { exact: true }).fill("3");
    await page.getByRole("combobox", { name: "นโยบายเกรดรายวิชา", exact: true }).selectOption("numeric");
    await page.getByLabel("แหล่งกฎ / หน้าเอกสาร", { exact: true }).fill("Synthetic administrator 517111; NOT university data");
    await page.getByRole("button", { name: "ใช้การแก้รายวิชาในร่าง", exact: true }).click();
    await page.getByRole("button", { name: "เงื่อนไขการเรียน", exact: true }).click();
    await page.getByRole("combobox", { name: "วิธีคิด GPA เมื่อเรียนซ้ำ", exact: true }).selectOption("latest_numeric");
    const policySource = `Synthetic completion policy ${info.project.name}; NOT university approval`;
    await page.getByLabel("ที่มาของเกณฑ์คำนวณ", { exact: true }).fill(policySource);
    await page.getByRole("button", { name: "บันทึกร่างข้อมูล", exact: true }).click();
    await expect(page.getByText("บันทึกร่างแล้ว ยังไม่เผยแพร่", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "ตรวจและเผยแพร่", exact: true }).click();
    await page.getByRole("button", { name: "ตรวจและเผยแพร่ฉบับ", exact: true }).click();
    await expect(page.getByText(/เผยแพร่แล้ว บางผลยังมีข้อจำกัด|เผยแพร่ชุดข้อมูลแล้ว/)).toBeVisible();
    expect(await dataset(page, f.datasetId)).toEqual(publishedBefore);
    const stale = await workspace(p);
    expect(stale.analysis.stale).toBe(true);
    expect(stale.analysis.result).toEqual(before.analysis.result);
    expect(stale.revision).toEqual(before.revision);
    await p.goto("/student");
    await expect(p.getByText("สถานภาพตามข้อบังคับมหาวิทยาลัย: ยังไม่ยืนยัน", { exact: true })).toBeVisible();
    await p.getByRole("button", { name: "คำนวณแผนการเรียน", exact: true }).click();
    await expect(p.getByText("คำนวณแผนแล้ว ตรวจรายละเอียดและข้อมูลที่ยังขาดก่อนใช้วางแผน", { exact: true })).toBeVisible();
    await expect(p.getByText(`ที่มานโยบายที่ใช้คำนวณครั้งนี้: ${policySource}`, { exact: true })).toBeVisible();
    const after = await workspace(p);
    expect(after.analysis.result.policy.source).toBe(policySource);
    expect(after.analysis.stale).toBe(false);
    expect(after.revision).toEqual(before.revision);
    expect(after.enrollment).toEqual(before.enrollment);
    expect(after.analysis.result.catalogue.find((c: { code: string }) => c.code === "517111")).toMatchObject({ credits: 3, grading: "numeric", source: "Synthetic administrator 517111; NOT university data" });
    expect(after.analysis.result.audits.map((a: { gpax: { value: number } }) => a.gpax.value)).toEqual([3, 3]);
    const source = p.getByText(`ที่มานโยบายที่ใช้คำนวณครั้งนี้: ${policySource}`, { exact: true });
    await source.scrollIntoViewIfNeeded();
    await p.screenshot({ path: info.outputPath("policy-and-status.png") });
  } finally { await student.close(); }
});

test("C100 historical analysis without policy snapshot remains readable", async ({ page }, info) => {
  const f = await fixture(info);
  await page.context().addCookies(f.storageStates.project.cookies);
  await page.goto("/student");
  await expect(page.getByText("สถานภาพตามข้อบังคับมหาวิทยาลัย: ยังไม่ยืนยัน", { exact: true })).toBeVisible();
  await expect(page.getByText(/ที่มานโยบายที่ใช้คำนวณครั้งนี้: ผลเดิมยังไม่ได้เก็บที่มานโยบาย/)).toBeVisible();
});

test("C100 TRACK: manual consent, version copy and refreshed student result", async ({ page, browser }, info) => {
  const f = await fixture(info);
  await page.context().addCookies(f.storageStates.admin.cookies);
  const student = await browser.newContext({ storageState: f.storageStates["not-selected"], baseURL: "http://localhost:3101", viewport: info.project.use.viewport });
  const p = await student.newPage();
  try {
    await p.goto("/student");
    const panel = p.getByRole("region", { name: "สิทธิ์เลือกสายเบื้องต้น" });
    await expect(panel.getByText("การอนุมัติจากภาควิชา: ยังไม่มีหลักฐานยืนยันใน APS", { exact: true })).toBeVisible();
    await page.goto("/admin/track-criteria");
    await page.getByRole("button", { name: "สร้างร่างเกณฑ์", exact: true }).click();
    await page.getByLabel("ปีเข้าศึกษา คั่นด้วยจุลภาค", { exact: true }).fill("2565");
    await page.getByRole("combobox", { name: "สาย", exact: true }).selectOption("cooperative");
    await page.getByRole("combobox", { name: "ทะเบียนรายวิชาที่อ้างอิง", exact: true }).selectOption(f.datasetId);
    await page.getByLabel("วันที่เริ่มใช้", { exact: true }).fill("2020-01-01");
    await page.getByLabel("วันที่สิ้นสุดใช้", { exact: true }).fill("2099-12-31");
    await page.getByRole("group", { name: "วิชาที่เกณฑ์ใช้พิจารณาสิทธิ์", exact: true }).getByRole("checkbox", { name: /^517393 / }).check();
    for (const label of ["GPAX", "ผลรายวิชา", "ข้อยกเว้น"]) {
      await page.getByRole("combobox", { name: `${label}: สถานะ`, exact: true }).selectOption("not_required");
      await page.getByLabel(`${label}: ข้อความอ้างอิงในประกาศ`, { exact: true }).fill("Synthetic not required; not official");
    }
    await page.getByRole("combobox", { name: "เงื่อนไขตรวจโดยเจ้าหน้าที่: สถานะ", exact: true }).selectOption("specified");
    await page.getByLabel("เงื่อนไขตรวจโดยเจ้าหน้าที่: ข้อความอ้างอิงในประกาศ", { exact: true }).fill("Synthetic consent and duration");
    await page.getByLabel("รายละเอียดที่ต้องตรวจด้วยคน", { exact: true }).fill("ตรวจความยินยอมและระยะเวลาฝึกตามเงื่อนไขสาธิต");
    await page.getByLabel("หน่วยงานตรวจเงื่อนไข", { exact: true }).fill("ผู้ดูแลสาธิต");
    for (const [label, value] of [["ชื่อประกาศ", "Synthetic completion manual criteria"], ["หน่วยงานผู้ออก", "APS Tests"], ["วันที่ประกาศ", "2026-10-20"], ["หน้า/ข้อที่อ้างอิง", "Synthetic clause 1"], ["วิธีตรวจหลักฐาน", "Automated synthetic fixture only"]]) await page.getByLabel(label, { exact: true }).fill(value);
    await page.getByLabel("เหตุผลการดำเนินการ", { exact: true }).fill("Synthetic manual criteria; not official consent");
    await page.getByRole("button", { name: "บันทึกร่างเกณฑ์", exact: true }).click();
    await expect(page.getByText(/บันทึกร่างแล้ว ยังไม่เผยแพร่/)).toBeVisible();
    await page.getByRole("button", { name: "ตรวจทานเกณฑ์", exact: true }).click();
    const listing = await (await page.request.get("/api/admin/track-criteria")).json();
    const previous = listing.items.find((c: { status: string; track: string; admissionYears: number[] }) => c.status === "published" && c.track === "cooperative" && c.admissionYears.includes(2565));
    if (previous) await page.getByRole("combobox", { name: "ฉบับเผยแพร่ที่ต้องการแทน (ถ้ามี)", exact: true }).selectOption(previous.id);
    page.once("dialog", d => d.accept());
    await page.getByRole("button", { name: "เผยแพร่เกณฑ์", exact: true }).click();
    await expect(page.getByText("เผยแพร่เกณฑ์แล้ว ไม่ได้อนุมัติสิทธิ์รายบุคคล", { exact: true })).toBeVisible();
    await p.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(panel.getByText(/นี่คือผลที่ตรวจไว้ก่อนหน้า/)).toBeVisible();
    const refresh = panel.getByRole("button", { name: "ตรวจเกณฑ์ล่าสุดอีกครั้ง", exact: true });
    await refresh.focus(); await p.keyboard.press("Enter");
    await expect(panel.getByRole("heading", { name: "สหกิจศึกษา — รอเจ้าหน้าที่ตรวจเงื่อนไขเพิ่มเติม", exact: true })).toBeVisible();
    await expect(panel.getByText(/นี่คือผลที่ตรวจไว้ก่อนหน้า/)).toHaveCount(0);
    await panel.scrollIntoViewIfNeeded();
    await p.screenshot({ path: info.outputPath("manual-consent.png") });
    await page.getByRole("button", { name: "คัดลอกเป็นร่างใหม่", exact: true }).click();
    await expect(page.getByText(/คัดลอกเป็นร่างแล้ว/)).toBeVisible();
    const after = await (await page.request.get("/api/admin/track-criteria")).json();
    const published = after.items.find((c: { status: string; data: { source: { title: string } } }) => c.status === "published" && c.data.source.title === "Synthetic completion manual criteria");
    expect(after.items.some((c: { status: string; basedOnId: string }) => c.status === "draft" && c.basedOnId === published.id)).toBe(true);
    const result = await (await p.request.get("/api/student/track-criteria?year=2569&semester=1")).json();
    expect(result.results.find((r: { track: string }) => r.track === "cooperative")).toMatchObject({ status: "manual_review", approval: "not_verified", criteriaId: published.id });
  } finally { await student.close(); }
});
