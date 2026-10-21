import { test, expect } from "@playwright/test";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";

const expectedViews = [
  { id: "overview", label: "ภาพรวม" },
  { id: "transcript", label: "ผลการเรียน" },
  { id: "progress", label: "ความก้าวหน้าตามหลักสูตร" },
  { id: "compare", label: "เปรียบเทียบสองสาย" },
  { id: "plan", label: "แผนการเรียน" },
  { id: "what-if", label: "ลองปรับแผน" },
];

const sessions = path.resolve("storage/demo", process.env.APS_DEMO_RUN!, "sessions");
const images = path.resolve("../aps-v2-doc/deliverables/redesign/images");

test.beforeEach(async ({ page }, info) => {
  await page.setViewportSize(info.project.name === "mobile" ? { width: 390, height: 844 } : { width: 1440, height: 1000 });
  const state = JSON.parse(await readFile(path.join(sessions, "not-selected.json"), "utf8"));
  await page.context().addCookies(state.cookies);
  await mkdir(images, { recursive: true });
});

test("เปิดตรงครบหกหน้า รีเฟรช และค่าหน้าไม่รองรับกลับภาพรวม", async ({ page }, info) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  for (const view of expectedViews) {
    await page.goto(`/student?view=${view.id}`);
    await expect(page.getByRole("heading", { level: 1, name: view.label, exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: view.label, exact: true })).toHaveAttribute("aria-pressed", "true");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ scale: "css", path: path.join(images, `${view.id}-${info.project.name}.png`), fullPage: true });
    if (view.id === "plan") await page.screenshot({ scale: "css", path: path.join(images, `workspace-${info.project.name}.png`) });
  }
  await page.reload();
  await expect(page.getByRole("heading", { level: 1, name: "ลองปรับแผน", exact: true })).toBeVisible();
  await page.goto("/student?view=unsupported");
  await expect(page.getByRole("heading", { level: 1, name: "ภาพรวม", exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test("สลับหน้าและ Back/Forward รักษาร่าง พร้อมเตือนก่อนรีเฟรชและออกจากระบบ", async ({ page }) => {
  await page.context().clearCookies();
  const state = JSON.parse(await readFile(path.join(sessions, "unknown-track.json"), "utf8"));
  await page.context().addCookies(state.cookies);
  await page.goto("/student?view=transcript");
  const name = page.getByRole("textbox", { name: "ชื่อและนามสกุล", exact: true });
  await name.fill("Synthetic unsaved redesign");
  await page.getByRole("button", { name: "ภาพรวม", exact: true }).click();
  await expect(page).toHaveURL(/view=overview/);
  await page.goBack();
  await expect(name).toHaveValue("Synthetic unsaved redesign");
  await page.goForward();
  await expect(page.getByRole("heading", { level: 1, name: "ภาพรวม", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "ผลการเรียน", exact: true }).click();
  await expect(name).toHaveValue("Synthetic unsaved redesign");
  const logoutDialog = page.waitForEvent("dialog");
  const logout = page.getByRole("button", { name: "ออกจากระบบ", exact: true }).click();
  const dialog = await logoutDialog;
  expect(dialog.type()).toBe("confirm");
  await dialog.dismiss();
  await logout;
  await expect(name).toHaveValue("Synthetic unsaved redesign");
  const unloadDialog = page.waitForEvent("dialog");
  // A dismissed reload never emits "load". Evaluate the browser action so the
  // test does not wait for a navigation that the user explicitly cancelled.
  const reload = page.evaluate(() => window.location.reload());
  const unload = await unloadDialog;
  expect(unload.type()).toBe("beforeunload");
  await unload.dismiss();
  await reload;
  await expect(name).toHaveValue("Synthetic unsaved redesign");
});

test("ค้นหาและกรองความก้าวหน้า พร้อมเปิดเงื่อนไขรายวิชา", async ({ page }) => {
  await page.goto("/student?view=progress");
  await page.getByRole("button", { name: "รายวิชาถัดไป", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "แสดง 21–40" })).toBeVisible();
  await page.getByRole("searchbox", { name: "ค้นหารหัสหรือชื่อวิชา", exact: true }).fill("517121");
  await expect(page.getByRole("status").filter({ hasText: "พบ 1 รายวิชา" })).toBeVisible();
  await page.getByText("เงื่อนไขวิชา 517121", { exact: true }).click();
  await expect(page.getByRole("region", { name: "เงื่อนไขของ 517121", exact: true })).toBeVisible();
  await page.getByRole("combobox", { name: "สถานะรายวิชา", exact: true }).selectOption("unknown");
  await expect(page.getByText("ไม่พบรายวิชาตามตัวกรอง ลองเปลี่ยนคำค้นหรือเลือกทุกสถานะ", { exact: true })).toBeVisible();
});

test("เปรียบเทียบใช้ผลฐานเดียวกัน เปิดอีกสายโดยไม่เปลี่ยน enrollment", async ({ page }) => {
  const before = await (await page.request.get("/api/student/transcripts")).json();
  await page.goto("/student?view=compare");
  for (const label of ["ทางเลือกโครงงานวิจัย", "ทางเลือกสหกิจศึกษา"]) await expect(page.getByRole("article", { name: label, exact: true })).toBeVisible();
  await page.getByRole("button", { name: "เปิดแผนสหกิจศึกษา", exact: true }).click();
  await expect(page).toHaveURL(/view=plan/);
  await expect(page.getByRole("heading", { name: "แผนการเรียน · สหกิจศึกษา", exact: true })).toBeVisible();
  const after = await (await page.request.get("/api/student/transcripts")).json();
  expect(after.enrollment).toEqual(before.enrollment);
  expect(after.revision).toEqual(before.revision);
});

test("ผู้เลือกสายแล้วไม่แสดงผลอีกสาย ผู้ไม่ทราบสายได้ทางแก้ข้อมูล", async ({ page }) => {
  for (const key of ["project", "unknown-track"]) {
    await page.context().clearCookies();
    const state = JSON.parse(await readFile(path.join(sessions, `${key}.json`), "utf8"));
    await page.context().addCookies(state.cookies);
    await page.goto("/student?view=compare");
    if (key === "project") {
      await expect(page.getByText("คุณเลือกสายแล้ว ระบบแสดงเฉพาะแผนสายปัจจุบัน จึงไม่มีผลอีกสายให้เปรียบเทียบ", { exact: true })).toBeVisible();
      await expect(page.getByRole("button", { name: "เปิดแผนสหกิจศึกษา", exact: true })).toHaveCount(0);
    } else {
      await expect(page.getByRole("heading", { name: "ยังไม่มีแผนการเรียนให้แสดง", exact: true })).toBeVisible();
      await expect(page.getByRole("button", { name: "กลับไปนำเข้าและยืนยันผลการเรียน", exact: true })).toBeVisible();
    }
  }
});

test("Planner เปิดรายละเอียดด้วยแป้นพิมพ์ และเมนูชี้หน้าปัจจุบัน", async ({ page }, info) => {
  await page.goto("/student?view=plan");
  const course = page.locator('button[aria-controls="planner-course-details"]').first();
  await expect(course).toBeVisible();
  await course.focus();
  await expect(course).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("complementary", { name: "รายละเอียดวิชาในแผน", exact: true })).toBeFocused();
  await expect(page.getByRole("complementary", { name: "รายละเอียดวิชาในแผน", exact: true }).getByRole("heading", { level: 3 })).not.toHaveText("รายละเอียดและเงื่อนไข");
  await page.screenshot({ scale: "css", path: path.join(images, `course-details-${info.project.name}.png`), fullPage: true });
  if (info.project.name === "mobile") await page.getByRole("button", { name: "เปิดเมนู", exact: true }).click();
  const menu = page.getByRole("navigation", { name: "เมนูนักศึกษา", exact: true });
  await expect(menu.getByRole("link", { name: "แผนการเรียน", exact: true })).toHaveAttribute("aria-current", "page");
  await menu.getByRole("link", { name: "ความก้าวหน้าตามหลักสูตร", exact: true }).click();
  await expect(page).toHaveURL(/view=progress/);
  if (info.project.name === "mobile") await expect(page.getByRole("button", { name: "เปิดเมนู", exact: true })).toHaveAttribute("aria-expanded", "false");
});

test("What-if เครือข่ายล้มเหลวยังรักษาค่าที่กรอก และฐานล้าสมัยต้องคำนวณใหม่", async ({ page }) => {
  await page.goto("/student?view=what-if");
  await page.getByRole("combobox", { name: "เหตุการณ์", exact: true }).selectOption("offering_open");
  await page.getByRole("combobox", { name: "รายวิชา", exact: true }).selectOption("517261");
  await page.route("**/api/student/scenarios", route => route.abort());
  await page.getByRole("button", { name: "เปรียบเทียบกับแผนเดิม", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("ข้อมูลที่กรอกยังอยู่");
  await expect(page.getByRole("combobox", { name: "รายวิชา", exact: true })).toHaveValue("517261");
  await page.getByText("ปรับเงื่อนไขแผน", { exact: true }).click();
  await page.getByRole("spinbutton", { name: "เป้าหมายหน่วยกิตภาคปกติ", exact: true }).fill("13");
  await expect(page.getByRole("button", { name: "เปรียบเทียบกับแผนเดิม", exact: true })).toBeDisabled();
});

test("แอดมินมีทางเดินงานและเมนูตามสิทธิ์ โดยไม่แก้ฉบับเผยแพร่", async ({ page }, info) => {
  await page.context().clearCookies();
  const state = JSON.parse(await readFile(path.join(sessions, "admin.json"), "utf8"));
  await page.context().addCookies(state.cookies);
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "เตรียมข้อมูลตามลำดับ", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "บัญชีและสิทธิ์ผู้ใช้", exact: true })).toHaveCount(0);
  await page.screenshot({ scale: "css", path: path.join(images, `admin-home-${info.project.name}.png`), fullPage: true });
  await page.goto("/admin/academic");
  await expect(page.getByRole("list", { name: "ขั้นตอนจัดเตรียมหลักสูตร", exact: true })).toBeVisible();
  const source = page.getByRole("textbox", { name: "แหล่งข้อมูลหลักสูตร", exact: true });
  const datasets = page.getByRole("combobox", { name: "ชุดข้อมูลที่เปิดดู", exact: true });
  const published = await datasets.getByRole("option").filter({ hasText: "เผยแพร่แล้ว" }).first().getAttribute("value");
  expect(published).toBeTruthy();
  await datasets.selectOption(published!);
  await expect(source).toBeDisabled();
  await page.getByRole("combobox", { name: "กรองหมวดรายวิชา", exact: true }).selectOption("core_required");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ scale: "css", path: path.join(images, `admin-academic-${info.project.name}.png`), fullPage: true });
  await page.goto("/admin/track-criteria");
  await expect(page.getByRole("heading", { name: "เกณฑ์เลือกสาย", exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ scale: "css", path: path.join(images, `admin-criteria-${info.project.name}.png`), fullPage: true });
});

