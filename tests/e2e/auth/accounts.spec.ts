import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";

test.describe("ผู้ดูแลหลัก", () => {
  test.use({ storageState: "tests/.auth/manager.json" });
  test("จัดบัญชีผ่านฟอร์ม ตรวจข้อมูลซ้ำ และระงับบัญชีได้", async ({
    page,
    request,
  }) => {
    const email = `ui-${randomUUID()}@aps-tests.invalid`;
    await page.goto("/admin/accounts");
    await expect(
      page.getByRole("heading", { name: "จัดการบัญชีและสิทธิ์" }),
    ).toBeVisible();
    await page.getByLabel("อีเมล Google").fill(email);
    await page
      .getByLabel("รหัสนักศึกษาที่ตรวจแล้ว")
      .fill(`00${randomUUID().slice(0, 18)}`);
    await page.getByRole("button", { name: "บันทึกบัญชีใหม่" }).click();
    await expect(page.getByText(email, { exact: true })).toBeVisible();
    await expect(
      page.getByText(
        "บันทึกบัญชีแล้ว หากแก้สิทธิ์ ผู้ใช้นั้นต้องเข้าสู่ระบบใหม่",
      ),
    ).toBeVisible();
    await page.getByLabel("อีเมล Google").fill(email);
    await page
      .getByLabel("รหัสนักศึกษาที่ตรวจแล้ว")
      .fill(`00${randomUUID().slice(0, 18)}`);
    await page.getByRole("button", { name: "บันทึกบัญชีใหม่" }).click();
    await expect(
      page.getByRole("form", { name: "ข้อมูลบัญชี" }).getByRole("alert"),
    ).toContainText("มีในระบบแล้ว");
    await expect(page.getByLabel("อีเมล Google")).toHaveValue(email);
    await page.getByRole("button", { name: `เตรียมระงับบัญชี ${email}`, exact: true }).click();
    await expect(page.getByLabel("สถานะบัญชี")).toHaveValue("inactive");
    const pending = await request.get("/api/admin/accounts");
    expect((await pending.json()).accounts.find((account: { email: string }) => account.email === email).status).toBe("active");
    await page.getByRole("button", { name: "บันทึกการแก้ไข" }).click();
    const row = page
      .getByRole("listitem")
      .filter({ has: page.getByText(email, { exact: true }) });
    await expect(row).toContainText("ระงับบัญชี");
    const response = await request.get("/api/admin/accounts");
    expect(response.status()).toBe(200);
    const accounts = (await response.json()).accounts;
    expect(
      accounts.find((account: { email: string }) => account.email === email)
        .status,
    ).toBe("inactive");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await test.info().attach("account-manager", {
      // Capture the account whose behavior was verified. The shared synthetic
      // database grows between runs; a full-page bitmap of every account can
      // exceed Chromium's capture limits, independently of these assertions.
      body: await row.screenshot(),
      contentType: "image/png",
    });
  });
  test("API ไม่ยอมให้เพิ่มสิทธิ์ผู้ดูแลหลักหรือแก้บัญชีหลัก", async ({
    request,
  }) => {
    const response = await request.get("/api/admin/accounts");
    const body = await response.json();
    const root = body.accounts.find(
      (account: { canManageAccounts: boolean }) => account.canManageAccounts,
    );
    const curriculumId = body.curricula[0].id;
    const forged = await request.post("/api/admin/accounts", {
      headers: { origin: "http://localhost:3101" },
      data: {
        email: `forged-${randomUUID()}@aps-tests.invalid`,
        role: "admin",
        status: "active",
        curriculumIds: [curriculumId],
        canManageAccounts: true,
      },
    });
    expect(forged.status()).toBe(400);
    const rootUpdate = await request.patch(`/api/admin/accounts/${root.id}`, {
      headers: { origin: "http://localhost:3101" },
      data: {
        email: root.email,
        role: "admin",
        status: "inactive",
        curriculumIds: [curriculumId],
        expectedVersion: root.version,
      },
    });
    expect(rootUpdate.status()).toBe(403);
  });
});

test.describe("นักศึกษา", () => {
  test.use({ storageState: "tests/.auth/student.json" });
  test("เห็นบริบทตนเองและเข้าถึงรายชื่อบัญชีไม่ได้", async ({
    page,
    request,
  }) => {
    await page.goto("/student");
    await expect(
      page.getByRole("heading", { name: "ผลการเรียน", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText(/รหัสนักศึกษา.*ยังไม่ทราบสาย/),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "บัญชีและสิทธิ์ผู้ใช้" })).toHaveCount(
      0,
    );
    expect((await request.get("/api/admin/accounts")).status()).toBe(403);
    await page.goto("/admin/accounts");
    await expect(
      page.getByRole("heading", { name: "ยังเข้าใช้งานส่วนนี้ไม่ได้" }),
    ).toBeVisible();
  });
});

test.describe("ผู้ดูแลหลักสูตร", () => {
  test.use({ storageState: "tests/.auth/admin.json" });
  test("เห็นหลักสูตรที่ได้รับมอบหมาย แต่จัดบัญชีไม่ได้", async ({
    page,
    request,
  }) => {
    await page.goto("/admin");
    await expect(
      page.getByRole("heading", { name: "หลักสูตรที่ได้รับมอบหมาย" }),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "หลักสูตรที่ได้รับมอบหมาย" }).locator("..").getByRole("listitem")).toContainText("CS2565");
    await expect(page.getByRole("link", { name: "จัดการบัญชี" })).toHaveCount(
      0,
    );
    expect((await request.get("/api/admin/accounts")).status()).toBe(403);
    await page.goto("/student");
    await expect(page.getByText("บัญชีนี้ไม่มีสิทธิ์นักศึกษา")).toBeVisible();
  });
});
