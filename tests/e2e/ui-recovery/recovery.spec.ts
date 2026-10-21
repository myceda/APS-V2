import { test, expect, type Page, type TestInfo, type Locator } from "@playwright/test";
import { readFile, mkdir } from "node:fs/promises";
import path from "node:path";

// The app honors this preference. It also prevents smooth scrolling from moving
// a disclosure between measuring and capturing its screenshot.
test.use({ reducedMotion: "reduce" });

const directory = process.env.APS_UI_AUDIT_OUTPUT_DIR || "C:/Users/MyLuna/aps-v2-doc/deliverables/ui-audit/round-9";
const phase = process.env.ROUND9_PHASE === "before" ? "before" : "after";
async function fixture() { return JSON.parse(await readFile("tests/.auth/round-9.json", "utf8")); }
async function identity(page: Page, key: string) {
  await page.context().addCookies((await fixture()).storageStates[key].cookies);
}
async function capture(page: Page, info: TestInfo, name: string, target?: Locator) {
  const folder = path.join(directory, "images", phase);
  await mkdir(folder, { recursive: true });
  const file = path.join(folder, `${name}-${info.project.name}.png`);
  if (target) {
    await target.evaluate(e => e.scrollIntoView({ block: "start", behavior: "instant" }));
    await page.screenshot({ path: file, fullPage: false, animations: "disabled" });
  } else await page.screenshot({ path: file, fullPage: false, animations: "disabled" });
}
async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
}
async function controlsNamed(page: Page) {
  const missing = await page.locator("input:not([type=hidden]), select, textarea, button").evaluateAll(nodes => nodes.filter(n => {
    const e = n as HTMLInputElement;
    if (!e.getClientRects().length) return false;
    return !e.getAttribute("aria-label") && !e.getAttribute("aria-labelledby") && !e.labels?.length && !e.textContent?.trim();
  }).map(e => e.outerHTML.slice(0, 130)));
  expect(missing).toEqual([]);
}

test("student screens, long text, tables and keyboard disclosure", async ({ page }, info) => {
  await identity(page, "not-selected");
  await page.goto("/student");
  await page.getByRole("button", { name: "ความก้าวหน้าตามหลักสูตร", exact: true }).click();
  await expect(page.getByRole("heading", { name: "ความก้าวหน้าตามหมวด", exact: true })).toBeVisible();
  await capture(page, info, "01-student-overview"); await noOverflow(page); await controlsNamed(page);
  await page.getByRole("button", { name: "แผนการเรียน", exact: true }).click();
  const course = page.getByRole("button", { name: /^517121 ·/ });
  await expect(course).toBeVisible(); await course.focus(); await expect(course).toBeFocused();
  await page.keyboard.press("Enter");
  const panel = page.getByRole("complementary", { name: "รายละเอียดวิชาในแผน", exact: true });
  await expect(panel).toBeFocused();
  expect(await panel.evaluate(e => getComputedStyle(e).outlineStyle)).not.toBe("none");
  await capture(page, info, "02-student-plan-keyboard", panel); await noOverflow(page);
  await page.getByRole("button", { name: "ลองปรับแผน", exact: true }).click();
  await capture(page, info, "03-student-simulation", page.getByRole("heading", { name: "ถ้าวิชานี้เปลี่ยน แผนจะเปลี่ยนอย่างไร", exact: true }).locator("..")); await controlsNamed(page); await noOverflow(page);
});

