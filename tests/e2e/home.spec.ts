import { expect, test } from "@playwright/test";

test("หน้าเริ่มต้นภาษาไทยอ่านได้และลิงก์เตรียมข้อมูลใช้งานได้", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const response = await page.goto("/");
  expect(response?.status()).toBe(200);
  await expect(page).toHaveTitle("APS · วางแผนการเรียนอย่างเข้าใจ");
  await expect(page.locator("html")).toHaveAttribute("lang", "th");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "วางแผนการเรียนอย่างเข้าใจ",
  );
  await expect(
    page.getByText("เข้าสู่ระบบเพื่ออัปโหลดและตรวจทานผลการเรียน"),
  ).toBeVisible();
  await expect(
    page.getByRole("list", { name: "สายการศึกษา" }).getByRole("listitem"),
  ).toHaveText(["โครงงานวิจัย", "สหกิจศึกษา"]);
  await test
    .info()
    .attach("หน้าเริ่มต้น", {
      body: await page.screenshot({ fullPage: true }),
      contentType: "image/png",
    });
  await expect(page.getByRole("link", { name: "เริ่มวางแผนการเรียน", exact: true })).toHaveAttribute("href", "/sign-in");
  await page.getByRole("link", { name: "ขั้นตอนใช้งาน" }).click();
  await expect(page).toHaveURL(/#getting-started$/);
  await expect(
    page.getByRole("heading", { name: "จากผลการเรียน สู่แผนที่เข้าใจได้" }),
  ).toBeInViewport();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});

test("ข้ามไปเนื้อหาหลักด้วยแป้นพิมพ์ได้", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Tab");
  const skipLink = page.getByRole("link", { name: "ข้ามไปเนื้อหาหลัก" });
  await expect(skipLink).toBeFocused();
  await expect(skipLink).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("main")).toBeFocused();
});

test("ไม่มี credentials ก็เปิดหน้าเข้าสู่ระบบและแจ้งความไม่พร้อมได้", async ({
  page,
}) => {
  await page.goto("/sign-in");
  await expect(
    page.getByRole("heading", { name: "เข้าสู่ระบบเพื่อเริ่มวางแผนการเรียน" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "เข้าสู่ระบบด้วย Google" }),
  ).toBeDisabled();
  await expect(
    page.getByText("การเข้าสู่ระบบ Google ยังไม่พร้อม กรุณาติดต่อผู้ดูแล"),
  ).toBeVisible();
});

test("ผู้ไม่ได้เข้าสู่ระบบถูกส่งไป sign-in และ API คืน 401", async ({
  page,
  request,
}) => {
  expect((await request.get("/api/me")).status()).toBe(401);
  await page.goto("/student");
  await expect(page).toHaveURL(/\/sign-in$/);
});

test("Google profile error explains how to try again", async ({ page }) => {
  await page.goto("/sign-in?error=unable_to_get_user_info");
  const error = page.getByRole("main").getByRole("alert");
  await expect(error).toContainText("รับข้อมูลบัญชีจาก Google ไม่สำเร็จ");
  await expect(error).toContainText("อีกครั้ง");
  await expect(page.getByRole("button", { name: "เข้าสู่ระบบด้วย Google" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: `storage/verification/google-login-error-${test.info().project.name}.png`, fullPage: true });
});
