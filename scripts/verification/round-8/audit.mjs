// Read-only preparation/checkpoints for the real-account audit. No login or fixtures.
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const APP = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const DOC = resolve(APP, "../aps-v2-doc");
const sha = (value) => createHash("sha256").update(value).digest("hex");
const json = (value) => JSON.stringify(value, null, 2) + "\n";

export function validateTarget(env) {
  let database;
  try { database = new URL(env.DATABASE_URL); } catch { throw new Error("AUDIT_DATABASE_INVALID"); }
  if (!["postgres:", "postgresql:"].includes(database.protocol)
    || !["localhost", "127.0.0.1"].includes(database.hostname)
    || database.pathname !== "/aps_v2_dev") throw new Error("AUDIT_REQUIRES_LOCAL_DEV");
  if (env.BETTER_AUTH_URL !== "http://localhost:3000" || env.APS_DEMO_MODE === "1")
    throw new Error("AUDIT_REQUIRES_REAL_LOCAL_ORIGIN");
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET || (env.BETTER_AUTH_SECRET || "").length < 32)
    throw new Error("AUDIT_AUTH_NOT_CONFIGURED");
  return { origin: env.BETTER_AUTH_URL, database: "aps_v2_dev", host: database.hostname, demo: false };
}

export function runDirectory(run) {
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(run || "")) throw new Error("AUDIT_RUN_INVALID");
  return join(APP, "storage", "auth-audit", "round-8", run);
}

async function writeNew(path, value) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, json(value), { flag: "wx", mode: 0o600 });
}

async function evidenceFiles(directory) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (path === join(DOC, "deliverables", "auth-audit", "round-8")) continue;
    if (entry.isDirectory()) result.push(...await evidenceFiles(path));
    else if (entry.isFile()) result.push(path);
    else throw new Error("AUDIT_EVIDENCE_LINK_UNSUPPORTED");
  }
  return result;
}

async function protectedFiles() {
  const source = execFileSync("git", ["ls-files", "-c", "-o", "--exclude-standard", "-z"], { cwd: APP, encoding: "utf8" })
    .split("\0").filter(Boolean).map((path) => join(APP, path));
  const documents = await evidenceFiles(join(DOC, "deliverables"));
  const hashes = {};
  for (const path of [...new Set([...source, ...documents])].sort())
    hashes[relative(resolve(APP, ".."), path).replaceAll("\\", "/")] = sha(await readFile(path));
  return hashes;
}

async function databaseSnapshot(env) {
  // Validate BEFORE importing/constructing a database client.
  validateTarget(env);
  const { default: pg } = await import("pg");
  const client = new pg.Client({ connectionString: env.DATABASE_URL, connectionTimeoutMillis: 10000 });
  try {
    await client.connect();
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const tables = (await client.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows;
    const protectedTables = {};
    // OAuth/session records legitimately change during login. Never read token columns.
    for (const { tablename } of tables) {
      if (["User", "Session", "Account", "Verification"].includes(tablename)) continue;
      const identifier = '"' + tablename.replaceAll('"', '""') + '"';
      // Only per-row digests leave PostgreSQL; no transcript/document/account contents.
      const rows = (await client.query(`SELECT md5(to_jsonb(t)::text) AS digest FROM public.${identifier} t ORDER BY digest`)).rows;
      protectedTables[tablename] = { rows: rows.length, sha256: sha(json(rows)) };
    }
    const accounts = (await client.query(`SELECT a.id, a."authUserId", a.role, a.status, a."canManageAccounts",
      u."emailVerified", EXISTS(SELECT 1 FROM "Account" p WHERE p."userId"=a."authUserId" AND p."providerId"='google') AS "googleBound",
      (SELECT count(*)::int FROM "CurriculumAdmin" g WHERE g."accountAccessId"=a.id AND g.active) AS "activeGrants",
      EXISTS(SELECT 1 FROM "StudentEnrollment" e WHERE e."accountAccessId"=a.id) AS enrolled
      FROM "AccountAccess" a LEFT JOIN "User" u ON u.id=a."authUserId" ORDER BY a.id`)).rows;
    const sessions = (await client.query('SELECT id, "userId", "createdAt", "expiresAt" FROM "Session" ORDER BY id')).rows;
    await client.query("COMMIT");
    return { capturedAt: new Date().toISOString(), protectedTables, accounts, sessions };
  } finally { await client.end(); }
}

export function compareSnapshots(before, after) {
  const changed = (left, right) => [...new Set([...Object.keys(left), ...Object.keys(right)])]
    .filter((key) => JSON.stringify(left[key]) !== JSON.stringify(right[key]));
  const tables = changed(before.database.protectedTables, after.database.protectedTables);
  const files = changed(before.files, after.files);
  return { businessDataUnchanged: tables.length === 0, protectedFilesUnchanged: files.length === 0,
    protectedTableCount: Object.keys(before.database.protectedTables).length,
    protectedFileCount: Object.keys(before.files).length, changedTableCount: tables.length, changedFileCount: files.length };
}

export function projectAccountInventory(accounts) {
  return ["student", "admin"].map((role) => ({ role,
    activeGoogleBoundVerified: accounts.filter((a) => a.role === role && a.status === "active" && a.googleBound && a.emailVerified).length,
    aliasesAssigned: false }));
}

export async function main(args = process.argv.slice(2)) {
  const [command, run, stage] = args;
  const directory = runDirectory(run);
  const { config } = await import("dotenv");
  config({ path: join(APP, ".env"), quiet: true });
  const target = validateTarget(process.env);
  if (command === "prepare") {
    // Exclusive directory creation protects retained baselines from accidental reruns.
    await mkdir(dirname(directory), { recursive: true });
    await mkdir(directory);
    const before = { capturedAt: new Date().toISOString(), target, files: await protectedFiles(), database: await databaseSnapshot(process.env) };
    await writeNew(join(directory, "before.private.json"), before);
    const preflight = { capturedAt: before.capturedAt, target, protectedFileCount: Object.keys(before.files).length,
      protectedTableCount: Object.keys(before.database.protectedTables).length,
      inventory: projectAccountInventory(before.database.accounts), realGoogleTested: false, databaseReadOnly: true };
    await writeNew(join(directory, "preflight.json"), preflight);
    console.log(json(preflight));
  } else if (command === "checkpoint") {
    if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(stage || "")) throw new Error("AUDIT_STAGE_INVALID");
    const before = JSON.parse(await readFile(join(directory, "before.private.json"), "utf8"));
    const after = { capturedAt: new Date().toISOString(), files: await protectedFiles(), database: await databaseSnapshot(process.env) };
    const result = { capturedAt: after.capturedAt, ...compareSnapshots(before, after) };
    await writeNew(join(directory, `${stage}.private.json`), after);
    await writeNew(join(directory, `${stage}.json`), result);
    console.log(json(result));
    if (!result.businessDataUnchanged || !result.protectedFilesUnchanged) process.exitCode = 1;
  } else throw new Error("AUDIT_COMMAND_INVALID");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  main().catch((error) => {
    // Connection/provider errors can contain credentials. Emit only fixed safe codes.
    console.error(/^AUDIT_[A-Z_]+$/.test(error.message || "") ? error.message : "AUDIT_COMMAND_FAILED");
    process.exitCode = 1;
  });
