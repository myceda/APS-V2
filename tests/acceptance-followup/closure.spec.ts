import { test, expect, type Page, type TestInfo } from "@playwright/test";
import { readFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { syntheticTranscript } from "../support/synthetic-transcript";

test.use({ reducedMotion: "reduce" });
const fixtures = async () => JSON.parse(await readFile("tests/.auth/acceptance-followup.json", "utf8"));
async function record(page: Page, info: TestInfo, alias: string) {
  const directory = process.env.APS_FOLLOWUP_IMAGES;
  if (!directory) throw new Error("An isolated evidence directory is required");
  await mkdir(directory, { recursive: true });
  await page.screenshot({ path: path.join(directory, `${alias}-${info.project.name}.png`), animations: "disabled" });
}
async function student(page: Page, info: TestInfo, kind: string) {
  const data = (await fixtures()).students[`${kind}-${info.project.name}`];
  await page.context().addCookies(data.storageState.cookies);
  await page.goto("/student");
  return data;
}
async function upload(page: Page, code: string, program = "Computer Science") {
  await page.getByRole("button", { name: "ผลการเรียน", exact: true }).click();
  if (program.length !== "Computer Science".length) throw new Error("Preserve PDF stream and xref byte offsets");
  const bytes = Buffer.from(syntheticTranscript(code).toString("binary").replace("Computer Science", program), "binary");
  await page.getByLabel("เลือกใบรายงานผลการศึกษา PDF").setInputFiles({ name: "synthetic.pdf", mimeType: "application/pdf", buffer: bytes });
  await page.getByRole("button", { name: "อ่านข้อมูลจาก PDF", exact: true }).click();
  await expect(page.getByText("อ่านข้อมูลแล้ว กรุณาตรวจชื่อ รหัสนักศึกษา และรายวิชาก่อนยืนยัน", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "บันทึกข้อมูลที่แก้ไข", exact: true })).toBeVisible();
}
async function workspace(page: Page) { return (await page.request.get("/api/student/transcripts")).json(); }

test("AC-AUTH-03 conflicting PDF identity and program cannot change the bound context", async ({ page }, info) => {
  const data = await student(page, info, "mismatch");
  const before = await workspace(page);
  // Feed the real parser a different synthetic student ID; do not substitute an API response.
  await upload(page, data.code === "6799999999" ? "6788888888" : "6799999999", "Other Studies   ");
  await expect(page.getByText(/รหัสนักศึกษาไม่ตรงกับข้อมูลเดิม/)).toBeVisible();
  await expect(page.getByRole("button", { name: "ยืนยันผลการเรียน", exact: true })).toBeDisabled();
  const program = page.getByLabel("สาขาวิชา", { exact: true });
  await expect(page.getByText(/สาขาที่ PDF รายงานไม่ตรงกับบริบทหลักสูตร/)).toBeVisible();
  await expect(program).toHaveValue("Other Studies");
  await program.fill("Synthetic Other Program");
  await page.getByRole("button", { name: "บันทึกข้อมูลที่แก้ไข", exact: true }).click();
  await expect(page.getByText("บันทึกร่างแล้ว ยังไม่เปลี่ยนข้อมูลยืนยัน", { exact: true })).toBeVisible();
  const current = await workspace(page);
  expect(current.enrollment).toEqual(before.enrollment);
  expect(current.revision).toEqual(before.revision);
  const draft = current.drafts.find((d: { status: string }) => d.status === "draft");
  const response = await page.request.post(`/api/student/transcripts/${draft.id}/confirm`, { headers: { origin: "http://localhost:3101" }, data: { expectedVersion: draft.editVersion } });
  expect(response.status()).toBe(422);
  expect((await response.json()).error.code).toBe("TRANSCRIPT_REVIEW_REQUIRED");
  await page.reload();
  expect((await workspace(page)).enrollment).toEqual(before.enrollment);
  await expect(program).toHaveValue("Synthetic Other Program");
  await record(page, info, "pdf-context-blocked");
});

