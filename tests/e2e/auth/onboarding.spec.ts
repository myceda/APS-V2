import { expect, test } from "@playwright/test";
import { syntheticTranscript } from "../../support/synthetic-transcript";

test("นักศึกษาใหม่อัปโหลดก่อนกรอกข้อมูล ยืนยันและเปิดกลับได้โดยไม่รออนุมัติ", async ({browser},info)=>{
 const device=info.project.name;
 const context=await browser.newContext({...info.project.use,storageState:`tests/.auth/onboarding-${device}.json`,baseURL:"http://localhost:3101"});
 try {
  const page=await context.newPage();
  await page.goto("/student");
  await expect(page.getByRole("heading",{name:"ผลการเรียน",exact:true})).toBeVisible();
  await page.getByRole("link",{name:"ข้ามไปเนื้อหาหลัก"}).focus();
  await expect(page.getByRole("link",{name:"ข้ามไปเนื้อหาหลัก"})).toBeFocused();
  await expect(page.getByRole("list",{name:"ลำดับการวางแผน"})).toBeVisible();
  await expect(page.getByRole("link",{name:"เริ่มอัปโหลด PDF",exact:true})).toBeVisible();
  expect((await context.request.get("/api/admin/enrollment-requests")).status()).toBe(403);
  const code=device==="desktop"?"6500000031":"6500000032";
  await page.getByLabel("เลือกใบรายงานผลการศึกษา PDF").setInputFiles({name:"first.pdf",mimeType:"application/pdf",buffer:syntheticTranscript(code)});
  await page.getByRole("button",{name:"อ่านข้อมูลจาก PDF",exact:true}).click();
  await expect(page.getByRole("heading",{name:"ตรวจข้อมูลก่อนเริ่มวางแผน"})).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading",{name:"ตรวจข้อมูลก่อนเริ่มวางแผน"})).toBeVisible();
  const before=await (await context.request.get("/api/student/transcripts")).json();
  expect(before.enrollment).toBeNull(); expect(before.revision).toBeNull();
  await page.getByLabel("ฉันตรวจข้อมูลสรุปและจุดที่แจ้งกับต้นฉบับแล้ว และยืนยันว่าเป็นใบผลการเรียนของฉัน").check();
  await page.getByRole("button",{name:"ยืนยันผลการเรียน",exact:true}).click();
  await expect(page.getByRole("heading",{name:"ภาพรวม",exact:true})).toBeVisible();
  await page.getByRole("button",{name:"ผลการเรียน",exact:true}).click();
  await expect(page.getByRole("list",{name:"ลำดับการวางแผน"}).getByText("4 ดูแผนและลองปรับ",{exact:true})).toHaveAttribute("aria-current","step");
  await page.getByRole("button",{name:"ความก้าวหน้าตามหลักสูตร",exact:true}).click();
  await expect(page.getByText(`รหัสนักศึกษา ${code}`,{exact:false})).toBeVisible();
  await expect(page.getByRole("heading",{name:"ความก้าวหน้าตามหมวด",exact:true})).toBeVisible();
  const after=await (await context.request.get("/api/student/transcripts")).json();
  expect(after.enrollment.studentCode).toBe(code); expect(after.enrollment.confirmationSource).toBe("student_confirmed");
  expect(after.revision).not.toBeNull();
  expect(after.analysis).not.toBeNull();
  expect(after.analysis.result.plans).toHaveLength(2);
  await expect(page.getByRole("heading",{name:"ความก้าวหน้าตามหมวด",exact:true})).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading",{name:"ความก้าวหน้าตามหมวด",exact:true})).toBeVisible();
  expect((await (await context.request.get("/api/student/transcripts")).json()).revision.id).toBe(after.revision.id);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await expect(page.getByLabel("ปีอ้างอิง พ.ศ.")).not.toBeVisible();
  await page.getByText("ปรับเงื่อนไขแผน",{exact:true}).click();
  await expect(page.getByLabel("ปีอ้างอิง พ.ศ.")).toBeVisible();
  await page.getByText("ปรับเงื่อนไขแผน",{exact:true}).click();
  await info.attach("first-upload-confirmed",{body:await page.screenshot({fullPage:true}),contentType:"image/png"});
 } finally {await context.close();}
});
