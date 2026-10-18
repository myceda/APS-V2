import { randomUUID, createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Prisma } from "../../src/generated/prisma/client";
import type { Dataset } from "../../src/modules/curriculum/types";
import seed from "../../src/modules/curriculum/data/cs2565.json";
import type { DemoManifest } from "../demo/store";
import { configurePdfReview } from "./runtime";
configurePdfReview(); // Before importing anything that constructs a database client.
const { getDatabase } = await import("../../src/server/database");
const { createSessionFixture } = await import("../../tests/support/fixtures");
const { fingerprint, sameSnapshot } = await import("../demo/store");
const { validateDataset } = await import("../../src/modules/curriculum/validation");
const root = path.resolve("storage/pdf-review/round-3"), run = `pdf-${Date.now().toString(36)}`;
const directory = path.join(root, run);
const db = getDatabase();
const json = (v: unknown): Prisma.InputJsonValue => JSON.parse(JSON.stringify(v));
interface Sample { sampleId: string; sourceSha256: string; payload: {header:{studentCode:{value:string}; track:string|null; trackState:"selected"|"not_selected"|"unknown"}} }
try {
  const expected: Sample[] = JSON.parse(await readFile(path.join(root,"expected.json"),"utf8"));
  if (expected.length !== 5 || new Set(expected.map(s=>s.sampleId)).size !== 5) throw new Error("Expected samples missing or duplicated");
  const m = { schemaVersion:1, run, state:"preparing", curriculumId:randomUUID(),curriculumCode:`CS2565-PDF-${run}`,versionId:randomUUID(),versionCode:`CS2565-PDF-${run}-v1`,datasetIds:[randomUUID()],trackIds:{project:randomUUID(),cooperative:randomUUID()},accounts:[],createdAt:new Date().toISOString(),outsideBefore:{},seedSha256:"",recipeSha256:"",note:"Private PDF review fixtures; not Google authentication or official academic approval" } as unknown as DemoManifest;
  const cases = [...expected, ...["synthetic-desktop","synthetic-mobile","negative-desktop","negative-mobile","foreign"].map(sampleId=>({sampleId,sourceSha256:"",payload:{header:{studentCode:{value:"6509999999"},track:null,trackState:"not_selected" as const}}}))];
  const accounts = cases.map((s,i)=>({key:s.sampleId,email:`${run}.${s.sampleId}@aps-pdf.invalid`,userId:randomUUID(),accountId:randomUUID(),enrollmentId:randomUUID(),studentCode:i<5?s.payload.header.studentCode.value:`650999999${i-5}`,documentId:"",draftId:"",versionId:m.versionId,payload:s.payload}));
  m.accounts=accounts as unknown as DemoManifest["accounts"];
  Object.assign(m,{sourceHashes:expected.map(s=>({sampleId:s.sampleId,sha256:s.sourceSha256})),expectedSha256:createHash("sha256").update(await readFile(path.join(root,"expected.json"))).digest("hex"),whitespaceReviewSha256:createHash("sha256").update(await readFile(path.join(root,"whitespace-review.json"))).digest("hex")});
  m.recipeSha256=createHash("sha256").update(await readFile(path.join(root,"fixtures/synthetic.pdf"))).digest("hex");
  await mkdir(directory,{recursive:true});
  m.outsideBefore=await fingerprint(m,false);
  await writeFile(path.join(directory,"manifest.json"),JSON.stringify(m,null,2),{flag:"wx",mode:0o600});
  const catalogue = structuredClone(seed) as unknown as Dataset;
  Object.assign(catalogue,{id:m.datasetIds[0],curriculumVersionId:m.versionId,version:1,editVersion:1,status:"published"});
  if(validateDataset(catalogue).length)throw new Error("Copied seed is not valid");
  m.seedSha256=createHash("sha256").update(await readFile("src/modules/curriculum/data/cs2565.json")).digest("hex");
  await db.$transaction(async tx=>{
    await tx.curriculum.create({data:{id:m.curriculumId,code:m.curriculumCode,name:"ข้อมูลทดสอบ PDF รอบ 3"}});
    for (const versionId of new Set(accounts.map(a=>a.versionId))) {
      await tx.curriculumVersion.create({data:{id:versionId,curriculumId:m.curriculumId,code:versionId===m.versionId?m.versionCode:`${m.versionCode}-${versionId}`}});
      for (const track of ["project","cooperative"] as const) await tx.track.create({data:{id:versionId===m.versionId?m.trackIds[track]:randomUUID(),curriculumVersionId:versionId,code:track,name:track}});
      // Test-only copy; never published into the canonical CS2565 context.
      await tx.academicDataset.create({data:{id:versionId===m.versionId?m.datasetIds[0]:randomUUID(),curriculumVersionId:versionId,version:1,status:"published",publishedAt:new Date(),source:"ข้อมูลทดสอบ PDF รอบ 3; copied seed with OPEN retained",policy:json(catalogue.policy),groups:json(catalogue.groups),unresolved:json(catalogue.unresolved),courses:{create:catalogue.courses.map(c=>({...c,prerequisite:json(c.prerequisite)}))},offerings:{create:catalogue.offerings}}});
    }
    for (const a of accounts) {
      await tx.user.create({data:{id:a.userId,email:a.email,name:`ข้อมูลทดสอบ PDF ${a.key}`,emailVerified:true}});
      await tx.account.create({data:{userId:a.userId,providerId:"google",accountId:`pdf-fixture:${a.email}`}});
      await tx.accountAccess.create({data:{id:a.accountId,email:a.email,authUserId:a.userId,role:"student",canManageAccounts:false}});
      const track= a.payload.header.track;
      const selected=track?await tx.track.findUnique({where:{curriculumVersionId_code:{curriculumVersionId:a.versionId,code:track}}}):null;
      await tx.studentEnrollment.create({data:{id:a.enrollmentId,accountAccessId:a.accountId,curriculumVersionId:a.versionId,studentCode:a.studentCode,trackState:a.payload.header.trackState,trackId:selected?.id,confirmationSource:"admin_verified"}});
    }
  },{timeout:60_000});
  for (const a of accounts) {
    const session=await createSessionFixture(a.userId);
    await writeFile(path.join(directory,`${a.key}.session.json`),JSON.stringify({cookies:[session.cookie],origins:[]}),{mode:0o600});
  }
  m.outsideAfter=await fingerprint(m,false);
  if(!sameSnapshot(m.outsideBefore,m.outsideAfter)) throw new Error("Outside data changed during preparation");
  m.state="complete";
  await writeFile(path.join(directory,"manifest.json"),JSON.stringify(m,null,2),{mode:0o600});
  await writeFile(path.join(root,"active-run.json"),JSON.stringify({run,directory,accountKeys:accounts.map(a=>a.key)}),{mode:0o600});
  console.log(`Prepared private PDF fixture run ${run}: ${accounts.length} isolated accounts`);
} catch(error) {
  await writeFile(path.join(directory,"preparation-error.private.txt"),String(error));
  console.error("PDF fixture preparation failed; private run retained for inspection. No existing data overwritten."); process.exitCode=1;
}
finally { await db.$disconnect(); }
