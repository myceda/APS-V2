import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createServer } from "node:net";
import { getDatabase } from "@/server/database";
import { requireAccount } from "@/server/account-context";
import { confirmDraft, getDraft, runAnalysis, runScenario } from "@/server/academic";
import { studentCriteria } from "@/server/track-criteria";
import { assertTestDatabase } from "../support/fixtures";
import { DEMO_PARAMETERS } from "../../scripts/demo/data";
import { prepareDemo, readManifest, verifyRun, fingerprint, demoContext, demoSessions, runDirectory, type DemoManifest } from "../../scripts/demo/store";
import { startDemoServer } from "../../scripts/demo/server";

const database=getDatabase();
const run=`it-demo-${randomUUID().slice(0,8)}`;
let manifest:DemoManifest;
beforeAll(async()=>{assertTestDatabase();manifest=(await prepareDemo(run)).manifest;},90_000);
afterAll(async()=>{await database.$disconnect();});

describe("repeatable demo data without resetting other records",()=>{
  it("creates seven accounts under a separate curriculum and five real evaluator outcomes",async()=>{
    expect(manifest.accounts).toHaveLength(7);
    expect(manifest.curriculumCode).toBe(`CS2565-DEMO-${run}`);
    expect(manifest.outsideAfter).toEqual(manifest.outsideBefore);
    for(const [key,track,status] of [
      ["not-selected","project","preliminary_pass"],["project","project","not_met"],["cooperative","cooperative","manual_review"],["insufficient-data","project","insufficient_data"],["awaiting-criteria","project","awaiting_criteria"],
    ] as const){const actual=await studentCriteria(demoContext(manifest,key),DEMO_PARAMETERS.currentTerm);expect(actual.results.find(r=>r.track===track)).toMatchObject({status,approval:"not_verified"});}
    const admin=await database.accountAccess.findUniqueOrThrow({where:{id:demoContext(manifest,"admin").accountId},include:{curriculumGrants:true}});
    expect(admin.canManageAccounts).toBe(false);expect(admin.curriculumGrants.map(g=>g.curriculumId)).toEqual([manifest.curriculumId]);
  });
  it("preparing the same run again is a business no-op and preserves all outside fingerprints",async()=>{
    const before=await fingerprint(manifest,true),outside=await fingerprint(manifest,false);
    const second=await prepareDemo(run);
    expect(second.alreadyPrepared).toBe(true);expect(second.manifest).toEqual(manifest);
    expect(await fingerprint(manifest,true)).toEqual(before);expect(await fingerprint(manifest,false)).toEqual(outside);
  });
  it("unknown track retains an unconfirmed draft and rejects confirmation/analysis",async()=>{
    const context=demoContext(manifest,"unknown-track"),account=manifest.accounts.find(a=>a.key==="unknown-track")!;
    await expect(confirmDraft(context,account.draftId,1)).rejects.toMatchObject({code:"TRANSCRIPT_REVIEW_REQUIRED"});
    await expect(runAnalysis(context,DEMO_PARAMETERS)).rejects.toMatchObject({code:"CONFIRMED_TRANSCRIPT_REQUIRED"});
    expect(await database.transcriptRevision.count({where:{ownerAccountId:account.accountId}})).toBe(0);
    expect((await getDraft(context,account.draftId)).issues).toEqual(expect.arrayContaining([expect.objectContaining({code:"TRACK_UNKNOWN"})]));
  });
  it("signed sessions bind the intended identity without changing business or outside data",async()=>{
    const outside=await fingerprint(manifest,false);
    const sessions=await demoSessions(manifest,["admin","not-selected"]);
    for(const key of ["admin","not-selected"] as const){const cookie=sessions[key].cookies[0];const actual=await requireAccount(new Headers({cookie:`${cookie.name}=${cookie.value}`}));expect(actual.accountId).toBe(demoContext(manifest,key).accountId);expect(actual.canManageAccounts).toBe(false);}
    expect(await fingerprint(manifest,false)).toEqual(outside);await verifyRun(manifest);
  });
  it("refuses an occupied demo port and leaves the existing listener alive",async()=>{
    const sentinel=createServer();let owned=false;
    try{
      await new Promise<void>((resolve,reject)=>{sentinel.once("error",e=>(e as NodeJS.ErrnoException).code==="EADDRINUSE"?resolve():reject(e));sentinel.listen(3102,"127.0.0.1",()=>{owned=true;resolve();});});
      await expect(startDemoServer()).rejects.toThrow("พอร์ต 3102 ถูกใช้งาน");
      if(owned)expect(sentinel.listening).toBe(true);
    }finally{if(owned)await new Promise<void>(resolve=>sentinel.close(()=>resolve()));}
  });
  it("a fresh run preserves the previous run and uses different identities",async()=>{
    const next=await prepareDemo(`${run}-new`);
    expect(next.alreadyPrepared).toBe(false);expect(next.manifest.outsideBefore).toEqual(next.manifest.outsideAfter);
    expect(next.manifest.versionId).not.toBe(manifest.versionId);expect(next.manifest.accounts.some(a=>manifest.accounts.some(b=>a.accountId===b.accountId))).toBe(false);
    await verifyRun(manifest);
  },90_000);
  it("colliding email without an ownership manifest is refused without overwriting the account",async()=>{
    const collision=`collision-${randomUUID().slice(0,8)}`,email=`${collision}.project@aps-demo.invalid`;
    const sentinel=await database.user.create({data:{name:"Sentinel that must survive",email,emailVerified:false}});
    await expect(prepareDemo(collision)).rejects.toThrow("ชื่อรอบชนข้อมูล");
    expect(await database.user.findUnique({where:{id:sentinel.id}})).toEqual(sentinel);
    expect(await database.accountAccess.count({where:{email}})).toBe(0);
  });
  it("rejects malformed manifest IDs and edits instead of resetting them",async()=>{
    const file=path.join(runDirectory(run),"manifest.json"),original=await readFile(file,"utf8"),tampered=JSON.parse(original);
    tampered.accounts[0].userId="not-a-uuid";
    try{await writeFile(file,JSON.stringify(tampered));await expect(readManifest(run)).rejects.toThrow("manifest");}finally{await writeFile(file,original);}
    const a=manifest.accounts.find(a=>a.key==="project")!;
    await database.user.update({where:{id:a.userId},data:{name:"ข้อมูลสาธิต edited by presenter"}});
    const before=await database.user.findUniqueOrThrow({where:{id:a.userId}});
    await expect(prepareDemo(run)).rejects.toThrow("ข้อมูลสาธิตเปลี่ยน");
    expect(await database.user.findUnique({where:{id:a.userId}})).toEqual(before);
    // Preserve the edit; subsequent tests use service contexts and do not reset this run.
  });
  it("ownership guards and What-if preserve confirmed transcripts/enrollment in every account",async()=>{
    const context=demoContext(manifest,"not-selected"),other=manifest.accounts.find(a=>a.key==="project")!;
    await expect(getDraft(context,other.draftId)).rejects.toMatchObject({status:404});
    const before=await fingerprint(manifest,true),outside=await fingerprint(manifest,false);
    const analysis=await database.analysisRun.findFirstOrThrow({where:{ownerAccountId:context.accountId}});
    await runScenario(context,{analysisId:analysis.id,track:"project",events:[],offeringAssumptions:[{courseCode:"517261",term:DEMO_PARAMETERS.currentTerm,availability:"open"}]});
    const after=await fingerprint(manifest,true);
    for(const table of ["TranscriptRevision","TranscriptDraft","DraftCourseAttempt","PrivateDocument","StudentAcademicState","StudentEnrollment"])expect(after[table]).toEqual(before[table]);
    expect(await fingerprint(manifest,false)).toEqual(outside);
  });
});