test("ขั้นตอนแอดมินกดเลือกฉบับด้วยแป้นพิมพ์ได้ และรักษาร่างระหว่างขั้น", async ({ page }, info) => {
  await page.context().clearCookies();
  const state = JSON.parse(await readFile(path.join(sessions, "admin.json"), "utf8"));
  await page.context().addCookies(state.cookies);
  await page.goto("/admin/academic");
  const source = page.getByRole("textbox", { name: "แหล่งข้อมูลหลักสูตร", exact: true });
  const dataset = page.getByRole("combobox", { name: "ชุดข้อมูลที่เปิดดู", exact: true });
  await expect(source).toBeEditable();
  const originalDataset = await dataset.inputValue();
  const writes: string[] = [];
  page.on("request", request => {
    if (request.method() === "POST" && request.url().includes("/api/admin/academic")) writes.push(request.url());
  });
  const choose = page.getByRole("button", { name: "1 เลือกฉบับ", exact: true });
  await choose.focus();
  await page.keyboard.press("Enter");
  await expect(dataset).toBeFocused();
  await expect(dataset).toBeInViewport();
  await expect(dataset).toHaveValue(originalDataset);
  const evidence = path.resolve("../aps-v2-doc/deliverables/redesign/admin-step-fix");
  await mkdir(evidence, { recursive: true });
  await page.screenshot({ scale: "css", path: path.join(evidence, `select-version-${info.project.name}.png`) });
  await source.fill("Synthetic unsaved step navigation");
  await page.getByRole("button", { name: "3 ตรวจความพร้อมและเผยแพร่", exact: true }).click();
  await expect(page.getByRole("heading", { name: "ตรวจความพร้อมก่อนเผยแพร่", exact: true })).toBeVisible();
  await choose.click();
  await expect(page.getByRole("region", { name: "เลือกหลักสูตร", exact: true })).toBeFocused();
  await expect(page.getByText("มีร่างที่ยังไม่บันทึก กรุณาบันทึกร่างข้อมูลก่อนเปลี่ยนฉบับ", { exact: true })).toBeVisible();
  await expect(dataset).toBeDisabled();
  await page.getByRole("button", { name: "2 แก้ข้อมูลและตรวจปัญหา", exact: true }).click();
  await expect(page.getByRole("heading", { name: "เพิ่มรายวิชาในร่าง", exact: true })).toBeVisible();
  await expect(source).toHaveValue("Synthetic unsaved step navigation");
  await expect(dataset).toHaveValue(originalDataset);
  expect(writes).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("รายวิชาในร่างเพิ่ม แก้ ลบ และยกเลิกงานที่ยังไม่บันทึกได้", async ({ page }) => {
  await page.context().clearCookies();
  const state = JSON.parse(await readFile(path.join(sessions, "admin.json"), "utf8"));
  await page.context().addCookies(state.cookies);
  await page.goto("/admin/academic");
  await expect(page.getByRole("textbox", { name: "แหล่งข้อมูลหลักสูตร", exact: true })).toBeEditable();
  await page.getByRole("textbox", { name: "รหัสวิชา", exact: true }).fill("R9901");
  await page.getByRole("textbox", { name: "ชื่อรายวิชา", exact: true }).fill("Synthetic CRUD course");
  await page.getByRole("textbox", { name: "แหล่งกฎ / หน้าเอกสาร", exact: true }).fill("Synthetic CRUD fixture only");
  await page.getByRole("button", { name: "เพิ่มรายวิชาในร่าง", exact: true }).click();
  await page.getByRole("textbox", { name: "ค้นหารหัสหรือชื่อวิชา", exact: true }).fill("R9901");
  await page.getByRole("button", { name: "แก้ R9901", exact: true }).click();
  await page.getByRole("textbox", { name: "ชื่อรายวิชา", exact: true }).fill("Synthetic edited course");
  await page.getByRole("button", { name: "ใช้การแก้รายวิชาในร่าง", exact: true }).click();
  await expect(page.getByRole("cell", { name: "R9901 · Synthetic edited course", exact: true })).toBeVisible();
  page.once("dialog", dialog => dialog.dismiss());
  await page.getByRole("button", { name: "ลบ R9901 จากร่าง", exact: true }).click();
  await expect(page.getByRole("button", { name: "แก้ R9901", exact: true })).toBeVisible();
  page.once("dialog", dialog => dialog.accept());
  await page.getByRole("button", { name: "ลบ R9901 จากร่าง", exact: true }).click();
  await expect(page.getByRole("button", { name: "แก้ R9901", exact: true })).toHaveCount(0);
  page.once("dialog", dialog => dialog.accept());
  await page.getByRole("button", { name: "ยกเลิกการแก้ไขที่ยังไม่บันทึก", exact: true }).click();
  await expect(page.getByText("ยกเลิกการแก้ไขที่ยังไม่บันทึกแล้ว โหลดฉบับล่าสุดจากระบบ", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "บันทึกร่างข้อมูล", exact: true })).toBeDisabled();
});

test("นักศึกษายกเลิกใช้และคืนฉบับยืนยันได้โดยไม่ลบประวัติ", async ({ page }, info) => {
  await page.goto("/student?view=transcript");
  const before = await (await page.request.get("/api/student/transcripts")).json();
  const withdraw = page.getByRole("button", { name: "ยกเลิกใช้ผลการเรียนฉบับปัจจุบัน", exact: true });
  page.once("dialog", dialog => dialog.dismiss());
  await withdraw.click();
  expect((await (await page.request.get("/api/student/transcripts")).json()).revision).toEqual(before.revision);
  page.once("dialog", dialog => dialog.accept());
  await withdraw.click();
  await expect(page.getByText("ยกเลิกใช้ผลการเรียนแล้ว ประวัติเดิมยังอยู่", { exact: true })).toBeVisible();
  const inactive = await (await page.request.get("/api/student/transcripts")).json();
  expect(inactive.revision).toBeNull(); expect(inactive.analysis).toBeNull();
  expect(inactive.revisionHistory.map((item: { id: string }) => item.id)).toContain(before.revision.id);
  page.once("dialog", dialog => dialog.accept());
  await page.getByRole("button", { name: "ใช้ฉบับนี้อีกครั้ง", exact: true }).click();
  await expect(page.getByText("เลือกฉบับผลการเรียนแล้ว กรุณาตรวจข้อมูลและคำนวณแผนใหม่", { exact: true })).toBeVisible();
  expect((await (await page.request.get("/api/student/transcripts")).json()).revision).toEqual(before.revision);
  const evidence = path.resolve("../aps-v2-doc/deliverables/crud-review/images");
  await mkdir(evidence, { recursive: true });
  await page.getByRole("heading", { name: "ประวัติฉบับผลการเรียน", exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ scale: "css", path: path.join(evidence, `student-history-${info.project.name}.png`) });
});

test("หน้าเริ่มต้นและ sign-in อธิบายขั้นตอน พร้อมสถานะ Google ไม่พร้อม", async ({ page }, info) => {
  await page.context().clearCookies();
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("วางแผนการเรียนอย่างเข้าใจ");
  await expect(page.getByText("แยกผลการเรียนจริงจากผลคาดการณ์ทุกขั้นตอน", { exact: true })).toBeVisible();
  await page.screenshot({ scale: "css", path: path.join(images, `landing-${info.project.name}.png`), fullPage: true });
  await page.getByRole("link", { name: "เริ่มวางแผนการเรียน", exact: true }).click();
  await expect(page.getByRole("list", { name: "หลังเข้าสู่ระบบ", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "เข้าสู่ระบบด้วย Google", exact: true })).toBeDisabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ scale: "css", path: path.join(images, `sign-in-${info.project.name}.png`), fullPage: true });
});

