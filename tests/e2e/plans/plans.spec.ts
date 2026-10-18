import { test, expect, type Browser, type TestInfo } from "@playwright/test";
import { mkdir, readFile } from "node:fs/promises";

async function open(browser: Browser, key: string, info: TestInfo) {
  const fixture = JSON.parse(await readFile("tests/.auth/round-5-plans.json", "utf8"));
  const context = await browser.newContext({ storageState: fixture.storageStates[key], baseURL: "http://localhost:3101", viewport: info.project.use.viewport });
  const page = await context.newPage();
  await page.goto("/student");
  return { fixture, context, page };
}
async function evidence(page: import("@playwright/test").Page, key: string, info: TestInfo) {
  const { directory } = JSON.parse(await readFile("tests/.auth/round-5-plans.json", "utf8"));
  await mkdir(`${directory}/images`, { recursive: true });
  await page.screenshot({ path: `${directory}/images/${key}-${info.project.name}.png`, fullPage: true });
  if (info.project.name === "mobile") expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
}
test("ยังไม่เลือกสายสลับสองแผนได้ เห็นเหตุผลและยังไม่อนุมัติ", async ({ browser }, info) => {
  const { page, context } = await open(browser, "not-selected", info);
  try {
    await page.getByRole("button", { name: "แผนการเรียน", exact: true }).click();
    const select = page.getByRole("combobox", { name: "สายที่ดูผล", exact: true });
    await expect(select.locator("option")).toHaveCount(2);
    const criteria = page.getByRole("region", { name: "สิทธิ์เลือกสายเบื้องต้น" });
    await expect(criteria.getByRole("heading", { name: "โครงงานวิจัย — ผ่านเกณฑ์เบื้องต้น", exact: true })).toBeVisible();
    await expect(criteria.getByRole("heading", { name: "สหกิจศึกษา — รอเจ้าหน้าที่ตรวจเงื่อนไขเพิ่มเติม", exact: true })).toBeVisible();
    await expect(criteria.getByText("การอนุมัติจากภาควิชา: ยังไม่มีหลักฐานยืนยันใน APS", { exact: true })).toBeVisible();
    for (const [track, title] of [["project", "โครงงานวิจัย"], ["cooperative", "สหกิจศึกษา"]]) {
      await select.selectOption(track);
      await expect(page.getByRole("heading", { name: `แผนการเรียน · ${title}`, exact: true })).toBeVisible();
      await expect(page.getByText(/เป็นทางเลือก ยังไม่เปลี่ยนสายจริง/)).toBeVisible();
      const summary = page.locator("summary").filter({ hasText: /^517121 ·/ }).first();
      if (!await summary.evaluate(s => (s.parentElement as HTMLDetailsElement).open)) await summary.click();
      await expect(page.getByText(/แหล่งเปิดสอน: ข้อมูลทดสอบรอบ 5/).first()).toBeVisible();
      await expect(page.getByRole("heading", { name: "วิชาที่ยังจัดไม่ได้", exact: true })).toBeVisible();
      await evidence(page, `alternative-${track}`, info);
    }
  } finally { await context.close(); }
});
for (const [key, title] of [["project", "โครงงานวิจัย"], ["cooperative", "สหกิจศึกษา"]]) {
  test(`เลือก ${key} แล้วมีแผนสายจริงเท่านั้น`, async ({ browser }, info) => {
    const { page, context, fixture } = await open(browser, key, info);
    try {
      await page.getByRole("button", { name: "แผนการเรียน", exact: true }).click();
      await expect(page.getByRole("combobox", { name: "สายที่ดูผล", exact: true }).locator("option")).toHaveCount(1);
      await expect(page.getByRole("heading", { name: `แผนการเรียน · ${title}`, exact: true })).toBeVisible();
      const own = fixture.manifest.accounts.find((a: { key: string }) => a.key === key);
      const response = await page.request.post("/api/student/scenarios", { headers: { origin: "http://localhost:3101" }, data: { analysisId: own.analysisId, track: key === "project" ? "cooperative" : "project", events: [] } });
      expect(response.status()).toBe(422);
      const other = fixture.manifest.accounts.find((a: { key: string }) => a.key === "not-selected");
      const denied = await page.request.post("/api/student/scenarios", { headers: { origin: "http://localhost:3101" }, data: { analysisId: other.analysisId, track: "project", events: [] } });
      expect(denied.status()).toBe(404);
      await evidence(page, key, info);
    } finally { await context.close(); }
  });
}
test("ข้อมูลสายกำกวมคงเป็นร่าง ไม่ยืนยันหรือสร้างแผนให้เอง", async ({ browser }, info) => {
  const { page, context, fixture } = await open(browser, "unknown", info);
  try {
    await expect(page.getByRole("button", { name: "ยืนยันข้อมูลชุดนี้", exact: true })).toBeDisabled();
    await expect(page.getByRole("combobox", { name: "สายที่ดูผล", exact: true })).toHaveCount(0);
    const own = fixture.manifest.accounts.find((a: { key: string }) => a.key === "unknown");
    const response = await page.request.post(`/api/student/transcripts/${own.draftId}/confirm`, { headers: { origin: "http://localhost:3101" }, data: { expectedVersion: 1, reviewed: true } });
    expect(response.status()).toBe(422);
    await expect(page.getByText(/ยังไม่ทราบสาย|ไม่ทราบสาย|ตรวจ.*สาย/).first()).toBeVisible();
    await evidence(page, "unknown", info);
  } finally { await context.close(); }
});
for (const key of ["absent", "wrong-cohort", "wrong-round", "expired"]) {
  test(`${key}: รอเกณฑ์โดยยังเปิดแผนสองทางเลือก`, async ({ browser }, info) => {
    const { page, context } = await open(browser, key, info);
    try {
      await page.getByRole("button", { name: "แผนการเรียน", exact: true }).click();
      const region = page.getByRole("region", { name: "สิทธิ์เลือกสายเบื้องต้น" });
      await expect(region.getByRole("heading", { name: "โครงงานวิจัย — รอข้อมูลจากผู้ดูแล", exact: true })).toBeVisible();
      await expect(region.getByRole("heading", { name: "สหกิจศึกษา — รอข้อมูลจากผู้ดูแล", exact: true })).toBeVisible();
      const select = page.getByRole("combobox", { name: "สายที่ดูผล", exact: true });
      await expect(select.locator("option")).toHaveCount(2);
      await select.selectOption("cooperative");
      await expect(page.getByRole("heading", { name: "แผนการเรียน · สหกิจศึกษา", exact: true })).toBeVisible();
      await evidence(page, key, info);
    } finally { await context.close(); }
  });
}
for (const [key, status] of [["failed", "ยังไม่ผ่านเกณฑ์เบื้องต้น"], ["pending", "ข้อมูลไม่พอสำหรับตรวจเกณฑ์"]]) {
  test(`${key}: แยกสถานะเกณฑ์และยังดูแผนได้`, async ({ browser }, info) => {
    const { page, context } = await open(browser, key, info);
    try {
      await page.getByRole("button", { name: "แผนการเรียน", exact: true }).click();
      const result = await (await page.request.get("/api/student/track-criteria?year=2569&semester=1")).json();
      expect(result.results.every((r: { status: string; approval: string }) => r.status === (key === "failed" ? "not_met" : "insufficient_data") && r.approval === "not_verified")).toBe(true);
      await expect(page.getByRole("region", { name: "สิทธิ์เลือกสายเบื้องต้น" }).getByRole("heading", { name: `โครงงานวิจัย — ${status}`, exact: true })).toBeVisible();
      await expect(page.getByRole("combobox", { name: "สายที่ดูผล", exact: true }).locator("option")).toHaveCount(2);
      await evidence(page, key, info);
    } finally { await context.close(); }
  });
}
