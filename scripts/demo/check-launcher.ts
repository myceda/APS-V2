import assert from "node:assert/strict";
import { createServer } from "node:net";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { configureDemo, cliOptions } from "./runtime";
import { DEMO_CASES, DEMO_NOTICE } from "../../src/modules/demo/config";
const {run}=cliOptions(process.argv.slice(2));configureDemo();
const {readManifest,verifyRun,fingerprint,sameSnapshot,runDirectory}=await import("./store");
const {getDatabase}=await import("../../src/server/database");
const {openDemo}=await import("./open");
try{
  const manifest=await readManifest(run),outside=await fingerprint(manifest,false);
  const actual=await openDemo(run,[...DEMO_CASES],{headless:true,onReady:async(_browser,contexts)=>{
    assert.equal(contexts.length,7);
    for(const [index,context] of contexts.entries()){
      const response=await context.request.get("http://localhost:3102/api/me");assert.equal(response.status(),200);
      const body=await response.json();assert.equal(body.account.email,`${run}.${DEMO_CASES[index]}@aps-demo.invalid`);
      assert.equal(await context.pages()[0].getByText(DEMO_NOTICE,{exact:true}).count(),1);
    }
    // Exercise the same close-last-window path used by the interactive command.
    for(const context of contexts)for(const page of context.pages())await page.close();
  }});
  // Re-open the client after launcher cleanup, and prove its server released the port.
  await new Promise<void>((resolve,reject)=>{const probe=createServer();probe.once("error",reject);probe.listen(3102,"127.0.0.1",()=>probe.close(()=>resolve()));});
  await verifyRun(manifest);
  const outsideAfter=await fingerprint(manifest,false);assert.ok(sameSnapshot(outside,outsideAfter));
  const result={...actual,headlessVerification:true,contexts:7,sessionTokensExported:false,portReleased:true,businessUnchanged:true,outsideUnchanged:true,recordedAt:new Date().toISOString()};
  await writeFile(path.join(runDirectory(run),`launcher-check-${Date.now()}.json`),JSON.stringify(result,null,2)+"\n",{flag:"wx"});
  console.log(JSON.stringify(result));
}finally{await getDatabase().$disconnect();}
