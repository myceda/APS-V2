import { readFile, writeFile } from "node:fs/promises";
import { configurePdfReview } from "./runtime";
import { createHash } from "node:crypto";
configurePdfReview();
const { getDatabase }=await import("../../src/server/database");
const { fingerprint, sameSnapshot }=await import("../demo/store");
const active=JSON.parse(await readFile("storage/pdf-review/round-3/active-run.json","utf8"));
const m=JSON.parse(await readFile(`${active.directory}/manifest.json`,"utf8"));
try {
  const after=await fingerprint(m,false);
  const outsideUnchanged=sameSnapshot(after,m.outsideBefore);
  const db=getDatabase();
  const accounts=m.accounts.map((a:{accountId:string})=>a.accountId);
  const created={documents:await db.privateDocument.count({where:{ownerAccountId:{in:accounts}}}),drafts:await db.transcriptDraft.count({where:{ownerAccountId:{in:accounts}}}),revisions:await db.transcriptRevision.count({where:{ownerAccountId:{in:accounts}}}),analyses:await db.analysisRun.count({where:{ownerAccountId:{in:accounts}}})};
  const revisionChecks:Record<string,boolean>={};
  for(const key of ["sample-1","sample-2","sample-3","sample-4","sample-5","synthetic-desktop","synthetic-mobile"]){
    try {
      const ids=JSON.parse(await readFile(`${active.directory}/${key}-ids.json`,"utf8"));
      const owner=m.accounts.find((a:{key:string})=>a.key===key);
      const state=await db.studentAcademicState.findUnique({where:{enrollmentId:owner.enrollmentId}});
      if(key.startsWith("synthetic")){
        const old=await db.transcriptRevision.findUniqueOrThrow({where:{id:ids.firstRevisionId}});
        revisionChecks[key]=createHash("sha256").update(JSON.stringify(old.payload)).digest("hex")===ids.firstPayloadSha256 && state?.currentRevisionId===ids.currentRevisionId;
      }else{
        const analysis=await db.analysisRun.findUniqueOrThrow({where:{id:ids.analysisId}});
        revisionChecks[key]=analysis.revisionId===ids.revisionId && analysis.ownerAccountId===owner.accountId && analysis.datasetId===m.datasetIds[0] && state?.currentRevisionId===ids.revisionId;
      }
    }catch{revisionChecks[key]=false;}
  }
  const revisionsIntact=Object.values(revisionChecks).every(Boolean);
  const negatives=m.accounts.filter((a:{key:string})=>a.key.startsWith("negative-")).map((a:{accountId:string})=>a.accountId);
  const rejectedOwnersEmpty=(await db.privateDocument.count({where:{ownerAccountId:{in:negatives}}}))===0 && (await db.transcriptDraft.count({where:{ownerAccountId:{in:negatives}}}))===0 && (await db.transcriptRevision.count({where:{ownerAccountId:{in:negatives}}}))===0;
  const documents=await db.privateDocument.findMany({where:{ownerAccountId:{in:accounts}},select:{id:true,ownerAccountId:true,sha256:true}});
  const drafts=await db.transcriptDraft.findMany({where:{ownerAccountId:{in:accounts}},select:{id:true,ownerAccountId:true,documentId:true,enrollmentId:true,baseRevisionId:true,status:true}});
  const revisions=await db.transcriptRevision.findMany({where:{ownerAccountId:{in:accounts}},select:{id:true,ownerAccountId:true,draftId:true,enrollmentId:true}});
  const analyses=await db.analysisRun.findMany({where:{ownerAccountId:{in:accounts}},select:{id:true,ownerAccountId:true,revisionId:true,datasetId:true}});
  await writeFile(`${active.directory}/owned-records.private.json`,JSON.stringify({documents,drafts,revisions,analyses},null,2),{mode:0o600});
  await writeFile(`${active.directory}/integrity.json`,JSON.stringify({recordedAt:new Date().toISOString(),run:m.run,outsideUnchanged,revisionsIntact,rejectedOwnersEmpty,revisionChecks,before:m.outsideBefore,after,created,sessionTokensExported:false},null,2));
  console.log(JSON.stringify({outsideUnchanged,revisionsIntact,rejectedOwnersEmpty,created}));
  if(!outsideUnchanged || !revisionsIntact || !rejectedOwnersEmpty)process.exitCode=1;
}finally{await getDatabase().$disconnect();}
