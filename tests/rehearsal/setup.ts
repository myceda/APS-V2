import { spawnSync } from "node:child_process";
export default function setup() {
  const result = spawnSync(process.execPath, ["--conditions=react-server", "--import", "tsx", "scripts/verification/round-12/prepare.ts", "--run", process.env.APS_DEMO_RUN!], { stdio: "inherit", windowsHide: true, env: process.env });
  if (result.status !== 0) throw new Error("Rehearsal preparation failed; keep this run and use a new name");
}
