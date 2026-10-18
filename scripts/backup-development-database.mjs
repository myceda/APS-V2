import { config } from "dotenv";
import { mkdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
config({ quiet: true });
const url = new URL(process.env.DATABASE_URL || "");
if (
  url.pathname !== "/aps_v2_dev" ||
  !["localhost", "127.0.0.1"].includes(url.hostname)
)
  throw new Error("Backup requires local aps_v2_dev");
await mkdir("storage/backups", { recursive: true });
const file = resolve(
  `storage/backups/aps-v2-${new Date().toISOString().replaceAll(/[:.]/g, "-")}.dump`,
);
const bin = "C:/Program Files/PostgreSQL/18/bin/";
const result = spawnSync(
  `${bin}pg_dump.exe`,
  [
    "--format=custom",
    "--file",
    file,
    "--host",
    url.hostname,
    "--port",
    url.port || "5432",
    "--username",
    decodeURIComponent(url.username),
    "--dbname",
    "aps_v2_dev",
  ],
  {
    env: { ...process.env, PGPASSWORD: decodeURIComponent(url.password) },
    stdio: "pipe",
  },
);
if (result.status !== 0)
  throw new Error("Backup failed; migration must not proceed");
const check = spawnSync(`${bin}pg_restore.exe`, ["--list", file], {
  stdio: "pipe",
});
if (check.status !== 0) throw new Error("Backup archive validation failed");
console.log(`Validated private backup: ${file}`);
