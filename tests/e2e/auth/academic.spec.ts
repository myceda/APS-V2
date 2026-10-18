import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { academicDataset } from "../../support/academic-fixtures";
import type { Dataset } from "@/modules/curriculum/types";
import { COURSE_COLUMNS, csvCell } from "@/modules/curriculum/csv";
test.use({ video: "on" });
test("ผู้ดูแลสร้างร่าง แก้ข้อมูล นำเข้า และเผยแพร่ผ่าน UI", async ({
  page,
}) => {
  await page
    .context()
    .addCookies(
      JSON.parse(await readFile("tests/.auth/admin.json", "utf8")).cookies,
    );
  await page.goto("/admin/academic");
  await expect(
    page.getByRole("heading", { name: "หลักสูตรและการเปิดสอน", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "สร้างร่าง CS2565 เริ่มต้น", exact: true })
    .click();
  await expect(
    page.getByText(
      "สร้างร่าง CS2565 แล้ว ตรวจข้อมูลก่อนเผยแพร่",
    ),
  ).toBeVisible();
  await page.getByLabel("รหัสวิชา", { exact: true }).fill("101099");
  await page
    .getByLabel("ชื่อรายวิชา", { exact: true })
    .fill("Synthetic UI Course");
  await page
    .getByRole("combobox", { name: "นโยบายเกรดรายวิชา", exact: true })
    .selectOption("numeric");
  await page
    .getByLabel("แหล่งกฎ / หน้าเอกสาร", { exact: true })
    .fill("Synthetic UI fixture");
  await page
    .getByRole("button", { name: "เพิ่มรายวิชาในร่าง", exact: true })
    .click();
  await page
    .getByRole("button", { name: "บันทึกร่างข้อมูล", exact: true })
    .click();
  await expect(
    page.getByText("บันทึกร่างแล้ว ยังไม่เผยแพร่", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "นำเข้า Excel/CSV", exact: true })
    .click();
  const csv =
    COURSE_COLUMNS.join(",") +
    "\n" +
    [
      "101098",
      "Synthetic CSV Course",
      3,
      "specific_elective",
      "",
      "numeric",
      true,
      "all",
      "",
      false,
      false,
      "Synthetic import fixture",
    ]
      .map(csvCell)
      .join(",");
  await page
    .getByLabel("ไฟล์รายวิชา CSV UTF-8 หรือ Excel", { exact: true })
    .setInputFiles({
      name: "synthetic.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(csv),
    });
  await page
    .getByRole("button", { name: "ตรวจตัวอย่างไฟล์", exact: true })
    .click();
  await expect(
    page.getByText("1/1 แถวอ่านได้ ยังไม่ได้บันทึกหรือเผยแพร่"),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "นำแถวที่ตรวจผ่านเข้าสู่ร่าง", exact: true })
    .click();
  await page
    .getByRole("button", { name: "บันทึกร่างข้อมูล", exact: true })
    .click();
  await expect(
    page.getByText("บันทึกร่างแล้ว ยังไม่เผยแพร่", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "ตรวจและเผยแพร่", exact: true }).click();
  await page
    .getByRole("button", { name: "ตรวจและเผยแพร่ฉบับ", exact: true })
    .click();
  await expect(
    page.getByText("เผยแพร่แล้ว บางผลยังมีข้อจำกัดจากเงื่อนไขที่ยังไม่ยืนยัน", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "บันทึกร่างข้อมูล", exact: true }),
  ).toBeDisabled();
  await test.info().attach("ผู้ดูแลข้อมูลวิชาการ", {
    body: await page.screenshot({ fullPage: true }),
    contentType: "image/png",
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test("นักศึกษา PDF ถึงยืนยัน วิเคราะห์ สองสาย แผน What-if และฉบับเดิม", async ({
  browser,
}, info) => {
  const adminContext = await browser.newContext({
    storageState: "tests/.auth/admin.json",
    baseURL: "http://localhost:3101",
  });
  try {
    const list = await adminContext.request.get("/api/admin/academic");
    expect(list.ok()).toBe(true);
    const metadata = await list.json();
    const created = await adminContext.request.post("/api/admin/academic", {
      headers: { origin: "http://localhost:3101" },
      data: { action: "create", versionId: metadata.versions[0].id },
    });
    expect(created.status()).toBe(201);
    const draft: Dataset = await created.json();
    const fixture = academicDataset(draft);
    fixture.offerings.push({courseCode:"101003",year:2569,semester:1,availability:"unknown",confidence:"planned",source:"Synthetic unknown offering"});
    const saved = await adminContext.request.post("/api/admin/academic", {
      headers: { origin: "http://localhost:3101" },
      data: {
        action: "save",
        id: draft.id,
        expectedVersion: draft.editVersion,
        dataset: fixture,
      },
    });
    expect(saved.ok()).toBe(true);
    const savedData = await saved.json();
    expect(
      (
        await adminContext.request.post("/api/admin/academic", {
          headers: { origin: "http://localhost:3101" },
          data: {
            action: "publish",
            id: draft.id,
            expectedVersion: savedData.editVersion,
          },
        })
      ).ok(),
    ).toBe(true);
  } finally {
    await adminContext.close();
  }
  const context = await browser.newContext({
    storageState: `tests/.auth/academic-${info.project.name}.json`,
    baseURL: "http://localhost:3101",
    viewport: info.project.use.viewport,
    recordVideo: {
      dir: "test-results-auth/academic-videos",
      size: { width: 1280, height: 720 },
    },
  });
  const page = await context.newPage(),
    errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  try {
    await page.goto("/student");
    await expect(
      page.getByRole("heading", { name: "เริ่มจากผลการเรียนของคุณ", exact: true }),
    ).toBeVisible();
    await page
      .getByLabel("เลือกใบรายงานผลการศึกษา PDF")
      .setInputFiles(`tests/.auth/academic-${info.project.name}.pdf`);
    await page
      .getByRole("button", { name: "อ่าน PDF เป็นร่าง", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "ตรวจข้อมูลก่อนเริ่มวางแผน", exact: true }),
    ).toBeVisible();
    await page
      .getByLabel(
        "ฉันตรวจข้อมูลสรุปและจุดที่แจ้งกับต้นฉบับแล้ว และยืนยันว่าเป็นใบผลการเรียนของฉัน",
      )
      .check();
    await page
      .getByRole("button", { name: "ยืนยันข้อมูลชุดนี้", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "ความก้าวหน้าตามหมวด", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("combobox", { name: "สายที่ดูผล", exact: true }),
    ).toHaveValue("project");
    await expect(page.getByText("คำนวณจากผลการเรียนที่ยืนยันแล้ว", { exact: true })).toBeVisible();
    await expect(page.getByText("แสดงสองตำแหน่ง; การเทียบเกณฑ์ใช้ค่าก่อนปัด", { exact: true })).toBeVisible();
    await expect(page.getByText("เกรดเฉลี่ยวิชาเฉพาะ", { exact: true })).toBeVisible();
    await page.screenshot({ path: `C:/Users/MyLuna/aps-v2-doc/deliverables/evidence/grade-policy/student-${info.project.name}.png`, fullPage: true });

    await page
      .getByRole("combobox", { name: "สายที่ดูผล", exact: true })
      .selectOption("cooperative");
    await expect(
      page.getByRole("combobox", { name: "สายที่ดูผล", exact: true }),
    ).toHaveValue("cooperative");
    await page
      .getByRole("combobox", { name: "สายที่ดูผล", exact: true })
      .selectOption("project");
    await page
      .getByRole("button", { name: "แผนการเรียน", exact: true })
      .click();
    await expect(
      page.getByRole("heading", {
        name: "แผนการเรียน · โครงงานวิจัย",
        exact: true,
      }),
    ).toBeVisible();
    const courseDetails = page.getByText("101002 · Synthetic Course 2 (3)", {
      exact: true,
    });
    await courseDetails.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByText("วิชาที่ต่อเนื่อง: 101003")).toBeVisible();
    await page.keyboard.press("Enter");
    await expect(page.getByText("วิชาที่ต่อเนื่อง: 101003")).not.toBeVisible();
    await expect(courseDetails).toBeFocused();
    await page.keyboard.press("Enter");
    await test.info().attach("แผนรายเทอม", {
      body: await page.screenshot({ fullPage: true }),
      contentType: "image/png",
    });
    const before = await (
      await context.request.get("/api/student/transcripts")
    ).json();
    await page
      .getByRole("button", { name: "ลองปรับแผน", exact: true })
      .click();
    await page
      .getByRole("combobox", { name: "รายวิชา", exact: true })
      .selectOption("101002");
    await page
      .getByRole("button", { name: "เปรียบเทียบกับแผนเดิม", exact: true })
      .click();
    await expect(
      page.getByText("เปรียบเทียบแล้ว ข้อมูลจริงยังคงเดิม", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("ภาคผ่านในจำลอง", { exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "ยกเลิกสถานการณ์", exact: true })
      .click();
    await expect(
      page.getByText("ภาคผ่านในจำลอง", { exact: true }),
    ).not.toBeVisible();
    await expect(
      page.getByText("ยกเลิกสถานการณ์แล้ว แผนเดิมและข้อมูลจริงยังคงเดิม", {
        exact: true,
      }),
    ).toBeVisible();
    await page.getByRole("combobox", {name:"เหตุการณ์",exact:true}).selectOption("offering_open");
    await page.getByRole("combobox", {name:"รายวิชา",exact:true}).selectOption("101003");
    await page.getByRole("button",{name:"เปรียบเทียบกับแผนเดิม",exact:true}).click();
    await expect(page.getByText("เปรียบเทียบแล้ว ข้อมูลจริงยังคงเดิม",{exact:true})).toBeVisible();
    await page.getByText("ข้อจำกัดและสมมติฐานของผลจำลอง",{exact:true}).click();
    await expect(page.getByText("101003 2569/1: สมมติเปิดสอน ข้อมูลจริงยังไม่ทราบ",{exact:true})).toBeVisible();
    const after = await (
      await context.request.get("/api/student/transcripts")
    ).json();
    expect(after.revision).toEqual(before.revision);
    await test.info().attach("ผลจำลอง", {
      body: await page.screenshot({ fullPage: true }),
      contentType: "image/png",
    });
    await page
      .getByRole("button", { name: "ผลการเรียน", exact: true })
      .click();
    await page
      .getByRole("button", { name: "สร้างร่างแก้ไขจากผลการเรียนที่ยืนยันแล้ว", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "ตรวจข้อมูลก่อนเริ่มวางแผน", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "ยกเลิกร่างนี้", exact: true })
      .click();
    await expect(
      page.getByText("ยกเลิกการแก้ไขแล้ว ผลการเรียนเดิมยังอยู่", { exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect(errors).toEqual([]);
  } finally {
    await context.close();
  }
});