test("student save failures retain draft and retry succeeds", async ({ page }, info) => {
  await identity(page, "unknown"); await page.goto("/student");
  const header = page.getByText("ข้อมูลนักศึกษาจาก PDF", { exact: true });
  if (!await header.locator("..").evaluate(e => (e as HTMLDetailsElement).open)) await header.click();
  const field = page.getByLabel("ชื่อและนามสกุล", { exact: true });
  const text = "ข้อมูลทดสอบข้อความยาวสำหรับตรวจการคงร่าง ".repeat(4);
  await field.fill(text);
  const save = page.getByRole("button", { name: "บันทึกข้อมูลที่แก้ไข", exact: true });
  for (const failure of ["network", "503", "409"]) {
    await page.route("**/api/student/transcripts/*", route => {
      if (route.request().method() !== "PATCH") return route.continue();
      return failure === "network" ? route.abort("failed") : route.fulfill({ status: Number(failure), json: { error: { code: failure === "409" ? "ACADEMIC_CONFLICT" : "UNAVAILABLE", message: failure === "409" ? "ข้อมูลเปลี่ยนแล้ว กรุณาตรวจฉบับล่าสุด" : "บันทึกไม่สำเร็จ กรุณาลองอีกครั้ง" } } });
    });
    await save.click(); await expect(page.locator('p[role="alert"]')).toBeVisible();
    await expect(field).toHaveValue(text); await expect(save).toBeEnabled();
    await page.locator('p[role="alert"]').scrollIntoViewIfNeeded();
    await capture(page, info, `04-student-save-${failure}`);
    if (phase === "after" && failure === "network") await expect(page.locator('p[role="alert"]')).toContainText("ข้อมูลที่กรอกยังอยู่");
    await page.unroute("**/api/student/transcripts/*");
  }
  await save.click(); await expect(page.getByText("บันทึกร่างแล้ว ยังไม่เปลี่ยนข้อมูลยืนยัน", { exact: true })).toBeVisible();
  await expect(field).toHaveValue(text.trim()); await capture(page, info, "05-student-save-recovered");
  if (!await page.getByLabel("รหัสแถว 1", { exact: true }).isVisible()) await page.getByText("รายวิชาและผลการเรียน", { exact: true }).click();
  const table = page.getByLabel("ตารางตรวจรายวิชา เลื่อนแนวนอนได้", { exact: true });
  await table.focus(); await expect(table).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByLabel("รหัสแถว 1", { exact: true })).toBeFocused();
  await capture(page, info, "22-student-table-keyboard");
  await noOverflow(page); await controlsNamed(page);
});

test("admin screens and named controls", async ({ page }, info) => {
  await identity(page, "manager");
  for (const [url, name] of [["/admin", "06-admin-home"], ["/admin/accounts", "07-admin-accounts"], ["/admin/track-criteria", "08-admin-criteria"], ["/admin/academic", "09-admin-academic"]]) {
    await page.goto(url); await expect(page.getByRole("button", { name: "ออกจากระบบ", exact: true })).toBeVisible();
    await expect(page.getByRole("main")).toBeVisible();
    if (url === "/admin/academic") await expect(page.getByRole("combobox", { name: "ชุดข้อมูลที่เปิดดู", exact: true })).toBeEnabled();
    await capture(page, info, name); await noOverflow(page); await controlsNamed(page);
  }
});

