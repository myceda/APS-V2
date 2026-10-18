import { randomUUID } from "node:crypto";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import pg from "pg";
import { config } from "dotenv";

config({ quiet: true });
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
const terminal = createInterface({ input: stdin, output: stdout });
try {
  if (!process.env.DATABASE_URL) throw new Error("ENVIRONMENT_NOT_READY");
  const email = (
    process.env.BOOTSTRAP_ADMIN_EMAIL ??
    (await terminal.question("อีเมล Google ของผู้ดูแลหลัก: "))
  )
    .trim()
    .toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    throw new Error("INVALID_EMAIL");
  await client.connect();
  await client.query("BEGIN");
  await client.query("SELECT pg_advisory_xact_lock(825601)");
  const manager = await client.query(
    'SELECT id, email FROM "AccountAccess" WHERE "canManageAccounts"=true',
  );
  if (manager.rowCount) {
    if (manager.rows[0].email !== email)
      throw new Error("ACCOUNT_MANAGER_ALREADY_EXISTS");
    console.log("มีผู้ดูแลหลักนี้แล้ว ไม่เปลี่ยนข้อมูลเดิม");
  } else {
    const existing = await client.query(
      'SELECT id FROM "AccountAccess" WHERE email=$1',
      [email],
    );
    if (existing.rowCount) throw new Error("EXISTING_ACCOUNT_NEEDS_REVIEW");
    const curriculumId = randomUUID();
    await client.query(
      'INSERT INTO "Curriculum" (id,code,name) VALUES ($1,$2,$3) ON CONFLICT (code) DO NOTHING',
      [curriculumId, "CS2565", "วิทยาการคอมพิวเตอร์ พ.ศ. 2565"],
    );
    const curriculum = await client.query(
      'SELECT id FROM "Curriculum" WHERE code=$1',
      ["CS2565"],
    );
    const versionId = randomUUID();
    await client.query(
      'INSERT INTO "CurriculumVersion" (id,"curriculumId",code,state) VALUES ($1,$2,$3,$4) ON CONFLICT (code) DO NOTHING',
      [versionId, curriculum.rows[0].id, "CS2565-identity-draft", "draft"],
    );
    const version = await client.query(
      'SELECT id FROM "CurriculumVersion" WHERE code=$1',
      ["CS2565-identity-draft"],
    );
    for (const [code, name] of [
      ["project", "โครงงานวิจัย"],
      ["cooperative", "สหกิจศึกษา"],
    ]) {
      await client.query(
        'INSERT INTO "Track" (id,"curriculumVersionId",code,name) VALUES ($1,$2,$3,$4) ON CONFLICT ("curriculumVersionId",code) DO NOTHING',
        [randomUUID(), version.rows[0].id, code, name],
      );
    }
    const accountId = randomUUID();
    await client.query(
      'INSERT INTO "AccountAccess" (id,email,role,status,"canManageAccounts",version,"updatedAt") VALUES ($1,$2,$3,$4,true,1,NOW())',
      [accountId, email, "admin", "active"],
    );
    await client.query(
      'INSERT INTO "CurriculumAdmin" ("accountAccessId","curriculumId",active) VALUES ($1,$2,true)',
      [accountId, curriculum.rows[0].id],
    );
    await client.query(
      'INSERT INTO "AuditEvent" (id,"actorAccountId","targetAccountId",action,"changedFields") VALUES ($1,$2,$2,$3,$4)',
      [
        randomUUID(),
        accountId,
        "bootstrap_manager",
        ["role", "status", "curriculumGrants"],
      ],
    );
    console.log(
      "สร้างผู้ดูแลหลักและ metadata CS2565 ฉบับร่างแล้ว (ไม่แสดงข้อมูลส่วนตัว)",
    );
  }
  await client.query("COMMIT");
} catch (error) {
  await client.query("ROLLBACK").catch(() => {});
  console.error(
    error instanceof Error && /^[A-Z_]+$/.test(error.message)
      ? error.message
      : "BOOTSTRAP_FAILED",
  );
  process.exitCode = 1;
} finally {
  terminal.close();
  await client.end();
}
