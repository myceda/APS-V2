import { test, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const run = process.env.APS_DEMO_RUN!;
const directory = path.resolve("storage/demo", run);
const output = process.env.APS_REHEARSAL_DIR!;
for (const viewport of [{ width: 1440, height: 1000 }, { width: 1280, height: 580 }, { width: 390, height: 844 }]) {
  for (const role of ["student", "admin"] as const) {
    test(`home retains ${role} identity and page scroll reaches the end at ${viewport.width}`, async ({ browser }) => {
      const context = await browser.newContext({ storageState: path.join(directory, `sessions/${role === "student" ? "not-selected" : "admin"}.json`), baseURL: "http://localhost:3102", viewport });
      try {
        const page = await context.newPage();
        await page.goto(`/${role}`);
        if (role === "admin") await expect(page.getByRole("link", { name: "จัดการหลักสูตรและการเปิดสอน", exact: true })).toBeInViewport();
        const before = await (await context.request.get("/api/me")).json();
        await page.getByRole("link", { name: "หน้าเริ่มต้น", exact: true }).click();
        await expect(page).toHaveURL(`http://localhost:3102/${role}`);
        await expect(page.getByRole("button", { name: "ออกจากระบบ", exact: true })).toBeVisible();
        await expect(page.getByRole("link", { name: "เข้าสู่ระบบ", exact: true })).toHaveCount(0);
        await page.goto("/");
        await expect(page).toHaveURL(`http://localhost:3102/${role}`);
        const response = await context.request.get("/api/me");
        expect(response.status()).toBe(200);
        const after = await response.json();
        expect(after.account.accountId).toBe(before.account.accountId);
        expect(after.account.role).toBe(role);
        if (role === "admin") {
          await page.goto("/admin/academic");
          await expect(page.getByRole("heading", { name: "เพิ่มรายวิชาในร่าง", exact: true })).toBeVisible();
          const table = page.getByRole("table").first();
          expect(await table.evaluate(el => { const container = el.parentElement!; return container.scrollHeight > container.clientHeight + 1; })).toBe(false);
        } else {
          await page.getByRole("button", { name: "ผลการเรียน", exact: true }).click();
          await page.getByRole("button", { name: "ดูข้อมูลผลการเรียน", exact: true }).click();
          await expect(page.getByRole("heading", { name: "ผลการเรียนที่บันทึกไว้", exact: true })).toBeInViewport();
        }
        await page.locator("#account-content").focus();
        await page.keyboard.press("Control+End");
        await expect(page.getByRole("link", { name: "กลับขึ้นด้านบน", exact: true })).toBeInViewport();
        await page.getByRole("link", { name: "กลับขึ้นด้านบน", exact: true }).click();
        await expect(page.locator("#account-content")).toBeFocused();
        await mkdir(path.join(output, "navigation-images"), { recursive: true });
        await page.screenshot({ path: path.join(output, `navigation-images/${role}-${viewport.width}.png`) });
      } finally { await context.close(); }
    });
  }
  test(`confirmed PDF remains readable after reload at ${viewport.width}`, async ({ browser }) => {
    const context = await browser.newContext({ storageState: path.join(directory, "sessions/not-selected.json"), baseURL: "http://localhost:3102", viewport });
    try {
      const page = await context.newPage();
      const before = await (await context.request.get("/api/student/transcripts")).json();
      const payload = before.revision.payload;
      await page.goto("/student");
      for (let round = 0; round < 2; round++) {
        await page.getByRole("button", { name: "ผลการเรียน", exact: true }).click();
        await page.getByRole("button", { name: "ดูข้อมูลผลการเรียน", exact: true }).click();
        const report = page.locator("#confirmed-transcript");
        await expect(report).toBeFocused();
        await expect(report.getByText(payload.header.studentName.value, { exact: true })).toBeVisible();
        await expect(report.getByText(payload.header.studentCode.value, { exact: true })).toBeVisible();
        await expect(report.getByRole("row")).toHaveCount(payload.attempts.length + 1);
        for (const attempt of payload.attempts) {
          const row = report.getByRole("row").filter({ hasText: attempt.courseCode });
          await expect(row.getByRole("cell", { name: attempt.name, exact: true })).toBeVisible();
          await expect(row.getByRole("cell", { name: attempt.grade, exact: true })).toBeVisible();
        }
        expect(await report.getByRole("table").evaluate(el => { const container = el.parentElement!; return container.scrollHeight > container.clientHeight + 1; })).toBe(false);
        if (round === 0) await page.reload();
      }
      const after = await (await context.request.get("/api/student/transcripts")).json();
      expect(after.revision).toEqual(before.revision);
      expect(after.enrollment).toEqual(before.enrollment);
      await mkdir(path.join(output, "navigation-images"), { recursive: true });
      await page.screenshot({ path: path.join(output, `navigation-images/confirmed-pdf-${viewport.width}.png`) });
    } finally { await context.close(); }
  });
}
