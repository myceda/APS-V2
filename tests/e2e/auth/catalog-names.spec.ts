import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";

test("ชื่อ CS2565 ที่ตรวจแล้วค้นหาและอ่านได้ในร่างผู้ดูแล", async ({ page }, info) => {
  await page.context().addCookies(JSON.parse(await readFile("tests/.auth/admin.json", "utf8")).cookies);
  await page.goto("/admin/academic");
  await page.getByRole("button", { name: "สร้างร่าง CS2565 เริ่มต้น", exact: true }).click();
  await expect(page.getByText("สร้างร่าง CS2565 แล้ว ตรวจข้อมูลก่อนเผยแพร่", { exact: true })).toBeVisible();
  const search = page.getByLabel("ค้นหารหัสหรือชื่อวิชา", { exact: true });
  for (const [code, name] of [
    ["SU110", "มนุษย์กับการสร้างสรรค์"], ["SU115", "อาหารเพื่อสุขภาพ"],
    ["511108", "แคลคูลัสสำหรับนักวิทยาศาสตร์คณนา 1"],
    ["517493", "โครงงานวิจัย 1"], ["517496", "สหกิจศึกษา"],
  ]) {
    await search.fill(code);
    await expect(page.getByRole("cell", { name: `${code} · ${name}`, exact: true })).toBeVisible();
  }
  await search.fill("SU115");
  await page.screenshot({ path: `C:/Users/MyLuna/aps-v2-doc/deliverables/evidence/curriculum-correction/admin-${info.project.name}.png`, fullPage: true });
});
