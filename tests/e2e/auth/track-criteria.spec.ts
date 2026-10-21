import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import type { Dataset } from "@/modules/curriculum/types";
import { academicDataset } from "../../support/academic-fixtures";
test("ผู้ดูแลเก็บฉบับเกณฑ์ นักศึกษาเห็นผลเบื้องต้นแยกจากอนุมัติ", async ({ browser, page }, info) => {
  const adminCookies = JSON.parse(await readFile("tests/.auth/admin.json", "utf8")).cookies;
  await page.context().addCookies(adminCookies);
  const post = async (path: string, data: unknown) => {
    const r = await page.request.post(path, { headers: { origin: "http://localhost:3101" }, data });
    expect(r.ok(), await r.text()).toBe(true); return r.json();
  };
  const meta = await (await page.request.get("/api/admin/academic")).json();
  const draft: Dataset = await post("/api/admin/academic", { action: "create", versionId: meta.versions[0].id });
  const saved = await post("/api/admin/academic", { action: "save", id: draft.id, expectedVersion: draft.editVersion, dataset: academicDataset(draft) });
  await post("/api/admin/academic", { action: "publish", id: draft.id, expectedVersion: saved.editVersion });
  const student = await browser.newContext({ storageState: `tests/.auth/criteria-${info.project.name}.json`, baseURL: "http://localhost:3101", viewport: info.project.use.viewport });
  const studentPage = await student.newPage();
  try {
    await studentPage.goto("/student");
    await studentPage.getByLabel("เลือกใบรายงานผลการศึกษา PDF").setInputFiles(`tests/.auth/criteria-${info.project.name}.pdf`);
    await studentPage.getByRole("button", { name: "อ่านข้อมูลจาก PDF", exact: true }).click();
    await expect(studentPage.getByRole("button", { name: "ยืนยันผลการเรียน", exact: true })).toBeVisible();
    await studentPage.getByLabel("ฉันตรวจข้อมูลสรุปและจุดที่แจ้งกับต้นฉบับแล้ว และยืนยันว่าเป็นใบผลการเรียนของฉัน", { exact: true }).check();
    await studentPage.getByRole("button", { name: "ยืนยันผลการเรียน", exact: true }).click();
    const studentPanel = studentPage.getByRole("region", { name: "สิทธิ์เลือกสายเบื้องต้น" });
    await expect(studentPanel.getByRole("heading", { name: "โครงงานวิจัย — รอข้อมูลจากผู้ดูแล", exact: true })).toBeVisible();
    await expect(studentPanel.getByText("การอนุมัติจากภาควิชา: ยังไม่มีหลักฐานยืนยันใน APS", { exact: true })).toBeVisible();
    await expect(studentPage.getByRole("combobox", { name: "สายที่ดูผล", exact: true }).locator("option")).toHaveCount(2);
    await studentPage.screenshot({ path: info.outputPath(`track-criteria/student-waiting-${info.project.name}.png`), fullPage: true });

    await page.goto("/admin/track-criteria");
    await page.getByText("ยืนยันปีที่เข้าศึกษาจากหลักฐาน", { exact: true }).click();
    await page.getByRole("combobox", { name: "หลักสูตรนักศึกษา", exact: true }).selectOption(meta.versions[0].id);
    await page.getByLabel("รหัสนักศึกษาที่ตรวจ", { exact: true }).fill(info.project.name === "desktop" ? "6500000701" : "6500000702");
    await page.getByRole("button", { name: "ค้นหาข้อมูลรุ่น", exact: true }).click();
    await page.getByLabel("ปีที่เข้าศึกษายืนยัน (พ.ศ.)", { exact: true }).fill("2565");
    await page.getByLabel("ที่มายืนยันปีเข้าศึกษา", { exact: true }).fill("Synthetic fixture only");
    await page.getByRole("button", { name: "บันทึกปีเข้าศึกษา", exact: true }).click();
    await expect(page.getByText("ยืนยันปีเข้าศึกษาแล้ว ไม่เปลี่ยนสายหรืออนุมัติสิทธิ์", { exact: true })).toBeVisible();

    await page.screenshot({ path: info.outputPath(`track-criteria/admin-list-${info.project.name}.png`), fullPage: true });
    await page.getByRole("button", { name: "สร้างร่างเกณฑ์", exact: true }).click();
    await page.getByLabel("ปีเข้าศึกษา คั่นด้วยจุลภาค", { exact: true }).fill("2565");
    await page.getByRole("combobox", { name: "ทะเบียนรายวิชาที่อ้างอิง", exact: true }).selectOption(draft.id);
    await page.getByLabel("วันที่เริ่มใช้", { exact: true }).fill("2020-01-01");
    await page.getByLabel("วันที่สิ้นสุดใช้", { exact: true }).fill("2099-12-31");
    await page.getByRole("group", { name: "วิชาที่เกณฑ์ใช้พิจารณาสิทธิ์", exact: true }).getByRole("checkbox", { name: "101001 Synthetic Course 1", exact: true }).check();
    await page.getByLabel("เหตุผลการดำเนินการ", { exact: true }).fill("Synthetic UI fixture only");
    await page.screenshot({ path: info.outputPath(`track-criteria/admin-form-${info.project.name}.png`), fullPage: true });
    await page.getByRole("button", { name: "บันทึกร่างเกณฑ์", exact: true }).click();
    await expect(page.getByText(/บันทึกร่างแล้ว ยังไม่เผยแพร่/)).toBeVisible();
    await page.getByRole("button", { name: "ตรวจทานเกณฑ์", exact: true }).click();
    await expect(page.getByRole("button", { name: "เผยแพร่เกณฑ์", exact: true })).toBeDisabled();
    await page.getByRole("button", { name: "กลับฟอร์ม", exact: true }).click();
    for (const label of ["GPAX", "ผลรายวิชา", "ข้อยกเว้น", "เงื่อนไขตรวจโดยเจ้าหน้าที่"]) {
      await page.getByRole("combobox", { name: `${label}: สถานะ`, exact: true }).selectOption("not_required");
      await page.getByLabel(`${label}: ข้อความอ้างอิงในประกาศ`, { exact: true }).fill("Synthetic explicitly not required, not a university rule");
    }
    await page.getByLabel("ชื่อประกาศ", { exact: true }).fill("Synthetic fixture only");
    await page.getByLabel("หน่วยงานผู้ออก", { exact: true }).fill("APS Tests");
    await page.getByLabel("วันที่ประกาศ", { exact: true }).fill("2026-10-17");
    await page.getByLabel("หน้า/ข้อที่อ้างอิง", { exact: true }).fill("Synthetic clause");
    await page.getByLabel("วิธีตรวจหลักฐาน", { exact: true }).fill("Automated fixture only");
    await page.getByRole("button", { name: "บันทึกร่างเกณฑ์", exact: true }).click();
    await expect(page.getByText(/บันทึกร่างแล้ว ยังไม่เผยแพร่/)).toBeVisible();
    await page.getByRole("button", { name: "ตรวจทานเกณฑ์", exact: true }).click();
    await page.screenshot({ path: info.outputPath(`track-criteria/admin-review-${info.project.name}.png`), fullPage: true });
    // Existing synthetic rule from another device/run is explicitly replaced, never silently reused.
    const listing = await (await page.request.get("/api/admin/track-criteria")).json();
    const active = listing.items.find((c: { status: string; track: string; year: number; semester: number; admissionYears: number[] }) => c.status === "published" && c.track === "project" && c.year === 2569 && c.semester === 1 && c.admissionYears.includes(2565));
    if (active) await page.getByRole("combobox", { name: "ฉบับเผยแพร่ที่ต้องการแทน (ถ้ามี)", exact: true }).selectOption(active.id);
    page.once("dialog", dialog => dialog.accept());
    await page.getByRole("button", { name: "เผยแพร่เกณฑ์", exact: true }).click();
    await expect(page.getByText("เผยแพร่เกณฑ์แล้ว ไม่ได้อนุมัติสิทธิ์รายบุคคล", { exact: true })).toBeVisible();
    await expect(page.getByText("ฉบับนี้อ่านอย่างเดียว ต้องคัดลอกเป็นร่างใหม่เพื่อแก้ไข", { exact: true })).toBeVisible();
    await studentPanel.getByRole("button", { name: "ตรวจเกณฑ์ล่าสุดอีกครั้ง", exact: true }).click();
    await expect(studentPanel.getByRole("heading", { name: "โครงงานวิจัย — ผ่านเกณฑ์เบื้องต้น", exact: true })).toBeVisible();
    await expect(studentPanel.getByRole("heading", { name: "สหกิจศึกษา — รอข้อมูลจากผู้ดูแล", exact: true })).toBeVisible();
    await expect(studentPanel.getByText("การอนุมัติจากภาควิชา: ยังไม่มีหลักฐานยืนยันใน APS", { exact: true })).toBeVisible();
    await studentPage.getByRole("combobox", { name: "สายที่ดูผล", exact: true }).selectOption("cooperative");
    await expect(studentPage.getByRole("combobox", { name: "สายที่ดูผล", exact: true })).toHaveValue("cooperative");
    await studentPage.screenshot({ path: info.outputPath(`track-criteria/student-preliminary-${info.project.name}.png`), fullPage: true });
    await page.getByRole("button", { name: "รายการเกณฑ์", exact: true }).click();
    const data = await (await page.request.get("/api/admin/track-criteria")).json();
    const newest = data.items.find((c: {status:string}) => c.status === "published");
    await page.getByRole("button", { name: `ประวัติฉบับ ${newest.version}`, exact: true }).click();
    await expect(page.getByRole("heading", { name: `ประวัติฉบับ ${newest.version}`, exact: true })).toBeVisible();
    const summary = page.locator("details summary").first();
    await summary.focus(); await page.keyboard.press("Enter");
    await expect(page.getByText("เหตุผล: Synthetic UI fixture only", { exact: true }).first()).toBeVisible();
    await page.screenshot({ path: info.outputPath(`track-criteria/admin-history-${info.project.name}.png`), fullPage: true });
  } finally { await student.close(); }
});