test("Back ออกจากหน้าร่างแอดมินต้องเตือน และยกเลิกแล้วยังเก็บค่าที่แก้", async ({ page }, info) => {
  await page.context().clearCookies();
  const state = JSON.parse(await readFile(path.join(sessions, "admin.json"), "utf8"));
  await page.context().addCookies(state.cookies);
  await page.goto("/admin");
  if (info.project.name === "mobile") await page.getByRole("button", { name: "เปิดเมนู", exact: true }).click();
  await page.getByRole("navigation", { name: "เมนูผู้ดูแล", exact: true }).getByRole("link", { name: "หลักสูตรและการเปิดสอน", exact: true }).click();
  const source = page.getByRole("textbox", { name: "แหล่งข้อมูลหลักสูตร", exact: true });
  await expect(source).toBeEditable();
  await source.click();
  await source.fill("Synthetic unsaved admin source");
  await expect(page.getByText("มีการแก้ที่ยังไม่บันทึก", { exact: true })).toBeVisible();
  const warning = page.waitForEvent("dialog");
  const back = page.evaluate(() => window.history.back());
  const dialog = await warning;
  expect(["confirm", "beforeunload"]).toContain(dialog.type());
  await dialog.dismiss();
  await back;
  await expect(page).toHaveURL(/\/admin\/academic$/);
  await expect(source).toHaveValue("Synthetic unsaved admin source");
  // Cancelling navigation must still recheck identity before revealing a draft.
  await page.context().clearCookies();
  const expiredWarning = page.waitForEvent("dialog");
  const expiredBack = page.evaluate(() => window.history.back());
  await (await expiredWarning).dismiss();
  await expiredBack;
  await expect(page.getByRole("link", { name: "เข้าสู่ระบบใหม่ในแท็บอื่น", exact: true })).toBeVisible();
  await expect(source).not.toBeVisible();
});
