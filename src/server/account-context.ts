import "server-only";
import { AccessError } from "@/modules/accounts/errors";
import type { AccountContext } from "@/modules/accounts/types";
import { getAuth } from "./auth";
import { getDatabase } from "./database";
import { normalizeEmail } from "@/modules/accounts/guards";

export async function requireAccount(
  requestHeaders: Headers,
): Promise<AccountContext> {
  if (!requestHeaders.get("cookie"))
    throw new AccessError(401, "SIGN_IN_REQUIRED", "กรุณาเข้าสู่ระบบก่อน");
  const session = await getAuth().api.getSession({ headers: requestHeaders });
  if (!session || !session.user.emailVerified)
    throw new AccessError(
      401,
      "SESSION_INVALID",
      "การเข้าสู่ระบบหมดอายุ กรุณาเข้าสู่ระบบใหม่",
    );
  const access = await getDatabase().accountAccess.findUnique({
    where: { authUserId: session.user.id },
    include: {
      curriculumGrants: { where: { active: true } },
      enrollmentRequests: { orderBy: { createdAt: "desc" }, take: 1 },
      enrollment: {
        include: {
          curriculumVersion: { include: { curriculum: true } },
          track: true,
        },
      },
    },
  });
  if (!access || access.status !== "active")
    throw new AccessError(
      403,
      "ACCOUNT_INACTIVE",
      "บัญชีนี้ยังไม่มีสิทธิ์ใช้งาน กรุณาติดต่อผู้ดูแล",
    );
  if (normalizeEmail(session.user.email) !== access.email)
    throw new AccessError(
      403,
      "IDENTITY_CONFLICT",
      "อีเมล Google ไม่ตรงกับบัญชีที่ผูกไว้ กรุณาติดต่อผู้ดูแล",
    );
  const enrollment = access.role === "student" ? access.enrollment : null;
  return {
    email: access.email,
    authUserId: session.user.id,
    accountId: access.id,
    displayName: session.user.name,
    role: access.role,
    canManageAccounts: access.canManageAccounts,
    curriculumIds:
      access.role === "admin"
        ? access.curriculumGrants.map((grant) => grant.curriculumId)
        : [],
    onboardingStatus: enrollment
      ? "complete"
      : access.enrollmentRequests[0]?.status === "pending"
        ? "pending"
        : access.enrollmentRequests[0]?.status === "rejected"
          ? "rejected"
          : "required",
    enrollment: enrollment
      ? {
          id: enrollment.id,
          studentCode: enrollment.studentCode,
          curriculumId: enrollment.curriculumVersion.curriculumId,
          curriculumCode: enrollment.curriculumVersion.curriculum.code,
          curriculumVersionId: enrollment.curriculumVersionId,
          curriculumState: enrollment.curriculumVersion.state,
          confirmationSource: enrollment.confirmationSource,
          trackState: enrollment.trackState,
          trackId: enrollment.trackId,
          trackName: enrollment.track?.name ?? null,
        }
      : null,
  };
}
