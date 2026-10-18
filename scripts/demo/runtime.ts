import { config } from "dotenv";
import { DEMO_ORIGIN, assertDemoDatabase, selectCases, validateRun } from "../../src/modules/demo/config";

export function configureDemo() {
  config({ quiet: true });
  assertDemoDatabase(process.env.TEST_DATABASE_URL);
  const secret = process.env.TEST_AUTH_SECRET;
  if (!secret || secret.length < 32) throw new Error("ต้องกำหนด TEST_AUTH_SECRET อย่างน้อย 32 ตัว");
  if (process.env.BETTER_AUTH_SECRET === secret && process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("/aps_v2_test")) throw new Error("secret สาธิตต้องแยกจากระบบจริง");
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  process.env.BETTER_AUTH_SECRET = secret;
  process.env.BETTER_AUTH_URL = DEMO_ORIGIN;
  process.env.APS_DEMO_MODE = "1";
  process.env.GOOGLE_CLIENT_ID = "";
  process.env.GOOGLE_CLIENT_SECRET = "";
}

export function cliOptions(args: string[], opening = false) {
  const options = new Map<string,string>();
  for (let i = 0; i < args.length; i += 2) {
    if (!["--run", ...(opening ? ["--case"] : [])].includes(args[i]) || !args[i+1] || args[i+1].startsWith("--") || options.has(args[i])) throw new Error("ใช้ --run <ชื่อรอบ> และ --case <ชุด> สำหรับ demo:open");
    options.set(args[i], args[i+1]);
  }
  return { run: validateRun(options.get("--run") || ""), cases: selectCases(options.get("--case") || "not-selected") };
}
