import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Prisma } from "../../src/generated/prisma/client";
import type { AccountContext } from "../../src/modules/accounts/types";
import { DEMO_CASES, assertDemoDatabase, validateRun, type DemoCase } from "../../src/modules/demo/config";
import { transcriptIssues } from "../../src/modules/transcript/validation";
import { getDatabase } from "../../src/server/database";
import { runAnalysis } from "../../src/server/academic";
import { mutateCriteria, studentCriteria } from "../../src/server/track-criteria";
import { createSessionFixture } from "../../tests/support/fixtures";
import { CASE_NAMES, DEMO_PARAMETERS, DEMO_SOURCE, demoCatalogue, demoCriteria, demoTranscript } from "./data";
import { referenceDocuments } from "./documents";

const json = (value: unknown): Prisma.InputJsonValue => JSON.parse(JSON.stringify(value));
export const digest = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const canonical = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).sort(([a],[b]) => a.localeCompare(b)).map(([k,v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
  return JSON.stringify(value);
};
export function sameSnapshot(a: unknown, b: unknown) { return canonical(a) === canonical(b); }
function db() { assertDemoDatabase(process.env.DATABASE_URL); return getDatabase(); }
export interface DemoIdentity {
  key: DemoCase; email: string; userId: string; accountId: string; enrollmentId: string; studentCode: string; documentId: string; draftId: string;
}
export type Fingerprint = Record<string, { count: number; hash: string }>;
export interface DemoManifest {
  schemaVersion: 1; run: string; state: "preparing" | "complete"; seedSha256: string; recipeSha256: string;
  curriculumId: string; curriculumCode: string; versionId: string; versionCode: string; datasetIds: string[]; trackIds: {project: string; cooperative: string};
  accounts: DemoIdentity[]; createdAt: string; businessSnapshot?: Fingerprint; outsideBefore: Fingerprint; outsideAfter?: Fingerprint;
  observedCriteria?: Record<string, unknown>; note: string;
}
export const runDirectory = (run: string, root = "storage/demo") => path.resolve(root, validateRun(run));
function validateManifest(value: unknown, run: string): asserts value is DemoManifest {
  const m = value as DemoManifest;
  if (!m || m.schemaVersion !== 1 || m.run !== validateRun(run) || m.curriculumCode !== `CS2565-DEMO-${run}` || m.versionCode !== `CS2565-DEMO-${run}-v1` || !Array.isArray(m.accounts) || m.accounts.length !== 7) throw new Error("manifest ไม่ตรงกับชุดสาธิต");
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (![m.curriculumId, m.versionId, ...m.datasetIds, m.trackIds.project, m.trackIds.cooperative].every(id => uuid.test(id)) || m.datasetIds.length !== 2) throw new Error("ID ใน manifest ไม่ถูกต้อง");
  for (const key of DEMO_CASES) {
    const matches = m.accounts.filter(a => a.key === key);
    if (matches.length !== 1 || matches[0].email !== `${run}.${key}@aps-demo.invalid` || ![matches[0].userId, matches[0].accountId, matches[0].enrollmentId, matches[0].documentId, matches[0].draftId].every(id => uuid.test(id))) throw new Error(`manifest ของ ${key} ไม่ถูกต้อง`);
  }
  if (new Set(m.accounts.map(a => a.userId)).size !== 7 || new Set(m.accounts.map(a => a.accountId)).size !== 7) throw new Error("manifest มีบัญชีซ้ำ");
}
export async function readManifest(run: string, root = "storage/demo") {
  const m: unknown = JSON.parse(await readFile(path.join(runDirectory(run,root), "manifest.json"), "utf8"));
  validateManifest(m,run); return m;
}
export function demoContext(m: DemoManifest, key: DemoCase): AccountContext {
  const a = m.accounts.find(a => a.key === key)!;
  return { email:a.email, authUserId:a.userId, accountId:a.accountId, displayName:`ข้อมูลสาธิต ${CASE_NAMES[key]}`, role:key === "admin" ? "admin" : "student", canManageAccounts:false, curriculumIds:key === "admin" ? [m.curriculumId] : [], onboardingStatus:"complete",
    enrollment:key === "admin" ? null : {id:a.enrollmentId,studentCode:a.studentCode,curriculumId:m.curriculumId,curriculumCode:m.curriculumCode,curriculumVersionId:m.versionId,curriculumState:"draft",confirmationSource:"admin_verified",trackState:key === "project" || key === "cooperative" ? "selected" : key === "unknown-track" ? "unknown" : "not_selected",trackId:key === "project" || key === "cooperative" ? m.trackIds[key] : null,trackName:key === "project" ? "โครงงานวิจัย" : key === "cooperative" ? "สหกิจศึกษา" : null},
  };
}

// Fixed identifiers only; ID arrays remain bound SQL parameters. Hashes, never rows/tokens,
// leave PostgreSQL. Include every application table, including tables not written by demo.
export async function fingerprint(m: DemoManifest, inside: boolean): Promise<Fingerprint> {
  const database = db(), accounts=m.accounts.map(a=>a.accountId), users=m.accounts.map(a=>a.userId);
  const datasets=(await database.academicDataset.findMany({where:{curriculumVersionId:m.versionId},select:{id:true}})).map(r=>r.id);
  const drafts=(await database.transcriptDraft.findMany({where:{ownerAccountId:{in:accounts}},select:{id:true}})).map(r=>r.id);
  const enrollments=(await database.studentEnrollment.findMany({where:{accountAccessId:{in:accounts}},select:{id:true}})).map(r=>r.id);
  const criteria=(await database.trackCriteria.findMany({where:{curriculumVersionId:m.versionId},select:{id:true}})).map(r=>r.id);
  const rules: [string,string,string[]][] = [
    ["User","id",users],["Account","userId",users],["Session","userId",users],["Verification","id",[]],
    ["AccountAccess","id",accounts],["EnrollmentRequest","accountAccessId",accounts],["Curriculum","id",[m.curriculumId]],["CurriculumVersion","id",[m.versionId]],
    ["Track","curriculumVersionId",[m.versionId]],["StudentEnrollment","accountAccessId",accounts],["CurriculumAdmin","accountAccessId",accounts],["AuditEvent","targetAccountId",accounts],
    ["AcademicDataset","curriculumVersionId",[m.versionId]],["CatalogCourse","datasetId",datasets],["CourseOffering","datasetId",datasets],
    ["TrackCriteria","curriculumVersionId",[m.versionId]],["TrackCriteriaEvent","criteriaId",criteria],
    ["PrivateDocument","ownerAccountId",accounts],["TranscriptDraft","ownerAccountId",accounts],["DraftCourseAttempt","draftId",drafts],["TranscriptRevision","ownerAccountId",accounts],
    ["StudentAcademicState","enrollmentId",enrollments],["AnalysisRun","ownerAccountId",accounts],["SimulationScenario","ownerAccountId",accounts],
  ];
  // These reads are independent. Keep the same table coverage, count and row
  // hashes while avoiding serial round trips on a growing local test database.
  const entries = await Promise.all(rules.filter(([table]) => !(inside && table === "Session")).map(async ([table,column,ids]) => {
    const query = `SELECT count(*)::int AS count, md5(COALESCE(string_agg(md5(to_jsonb(r)::text), '' ORDER BY md5(to_jsonb(r)::text)),'')) AS hash FROM "${table}" r WHERE ${inside ? "" : "NOT "}COALESCE(r."${column}" = ANY($1::uuid[]), false)`;
    const values = await database.$queryRawUnsafe<{count:number;hash:string}[]>(query,ids);
    return [table,values[0]] as const;
  }));
  return Object.fromEntries(entries);
}

async function recipeHashes() {
  const seedSha256 = digest(await readFile(new URL("../../src/modules/curriculum/data/cs2565.json",import.meta.url)));
  const recipeSha256 = digest(await readFile(new URL("./data.ts",import.meta.url)));
  return {seedSha256,recipeSha256};
}
export async function verifyRun(m: DemoManifest, checkRecipe = true) {
  validateManifest(m,m.run);
  const database=db();
  if(m.state !== "complete" || !m.businessSnapshot) throw new Error("รอบนี้เตรียมไม่สมบูรณ์ เก็บไว้ตรวจสอบและใช้ชื่อรอบใหม่ ไม่ล้างข้อมูล");
  if(checkRecipe && !sameSnapshot(await recipeHashes(),{seedSha256:m.seedSha256,recipeSha256:m.recipeSha256})) throw new Error("seed/สูตรสาธิตเปลี่ยนแล้ว ใช้ชื่อรอบใหม่");
  const version=await database.curriculumVersion.findUnique({where:{id:m.versionId},include:{curriculum:true}});
  if(version?.code!==m.versionCode || version.curriculumId!==m.curriculumId || version.curriculum.code!==m.curriculumCode) throw new Error("หลักสูตรใน manifest ไม่ตรงกับฐานข้อมูล");
  for(const a of m.accounts) {
    const access=await database.accountAccess.findUnique({where:{id:a.accountId},include:{authUser:true}});
    if(access?.email!==a.email || access.authUserId!==a.userId || access.authUser?.email!==a.email || access.canManageAccounts || access.role!==(a.key==="admin"?"admin":"student")) throw new Error(`บัญชี ${a.key} ไม่ตรงกับ manifest`);
  }
  const actual=await fingerprint(m,true);
  if(!sameSnapshot(actual,m.businessSnapshot)) {
    const tables=Object.keys(actual).filter(key=>!sameSnapshot(actual[key],m.businessSnapshot![key]));
    throw new Error(`ข้อมูลสาธิตเปลี่ยนใน ${tables.join(", ")} ใช้ชื่อรอบใหม่ ไม่เขียนทับ`);
  }
}

export async function prepareDemo(run: string, root = "storage/demo") {
  validateRun(run); const database=db(), directory=runDirectory(run,root);
  try {
    const prior=await readManifest(run,root); await verifyRun(prior);
    return {manifest:prior,alreadyPrepared:true};
  } catch(error) { if((error as NodeJS.ErrnoException).code!=="ENOENT") throw error; }
  const hashes=await recipeHashes();
  const m: DemoManifest={schemaVersion:1,run,state:"preparing",...hashes,curriculumId:randomUUID(),curriculumCode:`CS2565-DEMO-${run}`,versionId:randomUUID(),versionCode:`CS2565-DEMO-${run}-v1`,datasetIds:[randomUUID(),randomUUID()],trackIds:{project:randomUUID(),cooperative:randomUUID()},accounts:DEMO_CASES.map((key,i)=>({key,email:`${run}.${key}@aps-demo.invalid`,userId:randomUUID(),accountId:randomUUID(),enrollmentId:randomUUID(),studentCode:`${6509000000+i}`,documentId:randomUUID(),draftId:randomUUID()})),createdAt:new Date().toISOString(),outsideBefore:{},note:DEMO_SOURCE};
  const conflicts=await database.accountAccess.count({where:{email:{in:m.accounts.map(a=>a.email)}}});
  const conflictingUsers=await database.user.count({where:{email:{in:m.accounts.map(a=>a.email)}}});
  if(conflicts || conflictingUsers || await database.curriculum.findUnique({where:{code:m.curriculumCode}}) || await database.curriculumVersion.findUnique({where:{code:m.versionCode}})) throw new Error("ชื่อรอบชนข้อมูลที่ไม่มี manifest หยุดโดยไม่เขียนทับ");
  const catalogue=demoCatalogue(m.versionId);
  const payloads=Object.fromEntries(m.accounts.filter(a=>a.key!=="admin").map(a=>[a.key,demoTranscript(a.key as Exclude<DemoCase,"admin">,a.studentCode)]));
  const documents=await referenceDocuments(payloads);
  m.outsideBefore=await fingerprint(m,false);
  await mkdir(path.resolve(root),{recursive:true}); await mkdir(directory);
  const manifestPath=path.join(directory,"manifest.json");
  await writeFile(manifestPath,JSON.stringify(m,null,2)+"\n",{flag:"wx",mode:0o600});
  await database.$transaction(async tx=>{
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${m.versionCode}, 81))::text`;
    await tx.curriculum.create({data:{id:m.curriculumId,code:m.curriculumCode,name:`ข้อมูลสาธิต CS2565 · ${run}`}});
    await tx.curriculumVersion.create({data:{id:m.versionId,curriculumId:m.curriculumId,code:m.versionCode}});
    await tx.track.createMany({data:(["project","cooperative"] as const).map(key=>({id:m.trackIds[key],curriculumVersionId:m.versionId,code:key,name:key==="project"?"โครงงานวิจัย":"สหกิจศึกษา"}))});
    for(const [index,id] of m.datasetIds.entries()) await tx.academicDataset.create({data:{id,curriculumVersionId:m.versionId,version:index+1,status:index===0?"published":"draft",publishedAt:index===0?new Date():null,source:catalogue.source,policy:json(catalogue.policy),groups:json(catalogue.groups),unresolved:json(catalogue.unresolved),courses:{create:catalogue.courses.map(c=>({...c,prerequisite:json(c.prerequisite)}))},offerings:{create:catalogue.offerings}}});
    for(const a of m.accounts) {
      await tx.user.create({data:{id:a.userId,email:a.email,name:`ข้อมูลสาธิต ${CASE_NAMES[a.key]}`,emailVerified:true}});
      await tx.account.create({data:{userId:a.userId,providerId:"google",accountId:`demo-fixture:${a.email}`}});
      await tx.accountAccess.create({data:{id:a.accountId,email:a.email,authUserId:a.userId,role:a.key==="admin"?"admin":"student",canManageAccounts:false}});
      if(a.key==="admin") { await tx.curriculumAdmin.create({data:{accountAccessId:a.accountId,curriculumId:m.curriculumId}}); continue; }
      const context=demoContext(m,a.key), payload=payloads[a.key];
      const issues=transcriptIssues(payload,context.enrollment);
      if(a.key!=="unknown-track" && issues.some(i=>i.severity==="blocking")) throw new Error(`ข้อมูลสาธิต ${a.key} มีปัญหา blocking`);
      await tx.studentEnrollment.create({data:{id:a.enrollmentId,accountAccessId:a.accountId,curriculumVersionId:m.versionId,studentCode:a.studentCode,trackState:context.enrollment!.trackState,trackId:context.enrollment!.trackId,admissionYear:a.key==="awaiting-criteria"?2566:2565,cohortSource:DEMO_SOURCE}});
      await tx.privateDocument.create({data:{id:a.documentId,ownerAccountId:a.accountId,content:new Uint8Array(documents[a.key]),sha256:digest(documents[a.key])}});
      await tx.transcriptDraft.create({data:{id:a.draftId,documentId:a.documentId,ownerAccountId:a.accountId,enrollmentId:a.enrollmentId,header:json(payload.header),summaries:json(payload.summaries),extracted:json(payload),issues:json(issues),pages:1,status:a.key==="unknown-track"?"draft":"confirmed",editVersion:a.key==="unknown-track"?1:2,attempts:{create:payload.attempts}}});
      if(a.key!=="unknown-track") {
        const revision=await tx.transcriptRevision.create({data:{ownerAccountId:a.accountId,enrollmentId:a.enrollmentId,draftId:a.draftId,payload:json(payload)}});
        await tx.studentAcademicState.create({data:{enrollmentId:a.enrollmentId,currentRevisionId:revision.id}});
      }
    }
  },{timeout:30_000});
  for(const track of ["project","cooperative"] as const) {
    const admin=demoContext(m,"admin");
    const created=await mutateCriteria(admin,{action:"create",criteria:demoCriteria(m.versionId,m.datasetIds[0],track),reason:DEMO_SOURCE});
    await mutateCriteria(admin,{action:"publish",id:created.id,expectedEditVersion:created.editVersion,reason:DEMO_SOURCE});
  }
  m.observedCriteria={};
  for(const a of m.accounts.filter(a=>a.key!=="admin" && a.key!=="unknown-track")) {
    const context=demoContext(m,a.key);
    await runAnalysis(context,DEMO_PARAMETERS);
    const actual=await studentCriteria(context,DEMO_PARAMETERS.currentTerm);
    m.observedCriteria[a.key]=actual.results.map(r=>({track:r.track,status:r.status,approval:r.approval}));
  }
  m.businessSnapshot=await fingerprint(m,true); m.outsideAfter=await fingerprint(m,false);
  if(!sameSnapshot(m.outsideBefore,m.outsideAfter)) throw new Error("fingerprint นอกชุดเปลี่ยนระหว่างเตรียม ให้ตรวจสาเหตุก่อน ไม่รับรองรอบนี้");
  m.state="complete";
  await writeFile(manifestPath,JSON.stringify(m,null,2)+"\n",{mode:0o600});
  return {manifest:m,alreadyPrepared:false};
}

export async function demoSessions(m: DemoManifest, keys: DemoCase[]) {
  await verifyRun(m);
  const outsideBefore=await fingerprint(m,false), result: Record<string,{cookies:Awaited<ReturnType<typeof createSessionFixture>>["cookie"][];origins:never[]}>={};
  for(const key of keys) { const account=m.accounts.find(a=>a.key===key)!; const session=await createSessionFixture(account.userId); result[key]={cookies:[session.cookie],origins:[]}; }
  if(!sameSnapshot(outsideBefore,await fingerprint(m,false))) throw new Error("ข้อมูลนอกชุดเปลี่ยนระหว่างเตรียม session");
  await verifyRun(m);
  return result;
}
