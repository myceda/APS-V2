import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Browser, type BrowserContext } from "@playwright/test";
import { configureDemo, cliOptions } from "./runtime";
import { DEMO_ORIGIN, selectCases, validateRun, type DemoCase } from "../../src/modules/demo/config";

// The optional callback is for the local launcher smoke check, never an HTTP API.
export async function openDemo(run: string, keys: DemoCase[], options: {headless?: boolean; onReady?: (browser: Browser, contexts: BrowserContext[]) => Promise<void>} = {}) {
  validateRun(run); selectCases(keys.join(",")); configureDemo();
  const {readManifest,demoSessions,runDirectory}=await import("./store");
  const {getDatabase}=await import("../../src/server/database");
  const {startDemoServer}=await import("./server");
  let server: Awaited<ReturnType<typeof startDemoServer>>|undefined;
  let browser: Browser|undefined;
  let closing=false;
  let closePromise:Promise<void>|undefined;
  const closeBrowser=async()=>{
    if(!browser)return;
    if(!closePromise){closing=true;closePromise=browser.close();}
    await closePromise;
  };
  const controller=new AbortController();
  const stopRequest=()=>{controller.abort();void closeBrowser().catch(()=>{});};
  process.once("SIGINT",stopRequest);process.once("SIGTERM",stopRequest);
  try {
    const manifest=await readManifest(run);
    // Claim the port before adding sessions; never attach to another app.
    server=await startDemoServer(controller.signal);
    const sessions=await demoSessions(manifest,keys);
    const directory=path.join(runDirectory(run),"sessions"); await mkdir(directory,{recursive:true});
    controller.signal.throwIfAborted();
    const headless = options.headless ?? false;
    browser=await chromium.launch({headless,args:headless ? [] : ["--start-maximized"]});
    controller.signal.throwIfAborted();
    const liveBrowser=browser, contexts:BrowserContext[]=[];
    for(const key of keys) {
      await writeFile(path.join(directory,`${key}.json`),JSON.stringify(sessions[key]),{mode:0o600});
      // Use the real window size. A fixed 1440x1000 viewport can extend below
      // a laptop display even when the page reports that it reached its end.
      const context=await liveBrowser.newContext({storageState:sessions[key],viewport:null});
      contexts.push(context);
      const page=await context.newPage();
      await page.goto(`${DEMO_ORIGIN}/${key==="admin"?"admin":"student"}`);
      page.once("close",()=>{
        if(!closing && liveBrowser.contexts().every(c=>c.pages().length===0))void closeBrowser().catch(()=>controller.abort());
      });
    }
    if(!options.headless)console.log(`เปิดชุดสาธิต ${keys.join(", ")} แล้ว ปิดหน้าต่างทั้งหมดเพื่อหยุด server ของเดโม`);
    await options.onReady?.(liveBrowser,contexts);
    if(options.onReady)await closeBrowser();
    if(liveBrowser.isConnected())await new Promise<void>(resolve=>liveBrowser.once("disconnected",()=>resolve()));
    return {run,opened:keys,serverStopped:true};
  } finally {
    try{await closeBrowser();}finally{
      try{await server?.stop();}finally{
        await getDatabase().$disconnect();
        process.removeListener("SIGINT",stopRequest);process.removeListener("SIGTERM",stopRequest);
      }
    }
  }
}

if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const options=cliOptions(process.argv.slice(2),true);
  openDemo(options.run,options.cases).catch(error=>{console.error(error instanceof Error?error.message:"เปิดเดโมไม่สำเร็จ");process.exitCode=1;});
}