test("admin loading failure, retry and failed save preserve data", async ({ page }, info) => {
  await identity(page, "manager");
  await page.goto("/admin/academic");
  await expect(page.getByRole("combobox", { name: "ชุดข้อมูลที่เปิดดู", exact: true })).toBeEnabled();
  const versionId = (await fixture()).versionId;
  const history = await (await page.request.get(`/api/admin/academic?versionId=${versionId}`)).json();
  const publishedId = history.datasets.find((d: { status: string }) => d.status === "published").id;
  await page.getByRole("combobox", { name: "หลักสูตรที่ดูแล", exact: true }).selectOption(versionId);
  const datasets = page.getByRole("combobox", { name: "ชุดข้อมูลที่เปิดดู", exact: true });
  await expect(datasets.locator(`option[value="${publishedId}"]`)).toBeAttached();
  await datasets.selectOption(publishedId);
  await expect(page.getByRole("button", { name: "สร้างสำเนาเป็นร่างใหม่", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "สร้างสำเนาเป็นร่างใหม่", exact: true }).click();
  await expect(page.getByLabel("แหล่งข้อมูลหลักสูตร", { exact: true })).toBeEnabled();
  const source = page.getByLabel("แหล่งข้อมูลหลักสูตร", { exact: true });
  const text = "แหล่งข้อมูลสังเคราะห์สำหรับตรวจข้อความยาว ".repeat(12);
  await source.fill(text);
  await page.route("**/api/admin/academic", route => route.request().method() === "POST" ? route.fulfill({ status: 503, json: { error: { message: "บันทึกไม่สำเร็จ กรุณาลองอีกครั้ง" } } }) : route.continue());
  await page.getByRole("button", { name: "บันทึกร่างข้อมูล", exact: true }).click();
  await expect(page.locator('p[role="alert"]')).toContainText("บันทึกไม่สำเร็จ"); await expect(source).toHaveValue(text);
  await capture(page, info, "10-admin-save-failed", page.locator('p[role="alert"]')); await page.unroute("**/api/admin/academic");
  await page.getByRole("button", { name: "บันทึกร่างข้อมูล", exact: true }).click();
  await expect(page.getByText("บันทึกร่างแล้ว ยังไม่เผยแพร่", { exact: true })).toBeVisible();
  await capture(page, info, "11-admin-save-recovered", page.getByText("บันทึกร่างแล้ว ยังไม่เผยแพร่", { exact: true }));
  await page.route("**/api/admin/academic/*", route => route.request().method() === "GET" ? route.fulfill({ status: 503, json: { error: { message: "โหลดฉบับข้อมูลไม่สำเร็จ" } } }) : route.continue());
  await page.reload(); await expect(page.locator('p[role="alert"]')).toContainText("โหลดฉบับข้อมูลไม่สำเร็จ");
  await capture(page, info, "12-admin-load-failed"); await page.unroute("**/api/admin/academic/*");
  await page.reload(); await expect(source).toBeVisible(); await capture(page, info, "13-admin-load-recovered"); await noOverflow(page);
});

test("session check failure retains edits and retry restores them", async ({ page }, info) => {
  await identity(page, "manager"); await page.goto("/admin/accounts");
  const field = page.getByLabel("อีเมล Google", { exact: true });
  await field.fill("draft-round9@aps-tests.invalid");
  await page.route("**/api/me", route => route.fulfill({ status: 503, json: { error: { code: "UNAVAILABLE" } } }));
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.getByText("ตรวจสอบบัญชีไม่สำเร็จ กรุณาลองอีกครั้ง", { exact: true })).toBeVisible();
  await expect(field).not.toBeVisible(); await capture(page, info, "14-session-check-failed");
  await page.unroute("**/api/me");
  await page.getByRole("button", { name: "ลองตรวจบัญชีอีกครั้ง", exact: true }).click();
  await expect(field).toHaveValue("draft-round9@aps-tests.invalid"); await expect(field).toBeVisible();
  await capture(page, info, "15-session-check-recovered");
});

for (const key of ["manager", "unknown"] as const) test(`expired session hides data and same account can recover unsaved form: ${key}`, async ({ page }, info) => {
  await identity(page, key); await page.goto(key === "manager" ? "/admin/accounts" : "/student");
  if (key === "unknown") {
    const header = page.getByText("ข้อมูลนักศึกษาจาก PDF", { exact: true });
    if (!await header.locator("..").evaluate(e => (e as HTMLDetailsElement).open)) await header.click();
  }
  const field = page.getByLabel(key === "manager" ? "อีเมล Google" : "ชื่อและนามสกุล", { exact: true });
  await field.fill("expired-draft-round9@aps-tests.invalid");
  const cookies = await page.context().cookies();
  await identity(page, key === "manager" ? "expiredManager" : "expiredStudent");
  expect((await page.request.get("/api/me")).status()).toBe(401);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(field).not.toBeVisible();
  await capture(page, info, `16-session-expired-${key}`);
  await expect(page.getByRole("link", { name: "เข้าสู่ระบบใหม่ในแท็บอื่น", exact: true })).toBeVisible();
  await noOverflow(page); await controlsNamed(page);
  await page.context().addCookies(cookies);
  await page.getByRole("button", { name: "ลองตรวจบัญชีอีกครั้ง", exact: true }).click();
  await expect(field).toHaveValue("expired-draft-round9@aps-tests.invalid");
  await capture(page, info, `17-session-recovered-${key}`, field.locator(".."));
});

test("expired form is never restored for a different account", async ({ page }, info) => {
  await identity(page, "manager"); await page.goto("/admin/accounts");
  const field = page.getByLabel("อีเมล Google", { exact: true });
  await field.fill("other-identity-must-not-see@aps-tests.invalid");
  await identity(page, "expiredManager");
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.getByRole("link", { name: "เข้าสู่ระบบใหม่ในแท็บอื่น", exact: true })).toBeVisible();
  await identity(page, "project");
  await page.getByRole("button", { name: "ลองตรวจบัญชีอีกครั้ง", exact: true }).click();
  await expect(page.getByRole("heading", { name: "ยังเข้าใช้งานส่วนนี้ไม่ได้", exact: true })).toBeVisible();
  await expect(field).toHaveCount(0);
  expect(await page.locator("body").textContent()).not.toContain("other-identity-must-not-see");
  await capture(page, info, "21-other-account-denied");
});

