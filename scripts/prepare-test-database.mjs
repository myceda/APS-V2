import { config } from "dotenv";
import { spawnSync } from "node:child_process";
config({ quiet: true });
try {
  const target = new URL(process.env.TEST_DATABASE_URL || "");
  if (
    target.pathname !== "/aps_v2_test" ||
    !["localhost", "127.0.0.1"].includes(target.hostname)
  )
    throw new Error();
  const result = spawnSync(
    process.execPath,
    ["node_modules/prisma/build/index.js", "migrate", "deploy"],
    {
      stdio: "inherit",
      windowsHide: true,
      env: { ...process.env, DATABASE_URL: process.env.TEST_DATABASE_URL },
    },
  );
  process.exitCode = result.status ?? 1;
} catch {
  console.error("TEST_DATABASE_URL ต้องชี้ฐาน local aps_v2_test เท่านั้น");
  process.exitCode = 1;
}
