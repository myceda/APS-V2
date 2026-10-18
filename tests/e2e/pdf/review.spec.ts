import { test, expect, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import type { TranscriptPayload, DraftView } from "@/modules/transcript/types";
const root=path.resolve("storage/pdf-review/round-3"), directory=process.env.APS_PDF_RUN_DIR!;
const manifest=JSON.parse(await readFile(path.join(directory,"manifest.json"),"utf8"));
const expected: {sampleId:string;sourceSha256:string;payload:TranscriptPayload}[]=JSON.parse(await readFile(path.join(root,"expected.json"),"utf8"));
const source=process.env.APS_TRANSCRIPT_INPUT_DIR || "C:/Users/MyLuna/thesis-doc-1_69/example-transcript";
const labels=["CS_Moss","CS_F","CS_Golf","CS_Neoi","CS_Minie"];
const digest=(value:string|Buffer)=>createHash("sha256").update(value).digest("hex");
const clean=(s:string)=>s.normalize("NFKC").replace(/\s+/g," ").trim();
const review=JSON.parse(await readFile(path.join(root,"whitespace-review.json"),"utf8"));
async function context(browser:Browser,key:string) {
  return browser.newContext({storageState:path.join(directory,`${key}.session.json`),baseURL:"http://localhost:3103",viewport:test.info().project.name==="mobile"?{width:393,height:851}:{width:1440,height:1000},isMobile:test.info().project.name==="mobile"});
}
async function workspace(ctx:BrowserContext) {return (await ctx.request.get("/api/student/transcripts")).json();}
async function upload(page:Page, bytes:Buffer) {
  await page.getByRole("button",{name:"ผลการเรียน",exact:true}).click();
  await page.getByLabel("เลือกใบรายงานผลการศึกษา PDF").setInputFiles({name:"transcript.pdf",mimeType:"application/pdf",buffer:bytes});
  await page.getByRole("button",{name:"อ่าน PDF เป็นร่าง",exact:true}).click();
}
async function confirm(page:Page) {
  await page.getByRole("checkbox",{name:/ฉันตรวจข้อมูลสรุป/}).check();
  await page.getByRole("button",{name:"ยืนยันข้อมูลชุดนี้",exact:true}).click();
  await expect(page.getByText("ยืนยันผลการเรียนแล้ว",{exact:true})).toBeVisible();
}
function fieldEqual(e:unknown,a:unknown,sampleId:string,group:string,field:string,ordinal?:number) {
  if(JSON.stringify(e)===JSON.stringify(a))return true;
  if(typeof e!=="string" || typeof a!=="string")return false;
  if(clean(e)===clean(a))return true;
  return review.pairs.some((p:{sampleId:string;group:string;field:string;ordinal?:number;expectedSha256:string;actualSha256:string})=>p.sampleId===sampleId && p.group===group && p.field===field && p.ordinal===(ordinal??null) && p.expectedSha256===digest(e) && p.actualSha256===digest(a));
}
function agrees(e:TranscriptPayload,a:TranscriptPayload,id:string) {
  if(e.pages!==a.pages || e.attempts.length!==a.attempts.length)return false;
  for(const key of ["studentCode","studentName","faculty","department","degree","program","campus","studentStatus"] as const) for(const part of ["value","state","sourcePage"] as const) if(!fieldEqual(e.header[key]?.[part],a.header[key]?.[part],id,"header",`${key}.${part}`))return false;
  if(e.header.track!==a.header.track || e.header.trackState!==a.header.trackState)return false;
  for(const [i,row]of e.attempts.entries()) for(const key of Object.keys(row) as (keyof typeof row)[]) if(!fieldEqual(row[key],a.attempts[i][key],id,"rows",key,i))return false;
  const summaries=(p:TranscriptPayload)=>p.summaries.flatMap(s=>Object.entries(s.fields).filter(([key])=>key!=="raw").map(([key,value])=>JSON.stringify([s.sourcePage,s.year,s.semester,s.kind,key,value]))).sort();
  return JSON.stringify(summaries(e))===JSON.stringify(summaries(a));
}
async function openOriginal(page:Page,draft:DraftView,bytes:Buffer,filename:string) {
  await page.getByText("ดูและแก้รายละเอียดทุกรายวิชา",{exact:true}).click();
  const row=draft.attempts.find(r=>r.sourcePage>1) || draft.attempts[0];
  const link=page.getByRole("link",{name:`หน้า ${row.sourcePage}`,exact:true}).last();
  const popupPromise=page.waitForEvent("popup");
  await link.click();
  const popup=await popupPromise;
  const response=await page.context().request.get(`/api/student/documents/${draft.documentId}`);
  expect(response.status()).toBe(200);
  expect(digest(await response.body())===digest(bytes)).toBe(true);
  expect(popup.url().endsWith(`#page=${row.sourcePage}`)).toBe(true);
  // Chrome's native PDF viewer may not expose its internal DOM. Save the actual
  // visible popup for visual review; URL/hash checks alone do not certify rendering.
  await popup.waitForLoadState("load").catch(()=>undefined);
  await expect.poll(async()=> (await popup.locator("embed").count())>0 || popup.url().includes("/documents/")).toBe(true);
  await new Promise(resolve=>setTimeout(resolve,1200));
  await popup.screenshot({path:path.join(directory,filename)});
  await popup.close();
}
for(const [i,sample]of expected.entries()) test(`PDF ${sample.sampleId}: upload review source confirm analysis`,async({browser})=>{
  const ctx=await context(browser,sample.sampleId),page=await ctx.newPage();
  try {
    const bytes=await readFile(path.join(source,`${labels[i]}.pdf`));
    expect(digest(bytes)===sample.sourceSha256).toBe(true);
    await page.goto("/student");await upload(page,bytes);
    await expect(page.getByRole("heading",{name:"ตรวจข้อมูลก่อนเริ่มวางแผน",exact:true})).toBeVisible();
    const before=await workspace(ctx),draft=before.drafts[0];
    expect(agrees(sample.payload,draft,sample.sampleId)).toBe(true);
    await page.getByText("ยอดสรุปที่เอกสารรายงาน",{exact:true}).click();
    await expect(page.getByRole("cell",{name:"ยอดสะสมล่าสุด",exact:true})).toBeVisible();
    await openOriginal(page,draft,bytes,`${sample.sampleId}-original.png`);
    await page.screenshot({path:path.join(directory,`${sample.sampleId}-review.private.png`),fullPage:true});
    await confirm(page);
    await expect.poll(async()=>Boolean((await workspace(ctx)).analysis)).toBe(true);
    const after=await workspace(ctx);
    expect(agrees(sample.payload,after.revision.payload,sample.sampleId)).toBe(true);
    expect(after.analysis.stale).toBe(false);
    await writeFile(path.join(directory,`${sample.sampleId}-ids.json`),JSON.stringify({draftId:draft.id,documentId:draft.documentId,revisionId:after.revision.id,analysisId:after.analysis.id}));
  }finally{await ctx.close();}
});

test("@mobile synthetic: edit source page reconfirm cancel and block invalid data",async({browser},info)=>{
  const key=`synthetic-${info.project.name}`,ctx=await context(browser,key),page=await ctx.newPage();
  const account=manifest.accounts.find((a:{key:string})=>a.key===key);
  const bytes=Buffer.from((await readFile(path.join(root,"fixtures/synthetic.pdf"))).toString("latin1").replaceAll("6509999999",account.studentCode),"latin1");
  try {
    await page.goto("/student");await upload(page,bytes);
    await expect(page.getByRole("heading",{name:"ตรวจข้อมูลก่อนเริ่มวางแผน",exact:true})).toBeVisible();
    const first=await workspace(ctx),draft=first.drafts[0];
    expect(draft.header.studentCode.value===account.studentCode).toBe(true);
    const golden=JSON.parse(await readFile(path.join(root,"fixtures/expected.json"),"utf8"));
    expect(draft.pages).toBe(2);
    expect(draft.attempts.length).toBe(7);
    expect(draft.attempts.every((row:Record<string,unknown>,i:number)=>Object.entries(golden.rows[i]).every(([key,value])=>row[key]===value))).toBe(true);
    await page.getByText("ดูและแก้รายละเอียดทุกรายวิชา",{exact:true}).click();
    await page.getByLabel("ปีแถว 1",{exact:true}).fill("");
    await expect(page.getByRole("button",{name:"ยืนยันข้อมูลชุดนี้",exact:true})).toBeDisabled();
    await page.getByRole("button",{name:"บันทึกการแก้ร่าง",exact:true}).click();
    await expect(page.getByText("บันทึกร่างแล้ว ยังไม่เปลี่ยนข้อมูลยืนยัน",{exact:true})).toBeVisible();
    const invalid=(await workspace(ctx)).drafts[0];
    const denied=await ctx.request.post(`/api/student/transcripts/${invalid.id}/confirm`,{headers:{origin:"http://localhost:3103"},data:{expectedVersion:invalid.editVersion}});
    expect(denied.status()).toBe(422);
    expect((await denied.json()).error.code).toBe("TRANSCRIPT_REVIEW_REQUIRED");
    await page.reload();await page.getByText("ดูและแก้รายละเอียดทุกรายวิชา",{exact:true}).click();
    await page.getByLabel("ปีแถว 1",{exact:true}).fill("2568");
    await page.getByLabel("ชื่อแถว 1",{exact:true}).fill("Reviewed Withdrawn Attempt");
    await page.getByRole("button",{name:"บันทึกการแก้ร่าง",exact:true}).click();
    await expect(page.getByText("บันทึกร่างแล้ว ยังไม่เปลี่ยนข้อมูลยืนยัน",{exact:true})).toBeVisible();
    await page.reload();
    const saved=(await workspace(ctx)).drafts[0];
    expect(JSON.stringify(saved.attempts.slice(1))===JSON.stringify(draft.attempts.slice(1))).toBe(true);
    expect(saved.attempts[0].name==="Reviewed Withdrawn Attempt").toBe(true);
    expect(saved.header.campus.state).toBe("not_present");
    expect(saved.issues.filter((issue:{severity:string})=>issue.severity==="blocking").length).toBe(0);
    if(info.project.name==="desktop")await openOriginal(page,saved,bytes,"synthetic-original.png");
    else await page.getByText("ดูและแก้รายละเอียดทุกรายวิชา",{exact:true}).click();
    await page.getByLabel("ชื่อแถว 1",{exact:true}).scrollIntoViewIfNeeded();
    await page.screenshot({path:path.join(directory,`synthetic-${info.project.name}-review.png`)});
    await confirm(page);
    await expect.poll(async()=>Boolean((await workspace(ctx)).analysis)).toBe(true);
    const confirmed=await workspace(ctx);
    expect(confirmed.analysis.result.audits.every((audit:{unmapped:string[]})=>audit.unmapped.includes("999999"))).toBe(true);
    await expect(page.getByText("ยังไม่จัดหมวด: 999999",{exact:true})).toBeVisible();
    await page.getByRole("button",{name:"ผลการเรียน",exact:true}).click();
    await page.getByRole("button",{name:"สร้างร่างแก้ไขจากผลการเรียนที่ยืนยันแล้ว",exact:true}).click();
    await expect(page.getByRole("heading",{name:"ตรวจข้อมูลก่อนเริ่มวางแผน",exact:true})).toBeVisible();
    await page.getByRole("button",{name:"ยกเลิกร่างนี้",exact:true}).click();
    await expect(page.getByText("ยกเลิกการแก้ไขแล้ว ผลการเรียนเดิมยังอยู่",{exact:true})).toBeVisible();
    expect((await workspace(ctx)).revision.id===confirmed.revision.id).toBe(true);
    await page.getByRole("button",{name:"สร้างร่างแก้ไขจากผลการเรียนที่ยืนยันแล้ว",exact:true}).click();
    await page.getByText("ดูและแก้รายละเอียดทุกรายวิชา",{exact:true}).click();
    await page.getByLabel("ชื่อแถว 2",{exact:true}).fill("Reviewed Repeated Attempt");
    await confirm(page);
    const revised=await workspace(ctx);
    expect(revised.revision.id!==confirmed.revision.id).toBe(true);
    expect(revised.revision.payload.attempts[1].name==="Reviewed Repeated Attempt").toBe(true);
    await expect.poll(async()=>!(await workspace(ctx)).analysis?.stale).toBe(true);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await writeFile(path.join(directory,`${key}-ids.json`),JSON.stringify({firstRevisionId:confirmed.revision.id,currentRevisionId:revised.revision.id,firstPayloadSha256:digest(JSON.stringify(confirmed.revision.payload)),firstDraftId:draft.id,documentId:draft.documentId}));
  }finally{await ctx.close();}
});

test("@mobile rejected files show Thai errors and do not mutate records",async({browser},info)=>{
  const ctx=await context(browser,`negative-${info.project.name}`),page=await ctx.newPage();
  try {
    await page.goto("/student");
    expect(await page.getByLabel("เลือกใบรายงานผลการศึกษา PDF").evaluate(node=>{
      const label=node.closest("label")!,paragraph=label.closest("section")!.querySelector("p")!;
      return label.getBoundingClientRect().top>=paragraph.getBoundingClientRect().bottom;
    })).toBe(true);
    for(const [file,code,phrase]of [["scan.pdf","PDF_NO_TEXT","ยังไม่รองรับ OCR"],["corrupt.pdf","PDF_READ_FAILED","อ่าน PDF ไม่สำเร็จ"],["unsupported.pdf","PDF_LAYOUT_UNSUPPORTED","ไม่พบตารางผลการเรียน"],["not-pdf.txt","PDF_INVALID","กรุณาเลือก PDF"],["unknown-grade.pdf","PDF_GRADE_UNSUPPORTED","สัญลักษณ์เกรด"]]) {
      const before=await workspace(ctx);
      const responsePromise=page.waitForResponse(r=>r.url().endsWith("/api/student/transcripts") && r.request().method()==="POST");
      const bytes=file==="unknown-grade.pdf"?Buffer.from((await readFile(path.join(root,"fixtures/synthetic.pdf"))).toString("latin1").replace("(B)","(Q)"),"latin1"):await readFile(path.join(root,"fixtures",file));
      await upload(page,bytes);
      const response=await responsePromise;
      expect(response.status()).toBe(422);
      expect((await response.json()).error.code).toBe(code);
      await expect(page.getByRole("alert").filter({hasText:phrase})).toBeVisible();
      const after=await workspace(ctx);
      expect(JSON.stringify(after)===JSON.stringify(before)).toBe(true);
      expect(await page.getByRole("button",{name:"ยืนยันข้อมูลชุดนี้",exact:true}).count()).toBe(0);
      await page.screenshot({path:path.join(directory,`negative-${info.project.name}-${code}.png`)});
    }
  }finally{await ctx.close();}
});

test("@mobile foreign transcript and document are rejected",async({browser})=>{
  const ctx=await context(browser,"foreign");
  try {
    const target=JSON.parse(await readFile(path.join(directory,"sample-1-ids.json"),"utf8"));
    const before=await workspace(ctx);
    expect((await ctx.request.get(`/api/student/transcripts/${target.draftId}`)).status()).toBe(404);
    expect((await ctx.request.get(`/api/student/documents/${target.documentId}`)).status()).toBe(404);
    expect(JSON.stringify(await workspace(ctx))===JSON.stringify(before)).toBe(true);
  }finally{await ctx.close();}
});