test("AND OR consent and unknown conditions have readable text", async ({ page }, info) => {
  await identity(page, "not-selected"); await page.goto("/student");
  await page.getByRole("button", { name: "แผนการเรียน", exact: true }).click();
  await expect(page.getByRole("heading", { name: /^แผนการเรียน ·/ })).toBeVisible();
  for (const [code, text] of [["517122", "ต้องผ่านอย่างน้อยหนึ่งวิชา"], ["517211", "ต้องผ่านทุกวิชา"], ["517392", "ต้องตรวจความยินยอม"], ["517494", "เงื่อนไขเพิ่มเติมยังไม่ยืนยัน"]]) {
    let course = page.getByRole("button", { name: new RegExp(`^${code} ·`) }).first();
    if (await course.count() === 0) {
      const blocked = page.locator("summary").filter({ hasText: /^วิชาที่ยังจัดไม่ได้/ });
      if (!await blocked.locator("..").evaluate(element => (element as HTMLDetailsElement).open)) await blocked.click();
      course = page.getByRole("button", { name: `ดูวิชา ${code}`, exact: true });
    }
    await expect(course).toBeVisible(); await course.focus(); await expect(course).toBeFocused();
    await page.keyboard.press("Enter");
    const detail = page.getByRole("complementary", { name: "รายละเอียดวิชาในแผน", exact: true });
    await expect(detail).toBeFocused();
    await expect(detail).toContainText(text);
    if (code === "517122" || code === "517211") {
      await expect(detail.locator("svg")).toBeVisible();
      await expect(detail.locator("li").filter({ hasText: /517121.*(ยังไม่ผ่าน|ยังต้องเรียน|ผ่านแล้ว)/ })).toBeVisible();
    }
    await capture(page, info, `18-graph-${code}`, code === "517494"
      ? detail.getByText("เงื่อนไขเพิ่มเติมยังไม่ยืนยัน — ข้อมูลทดสอบรอบ 9", { exact: true })
      : detail.getByRole("region", { name: `เงื่อนไขของ ${code}`, exact: true }));
  }
  await noOverflow(page);
});

test("real 409 keeps local edits and manual reconciliation preserves other changes", async ({ page }, info) => {
  await identity(page, "manager");
  const f = await fixture();
  const origin = { origin: "http://localhost:3101" };
  const list = await (await page.request.get(`/api/admin/academic?versionId=${f.versionId}`)).json();
  const created = await page.request.post("/api/admin/academic", { headers: origin, data: { action: "create", versionId: f.versionId, copyId: list.datasets.find((d: { status: string }) => d.status === "published").id } });
  expect(created.status()).toBe(201); const draft = await created.json();
  await page.goto("/admin/academic");
  await page.getByRole("combobox", { name: "หลักสูตรที่ดูแล", exact: true }).selectOption(f.versionId);
  await expect(page.getByRole("combobox", { name: "ชุดข้อมูลที่เปิดดู", exact: true })).toHaveValue(draft.id);
  const source = page.getByLabel("แหล่งข้อมูลหลักสูตร", { exact: true });
  const localText = "ข้อมูลที่แก้เองในแท็บแรก — ข้อมูลสังเคราะห์";
  await source.fill(localText);
  const other = structuredClone(draft); other.source = "ฉบับที่ผู้ดูแลอีกแท็บแก้"; other.unresolved = ["ข้อมูลจากอีกแท็บต้องคงอยู่"];
  const changed = await page.request.post("/api/admin/academic", { headers: origin, data: { action: "save", id: draft.id, expectedVersion: draft.editVersion, dataset: other } });
  expect(changed.ok()).toBe(true);
  const denied = page.waitForResponse(r => r.request().method() === "POST" && r.url().endsWith("/api/admin/academic"));
  await page.getByRole("button", { name: "บันทึกร่างข้อมูล", exact: true }).click();
  expect((await denied).status()).toBe(409);
  await expect(source).toHaveValue(localText);
  const stored = await (await page.request.get(`/api/admin/academic/${draft.id}`)).json();
  expect(stored.source).toBe(other.source); expect(stored.unresolved).toEqual(other.unresolved);
  const link = page.getByRole("link", { name: "เปิดฉบับล่าสุดในแท็บใหม่", exact: true });
  await expect(link).toHaveAttribute("target", "_blank");
  await capture(page, info, "19-conflict-local-retained", link.locator(".."));
  const opened = page.waitForEvent("popup"); await link.click(); const latest = await opened;
  try {
    await latest.getByRole("combobox", { name: "หลักสูตรที่ดูแล", exact: true }).selectOption(f.versionId);
    await latest.getByRole("combobox", { name: "ชุดข้อมูลที่เปิดดู", exact: true }).selectOption(draft.id);
    const latestSource = latest.getByLabel("แหล่งข้อมูลหลักสูตร", { exact: true });
    await expect(latestSource).toHaveValue(other.source);
    await latestSource.fill(localText); // Explicit user reconciliation of one field only.
    await latest.getByRole("button", { name: "บันทึกร่างข้อมูล", exact: true }).click();
    await expect(latest.getByText("บันทึกร่างแล้ว ยังไม่เผยแพร่", { exact: true })).toBeVisible();
    const final = await (await latest.request.get(`/api/admin/academic/${draft.id}`)).json();
    expect(final.source).toBe(localText); expect(final.unresolved).toEqual(other.unresolved);
    await expect(source).toHaveValue(localText);
    await capture(latest, info, "20-conflict-reconciled", latest.getByLabel("แหล่งข้อมูลหลักสูตร", { exact: true }).locator(".."));
  } finally { await latest.close(); }
});

