import { spawnSync } from "node:child_process";
export default function teardown(){
  const result=spawnSync(process.execPath,["--conditions=react-server","--import","tsx","scripts/demo/audit.ts","--run",process.env.APS_DEMO_RUN!],{stdio:"inherit",windowsHide:true,env:process.env});
  if(result.status!==0)throw new Error("fingerprint หลัง browser เดโมไม่ตรง");
}
