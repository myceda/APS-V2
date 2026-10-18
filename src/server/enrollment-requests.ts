import "server-only";
import { AccessError, invalidInput } from "@/modules/accounts/errors";
import { requireAccountManager } from "@/modules/accounts/guards";
import { parseAccountInput, uuidPattern } from "@/modules/accounts/validation";
import type {
  AccountContext,
  EnrollmentRequestSummary,
} from "@/modules/accounts/types";
import type { Prisma } from "@/generated/prisma/client";
import { getDatabase } from "./database";
import { assertManagerInTransaction, validateReferences } from "./accounts";

const include = {
  owner: { select: { email: true } },
  curriculumVersion: { include: { curriculum: true } },
  track: true,
} as const;
type Stored = Prisma.EnrollmentRequestGetPayload<{ include: typeof include }>;
function summary(row: Stored): EnrollmentRequestSummary {
  return {
    id: row.id,
    accountAccessId: row.accountAccessId,
    email: row.owner.email,
    studentCode: row.studentCode,
    curriculumVersionId: row.curriculumVersionId,
    curriculumCode: row.curriculumVersion.curriculum.code,
    trackState: row.trackState,
    trackId: row.trackId,
    trackName: row.track?.name ?? null,
    status: row.status,
    version: row.version,
    reviewReason: row.reviewReason,
    submissionReason: row.submissionReason,
  };
}
function studentRole(context: AccountContext) {
  if (context.role !== "student")
    throw new AccessError(
      403,
      "STUDENT_REQUIRED",
      "เฉพาะนักศึกษาที่กรอกข้อมูลได้",
    );
}
function object(data: unknown, keys: string[]) {
  if (!data || typeof data !== "object" || Array.isArray(data)) invalidInput();
  const value = data as Record<string, unknown>;
  if (Object.keys(value).some((key) => !keys.includes(key)))
    invalidInput("คำขอมีฟิลด์ที่ระบบไม่รองรับ");
  return value;
}
function version(data: Record<string, unknown>) {
  if (
    !Number.isInteger(data.expectedVersion) ||
    (data.expectedVersion as number) < 0
  )
    invalidInput("กรุณาโหลดฉบับข้อมูลล่าสุด");
  return data.expectedVersion as number;
}
export async function getOwnEnrollmentRequest(context: AccountContext) {
  studentRole(context);
  const row = await getDatabase().enrollmentRequest.findFirst({
    where: { accountAccessId: context.accountId },
    orderBy: { createdAt: "desc" },
    include,
  });
  return row ? summary(row) : null;
}
export async function saveEnrollmentRequest(
  context: AccountContext,
  data: unknown,
) {
  studentRole(context);
  const value = object(data, [
    "studentCode",
    "curriculumVersionId",
    "trackState",
    "trackId",
    "expectedVersion",
  ]);
  const expectedVersion = version(value);
  const input = parseAccountInput({
    ...value,
    expectedVersion: undefined,
    email: "request@aps.invalid",
    role: "student",
    status: "active",
    curriculumIds: [],
  });
  if (!input.studentCode) invalidInput("กรุณาระบุรหัสนักศึกษาและหลักสูตร");
  return getDatabase().$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "AccountAccess" WHERE id = ${context.accountId}::uuid FOR UPDATE`;
    const owner = await tx.accountAccess.findUnique({
      where: { id: context.accountId },
      include: { enrollment: true },
    });
    if (
      !owner ||
      owner.role !== "student" ||
      owner.status !== "active" ||
      owner.authUserId !== context.authUserId
    )
      throw new AccessError(
        403,
        "ACCOUNT_INACTIVE",
        "บัญชีนี้ไม่มีสิทธิ์ส่งข้อมูล",
      );
    if (owner.enrollment)
      throw new AccessError(
        409,
        "ENROLLMENT_COMPLETE",
        "บริบทยืนยันแล้ว เปลี่ยนผ่านคำขอนี้ไม่ได้",
      );
    const previous = await tx.enrollmentRequest.findFirst({
      where: { accountAccessId: owner.id },
      orderBy: { createdAt: "desc" },
    });
    if ((previous?.version ?? 0) !== expectedVersion)
      throw new AccessError(
        409,
        "VERSION_CONFLICT",
        "ข้อมูลเปลี่ยนแล้ว กรุณาโหลดรายการล่าสุด",
      );
    await validateReferences(tx, input);
    const fields = {
      studentCode: input.studentCode!,
      curriculumVersionId: input.curriculumVersionId!,
      trackState: input.trackState,
      trackId: input.trackId,
    };
    const row =
      previous?.status === "pending"
        ? await tx.enrollmentRequest.update({
            where: { id: previous.id },
            data: { ...fields, version: { increment: 1 } },
            include,
          })
        : await tx.enrollmentRequest.create({
            data: {
              ...fields,
              accountAccessId: owner.id,
              version: expectedVersion + 1,
              createdAt: new Date(
                Math.max(Date.now(), (previous?.createdAt.getTime() ?? 0) + 1),
              ),
            },
            include,
          });
    await tx.auditEvent.create({
      data: {
        actorAccountId: owner.id,
        targetAccountId: owner.id,
        action: "submit_enrollment_request",
        changedFields: ["enrollmentRequest"],
      },
    });
    return summary(row);
  });
}
export async function listEnrollmentRequests(context: AccountContext) {
  requireAccountManager(context);
  return (
    await getDatabase().enrollmentRequest.findMany({
      where: { owner: { enrollment: null } },
      include,
      orderBy: { createdAt: "desc" },
    })
  ).map(summary);
}
export async function reviewEnrollmentRequest(
  context: AccountContext,
  id: string,
  data: unknown,
) {
  requireAccountManager(context);
  if (!uuidPattern.test(id))
    throw new AccessError(404, "REQUEST_NOT_FOUND", "ไม่พบคำขอ");
  const value = object(data, ["decision", "reason", "expectedVersion"]);
  const expectedVersion = version(value);
  if (value.decision !== "approved" && value.decision !== "rejected")
    invalidInput("กรุณาเลือกผลการตรวจ");
  if (
    value.reason != null &&
    (typeof value.reason !== "string" || value.reason.length > 500)
  )
    invalidInput("เหตุผลยาวได้ไม่เกิน 500 ตัวอักษร");
  const reason = typeof value.reason === "string" ? value.reason.trim() : null;
  if (value.decision === "rejected" && !reason)
    invalidInput("กรุณาระบุเหตุผลที่ให้แก้ไข");
  const decision = value.decision;
  return getDatabase().$transaction(async (tx) => {
    await assertManagerInTransaction(tx, context);
    const request = await tx.enrollmentRequest.findUnique({ where: { id } });
    if (!request) throw new AccessError(404, "REQUEST_NOT_FOUND", "ไม่พบคำขอ");
    await tx.$queryRaw`SELECT id FROM "AccountAccess" WHERE id = ${request.accountAccessId}::uuid FOR UPDATE`;
    const current = await tx.enrollmentRequest.findUniqueOrThrow({
      where: { id },
    });
    // A retry of the same decision is harmless; different/stale decisions conflict.
    if (current.status === decision && current.version === expectedVersion + 1)
      return summary(
        await tx.enrollmentRequest.findUniqueOrThrow({
          where: { id },
          include,
        }),
      );
    if (current.status !== "pending" || current.version !== expectedVersion)
      throw new AccessError(
        409,
        "VERSION_CONFLICT",
        "คำขอเปลี่ยนหรือได้รับการตรวจแล้ว กรุณาโหลดรายการล่าสุด",
      );
    const owner = await tx.accountAccess.findUniqueOrThrow({
      where: { id: current.accountAccessId },
      include: { enrollment: true },
    });
    if (owner.role !== "student" || owner.status !== "active")
      throw new AccessError(
        409,
        "ACCOUNT_INACTIVE",
        "บัญชีไม่ใช่นักศึกษาที่เปิดใช้งาน",
      );
    if (owner.enrollment)
      throw new AccessError(
        409,
        "ENROLLMENT_COMPLETE",
        "บัญชีมีบริบทที่ยืนยันแล้ว ไม่เขียนทับข้อมูลเดิม",
      );
    if (decision === "approved") {
      await validateReferences(tx, {
        email: owner.email,
        role: "student",
        status: "active",
        curriculumIds: [],
        studentCode: current.studentCode,
        curriculumVersionId: current.curriculumVersionId,
        trackState: current.trackState,
        trackId: current.trackId,
      });
      await tx.studentEnrollment.create({
        data: {
          accountAccessId: owner.id,
          studentCode: current.studentCode,
          curriculumVersionId: current.curriculumVersionId,
          trackState: current.trackState,
          trackId: current.trackId,
        },
      });
      await tx.accountAccess.update({
        where: { id: owner.id },
        data: { version: { increment: 1 } },
      });
      if (owner.authUserId)
        await tx.session.deleteMany({ where: { userId: owner.authUserId } });
    }
    const row = await tx.enrollmentRequest.update({
      where: { id },
      data: {
        status: decision,
        reviewReason: reason || null,
        reviewerAccountId: context.accountId,
        reviewedAt: new Date(),
        version: { increment: 1 },
      },
      include,
    });
    await tx.auditEvent.create({
      data: {
        actorAccountId: context.accountId,
        targetAccountId: owner.id,
        action: `enrollment_${decision}`,
        changedFields:
          decision === "approved"
            ? ["enrollment", "sessions"]
            : ["enrollmentRequest"],
      },
    });
    return summary(row);
  });
}
