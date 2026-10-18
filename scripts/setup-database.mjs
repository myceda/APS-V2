import { randomBytes } from "node:crypto";
import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import pg from "pg";
import { config, parse } from "dotenv";

config({ quiet: true });
const envPath = resolve(".env");
const appRole = "aps_v2_app";
const databases = ["aps_v2_dev", "aps_v2_shadow", "aps_v2_test"];
const adminPassword = process.env.PGADMINPASSWORD;
if (!adminPassword) {
  console.error(
    "ต้องตั้ง PGADMINPASSWORD เฉพาะ process เพื่อเตรียม PostgreSQL",
  );
  process.exit(1);
}
const admin = new pg.Client({
  host: "127.0.0.1",
  port: 5432,
  user: "postgres",
  password: adminPassword,
  database: "postgres",
});
try {
  await admin.connect();
  await admin.query("SELECT 1");
  const existingRole = await admin.query(
    "SELECT rolsuper, rolcreatedb, rolcreaterole FROM pg_roles WHERE rolname=$1",
    [appRole],
  );
  let appPassword;
  if (existingRole.rowCount) {
    const role = existingRole.rows[0];
    if (role.rolsuper || role.rolcreatedb || role.rolcreaterole)
      throw new Error("ROLE_PRIVILEGES_UNEXPECTED");
    if (!process.env.DATABASE_URL)
      throw new Error("EXISTING_ROLE_NEEDS_ENVIRONMENT");
    const url = new URL(process.env.DATABASE_URL);
    if (
      url.username !== appRole ||
      !["localhost", "127.0.0.1"].includes(url.hostname)
    )
      throw new Error("ENVIRONMENT_TARGET_UNEXPECTED");
    appPassword = decodeURIComponent(url.password);
  } else {
    if (process.env.DATABASE_URL)
      throw new Error("EXISTING_ENVIRONMENT_NEEDS_REVIEW");
    appPassword = randomBytes(32).toString("base64url");
  }
  for (const database of databases) {
    const result = await admin.query(
      "SELECT pg_get_userbyid(datdba) AS owner FROM pg_database WHERE datname=$1",
      [database],
    );
    if (result.rowCount && result.rows[0].owner !== appRole)
      throw new Error("EXISTING_DATABASE_OWNER_UNEXPECTED");
  }
  if (!existingRole.rowCount) {
    // Password is generated locally with a restricted alphabet, never printed.
    await admin.query(
      `CREATE ROLE "${appRole}" LOGIN PASSWORD '${appPassword}' NOSUPERUSER NOCREATEDB NOCREATEROLE`,
    );
  }
  const connection = (database) =>
    `postgresql://${appRole}:${encodeURIComponent(appPassword)}@127.0.0.1:5432/${database}`;
  let envText = existsSync(envPath)
    ? readFileSync(envPath, "utf8")
    : "# Local APS-v2 credentials. Do not commit.\n";
  if (!envText.endsWith("\n")) envText += "\n";
  const existingSettings = parse(envText);
  const settings = {
    DATABASE_URL: connection(databases[0]),
    SHADOW_DATABASE_URL: connection(databases[1]),
    TEST_DATABASE_URL: connection(databases[2]),
    BETTER_AUTH_URL: "http://localhost:3000",
    BETTER_AUTH_SECRET:
      process.env.BETTER_AUTH_SECRET || randomBytes(32).toString("base64url"),
    TEST_AUTH_SECRET:
      process.env.TEST_AUTH_SECRET || randomBytes(32).toString("base64url"),
    GOOGLE_CLIENT_ID: "",
    GOOGLE_CLIENT_SECRET: "",
  };
  for (const [key, value] of Object.entries(settings)) {
    if (!new RegExp(`^${key}=`, "m").test(envText))
      envText += `${key}=${value}\n`;
    else if (!existingSettings[key]?.trim() && value)
      envText = envText.replace(
        new RegExp(`^${key}=.*$`, "m"),
        () => `${key}=${value}`,
      );
  }
  writeFileSync(envPath, envText, { mode: 0o600 });
  for (const database of databases) {
    const result = await admin.query(
      "SELECT 1 FROM pg_database WHERE datname=$1",
      [database],
    );
    if (!result.rowCount)
      await admin.query(`CREATE DATABASE "${database}" OWNER "${appRole}"`);
    const check = new pg.Client({ connectionString: connection(database) });
    try {
      await check.connect();
      await check.query("SELECT 1");
      const tables = await check.query(
        "SELECT tablename FROM pg_tables WHERE schemaname='public'",
      );
      if (
        tables.rowCount &&
        !tables.rows.some((row) => row.tablename === "_prisma_migrations")
      )
        throw new Error("EXISTING_SCHEMA_NEEDS_REVIEW");
      console.log(
        `${database}: เชื่อมต่อได้ (${tables.rowCount} ตารางเดิม; ไม่ล้างข้อมูล)`,
      );
    } finally {
      await check.end();
    }
  }
  console.log(
    "เตรียมฐานข้อมูลและ environment local แล้ว (ไม่แสดง credentials)",
  );
} catch (error) {
  const code =
    error instanceof Error && /^[A-Z_]+$/.test(error.message)
      ? error.message
      : "DATABASE_SETUP_FAILED";
  console.error(code);
  process.exitCode = 1;
} finally {
  delete process.env.PGADMINPASSWORD;
  await admin.end();
}
