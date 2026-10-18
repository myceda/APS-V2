import { expect, test } from "@playwright/test";

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
