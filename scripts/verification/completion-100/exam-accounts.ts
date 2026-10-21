// Explicit local operator provisioning. This is not a Google login or session fixture.
import { config } from "dotenv";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import type { AccountContext } from "../../../src/modules/accounts/types";
config({ quiet: true });
const root = fileURLToPath(new URL("../../../", import.meta.url));
const docs = path.resolve(root, "../aps-v2-doc/deliverables/completion-100/exam-2026-10-21");
const args = process.argv.slice(2);
const value = (key: string) => args[args.indexOf(key) + 1]?.trim().toLowerCase();
const studentEmail = args.includes("--student") ? value("--student") : "";
const adminEmail = args.includes("--admin") ? value("--admin") : "";
if (!studentEmail || !adminEmail || studentEmail === adminEmail || ![studentEmail, adminEmail].every(e => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))) throw new Error("Provide distinct --student and --admin emails");
let target: URL;
try { target = new URL(process.env.DATABASE_URL || ""); }
catch { throw new Error("EXAM_DATABASE_CONFIGURATION_INVALID"); }
if (!["postgres:", "postgresql:"].includes(target.protocol) || !["localhost", "127.0.0.1"].includes(target.hostname) || target.pathname !== "/aps_v2_dev" || process.env.BETTER_AUTH_URL !== "http://localhost:3000" || process.env.APS_DEMO_MODE === "1") throw new Error("EXAM_REQUIRES_NORMAL_LOCAL_DEV_CONFIGURATION");
if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET || (process.env.BETTER_AUTH_SECRET || "").length < 32) throw new Error("EXAM_REAL_GOOGLE_NOT_CONFIGURED");
const { getDatabase } = await import("../../../src/server/database");
const { createAccount } = await import("../../../src/server/accounts");
const db = getDatabase();
try {
  const include = { authUser: true, enrollment: true, curriculumGrants: true } as const;
  const [studentBefore, admin] = await Promise.all([
    db.accountAccess.findUnique({ where: { email: studentEmail }, include }),
    db.accountAccess.findUnique({ where: { email: adminEmail }, include }),
  ]);
  const fingerprint = async () => createHash("sha256").update(JSON.stringify(await db.accountAccess.findMany({ where: { email: { notIn: [studentEmail, adminEmail] } }, orderBy: { id: "asc" }, include }))).digest("hex");
  const protectedBefore = await fingerprint();
  const inventory = { accounts: await db.accountAccess.count(), activeManagers: await db.accountAccess.count({ where: { role: "admin", status: "active", canManageAccounts: true } }), cs2565Curricula: await db.curriculum.count({ where: { code: "CS2565" } }) };
  if (args.includes("--apply") && studentBefore && (studentBefore.role !== "student" || studentBefore.status !== "active")) throw new Error("EXAM_STUDENT_CONFLICT_NO_ROLES_CHANGED");
  if (args.includes("--apply") && admin && (admin.role !== "admin" || admin.status !== "active")) throw new Error("EXAM_ADMIN_CONFLICT_NO_ROLES_CHANGED");
  let action = studentBefore ? "existing_student_preserved" : "student_not_registered";
  let adminAction = admin ? "existing_administrator_preserved" : "administrator_not_registered";
  if (args.includes("--apply") && (!studentBefore || !admin)) {
    // Local operator has explicit authorization for these two emails. The
    // existing manager is the audit actor, not a fabricated browser session.
    const operator = await db.accountAccess.findFirst({ where: { role: "admin", status: "active", canManageAccounts: true, authUserId: { not: null }, authUser: { emailVerified: true } }, include });
    if (!operator?.authUserId) throw new Error("EXAM_EXISTING_MANAGER_NOT_READY_NO_ROLES_CHANGED");
    const context: AccountContext = { email: operator.email, authUserId: operator.authUserId, accountId: operator.id, displayName: "Local authorized operator", role: "admin", canManageAccounts: true, curriculumIds: operator.curriculumGrants.filter(g => g.active).map(g => g.curriculumId), enrollment: null, onboardingStatus: "required" };
    if (!admin) {
      const curriculum = await db.curriculum.findUnique({ where: { code: "CS2565" } });
      if (!curriculum || !context.curriculumIds.includes(curriculum.id)) throw new Error("EXAM_CURRICULUM_NOT_AUTHORIZED");
      await createAccount(context, { email: adminEmail, role: "admin", status: "active", curriculumIds: [curriculum.id] });
      adminAction = "created_curriculum_administrator_without_account_manager_privilege";
    }
    if (!studentBefore) {
      await createAccount(context, { email: studentEmail, role: "student", status: "active", curriculumIds: [] });
      action = "created_student_allowlist_without_enrollment";
    }
  }
  const after = await db.accountAccess.findUnique({ where: { email: studentEmail }, include });
  const adminAfter = await db.accountAccess.findUnique({ where: { email: adminEmail }, include });
  const protectedAfter = await fingerprint();
  if (protectedBefore !== protectedAfter) throw new Error("PROTECTED_ACCOUNT_STATE_CHANGED");
  const result = { checkedAt: new Date().toISOString(), method: args.includes("--apply") ? "authorized_local_operator_via_existing_account_service" : "read_only_database_check", action, adminAction, inventory,
    student: { exists: Boolean(after), role: after?.role ?? null, active: after?.status === "active", googleBound: Boolean(after?.authUserId), emailVerified: after?.authUser?.emailVerified ?? false, enrollmentExists: Boolean(after?.enrollment) },
    administrator: { exists: Boolean(adminAfter), role: adminAfter?.role ?? null, active: adminAfter?.status === "active", canManageAccounts: adminAfter?.canManageAccounts ?? false, googleBound: Boolean(adminAfter?.authUserId), emailVerified: adminAfter?.authUser?.emailVerified ?? false, activeCurriculumGrants: adminAfter?.curriculumGrants.filter(g => g.active).length ?? 0 },
    otherAccountStateUnchanged: true, protectionScope: "before_and_after_this_command", protectedBefore, protectedAfter,
    realGoogleFinalVersion: "not_assessed_by_this_database_command", universityAutoRegistration: "not_tested", note: "No password, OAuth identity, session, enrollment or academic data created by this command; Google acceptance recorded separately, aliases only in report" };
  await mkdir(docs, { recursive: true });
  const suffix = new Date().toISOString().replace(/[:.]/g, "-");
  await writeFile(path.join(docs, `account-preparation-${suffix}.json`), JSON.stringify(result, null, 2) + "\n", { flag: "wx" });
  await writeFile(path.join(docs, "account-preparation.json"), JSON.stringify(result, null, 2) + "\n");
  console.log(JSON.stringify(result));
} catch (error) {
  // Do not print driver errors, connection strings, user identifiers or secrets.
  console.error(error instanceof Error && error.message.startsWith("EXAM_") ? error.message : "EXAM_ACCOUNT_OPERATION_FAILED_NO_CREDENTIALS_LOGGED");
  process.exitCode = 1;
} finally { await db.$disconnect(); }
