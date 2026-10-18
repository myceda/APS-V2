// The engine adapter never calculates expected values or writes to the database.
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { auditTranscript, passedForPrerequisites, ENGINE_VERSION } from "../../../src/modules/analysis/engine";
import type { Dataset, StudyTrack } from "../../../src/modules/curriculum/types";
import type { TranscriptPayload } from "../../../src/modules/transcript/types";
const root=path.resolve(process.env.APS_GRADE_AUDIT_ROOT || "storage/grade-audit/round-4");
const relative=path.relative(path.resolve("storage/grade-audit"),root);
if(relative.startsWith("..") || path.isAbsolute(relative))throw new Error("Audit output must stay in ignored storage/grade-audit");
const output=process.argv[2] || "actual-before.json";
if(!/^actual-(before|after)\.json$/.test(output))throw new Error("Use actual-before.json or actual-after.json");
const bytes=await readFile(path.join(root,"inputs.json"));
const manifest=JSON.parse(await readFile(path.join(root,"manifest.json"),"utf8"));
const digest=(value:Buffer|string)=>createHash("sha256").update(value).digest("hex");
if(digest(bytes)!==manifest.inputsSha256 || digest(await readFile(path.join(root,"expected.json")))!==manifest.expectedSha256)throw new Error("Frozen input/expected changed");
const cases:{id:string;kind:string;dataset:Dataset;payload:TranscriptPayload;track:StudyTrack}[]=JSON.parse(bytes.toString());
const actual=[];
for(const scenario of cases){
  const before=digest(JSON.stringify(scenario));
  const result=auditTranscript(scenario.payload,scenario.dataset,scenario.track);
  actual.push({id:scenario.id,result,eligiblePrerequisites:[...passedForPrerequisites(scenario.payload.attempts,scenario.dataset)].sort(),display:{gpax:result.gpax.value?.toFixed(2)??null,specificGpa:result.specificGpa.value?.toFixed(2)??null},inputUnchanged:before===digest(JSON.stringify(scenario))});
}
await writeFile(path.join(root,output),JSON.stringify({recordedAt:new Date().toISOString(),engineVersion:ENGINE_VERSION,inputsSha256:manifest.inputsSha256,expectedSha256:manifest.expectedSha256,cases:actual},null,2),{flag:"wx",mode:0o600});
console.log(JSON.stringify({engineVersion:ENGINE_VERSION,cases:actual.length,output,inputUnchanged:actual.every(c=>c.inputUnchanged),databaseUsed:false}));
