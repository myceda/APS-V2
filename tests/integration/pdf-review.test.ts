import { randomInt } from "node:crypto";
import { beforeAll, afterAll, expect, it } from "vitest";
import { getDatabase } from "@/server/database";
import { requireAccount } from "@/server/account-context";
import { uploadTranscript, saveDraft, confirmDraft, getDraft, reviseTranscript, cancelDraft } from "@/server/academic";
import type { AccountContext } from "@/modules/accounts/types";
import { createIdentity, createSessionFixture, assertTestDatabase } from "../support/fixtures";
import { syntheticTranscript } from "../support/synthetic-transcript";
const db=getDatabase();
let context:AccountContext,userId:string,accountId:string,code:string;
beforeAll(async()=>{
  assertTestDatabase();
  const identity=await createIdentity("student");userId=identity.user.id;accountId=identity.access.id;
  code=`66${randomInt(10_000_000,99_999_999)}`;
  await db.studentEnrollment.update({where:{accountAccessId:accountId},data:{studentCode:code,trackState:"not_selected"}});
  context=await requireAccount((await createSessionFixture(userId)).headers);
});
afterAll(async()=>{
  if(!accountId)return;
  await db.studentAcademicState.deleteMany({where:{enrollment:{accountAccessId:accountId}}});
  await db.transcriptRevision.deleteMany({where:{ownerAccountId:accountId}});
  await db.transcriptDraft.deleteMany({where:{ownerAccountId:accountId}});
  await db.privateDocument.deleteMany({where:{ownerAccountId:accountId}});
  await db.studentEnrollment.deleteMany({where:{accountAccessId:accountId}});
  await db.accountAccess.delete({where:{id:accountId}});
  await db.user.delete({where:{id:userId}});
});
it("failed PDF reads create no draft/document/revision or current-state changes",async()=>{
  const before={documents:await db.privateDocument.count(),drafts:await db.transcriptDraft.count(),revisions:await db.transcriptRevision.count(),state:await db.studentAcademicState.findUnique({where:{enrollmentId:context.enrollment!.id}})};
  for(const [bytes,error]of [[Buffer.from("not pdf"),"PDF_INVALID"],[Buffer.from("%PDF-1.4\nbroken\n%%EOF"),"PDF_READ_FAILED"],[syntheticTranscript(code,"Q"),"PDF_GRADE_UNSUPPORTED"]] as const)
    await expect(uploadTranscript(context,bytes)).rejects.toMatchObject({code:error});
  expect({documents:await db.privateDocument.count(),drafts:await db.transcriptDraft.count(),revisions:await db.transcriptRevision.count(),state:await db.studentAcademicState.findUnique({where:{enrollmentId:context.enrollment!.id}})}).toEqual(before);
});
it("saving an unrelated edit retains unreadable state and blocks server confirmation",async()=>{
  const bytes=Buffer.from(syntheticTranscript(code).toString("latin1").replace("Faculty: Science","Faculty:        "),"latin1");
  const draft=await uploadTranscript(context,bytes);
  expect(draft.header.faculty.state).toBe("unreadable");
  const payload=structuredClone(draft);payload.attempts[0].name="Edited Synthetic Course";
  const saved=await saveDraft(context,draft.id,{expectedVersion:draft.editVersion,payload});
  expect(saved.header.faculty.state).toBe("unreadable");
  await expect(confirmDraft(context,draft.id,saved.editVersion)).rejects.toMatchObject({code:"TRANSCRIPT_REVIEW_REQUIRED"});
  expect(await db.transcriptRevision.count({where:{ownerAccountId:accountId}})).toBe(0);
});
it("reconfirmation preserves the extracted snapshot, old immutable revision and other rows",async()=>{
  const draft=await uploadTranscript(context,syntheticTranscript(code,"B",[{code:"517101",name:"First Synthetic"},{code:"517121",name:"Second Synthetic"}]));
  const extracted=(await db.transcriptDraft.findUniqueOrThrow({where:{id:draft.id}})).extracted;
  await confirmDraft(context,draft.id,draft.editVersion);
  const old=await db.transcriptRevision.findUniqueOrThrow({where:{draftId:draft.id}});
  const cancelled=await reviseTranscript(context);await cancelDraft(context,cancelled.id,cancelled.editVersion);
  const revised=await reviseTranscript(context),payload=structuredClone(revised);payload.attempts[0].name="Reviewed First Synthetic";
  const saved=await saveDraft(context,revised.id,{expectedVersion:revised.editVersion,payload});
  expect(saved.attempts[1]).toEqual(draft.attempts[1]);
  await confirmDraft(context,saved.id,saved.editVersion);
  expect((await db.transcriptRevision.findUniqueOrThrow({where:{id:old.id}})).payload).toEqual(old.payload);
  expect((await db.transcriptDraft.findUniqueOrThrow({where:{id:revised.id}})).extracted).toEqual(extracted);
  expect((await getDraft(context,revised.id)).attempts[0].name).toBe("Reviewed First Synthetic");
});
