import { spawnSync } from "node:child_process";
export default function setup(){
  const result=spawnSync(process.execPath,["--conditions=react-server","--import","tsx","scripts/demo/browser-fixtures.ts"],{stdio:"inherit",windowsHide:true,env:process.env});
  if(result.status!==0)throw new Error("เตรียมข้อมูล browser เดโมไม่สำเร็จ");
}