test("student real conflict can be reconciled without losing the other field", async ({ page }, info) => {
  await identity(page, "unknown"); await page.goto("/student");
  const header = page.getByText("ข้อมูลนักศึกษาจาก PDF", { exact: true });
  if (!await header.locator("..").evaluate(e => (e as HTMLDetailsElement).open)) await header.click();
  const field = page.getByLabel("ชื่อและนามสกุล", { exact: true });
  const local = `ข้อมูลสังเคราะห์ที่แก้ในแท็บแรก ${info.project.name}`;
  await field.fill(local);
  const before = await (await page.request.get("/api/student/transcripts")).json();
  const draft = before.drafts[0];
  const payload = structuredClone(draft); payload.header.faculty.value = "คณะสังเคราะห์ที่แก้จากอีกแท็บ";
  const remote = await page.request.patch(`/api/student/transcripts/${draft.id}`, { headers: { origin: "http://localhost:3101" }, data: { expectedVersion: draft.editVersion, payload } });
  expect(remote.ok()).toBe(true);
  const denied = page.waitForResponse(r => r.request().method() === "PATCH");
  await page.getByRole("button", { name: "บันทึกข้อมูลที่แก้ไข", exact: true }).click();
  expect((await denied).status()).toBe(409); await expect(field).toHaveValue(local);
  await capture(page, info, "23-student-real-conflict", page.getByRole("link", { name: "เปิดฉบับล่าสุดในแท็บใหม่", exact: true }).locator(".."));
  const opened = page.waitForEvent("popup"); await page.getByRole("link", { name: "เปิดฉบับล่าสุดในแท็บใหม่", exact: true }).click();
  const latest = await opened;
  try {
    const detail = latest.getByText("ข้อมูลนักศึกษาจาก PDF", { exact: true });
    if (!await detail.locator("..").evaluate(e => (e as HTMLDetailsElement).open)) await detail.click();
    await expect(latest.getByLabel("คณะ", { exact: true })).toHaveValue(payload.header.faculty.value);
    await latest.getByLabel("ชื่อและนามสกุล", { exact: true }).fill(local);
    await latest.getByRole("button", { name: "บันทึกข้อมูลที่แก้ไข", exact: true }).click();
    await expect(latest.getByText("บันทึกร่างแล้ว ยังไม่เปลี่ยนข้อมูลยืนยัน", { exact: true })).toBeVisible();
    const final = await (await latest.request.get("/api/student/transcripts")).json();
    expect(final.drafts[0].header.faculty.value).toBe(payload.header.faculty.value);
    expect(final.drafts[0].header.studentName.value).toBe(local);
    expect(final.revision).toEqual(before.revision);
    await expect(field).toHaveValue(local); await capture(latest, info, "24-student-conflict-reconciled", latest.getByLabel("ชื่อและนามสกุล", { exact: true }).locator(".."));
  } finally { await latest.close(); }
});
