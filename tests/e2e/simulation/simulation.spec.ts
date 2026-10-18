import { test, expect } from "@playwright/test";
import { mkdir, readFile, writeFile } from "node:fs/promises";

const scenarios = [
  { id: "grade-a", action: "add", code: "517121", grade: "A", gpa: "3.29" },
  { id: "grade-c", action: "add", code: "517121", grade: "C", gpa: "2.71" },
  { id: "drop-numeric", action: "drop", code: "517121", difference: 1 },
  { id: "fail-numeric", action: "fail", code: "517121", difference: 1, failedGrade: "F" },
  { id: "fail-su", action: "fail", code: "517392", difference: 0, failedGrade: "U" },
  { id: "add-su-u", action: "add", code: "517392", grade: "U", difference: 0, failedGrade: "U" },
  { id: "offering-open", action: "offering_open", code: "517122", offering: "open" },
  { id: "offering-closed", action: "offering_closed", code: "517122", offering: "closed" },
  { id: "blocked-prerequisite", action: "add", code: "517122", grade: "A", warning: "ต้องผ่าน" },
  { id: "blocked-load", action: "add", code: "517392", grade: "S", warning: "เกินภาระเรียน", load: 4 },
];
for (const track of ["project", "cooperative"]) for (const scenario of scenarios) {
  test(`${track} ${scenario.id}: compare, cancel and keep actual eligibility`, async ({ browser }, info) => {
    const f = JSON.parse(await readFile("tests/.auth/round-6-simulation.json", "utf8"));
    const context = await browser.newContext({ storageState: f.states.student, baseURL: "http://localhost:3101", viewport: info.project.use.viewport });
    const page = await context.newPage();
    try {
      // Each case chooses its own baseline parameters, appending only an AnalysisRun.
      const analysis = await context.request.post("/api/student/analysis", { headers: { origin: "http://localhost:3101" }, data: { ...f.parameters, normalLoad: scenario.load ?? 8 } });
      expect(analysis.ok(), await analysis.text()).toBe(true);
      const realBefore = await (await context.request.get("/api/student/transcripts")).json();
      const criteriaBefore = await (await context.request.get("/api/student/track-criteria?year=2569&semester=1")).json();
      expect(criteriaBefore.results.every((r: { status: string }) => r.status === "not_met")).toBe(true);
      await page.goto("/student");
      await page.getByRole("button", { name: "ลองปรับแผน", exact: true }).click();
      await page.getByRole("combobox", { name: "สายที่ดูผล", exact: true }).selectOption(track);
      await page.getByRole("combobox", { name: "เหตุการณ์", exact: true }).selectOption(scenario.action);
      await page.getByRole("combobox", { name: "ภาคที่จำลอง", exact: true }).selectOption("2569/1");
      await page.getByRole("combobox", { name: "รายวิชา", exact: true }).selectOption(scenario.code);
      if (scenario.grade) await page.getByRole("combobox", { name: "เกรดสมมติ", exact: true }).selectOption(scenario.grade);
      const response = page.waitForResponse(r => r.url().endsWith("/api/student/scenarios") && r.request().method() === "POST");
      await page.getByRole("button", { name: "เปรียบเทียบกับแผนเดิม", exact: true }).click();
      const http = await response; expect(http.ok()).toBe(true); const actual = await http.json();
      await expect(page.getByText("เปรียบเทียบแล้ว ข้อมูลจริงยังคงเดิม", { exact: true })).toBeVisible();
      await expect(page.getByText("เป็นผลสมมติ แยกจาก GPAX จริงปัจจุบัน", { exact: true })).toBeVisible();
      if (scenario.gpa) {
        await expect(page.getByText(scenario.gpa, { exact: true })).toBeVisible();
        expect(actual.comparison.simulatedAudit.gpax.value.toFixed(2)).toBe(scenario.gpa);
      }
      if (scenario.difference !== undefined) expect(actual.comparison.termDifference).toBe(scenario.difference);
      if (scenario.failedGrade) expect(actual.comparison.changed.terms[0].courses.find((c: { code: string }) => c.code === scenario.code).grade).toBe(scenario.failedGrade);
      await page.getByText("ข้อจำกัดและสมมติฐานของผลจำลอง", { exact: true }).click();
      if (scenario.warning) await expect(page.getByText(new RegExp(`${scenario.code} 2569/1:.*${scenario.warning}`)).first()).toBeVisible();
      if (scenario.offering) expect(actual.comparison.offeringAssumptions).toEqual([{ courseCode: "517122", term: { year: 2569, semester: 1 }, availability: scenario.offering }]);
      const realAfter = await (await context.request.get("/api/student/transcripts")).json();
      const criteriaAfter = await (await context.request.get("/api/student/track-criteria?year=2569&semester=1")).json();
      expect(realAfter.revision).toEqual(realBefore.revision);
      expect(criteriaAfter.results).toEqual(criteriaBefore.results);
      await page.getByRole("region", { name: "สิทธิ์เลือกสายเบื้องต้น" }).getByRole("button", { name: "ตรวจเกณฑ์ล่าสุดอีกครั้ง", exact: true }).click();
      await expect(page.getByRole("heading", { name: "โครงงานวิจัย — ยังไม่ผ่านเกณฑ์เบื้องต้น", exact: true })).toBeVisible();
      const name = `${scenario.id}-${track}-${info.project.name}`;
      await mkdir(`${f.directory}/images`, { recursive: true });
      await writeFile(`${f.directory}/${name}.json`, JSON.stringify({ scenario, track, actual, actualRevisionUnchanged: true, actualCriteriaUnchanged: true }, null, 2), { flag: "wx" });
      await page.screenshot({ path: `${f.directory}/images/${name}.png`, fullPage: true });
      await page.getByRole("button", { name: "ยกเลิกสถานการณ์", exact: true }).click();
      await expect(page.getByText("ภาคผ่านในจำลอง", { exact: true })).toHaveCount(0);
      await expect(page.getByText("ยกเลิกสถานการณ์แล้ว แผนเดิมและข้อมูลจริงยังคงเดิม", { exact: true })).toBeVisible();
      await page.getByRole("button", { name: "แผนการเรียน", exact: true }).click();
      await expect(page.getByRole("heading", { name: `แผนการเรียน · ${track === "project" ? "โครงงานวิจัย" : "สหกิจศึกษา"}`, exact: true })).toBeVisible();
      expect((await (await context.request.get("/api/student/transcripts")).json()).revision).toEqual(realBefore.revision);
      if (info.project.name === "mobile") expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    } finally { await context.close(); }
  });
}
