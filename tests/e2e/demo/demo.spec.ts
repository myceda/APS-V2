import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { DEMO_CASES, DEMO_NOTICE } from "../../../src/modules/demo/config";
import type { DemoManifest } from "../../../scripts/demo/store";
const run=process.env.APS_DEMO_RUN!;
const directory=path.resolve("storage/demo",run);
const states={"not-selected":"โครงงานวิจัย — ผ่านเกณฑ์เบื้องต้น",project:"โครงงานวิจัย — ยังไม่ผ่านเกณฑ์เบื้องต้น",cooperative:"สหกิจศึกษา — รอเจ้าหน้าที่ตรวจเงื่อนไขเพิ่มเติม","insufficient-data":"โครงงานวิจัย — ข้อมูลไม่พอสำหรับตรวจเกณฑ์","awaiting-criteria":"โครงงานวิจัย — รอข้อมูลจากผู้ดูแล"};

for(const key of DEMO_CASES)test(`ชุด ${key} มีป้ายสาธิตและสถานะตามข้อมูล`,async({browser},info)=>{
  const context=await browser.newContext({storageState:path.join(directory,"sessions",`${key}.json`),baseURL:"http://localhost:3102",viewport:info.project.use.viewport});
  try{
    const page=await context.newPage();await page.goto(key==="admin"?"/admin":"/student");
    await expect(page.getByText(DEMO_NOTICE,{exact:true})).toBeVisible();await expect(page.getByText("กำลังทดลองในบทบาท",{exact:false}).filter({has:page.locator("strong")})).toContainText(key === "admin" ? "ผู้ดูแล" : "นักศึกษา");
    const me=await (await context.request.get("/api/me")).json();expect(me.account.email).toBe(`${run}.${key}@aps-demo.invalid`);expect(me.account.canManageAccounts).toBe(false);
    if(key==="admin"){
      await page.goto("/admin/academic");await expect(page.getByRole("heading",{name:"หลักสูตรและการเปิดสอน",exact:true})).toBeVisible();
      await page.goto("/admin/track-criteria");await expect(page.getByText(/ข้อมูลสาธิต APS รอบ 2/).first()).toBeVisible();
    }else if(key==="unknown-track"){
      await expect(page.getByRole("heading",{name:"ตรวจข้อมูลก่อนเริ่มวางแผน",exact:true})).toBeVisible();
      await expect(page.getByRole("button",{name:"ยืนยันผลการเรียน",exact:true})).toBeDisabled();
      const analysis=await context.request.post("/api/student/analysis",{headers:{origin:"http://localhost:3102"},data:{}});expect(analysis.status()).toBe(422);
    }else{
      await page.getByRole("button",{name:"ภาพรวม",exact:true}).click();
      await expect(page.getByRole("region",{name:"สิทธิ์เลือกสายเบื้องต้น"}).getByRole("heading",{name:states[key],exact:true})).toBeVisible();
      await page.getByRole("button",{name:"แผนการเรียน",exact:true}).click();
      await expect(page.getByRole("heading",{name:`แผนการเรียน · ${key==="cooperative"?"สหกิจศึกษา":"โครงงานวิจัย"}`,exact:true})).toBeVisible();
      if(key==="not-selected" || key==="awaiting-criteria"){
        await page.getByRole("combobox",{name:"สายที่ดูผล",exact:true}).selectOption("cooperative");
        await expect(page.getByRole("heading",{name:"แผนการเรียน · สหกิจศึกษา",exact:true})).toBeVisible();
      }
    }
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await page.screenshot({path:path.join(directory,`${key}-${info.project.name}.png`),fullPage:true});
  }finally{await context.close();}
});

test("session แยกบัญชี ปฏิเสธข้อมูลคนอื่น และ What-if ไม่เปลี่ยน Transcript",async({browser})=>{
  const manifest:DemoManifest=JSON.parse(await readFile(path.join(directory,"manifest.json"),"utf8"));
  const student=await browser.newContext({storageState:path.join(directory,"sessions/not-selected.json"),baseURL:"http://localhost:3102"});
  const other=await browser.newContext({storageState:path.join(directory,"sessions/project.json"),baseURL:"http://localhost:3102"});
  try{
    const target=manifest.accounts.find(a=>a.key==="project")!;
    expect((await student.request.get(`/api/student/transcripts/${target.draftId}`)).status()).toBe(404);
    expect((await student.request.get("/api/admin/academic")).status()).toBe(403);
    const before=await (await student.request.get("/api/student/transcripts")).json();
    const otherBefore=await (await other.request.get("/api/student/transcripts")).json();
    const page=await student.newPage();await page.goto("/student");await page.getByRole("button",{name:"ลองปรับแผน",exact:true}).click();
    await page.getByRole("combobox",{name:"เหตุการณ์",exact:true}).selectOption("offering_open");
    await page.getByRole("combobox",{name:"รายวิชา",exact:true}).selectOption("517261");
    await page.getByRole("button",{name:"เปรียบเทียบกับแผนเดิม",exact:true}).click();
    await expect(page.getByRole("button",{name:"ยกเลิกสถานการณ์",exact:true})).toBeVisible();
    await page.getByRole("button",{name:"ยกเลิกสถานการณ์",exact:true}).click();
    const after=await (await student.request.get("/api/student/transcripts")).json();
    const otherAfter=await (await other.request.get("/api/student/transcripts")).json();
    for(const item of ["revision","enrollment"]) {expect(after[item]).toEqual(before[item]);expect(otherAfter[item]).toEqual(otherBefore[item]);}
  }finally{await student.close();await other.close();}
});
