import { config } from "dotenv";
import pg from "pg";
config({ quiet: true });
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
try {
  if (!process.env.DATABASE_URL) throw new Error();
  await client.connect();
  const role = await client.query(
    "SELECT rolsuper, rolcreatedb, rolcreaterole FROM pg_roles WHERE rolname=current_user",
  );
  const accounts = await client.query(
    'SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE "canManageAccounts")::int AS managers, COUNT(*) FILTER (WHERE "canManageAccounts" AND "authUserId" IS NOT NULL)::int AS bound_managers FROM "AccountAccess"',
  );
  const identities = await client.query(
    'SELECT COUNT(*)::int AS total FROM "User"',
  );
  console.log(
    JSON.stringify(
      {
        databaseConnected: true,
        applicationRole: {
          superuser: role.rows[0].rolsuper,
          createDatabase: role.rows[0].rolcreatedb,
          createRole: role.rows[0].rolcreaterole,
        },
        accounts: accounts.rows[0],
        authUserCount: identities.rows[0].total,
        googleEnvironmentConfigured: Boolean(
          process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET,
        ),
        googleLoginVerified: "requires real browser acceptance",
      },
      null,
      2,
    ),
  );
} catch {
  console.error(
    "SETUP_CHECK_FAILED (ไม่แสดง connection string หรือข้อมูลส่วนตัว)",
  );
  process.exitCode = 1;
} finally {
  await client.end();
}
