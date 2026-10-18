import { writeFile } from "node:fs/promises";
import path from "node:path";
import { configureDemo, cliOptions } from "./runtime";
const {run}=cliOptions(process.argv.slice(2));configureDemo();
const {readManifest,fingerprint,sameSnapshot,runDirectory}=await import("./store");
const {getDatabase}=await import("../../src/server/database");
try{
  const m=await readManifest(run),outside=await fingerprint(m,false),business=await fingerprint(m,true);
  const outsideUnchanged=sameSnapshot(outside,m.outsideAfter);
  const protectedTables=["User","AccountAccess","Account","StudentEnrollment","TranscriptRevision","TranscriptDraft","DraftCourseAttempt","PrivateDocument","StudentAcademicState","AcademicDataset","CatalogCourse","CourseOffering","TrackCriteria","TrackCriteriaEvent"];
  const protectedBusinessUnchanged=protectedTables.every(table=>sameSnapshot(business[table],m.businessSnapshot?.[table]));
  const result={run,recordedAt:new Date().toISOString(),outsideUnchanged,protectedBusinessUnchanged,outsideBefore:m.outsideAfter,outsideAfter:outside,protectedTables,sessionTokensExported:false};
  await writeFile(path.join(runDirectory(run),`audit-${Date.now()}.json`),JSON.stringify(result,null,2)+"\n",{flag:"wx"});
  if(!outsideUnchanged || !protectedBusinessUnchanged)throw new Error("ข้อมูลที่ต้องคงเดิมเปลี่ยน ให้ตรวจ audit ใน storage/demo");
  console.log(JSON.stringify({run,outsideUnchanged,protectedBusinessUnchanged}));
}catch(error){console.error(error instanceof Error?error.message:"ตรวจเดโมไม่สำเร็จ");process.exitCode=1;}finally{await getDatabase().$disconnect();}
