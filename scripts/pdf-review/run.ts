import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { appendFile, readFile, writeFile } from "node:fs/promises";
import { configurePdfReview, PDF_ORIGIN } from "./runtime";
configurePdfReview();
const runChild = (args: string[]) => new Promise<number>((resolve, reject) => {
  const child=spawn(process.execPath,args,{stdio:"inherit",windowsHide:true,env:process.env});
  child.once("error",reject); child.once("exit",code=>resolve(code??1));
});
await new Promise<void>((resolve,reject)=>{
  const probe=createServer(); probe.once("error",()=>reject(new Error("Port 3103 is occupied; no process stopped or reused")));
  probe.listen(3103,"127.0.0.1",()=>probe.close(error=>error?reject(error):resolve()));
});
if(await runChild(["--conditions=react-server","--import","tsx","scripts/pdf-review/prepare.ts"])) throw new Error("PDF fixture preparation failed");
const active=JSON.parse(await readFile("storage/pdf-review/round-3/active-run.json","utf8"));
process.env.APS_PDF_RUN_DIR=active.directory;
const server=spawn(process.execPath,["node_modules/next/dist/bin/next","start","--hostname","127.0.0.1","--port","3103"],{windowsHide:true,stdio:["ignore","pipe","pipe"],env:{...process.env,NODE_ENV:"production",NEXT_TELEMETRY_DISABLED:"1"}});
server.stdout.on("data",data=>{void appendFile(`${active.directory}/server.log`,data);});
server.stderr.on("data",data=>{void appendFile(`${active.directory}/server.log`,data);});
const stop=async()=>{if(server.exitCode===null && !server.signalCode) await new Promise<void>(resolve=>{server.once("exit",()=>resolve());server.kill();});};
const interrupt=()=>{void stop();};process.once("SIGINT",interrupt);process.once("SIGTERM",interrupt);
try {
  let ready=false;
  for(let i=0;i<200;i++) {
    if(server.exitCode!==null || server.signalCode) throw new Error("PDF server failed; inspect private server.log");
    try {ready=(await fetch(`${PDF_ORIGIN}/api/me`,{signal:AbortSignal.timeout(1000)})).status===401;}catch{/* starting */}
    if(ready)break;
    await new Promise(resolve=>setTimeout(resolve,200));
  }
  if(!ready)throw new Error("PDF server readiness timeout");
  process.exitCode=await runChild(["node_modules/@playwright/test/cli.js","test","--config","playwright.pdf.config.ts"]);
} finally {
  await stop();
  const portReleased=await new Promise<boolean>(resolve=>{
    const probe=createServer();probe.once("error",()=>resolve(false));probe.listen(3103,"127.0.0.1",()=>probe.close(()=>resolve(true)));
  });
  await writeFile(`${active.directory}/server-lifecycle.json`,JSON.stringify({recordedAt:new Date().toISOString(),port:3103,serverStopped:server.exitCode!==null || Boolean(server.signalCode),portReleased,otherProcessesStopped:false},null,2));
  if(!portReleased)process.exitCode=1;
  const audit=await runChild(["--conditions=react-server","--import","tsx","scripts/pdf-review/audit.ts"]);
  if(audit)process.exitCode=1;
  process.removeListener("SIGINT",interrupt);process.removeListener("SIGTERM",interrupt);
}
