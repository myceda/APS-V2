import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

for (const target of ["signed-out", "student", "other-admin"] as const) {
  test(`Back ของแท็บผู้ดูแลไม่คืนข้อมูลเดิมเมื่ออีกแท็บเป็น ${target}`, async ({ browser }, info) => {
    const context = await browser.newContext({
      ...info.project.use,
      baseURL: "http://localhost:3101",
      storageState: "tests/.auth/manager.json",
    });
    try {
      const page = await context.newPage();
      await page.goto("/admin");
      await expect(page.getByRole("heading", { name: "วันนี้มีอะไรต้องจัดการ?", exact: true })).toBeVisible();
      await page.getByRole("link", { name: "ข้อมูลวิชาการ", exact: true }).click();
      await expect(page.getByRole("heading", { name: "หลักสูตรและการเปิดสอน", exact: true })).toBeVisible();
      // Change only this synthetic browser context, without revoking shared fixtures.
      await context.clearCookies();
      if (target !== "signed-out") {
        const state = JSON.parse(await readFile(`tests/.auth/${target === "student" ? "student" : "admin"}.json`, "utf8"));
        await context.addCookies(state.cookies);
      }
      const otherTab = await context.newPage();
      const identity = await otherTab.goto("http://localhost:3101/api/me");
      expect(identity!.status()).toBe(target === "signed-out" ? 401 : 200);
      if (target !== "signed-out") expect((await identity!.json()).account.role).toBe(target === "student" ? "student" : "admin");
      await page.goBack();
      if (target === "student") {
        await expect(page.getByRole("heading", { name: "ยังเข้าใช้งานส่วนนี้ไม่ได้", exact: true })).toBeVisible();
      } else if (target === "signed-out") {
        await expect(page).toHaveURL(/\/sign-in$/);
      } else {
        await expect(page.getByText("fixture-admin@aps-tests.invalid", { exact: true })).toBeVisible();
      }
      if (target !== "other-admin")
        await expect(page.getByRole("heading", { name: "วันนี้มีอะไรต้องจัดการ?", exact: true })).toHaveCount(0);
      await expect(page.getByText("fixture-manager@aps-tests.invalid", { exact: true })).toHaveCount(0);
      await page.reload();
      await expect(page.getByText("fixture-manager@aps-tests.invalid", { exact: true })).toHaveCount(0);
    } finally {
      await context.close();
    }
  });
}

test("ตรวจ session ขัดข้องต้องซ่อนข้อมูล และตรวจซ้ำบัญชีเดิมไม่ทำร่างหาย", async ({ browser }, info) => {
  const context = await browser.newContext({ ...info.project.use, baseURL: "http://localhost:3101", storageState: "tests/.auth/manager.json" });
  try {
    const page = await context.newPage();
    let unavailable = true;
    let sessionChecks = 0;
    await page.route("**/api/me", async (route) => {
      sessionChecks++;
      if (unavailable) await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: { code: "FIXTURE_UNAVAILABLE" } }) });
      else await route.continue();
    });
    await page.goto("/admin/accounts");
    await expect(page.getByText("ตรวจสอบบัญชีไม่สำเร็จ กรุณาลองอีกครั้ง", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "จัดการบัญชีและสิทธิ์", exact: true })).not.toBeVisible();
    unavailable = false;
    await page.getByRole("button", { name: "ลองตรวจบัญชีอีกครั้ง", exact: true }).click();
    await expect(page.getByRole("heading", { name: "จัดการบัญชีและสิทธิ์", exact: true })).toBeVisible();
    await page.getByLabel("อีเมล Google", { exact: true }).fill("unsaved-session-check@aps-tests.invalid");
    const before = sessionChecks;
    const other = await context.newPage();
    await other.goto("/sign-in");
    await page.bringToFront();
    // Headless contexts do not consistently generate an OS focus event.
    // Dispatch the browser event explicitly; still require a real HTTP recheck
    // and verify that the unsaved form survives, without relaxing assertions.
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect.poll(() => sessionChecks).toBeGreaterThan(before);
    await expect(page.getByLabel("อีเมล Google", { exact: true })).toBeVisible();
    await expect(page.getByLabel("อีเมล Google", { exact: true })).toHaveValue("unsaved-session-check@aps-tests.invalid");
  } finally {
    await context.close();
  }
});

