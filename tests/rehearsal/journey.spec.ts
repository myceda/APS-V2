import { test, expect, type Page } from "@playwright/test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { DEMO_NOTICE } from "../../src/modules/demo/config";
import type { DemoManifest } from "../../scripts/demo/store";
const run = process.env.APS_DEMO_RUN!;
const directory = path.resolve("storage/demo", run);
const output = process.env.APS_REHEARSAL_DIR!;

test("continuous seven-step synthetic rehearsal from PDF through both plans and admin history", async ({ browser }) => {
  const manifest: DemoManifest = JSON.parse(await readFile(path.join(directory, "manifest.json"), "utf8"));
  const timeline: { step: number; title: string; checkedAt: string; evidence: string; actual: string }[] = [];
  const student = await browser.newContext({ storageState: path.join(directory, "sessions/not-selected.json"), baseURL: "http://localhost:3102", viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce" });
  const admin = await browser.newContext({ storageState: path.join(directory, "sessions/admin.json"), baseURL: "http://localhost:3102", viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce" });
  const page = await student.newPage();
  async function shot(page: Page, step: number, title: string, name: string, actual: string) {
    await mkdir(path.join(output, "images"), { recursive: true });
    const evidence = `images/${name}.png`;
    await page.screenshot({ path: path.join(output, evidence), animations: "disabled" });
    timeline.push({ step, title, checkedAt: new Date().toISOString(), evidence, actual });
    await writeFile(path.join(output, "steps.json"), JSON.stringify(timeline, null, 2));
  }
  const workspace = async () => (await student.request.get("/api/student/transcripts")).json();
  try {
    await test.step("1 correct synthetic roles", async () => {
      await page.goto("/student");
      await expect(page.getByText(DEMO_NOTICE, { exact: true })).toBeVisible();
      expect((await (await student.request.get("/api/me")).json()).account.role).toBe("student");
      expect((await student.request.get("/api/admin/academic")).status()).toBe(403);
      expect((await (await admin.request.get("/api/me")).json()).account.role).toBe("admin");
      await shot(page, 1, "เข้าด้วยบทบาทนักศึกษาสาธิต", "01-student-role", "student role, admin API denied; signed fixtures, not Google");
    });
    await test.step("2 upload actual synthetic PDF and confirm", async () => {
      const original = await workspace();
      await page.getByRole("button", { name: "ผลการเรียน", exact: true }).click();
      await page.getByLabel("เลือกใบรายงานผลการศึกษา PDF").setInputFiles(path.join(directory, "rehearsal-input.pdf"));
      await page.getByRole("button", { name: "อ่านข้อมูลจาก PDF", exact: true }).click();
      await expect(page.getByText("อ่านข้อมูลแล้ว กรุณาตรวจชื่อ รหัสนักศึกษา และรายวิชาก่อนยืนยัน", { exact: true })).toBeVisible();
      const draft = await workspace();
      expect(draft.revision).toEqual(original.revision);
      expect(draft.drafts[0].attempts.map((a: { courseCode: string }) => a.courseCode).sort()).toEqual(["511108", "517101"]);
      await page.getByRole("heading", { name: "ตรวจข้อมูลก่อนเริ่มวางแผน", exact: true }).scrollIntoViewIfNeeded();
      await shot(page, 2, "อ่านข้อมูลจาก PDFจริง", "02-pdf-review", "Real parser read two synthetic 3-credit B rows; original revision unchanged before confirmation");
      await page.getByRole("checkbox", { name: /ฉันตรวจข้อมูลสรุป/ }).check();
      await page.getByRole("button", { name: "ยืนยันผลการเรียน", exact: true }).click();
      await expect(page.getByText("ยืนยันผลการเรียนแล้ว", { exact: true })).toBeVisible();
      await page.getByRole("button", { name: "ความก้าวหน้าตามหลักสูตร", exact: true }).click();
      await expect(page.getByRole("heading", { name: "ความก้าวหน้าตามหมวด", exact: true })).toBeVisible();
      const confirmed = await workspace();
      expect(confirmed.revision.id).not.toBe(original.revision.id);
      expect(confirmed.enrollment).toEqual(original.enrollment);
    });
    await test.step("3 independent GPA and credit check", async () => {
      await page.getByRole("button", { name: "ภาพรวม", exact: true }).click();
      const state = await workspace();
      for (const audit of state.analysis.result.audits) {
        expect(audit.gpax.raw).toBe(3); // (3*3 + 3*3) / (3+3)
        expect(audit.earnedCredits).toBe(6);
        expect(audit.courses.some((c: { status: string }) => c.status !== "passed")).toBe(true);
      }
      await expect(page.getByText("เกรดเฉลี่ยสะสม (GPAX)", { exact: true })).toBeVisible();
      await page.getByText("เกรดเฉลี่ยสะสม (GPAX)", { exact: true }).scrollIntoViewIfNeeded();
      await shot(page, 3, "GPAX หน่วยกิต และส่วนที่ยังขาด", "03-gpa-and-credits", "GPAX 3.00; earned credits 6; remaining courses exist; not a graduation decision");
    });
    await test.step("4 both alternative plans without changing track", async () => {
      const before = (await workspace()).enrollment;
      await page.getByRole("button", { name: "แผนการเรียน", exact: true }).click();
      const selector = page.getByRole("combobox", { name: "สายที่ดูผล", exact: true });
      await expect(selector.locator("option")).toHaveCount(2);
      for (const [track, title] of [["project", "โครงงานวิจัย"], ["cooperative", "สหกิจศึกษา"]]) {
        await selector.selectOption(track);
        await expect(page.getByRole("heading", { name: `แผนการเรียน · ${title}`, exact: true })).toBeVisible();
        await page.getByRole("heading", { name: `แผนการเรียน · ${title}`, exact: true }).scrollIntoViewIfNeeded();
        await shot(page, 4, `แผนทางเลือก ${title}`, `04-${track}`, "Alternative plan only; enrollment and actual track unchanged");
      }
      expect((await workspace()).enrollment).toEqual(before);
    });
    await test.step("5 preliminary eligibility is separate from approval", async () => {
      await page.getByRole("button", { name: "เปรียบเทียบสองสาย", exact: true }).click();
      const region = page.getByRole("region", { name: "สิทธิ์เลือกสายเบื้องต้น" });
      await expect(region.getByRole("heading", { name: "โครงงานวิจัย — ผ่านเกณฑ์เบื้องต้น", exact: true })).toBeVisible();
      await expect(region.getByRole("heading", { name: "สหกิจศึกษา — รอเจ้าหน้าที่ตรวจเงื่อนไขเพิ่มเติม", exact: true })).toBeVisible();
      await expect(region.getByText("การอนุมัติจากภาควิชา: ยังไม่มีหลักฐานยืนยันใน APS", { exact: true })).toBeVisible();
      await region.scrollIntoViewIfNeeded();
      await shot(page, 5, "เกณฑ์สมมติแยกจากการอนุมัติ", "05-preliminary-not-approval", "Synthetic threshold 2.50: preliminary project pass; cooperative manual review; neither is approval");
    });
    await test.step("6 What-if then restore original plan", async () => {
      const before = await workspace();
      await page.getByRole("button", { name: "ลองปรับแผน", exact: true }).click();
      await page.getByRole("combobox", { name: "เหตุการณ์", exact: true }).selectOption("drop");
      await page.getByRole("combobox", { name: "รายวิชา", exact: true }).selectOption("517121");
      await page.getByRole("button", { name: "เปรียบเทียบกับแผนเดิม", exact: true }).click();
      await expect(page.getByText("เปรียบเทียบแล้ว ข้อมูลจริงยังคงเดิม", { exact: true })).toBeVisible();
      await page.getByRole("button", { name: "ยกเลิกสถานการณ์", exact: true }).scrollIntoViewIfNeeded();
      await shot(page, 6, "ถอนวิชาในสถานการณ์สมมติ", "06-what-if", "Simulated drop of 517121; no real W or Transcript edit");
      await page.getByText("ภาคจบตามแผนเดิม", { exact: true }).evaluate(element => element.parentElement!.scrollIntoView({ block: "start", behavior: "instant" }));
      await shot(page, 6, "ผลเปรียบเทียบและข้อจำกัด", "06-what-if-comparison", "Before/after graduation may remain unknown; do not invent a semester delay");
      await page.getByRole("button", { name: "ยกเลิกสถานการณ์", exact: true }).click();
      await expect(page.getByRole("button", { name: "ยกเลิกสถานการณ์", exact: true })).not.toBeVisible();
      const after = await workspace();
      for (const field of ["revision", "enrollment", "analysis"]) expect(after[field]).toEqual(before[field]);
      await page.getByRole("button", { name: "แผนการเรียน", exact: true }).click();
      await page.getByRole("heading", { name: "แผนการเรียน · สหกิจศึกษา", exact: true }).scrollIntoViewIfNeeded();
      await shot(page, 6, "กลับแผนเดิมเดิม", "06-original-restored", "Revision, enrollment and baseline analysis unchanged after cancelling; scenario history may remain");
    });
    await test.step("7 administrator sources and immutable version history", async () => {
      const manager = await admin.newPage(); await manager.goto("/admin/academic");
      await expect(manager.getByText(DEMO_NOTICE, { exact: true })).toBeVisible();
      const selector = manager.getByRole("combobox", { name: "ชุดข้อมูลที่เปิดดู", exact: true });
      await expect(selector.locator('option:not([value=""])')).toHaveCount(2);
      await selector.selectOption(manifest.datasetIds[0]);
      await expect(manager.getByText(/ฉบับเผยแพร่ อ่านได้อย่างเดียว/)).toBeVisible();
      await expect(manager.getByLabel("แหล่งข้อมูลหลักสูตร", { exact: true })).toHaveValue(/ข้อมูลสาธิต APS/);
      await manager.getByLabel("แหล่งข้อมูลหลักสูตร", { exact: true }).scrollIntoViewIfNeeded();
      await shot(manager, 7, "ที่มาและฉบับเผยแพร่", "07-admin-source", "Two dataset versions; published version read-only, synthetic source visible");
      await selector.selectOption(manifest.datasetIds[1]);
      await expect(manager.getByText(/ร่างที่แก้ไขได้/)).toBeVisible();
      await selector.scrollIntoViewIfNeeded();
      await shot(manager, 7, "ร่างใหม่แยกจากฉบับเก่า", "07-admin-versions", "Draft version 2 separate from published version 1; no administrative data edited");
      await manager.goto("/admin/track-criteria");
      await manager.getByRole("button", { name: "ประวัติฉบับ 1", exact: true }).first().click();
      await expect(manager.getByRole("heading", { name: "ประวัติฉบับ", exact: false })).toBeVisible();
      await manager.locator("details").first().locator("summary").click();
      await expect(manager.getByText(/เหตุผล:/).first()).toBeVisible();
      await shot(manager, 7, "ประวัติเกณฑ์เลือกสาย", "07-criteria-history", "Criterion create/publish history and synthetic evidence; not university approval");
    });
    expect([...new Set(timeline.map(s => s.step))]).toEqual([1, 2, 3, 4, 5, 6, 7]);
  } finally { await student.close(); await admin.close(); }
});
