import "server-only";
import { AccessError, invalidInput } from "@/modules/accounts/errors";
import { requireAccountManager } from "@/modules/accounts/guards";
import { parseAccountInput, uuidPattern } from "@/modules/accounts/validation";
import type {
  AccountContext,
  AccountInput,
  AccountSummary,
} from "@/modules/accounts/types";
import type { Prisma } from "@/generated/prisma/client";
import { getDatabase } from "./database";

const accountInclude = {
  enrollment: true,
  curriculumGrants: { where: { active: true } },
} as const;
type StoredAccount = Prisma.AccountAccessGetPayload<{
  include: typeof accountInclude;
}>;
function summarize(account: StoredAccount): AccountSummary {
  return {
    id: account.id,
    email: account.email,
    role: account.role,
    status: account.status,
    canManageAccounts: account.canManageAccounts,
    bound: Boolean(account.authUserId),
    version: account.version,
    curriculumIds: account.curriculumGrants.map((grant) => grant.curriculumId),
    enrollment: account.enrollment
      ? {
          confirmationSource: account.enrollment.confirmationSource,
          studentCode: account.enrollment.studentCode,
          curriculumVersionId: account.enrollment.curriculumVersionId,
          trackState: account.enrollment.trackState,
          trackId: account.enrollment.trackId,
        }
      : null,
  };
}

export async function validateReferences(
  tx: Prisma.TransactionClient,
  input: AccountInput,
) {
  if (input.role === "admin") {
    const count = await tx.curriculum.count({
      where: { id: { in: input.curriculumIds }, code: "CS2565" },
    });
    if (count !== input.curriculumIds.length)
      invalidInput("รอบนี้จัดสิทธิ์ได้เฉพาะ CS2565 ที่มีในระบบ");
  } else if (input.studentCode !== null) {
    const version = await tx.curriculumVersion.findFirst({
      where: { id: input.curriculumVersionId!, curriculum: { code: "CS2565" } },
    });
    if (!version) invalidInput("ไม่พบฉบับหลักสูตร CS2565 ที่เลือก");
    if (
      input.trackId &&
      !(await tx.track.findFirst({
        where: { id: input.trackId, curriculumVersionId: version.id },
      }))
    )
      invalidInput("สายไม่อยู่ในฉบับหลักสูตรที่เลือก");
  }
}

export async function assertManagerInTransaction(
  tx: Prisma.TransactionClient,
  context: AccountContext,
) {
  // Serialize manager provisioning against manager changes outside this service.
  await tx.$queryRaw`SELECT id FROM "AccountAccess" WHERE id = ${context.accountId}::uuid FOR UPDATE`;
  const manager = await tx.accountAccess.findUnique({
    where: { id: context.accountId },
  });
  if (
    !manager ||
    manager.status !== "active" ||
    manager.role !== "admin" ||
    !manager.canManageAccounts ||
    manager.authUserId !== context.authUserId
  )
    throw new AccessError(403, "MANAGER_REQUIRED", "ไม่มีสิทธิ์จัดการบัญชี");
}

export async function listAccounts(context: AccountContext) {
  requireAccountManager(context);
  return (
    await getDatabase().accountAccess.findMany({
      include: accountInclude,
      orderBy: { createdAt: "asc" },
    })
  ).map(summarize);
}

export async function curriculumOptions() {
  return getDatabase().curriculum.findMany({
    where: { code: "CS2565" },
    select: {
      id: true,
      code: true,
      name: true,
      versions: {
        select: {
          id: true,
          code: true,
          state: true,
          tracks: { select: { id: true, code: true, name: true } },
        },
      },
    },
  });
}

export async function createAccount(context: AccountContext, data: unknown) {
  requireAccountManager(context);
  const input = parseAccountInput(data);
  return getDatabase().$transaction(async (tx) => {
    await assertManagerInTransaction(tx, context);
    await validateReferences(tx, input);
    const account = await tx.accountAccess.create({
      data: {
        email: input.email,
        role: input.role,
        status: input.status,
        enrollment:
          input.role === "student" && input.studentCode !== null
            ? {
                create: {
                  studentCode: input.studentCode!,
                  curriculumVersionId: input.curriculumVersionId!,
                  trackState: input.trackState,
                  trackId: input.trackId,
                },
              }
            : undefined,
        curriculumGrants:
          input.role === "admin"
            ? {
                create: input.curriculumIds.map((curriculumId) => ({
                  curriculumId,
                })),
              }
            : undefined,
      },
      include: accountInclude,
    });
    await tx.auditEvent.create({
      data: {
        actorAccountId: context.accountId,
        targetAccountId: account.id,
        action: "create_account",
        changedFields: ["role", "status", "context"],
      },
    });
    return summarize(account);
  });
}

