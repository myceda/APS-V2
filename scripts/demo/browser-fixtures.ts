import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { configureDemo } from "./runtime";
import { DEMO_CASES, validateRun } from "../../src/modules/demo/config";
configureDemo();
const run=validateRun(process.env.APS_DEMO_RUN || "");
const {prepareDemo,demoSessions,runDirectory}=await import("./store");
const {getDatabase}=await import("../../src/server/database");
try{
  const {manifest}=await prepareDemo(run);
  const sessions=await demoSessions(manifest,[...DEMO_CASES]);
  const directory=path.join(runDirectory(run),"sessions");await mkdir(directory,{recursive:true});
  for(const key of DEMO_CASES)await writeFile(path.join(directory,`${key}.json`),JSON.stringify(sessions[key]),{mode:0o600});
  console.log("เตรียม browser fixtures ของเดโมแล้ว; ไม่ใช่ Google จริง");
}finally{await getDatabase().$disconnect();}
