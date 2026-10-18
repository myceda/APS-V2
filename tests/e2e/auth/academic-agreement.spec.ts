import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";

test("ร่าง CS2565 แสดง S/U ตามผู้ใช้และ Algorithm ต้องผ่านวิชาก่อนครบ", async ({ page }, info) => {
  await page.context().addCookies(JSON.parse(await readFile("tests/.auth/admin.json", "utf8")).cookies);
  await page.goto("/admin/academic");
  await page.getByRole("button", { name: "สร้างร่าง CS2565 เริ่มต้น", exact: true }).click();
  await expect(page.getByText("สร้างร่าง CS2565 แล้ว ตรวจข้อมูลก่อนเผยแพร่", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "เงื่อนไขการเรียน", exact: true }).click();
  await expect(page.getByRole("combobox", { name: "การเทียบเกณฑ์ GPA", exact: true })).toHaveValue("raw");
  await expect(page.getByRole("combobox", { name: "ขอบเขต GPA เฉพาะด้าน", exact: true })).toHaveValue("all_specific");
  await expect(page.getByRole("combobox", { name: "สิทธิ์วิชาต่อเนื่องเมื่อเรียนซ้ำ", exact: true })).toHaveValue("latest_assessed");
  await expect(page.getByLabel("รหัสวิชาที่รับรอง S*/U* เทียบ S/U คั่นด้วยจุลภาค", { exact: true })).toHaveValue("511100");
  await page.getByRole("combobox", { name: "การเทียบเกณฑ์ GPA", exact: true }).selectOption("unconfirmed");
  await page.getByRole("combobox", { name: "การเทียบเกณฑ์ GPA", exact: true }).selectOption("raw");
  await page.getByRole("combobox", { name: "ขอบเขต GPA เฉพาะด้าน", exact: true }).selectOption("unconfirmed");
  await page.getByRole("combobox", { name: "ขอบเขต GPA เฉพาะด้าน", exact: true }).selectOption("all_specific");
  await page.getByRole("button", { name: "บันทึกร่างข้อมูล", exact: true }).click();
  await expect(page.getByText("บันทึกร่างแล้ว ยังไม่เผยแพร่", { exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "เงื่อนไขการเรียน", exact: true }).click();
  await expect(page.getByRole("combobox", { name: "การเทียบเกณฑ์ GPA", exact: true })).toHaveValue("raw");
  await expect(page.getByRole("combobox", { name: "ขอบเขต GPA เฉพาะด้าน", exact: true })).toHaveValue("all_specific");
  await expect(page.getByLabel("รหัสวิชาที่รับรอง S*/U* เทียบ S/U คั่นด้วยจุลภาค", { exact: true })).toHaveValue("511100");
  await page.screenshot({ path: `C:/Users/MyLuna/aps-v2-doc/deliverables/evidence/grade-policy/admin-${info.project.name}.png`, fullPage: true });
  await page.getByRole("button", { name: "รายวิชา", exact: true }).click();
  const search = page.getByLabel("ค้นหารหัสหรือชื่อวิชา", { exact: true });
  for (const code of ["517392", "517393"]) {
    await search.fill(code);
    await page.getByRole("button", { name: `แก้ ${code}`, exact: true }).click();
    await expect(page.getByRole("combobox", { name: "นโยบายเกรดรายวิชา", exact: true })).toHaveValue("su");
    await expect(page.getByLabel("แหล่งกฎ / หน้าเอกสาร", { exact: true })).toHaveValue(/ตามคำยืนยันผู้ใช้/);
  }
  await search.fill("517311");
  await page.getByRole("button", { name: "แก้ 517311", exact: true }).click();
  await expect(page.getByRole("combobox", { name: "เงื่อนไขวิชาก่อน", exact: true })).toHaveValue("all");
  await expect(page.getByLabel("รหัสวิชาก่อน คั่นด้วยจุลภาค", { exact: true })).toHaveValue("517211, 517212");
  await expect(page.getByLabel("เอกสารระบุให้เรียนพร้อมวิชาก่อนได้", { exact: true })).not.toBeChecked();
  await expect(page.getByLabel("เงื่อนไขเพิ่มเติมที่ยังไม่ยืนยัน", { exact: true })).toHaveValue(/ไม่รองรับข้อยกเว้นเรียนพร้อมสิบสัปดาห์/);
  await page.screenshot({ path: `C:/Users/MyLuna/aps-v2-doc/deliverables/evidence/grade-policy/courses-${info.project.name}.png`, fullPage: true });
});
