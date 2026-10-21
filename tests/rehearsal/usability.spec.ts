import { test, expect } from "@playwright/test";
import { readFile, mkdir } from "node:fs/promises";
import path from "node:path";

const run = process.env.APS_DEMO_RUN!;
const directory = path.resolve("storage/demo", run);
const output = process.env.APS_REHEARSAL_DIR!;

for (const viewport of [{ width: 1440, height: 1000 }, { width: 1280, height: 580 }, { width: 390, height: 844 }]) {
  test(`guided tasks, complete PDF identity and usable plans at width ${viewport.width}`, async ({ browser }) => {
    const student = await browser.newContext({ storageState: path.join(directory, "sessions/not-selected.json"), baseURL: "http://localhost:3102", viewport });
    const admin = await browser.newContext({ storageState: path.join(directory, "sessions/admin.json"), baseURL: "http://localhost:3102", viewport });
    const page = await student.newPage();
    await mkdir(path.join(output, "ux-images"), { recursive: true });
    try {
      await page.goto("/student");
      await expect(page.getByRole("heading", { name: "เปิดแผนการเรียนของคุณ", exact: true })).toBeVisible();
      await expect(page.getByRole("button", { name: "เปิดแผนรายภาค", exact: true })).toBeInViewport();
      await page.screenshot({ path: path.join(output, `ux-images/student-start-${viewport.width}.png`) });
      await page.getByRole("button", { name: "เปิดแผนรายภาค", exact: true }).click();
      await expect(page.locator("#student-plan")).toBeFocused();
      await expect(page.getByRole("heading", { name: "แผนการเรียน · โครงงานวิจัย", exact: true })).toBeInViewport();
      await expect(page.getByRole("heading", { name: "แผนการเรียน · โครงงานวิจัย", exact: true })).toBeVisible();
      // A heading alone is insufficient: at least one term must contain real scheduled rows.
      await expect(page.getByRole("heading", { name: "2569/1", exact: true })).toBeVisible();
      const firstTerm = page.getByRole("article").filter({ has: page.getByRole("heading", { name: "2569/1", exact: true }) });
      await expect(firstTerm.getByRole("button", { name: /^517121 ·/ })).toBeVisible();
      const track = page.getByRole("combobox", { name: "สายที่ดูผล", exact: true });
      await track.selectOption("cooperative");
      await expect(page.getByRole("heading", { name: "แผนการเรียน · สหกิจศึกษา", exact: true })).toBeVisible();
      await page.getByRole("heading", { name: "แผนการเรียน · สหกิจศึกษา", exact: true }).scrollIntoViewIfNeeded();
      await page.screenshot({ path: path.join(output, `ux-images/student-plan-${viewport.width}.png`) });
      await page.getByRole("button", { name: "ผลการเรียน", exact: true }).click();
      await page.getByLabel("เลือกใบรายงานผลการศึกษา PDF").setInputFiles(path.join(directory, "rehearsal-input.pdf"));
      await page.getByRole("button", { name: "อ่านข้อมูลจาก PDF", exact: true }).click();
      await expect(page.getByRole("heading", { name: "ตรวจข้อมูลที่อ่านจาก PDF", exact: true })).toBeVisible();
      await page.getByRole("link", { name: "ไปตรวจข้อมูล", exact: true }).click();
      await expect(page.locator("#transcript-review")).toBeFocused();
      await expect(page.getByRole("heading", { name: "ตรวจข้อมูลก่อนเริ่มวางแผน", exact: true })).toBeInViewport();
      await expect(page.getByLabel("ชื่อและนามสกุล", { exact: true })).toBeVisible();
      await expect(page.getByLabel("ชื่อและนามสกุล", { exact: true })).toHaveValue("Synthetic Student");
      await expect(page.getByLabel("รหัสแถว 1", { exact: true })).toBeVisible();
      const state = await (await student.request.get("/api/student/transcripts")).json();
      expect(state.drafts[0].attempts.map((row: { courseCode: string; grade: string; year: number; semester: number }) => [row.courseCode, row.grade, row.year, row.semester]))
        .toEqual([["517101", "B", 2568, 2], ["511108", "B", 2568, 2]]);
      await page.screenshot({ path: path.join(output, `ux-images/student-review-${viewport.width}.png`) });
      await page.getByRole("button", { name: "ยืนยันผลการเรียน", exact: true }).scrollIntoViewIfNeeded();
      await expect(page.getByRole("button", { name: "ยืนยันผลการเรียน", exact: true })).toBeDisabled();
      await page.getByRole("checkbox", { name: /ฉันตรวจข้อมูลสรุป/ }).check();
      await page.getByRole("button", { name: "ยืนยันผลการเรียน", exact: true }).click();
      await expect(page.getByText("ยืนยันผลการเรียนแล้ว", { exact: true })).toBeVisible();
      const confirmed = await (await student.request.get("/api/student/transcripts")).json();
      expect(confirmed.revision.payload.header.studentName.value).toBe("Synthetic Student");
      expect(confirmed.analysis.result.plans.map((p: { track: string }) => p.track).sort()).toEqual(["cooperative", "project"]);
      expect(confirmed.analysis.result.plans.every((p: { terms: { courses: unknown[] }[] }) => p.terms.some(t => t.courses.length > 0))).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

      const manager = await admin.newPage(); await manager.goto("/admin");
      await expect(manager.getByText("เข้าใช้งานครั้งแรก เริ่มตรงนี้", { exact: true })).toBeVisible();
      await manager.getByRole("link", { name: "จัดการหลักสูตรและการเปิดสอน", exact: true }).click();
      await expect(manager.getByRole("heading", { name: "เตรียมข้อมูลให้นักศึกษาใช้วางแผน", exact: true })).toBeVisible();
      await manager.screenshot({ path: path.join(output, `ux-images/admin-start-${viewport.width}.png`) });
      await manager.getByRole("button", { name: "เริ่มนำเข้าไฟล์รายวิชา", exact: true }).click();
      await expect(manager.getByRole("heading", { name: "นำเข้ารายวิชาแบบตรวจตัวอย่างก่อนบันทึก", exact: true })).toBeVisible();
      await manager.getByLabel("ไฟล์รายวิชา CSV UTF-8 หรือ Excel").setInputFiles({ name: "invalid-demo.csv", mimeType: "text/csv", buffer: await readFile(path.resolve("../aps-v2-doc/deliverables/completion-100/administrator-with-error.csv")) });
      await manager.getByRole("button", { name: "ตรวจตัวอย่างไฟล์", exact: true }).click();
      await expect(manager.getByText(/1\/2 แถวอ่านได้/)).toBeVisible();
      await expect(manager.getByRole("button", { name: "นำแถวที่ตรวจผ่านเข้าสู่ร่าง", exact: true })).toBeDisabled();
      await manager.getByRole("heading", { name: "นำเข้ารายวิชาแบบตรวจตัวอย่างก่อนบันทึก", exact: true }).scrollIntoViewIfNeeded();
      await manager.screenshot({ path: path.join(output, `ux-images/admin-import-${viewport.width}.png`) });
      await manager.getByRole("button", { name: "ตรวจการเปิดสอน", exact: true }).click();
      await expect(manager.getByRole("heading", { name: "ตารางเปิดสอนรายปีและรายภาค", exact: true })).toBeVisible();
      await manager.getByRole("button", { name: "ไปตรวจความพร้อม", exact: true }).click();
      await expect(manager.getByRole("heading", { name: "ตรวจความพร้อมก่อนเผยแพร่", exact: true })).toBeVisible();
      expect(await manager.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    } finally { await student.close(); await admin.close(); }
  });
}