test("ออกจากบัญชีเดิมก่อนเปลี่ยน Google และไม่กลับใช้ข้อมูลเดิมเมื่อยกเลิก", async ({
  browser,
}, info) => {
  const context = await browser.newContext({
    ...info.project.use,
    baseURL: "http://localhost:3101",
    storageState: `tests/.auth/switch-${info.project.name}.json`,
  });
  try {
    const page = await context.newPage();
    await page.goto("/student");
    await expect(
      page.getByText(`fixture-switch-${info.project.name}@aps-tests.invalid`, {
        exact: true,
      }),
    ).toBeVisible();
    await page.goto("/sign-in");
    await page
      .getByLabel("อีเมล Google ที่ต้องการเข้าใช้")
      .fill(`fixture-switch-${info.project.name}@aps-tests.invalid`);
    let socialStarted = false;
    await page.route("**/api/auth/sign-in/social", async (route) => {
      expect(route.request().postDataJSON().loginHint).toBe(
        `fixture-switch-${info.project.name}@aps-tests.invalid`,
      );
      // Observe the real logout cookie/session state before simulating cancellation.
      expect((await context.request.get("/api/me")).status()).toBe(401);
      socialStarted = true;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          url: "http://localhost:3101/sign-in?error=access_denied",
          redirect: true,
        }),
      });
    });
    await page.getByRole("button", { name: "เข้าสู่ระบบด้วย Google" }).click();
    await expect(page).toHaveURL(/error=access_denied/);
    expect(socialStarted).toBe(true);
    await expect(
      page.getByRole("alert").filter({ hasText: "ยกเลิก" }),
    ).toBeVisible();
    await page.goto("/student");
    await expect(page).toHaveURL(/\/sign-in$/);
    await expect(
      page.getByRole("heading", { name: "บัญชีนักศึกษา" }),
    ).toHaveCount(0);
  } finally {
    await context.close();
  }
});

test("กรอกอีเมลแล้ว Google ส่งบัญชีอื่น จะเห็นข้อผิดพลาดและไม่เห็นข้อมูลบัญชีเดิม", async ({
  page,
  context,
}, info) => {
  await page.goto("/sign-in");
  await page
    .getByLabel("อีเมล Google ที่ต้องการเข้าใช้")
    .fill("Requested@silpakorn.edu");
  await info.attach("requested-email-sign-in", {
    body: await page.screenshot({ fullPage: true }),
    contentType: "image/png",
  });
  await page.route("**/api/auth/sign-in/social", async (route) => {
    expect(route.request().postDataJSON().loginHint).toBe(
      "requested@silpakorn.edu",
    );
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        url: "http://localhost:3101/sign-in?error=GOOGLE_ACCOUNT_MISMATCH",
        redirect: true,
      }),
    });
  });
  await page.getByRole("button", { name: "เข้าสู่ระบบด้วย Google" }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "บัญชีที่เลือกใน Google ไม่ตรง" }),
  ).toBeVisible();
  await info.attach("wrong-google-account-message", {
    body: await page.screenshot({ fullPage: true }),
    contentType: "image/png",
  });
  expect((await context.request.get("/api/me")).status()).toBe(401);
  await page.goto("/student");
  await expect(page).toHaveURL(/\/sign-in$/);
});

test("logout ไม่สำเร็จจะไม่เริ่ม Google login", async ({ page }) => {
  await page.goto("/sign-in");
  await page
    .getByLabel("อีเมล Google ที่ต้องการเข้าใช้")
    .fill("requested@silpakorn.edu");
  let socialCalls = 0;
  await page.route("**/api/auth/sign-out", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: { message: "fixture failure" } }),
    }),
  );
  await page.route("**/api/auth/sign-in/social", async (route) => {
    socialCalls++;
    await route.abort();
  });
  await page.getByRole("button", { name: "เข้าสู่ระบบด้วย Google" }).click();
  await expect(
    page.getByText("ออกจากบัญชีเดิมไม่สำเร็จ กรุณาลองใหม่ก่อนเปลี่ยนบัญชี"),
  ).toBeVisible();
  expect(socialCalls).toBe(0);
});