test("AC-GRAPH-02 concurrent prerequisites have keyboard accessible text and source", async ({ page }, info) => {
  await page.context().addCookies((await fixtures()).storageStates["not-selected"].cookies);
  await page.goto("/student");
  await page.getByRole("button", { name: "แผนการเรียน", exact: true }).click();
  const course = page.getByRole("button", { name: /^517122 ·/ });
  await expect(course).toBeVisible(); await course.focus(); await expect(course).toBeFocused();
  await page.keyboard.press("Enter");
  const detail = page.getByRole("complementary", { name: "รายละเอียดวิชาในแผน", exact: true });
  await expect(detail).toBeFocused();
  await expect(detail).toContainText("หรือเรียนพร้อมกันตามเงื่อนไขที่ระบุ");
  await expect(detail.locator("li").filter({ hasText: /517121/ }).first()).toBeVisible();
  await expect(detail.locator("svg")).toBeVisible();
  await expect(course).toHaveAttribute("aria-pressed", "true");
  await detail.scrollIntoViewIfNeeded();
  await record(page, info, "concurrent-rule");

});

test("AC-ADMIN-03 publication preview preserves every unresolved rule and its affected capability", async ({ page }, info) => {
  const fixture = await fixtures();
  await page.context().addCookies(fixture.storageStates.manager.cookies);
  await page.goto("/admin/academic");
  await page.getByRole("combobox", { name: "หลักสูตรที่ดูแล", exact: true }).selectOption(fixture.versionId);
  await expect(page.getByRole("combobox", { name: "ชุดข้อมูลที่เปิดดู", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "ตรวจและเผยแพร่", exact: true }).click();
  const readiness = page.getByRole("region", { name: "ความสามารถที่ยังมีข้อจำกัด", exact: true });
  await expect(readiness).toBeVisible();
  await expect(readiness.getByRole("listitem")).toHaveCount(13);
  for (const code of ["01", "02", "03", "04/10", "05", "16", "06", "07", "08/09", "11/12", "14", "15", "17"]) {
    await expect(readiness.getByRole("listitem").filter({ hasText: `OPEN-${code}:` })).toHaveCount(1);
  }
  await expect(readiness).toContainText("ยังไม่รับรอง");
  await expect(readiness).toContainText("ข้อมูลเพิ่มเติมเป็นหน้าที่ผู้ดูแล");
  await readiness.scrollIntoViewIfNeeded();
  await record(page, info, "publication-limitations");
});

test("AC-UX-01 empty draft confirmed revised and multiple drafts survive refresh and fresh session", async ({ page }, info) => {
  const data = await student(page, info, "lifecycle");
  let stage = 0;
  async function reloadAndReenter() {
    const saved = await workspace(page);
    await page.reload();
    expect(await workspace(page)).toEqual(saved);
    await page.getByRole("button", { name: "ออกจากระบบ", exact: true }).click();
    await expect.poll(async () => (await page.request.get("/api/me")).status()).toBe(401);
    await page.context().addCookies([data.reentries[stage++]]);
    await page.goto("/student");
    expect(await workspace(page)).toEqual(saved);
  }
  expect((await workspace(page)).revision).toBeNull();
  await reloadAndReenter();
  await record(page, info, "empty-state");
  await upload(page, data.code);
  const state = await workspace(page);
  await reloadAndReenter();
  expect((await workspace(page)).drafts.length).toBe(state.drafts.length);
  await expect(page.getByRole("button", { name: "ยืนยันผลการเรียน", exact: true })).toBeVisible();
  await page.getByRole("checkbox", { name: /ฉันตรวจข้อมูลสรุป/ }).check();
  await page.getByRole("button", { name: "ยืนยันผลการเรียน", exact: true }).click();
  await expect(page.getByText("ยืนยันผลการเรียนแล้ว", { exact: true })).toBeVisible();
  const confirmed = (await workspace(page)).revision;
  expect(confirmed).not.toBeNull();
  await reloadAndReenter(); expect((await workspace(page)).revision).toEqual(confirmed);
  await page.getByRole("button", { name: "ผลการเรียน", exact: true }).click();
  await page.getByRole("button", { name: "แก้ไขผลการเรียน", exact: true }).click();
  await expect(page.getByRole("button", { name: "บันทึกข้อมูลที่แก้ไข", exact: true })).toBeVisible();
  await reloadAndReenter();
  await upload(page, data.code);
  const multiple = await workspace(page);
  expect(multiple.drafts.filter((d: { status: string }) => d.status === "draft").length).toBeGreaterThanOrEqual(2);
  await reloadAndReenter();
  const after = await workspace(page);
  expect(after.revision).toEqual(confirmed);
  expect(after.drafts.map((d: { id: string }) => d.id).sort()).toEqual(multiple.drafts.map((d: { id: string }) => d.id).sort());
  await record(page, info, "multiple-drafts-retained");
});

test("AC-UX-02 administrator delayed save blocks duplicates and recovers", async ({ page }, info) => {
  const fixture = await fixtures();
  await page.context().addCookies(fixture.storageStates.manager.cookies);
  await page.goto("/admin/academic");
  await page.getByRole("combobox", { name: "หลักสูตรที่ดูแล", exact: true }).selectOption(fixture.versionId);
  await expect(page.getByRole("button", { name: "สร้างสำเนาเป็นร่างใหม่", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "สร้างสำเนาเป็นร่างใหม่", exact: true }).click();
  const source = page.getByLabel("แหล่งข้อมูลหลักสูตร", { exact: true });
  await expect(source).toBeEnabled();
  const value = `ข้อมูลสังเคราะห์ตรวจการส่งซ้ำ ${info.project.name}`;
  await source.fill(value);
  let calls = 0;
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/api/admin/academic", async route => {
    if (route.request().method() !== "POST") return route.continue();
    calls++; await held;
    await route.fulfill({ status: 503, json: { error: { message: "บันทึกไม่สำเร็จ กรุณาลองอีกครั้ง" } } });
  });
  const save = page.getByRole("button", { name: "บันทึกร่างข้อมูล", exact: true });
  await save.click(); await expect(save).toBeDisabled();
  expect(calls).toBe(1); release();
  await expect(page.locator('p[role="alert"]')).toContainText("บันทึกไม่สำเร็จ");
  await expect(source).toHaveValue(value);
  await page.unroute("**/api/admin/academic");
  await save.click(); await expect(page.getByText("บันทึกร่างแล้ว ยังไม่เผยแพร่", { exact: true })).toBeVisible();
  await expect(source).toHaveValue(value);
  await record(page, info, "administrator-single-submit");
});

