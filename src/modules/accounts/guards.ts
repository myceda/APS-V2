import { AccessError } from "./errors";
import type { AccountContext } from "./types";

export function requireStudentAccount(context: AccountContext) {
  if (context.role !== "student")
    throw new AccessError(
      403,
      "STUDENT_REQUIRED",
      "บัญชีนี้ไม่มีสิทธิ์นักศึกษา",
    );
  return context;
}

export function requireStudent(context: AccountContext) {
  requireStudentAccount(context);
  if (!context.enrollment)
    throw new AccessError(
      403,
      "ENROLLMENT_REQUIRED",
      "กรุณาอัปโหลดและยืนยันผลการเรียนก่อนใช้งานส่วนนี้",
    );
  return context.enrollment;
}

export function requireCurriculumAdmin(
  context: AccountContext,
  curriculumId: string,
) {
  if (
    context.role !== "admin" ||
    !context.curriculumIds.includes(curriculumId)
  ) {
    throw new AccessError(
      403,
      "CURRICULUM_FORBIDDEN",
      "ไม่มีสิทธิ์เข้าถึงหลักสูตรนี้",
    );
  }
  return context;
}

export function requireAccountManager(context: AccountContext) {
  if (context.role !== "admin" || !context.canManageAccounts)
    throw new AccessError(
      403,
      "MANAGER_REQUIRED",
      "เฉพาะผู้ดูแลหลักเท่านั้นที่จัดการบัญชีได้",
    );
  return context;
}

export function requireOwner(context: AccountContext, ownerAccountId: string) {
  if (context.accountId !== ownerAccountId)
    throw new AccessError(
      404,
      "RESOURCE_NOT_FOUND",
      "ไม่พบข้อมูลที่คุณมีสิทธิ์เข้าถึง",
    );
}

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function requireVerifiedGoogleEmail(email: string, verified: boolean) {
  if (!verified)
    throw new AccessError(
      403,
      "GOOGLE_EMAIL_UNVERIFIED",
      "บัญชี Google ยังไม่ยืนยันอีเมล",
    );
  return normalizeEmail(email);
}
