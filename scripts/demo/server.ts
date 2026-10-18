import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { DEMO_ORIGIN, assertDemoDatabase } from "../../src/modules/demo/config";

export async function startDemoServer(signal?: AbortSignal) {
  assertDemoDatabase(process.env.DATABASE_URL);
  signal?.throwIfAborted();
  await new Promise<void>((resolve,reject) => {
    const probe=createServer();
    probe.once("error",()=>reject(new Error("พอร์ต 3102 ถูกใช้งานอยู่ ไม่ปิดหรือใช้ server เดิมแทน")));
    probe.listen(3102,"127.0.0.1",()=>probe.close(error=>error?reject(error):resolve()));
  });
  const child=spawn(process.execPath,["node_modules/next/dist/bin/next","start","--hostname","127.0.0.1","--port","3102"],{windowsHide:true,stdio:["ignore","pipe","pipe"],env:{...process.env,NODE_ENV:"production",NEXT_TELEMETRY_DISABLED:"1"}});
  // Keep subprocess output private; never print inherited configuration or cookies.
  child.stdout.resume(); child.stderr.resume();
  const stop=async()=>{
    if(child.exitCode!==null || child.signalCode) return;
    await new Promise<void>(resolve=>{child.once("exit",()=>resolve());child.kill();});
  };
  signal?.addEventListener("abort",()=>{void stop();},{once:true});
  try {
    const deadline=Date.now()+60_000;
    while(Date.now()<deadline) {
      signal?.throwIfAborted();
      if(child.exitCode!==null || child.signalCode) throw new Error("เปิด production server สาธิตไม่สำเร็จ ตรวจ npm.cmd run build ก่อน");
      try { const response=await fetch(`${DEMO_ORIGIN}/api/me`,{signal:AbortSignal.timeout(1500)}); if(response.status===401) return {child,stop}; } catch { /* wait for this child only */ }
      await new Promise(resolve=>setTimeout(resolve,200));
    }
    throw new Error("server สาธิตไม่พร้อมภายใน 60 วินาที");
  } catch(error) { await stop(); throw error; }
}