test("AC-UX-02 delayed save prevents duplicate submission and retry preserves edits", async ({ page }, info) => {
  await page.context().addCookies((await fixtures()).storageStates.unknown.cookies);
  await page.goto("/student");
  const field = page.getByLabel("ชื่อและนามสกุล", { exact: true });
  await field.fill(`Synthetic retry ${info.project.name}`);
  let calls = 0;
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/api/student/transcripts/*", async route => {
    if (route.request().method() !== "PATCH") return route.continue();
    calls++; await held;
    await route.fulfill({ status: 503, json: { error: { code: "TEMPORARY_FAILURE", message: "บันทึกไม่สำเร็จ กรุณาลองอีกครั้ง" } } });
  });
  const button = page.getByRole("button", { name: "บันทึกข้อมูลที่แก้ไข", exact: true });
  await button.click();
  await expect(button).toBeDisabled();
  await expect(page.locator('[aria-busy="true"]').first()).toBeVisible();
  expect(calls).toBe(1);
  release();
  await expect(page.locator('p[role="alert"]')).toContainText("บันทึกไม่สำเร็จ");
  await expect(field).toHaveValue(`Synthetic retry ${info.project.name}`);
  await expect(button).toBeEnabled();
  await page.unroute("**/api/student/transcripts/*");
  await button.click();
  await expect(page.getByText("บันทึกร่างแล้ว ยังไม่เปลี่ยนข้อมูลยืนยัน", { exact: true })).toBeVisible();
  await record(page, info, "save-retry-single-submit");
});