export async function updateAccount(
  context: AccountContext,
  id: string,
  data: unknown,
) {
  requireAccountManager(context);
  if (!uuidPattern.test(id))
    throw new AccessError(404, "ACCOUNT_NOT_FOUND", "ไม่พบบัญชี");
  const input = parseAccountInput(data, true);
  return getDatabase().$transaction(async (tx) => {
    await assertManagerInTransaction(tx, context);
    await tx.$queryRaw`SELECT id FROM "AccountAccess" WHERE id = ${id}::uuid FOR UPDATE`;
    const previous = await tx.accountAccess.findUnique({
      where: { id },
      include: accountInclude,
    });
    if (!previous)
      throw new AccessError(404, "ACCOUNT_NOT_FOUND", "ไม่พบบัญชี");
    if (previous.canManageAccounts)
      throw new AccessError(
        403,
        "MANAGER_PROTECTED",
        "บัญชีผู้ดูแลหลักเปลี่ยนสิทธิ์หรือระงับผ่านหน้าจอไม่ได้",
      );
    if (previous.version !== input.expectedVersion)
      throw new AccessError(
        409,
        "VERSION_CONFLICT",
        "ข้อมูลเปลี่ยนแล้ว กรุณาโหลดรายการล่าสุดก่อนแก้ไข",
      );
    if (previous.authUserId && input.email !== previous.email)
      throw new AccessError(
        409,
        "IDENTITY_LOCKED",
        "บัญชีที่ผูก Google แล้วเปลี่ยนอีเมลไม่ได้",
      );
    if (
      input.role === "student" &&
      previous.enrollment &&
      input.studentCode === null
    )
      throw new AccessError(
        409,
        "ENROLLMENT_COMPLETE",
        "ไม่ลบบริบทที่ยืนยันแล้วผ่านฟอร์มนี้",
      );
    if (
      input.role === "student" &&
      previous.authUserId &&
      !previous.enrollment &&
      input.studentCode !== null
    )
      throw new AccessError(
        409,
        "REVIEW_REQUIRED",
        "กรุณายืนยันบริบทผ่านรายการตรวจข้อมูลนักศึกษา",
      );
    if (
      previous.authUserId &&
      previous.enrollment &&
      input.role === "student" &&
      (input.studentCode !== previous.enrollment.studentCode ||
        input.curriculumVersionId !== previous.enrollment.curriculumVersionId)
    )
      throw new AccessError(
        409,
        "IDENTITY_LOCKED",
        "รหัสนักศึกษาและเจ้าของบริบทที่ผูกแล้วเปลี่ยนผ่านฟอร์มนี้ไม่ได้",
      );
    await validateReferences(tx, input);
    await tx.curriculumAdmin.updateMany({
      where: { accountAccessId: id },
      data: { active: false },
    });
    if (input.role === "admin") {
      for (const curriculumId of input.curriculumIds)
        await tx.curriculumAdmin.upsert({
          where: {
            accountAccessId_curriculumId: { accountAccessId: id, curriculumId },
          },
          create: { accountAccessId: id, curriculumId, active: true },
          update: { active: true },
        });
    } else if (input.studentCode !== null) {
      const enrollment = {
        studentCode: input.studentCode!,
        confirmationSource: "admin_verified",
        curriculumVersionId: input.curriculumVersionId!,
        trackState: input.trackState,
        trackId: input.trackId,
      };
      await tx.studentEnrollment.upsert({
        where: { accountAccessId: id },
        create: { accountAccessId: id, ...enrollment },
        update: enrollment,
      });
    }
    const account = await tx.accountAccess.update({
      where: { id },
      data: {
        email: input.email,
        role: input.role,
        status: input.status,
        version: { increment: 1 },
      },
      include: accountInclude,
    });
    if (previous.authUserId)
      await tx.session.deleteMany({ where: { userId: previous.authUserId } });
    await tx.auditEvent.create({
      data: {
        actorAccountId: context.accountId,
        targetAccountId: id,
        action: "update_account",
        changedFields: ["role", "status", "context", "sessions"],
      },
    });
    return summarize(account);
  });
}
