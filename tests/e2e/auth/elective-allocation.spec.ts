import { test, expect } from "@playwright/test";
import type { Dataset } from "@/modules/curriculum/types";

test("นักศึกษาเห็นวิชาเลือกเฉพาะส่วนเกินนับเลือกเสรีครั้งเดียวพร้อมเหตุผลทั้งสองสาย", async ({ browser }, info) => {
  const admin = await browser.newContext({ storageState: "tests/.auth/admin.json", baseURL: "http://localhost:3101" });
  try {
    const metadata = await (await admin.request.get("/api/admin/academic")).json();
    const created = await admin.request.post("/api/admin/academic", { headers: { origin: "http://localhost:3101" }, data: { action: "create", versionId: metadata.versions[0].id } });
    expect(created.status()).toBe(201);
    const d: Dataset = await created.json(), template = d.courses.find(c => c.code === "517465")!;
    d.courses = Array.from({ length: 7 }, (_, i) => ({ ...structuredClone(template), code: `99100${i+1}`, name: `Allocation Course ${i+1}`, source: "Synthetic allocation test course" }));
    d.policy = { ...d.policy, degreeCredits: 21, normalMin: 0, starGradeCourses: [] };
    d.source = "Synthetic allocation browser acceptance; not university data"; d.unresolved = []; d.offerings = [];
    d.groups = [{ category: "specific_elective", minimum: 15, track: "project", source: "Synthetic" }, { category: "specific_elective", minimum: 9, track: "cooperative", source: "Synthetic" }, { category: "free_elective", minimum: 6, track: "both", source: "Synthetic" }];
    const saved = await admin.request.post("/api/admin/academic", { headers: { origin: "http://localhost:3101" }, data: { action: "save", id: d.id, expectedVersion: d.editVersion, dataset: d } });
    expect(saved.ok()).toBe(true);
    const persisted: Dataset = await saved.json();
    expect((await admin.request.post("/api/admin/academic", { headers: { origin: "http://localhost:3101" }, data: { action: "publish", id: d.id, expectedVersion: persisted.editVersion } })).ok()).toBe(true);
  } finally { await admin.close(); }
  const context = await browser.newContext({ storageState: `tests/.auth/allocation-${info.project.name}.json`, baseURL: "http://localhost:3101", viewport: info.project.use.viewport });
  try {
    const page = await context.newPage();
    await page.goto("/student");
    await page.getByLabel("เลือกใบรายงานผลการศึกษา PDF").setInputFiles(`tests/.auth/allocation-${info.project.name}.pdf`);
    await page.getByRole("button", { name: "อ่าน PDF เป็นร่าง", exact: true }).click();
    await expect(page.getByRole("heading", { name: "ตรวจข้อมูลก่อนเริ่มวางแผน", exact: true })).toBeVisible();
    await page.getByLabel("ฉันตรวจข้อมูลสรุปและจุดที่แจ้งกับต้นฉบับแล้ว และยืนยันว่าเป็นใบผลการเรียนของฉัน").check();
    await page.getByRole("button", { name: "ยืนยันข้อมูลชุดนี้", exact: true }).click();
    await expect(page.getByRole("heading", { name: "ความก้าวหน้าตามหมวด", exact: true })).toBeVisible();
    await expect(page.getByText(/เฉพาะด้านเลือก · 15\/15/)).toBeVisible();
    await expect(page.getByText(/เลือกเสรี · 6\/6/)).toBeVisible();
    await expect(page.getByRole("row").filter({ hasText: "991006" }).getByRole("cell").nth(1)).toHaveText("เลือกเสรี");
    await expect(page.getByRole("row").filter({ hasText: "991006" })).toContainText("ไม่นับซ้ำ");
    await expect(page.getByText("เกรดเฉลี่ยวิชาเฉพาะ", { exact: true })).toBeVisible();
    await page.getByRole("combobox", { name: "สายที่ดูผล", exact: true }).selectOption("cooperative");
    await expect(page.getByText(/เฉพาะด้านเลือก · 9\/9/)).toBeVisible();
    await expect(page.getByText(/เลือกเสรี · 12\/6/)).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath(`category-agreement/allocation-${info.project.name}.png`), fullPage: true });
  } finally { await context.close(); }
});
