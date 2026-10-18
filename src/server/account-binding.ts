import "server-only";
import { AccessError } from "@/modules/accounts/errors";
import {
  normalizeEmail,
  requireVerifiedGoogleEmail,
} from "@/modules/accounts/guards";
import { getDatabase } from "./database";
import { isUniversityIdentity } from "@/modules/accounts/university";

export async function validateGoogleIdentity(
  email: string,
  verified: boolean,
  subject?: string,
  hostedDomain?: unknown,
) {
  const normalized = requireVerifiedGoogleEmail(email, verified);
  const database = getDatabase();
  if (subject) {
    const identity = await database.account.findUnique({
      where: {
        providerId_accountId: { providerId: "google", accountId: subject },
      },
      include: { user: { include: { access: true } } },
    });
    if (identity?.user.access && identity.user.access.email !== normalized)
      throw new AccessError(
        403,
        "IDENTITY_CONFLICT",
        "อีเมล Google ไม่ตรงกับตัวตนที่ผูกไว้",
      );
  }
  const access = await database.accountAccess.findUnique({
    where: { email: normalized },
  });
  if (!access && isUniversityIdentity(normalized, hostedDomain)) return null;
  if (!access || access.status !== "active")
    throw new AccessError(
      403,
      "ACCOUNT_NOT_ALLOWED",
      "บัญชีนี้ยังไม่ได้รับอนุญาต กรุณาติดต่อผู้ดูแล",
    );
  if (subject && access.authUserId) {
    const binding = await database.account.findUnique({
      where: {
        providerId_accountId: { providerId: "google", accountId: subject },
      },
    });
    if (!binding || binding.userId !== access.authUserId)
      throw new AccessError(
        403,
        "IDENTITY_CONFLICT",
        "บัญชี Google ไม่ตรงกับตัวตนที่ผูกไว้",
      );
  }
  return access;
}

export async function bindAccountToUser(authUserId: string) {
  const database = getDatabase();
  return database.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { id: authUserId } });
    if (!user?.emailVerified)
      throw new AccessError(
        403,
        "GOOGLE_EMAIL_UNVERIFIED",
        "บัญชี Google ยังไม่ยืนยันอีเมล",
      );
    const provider = await tx.account.findFirst({
      where: { userId: authUserId, providerId: "google" },
    });
    if (!provider)
      throw new AccessError(
        403,
        "GOOGLE_ACCOUNT_REQUIRED",
        "ต้องใช้บัญชี Google ที่ตรวจสอบแล้ว",
      );
    const previousBinding = await tx.accountAccess.findUnique({
      where: { authUserId },
    });
    if (previousBinding && previousBinding.email !== normalizeEmail(user.email))
      throw new AccessError(
        403,
        "IDENTITY_CONFLICT",
        "อีเมล Google ไม่ตรงกับบัญชีที่ผูกไว้",
      );
    const email = normalizeEmail(user.email);
    // Locks also serialize first logins when no AccountAccess row exists yet.
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${email}, 0))::text`;
    await tx.$queryRaw`SELECT id FROM "AccountAccess" WHERE email = ${email} FOR UPDATE`;
    const access = await tx.accountAccess.findUnique({
      where: { email },
      include: { enrollment: true },
    });
    if (!access && isUniversityIdentity(email, user.googleHostedDomain)) {
      const created = await tx.accountAccess.create({
        data: { email, role: "student", status: "active", authUserId },
      });
      await tx.auditEvent.create({
        data: {
          actorAccountId: created.id,
          targetAccountId: created.id,
          action: "university_registration",
          changedFields: ["identity"],
        },
      });
      return created;
    }
    if (!access || access.status !== "active")
      throw new AccessError(
        403,
        "ACCOUNT_NOT_ALLOWED",
        "บัญชีนี้ยังไม่ได้รับอนุญาต",
      );
    if (access.authUserId && access.authUserId !== authUserId)
      throw new AccessError(
        403,
        "IDENTITY_CONFLICT",
        "บัญชีนี้ผูกกับตัวตนอื่นแล้ว",
      );
    if (!access.authUserId)
      return tx.accountAccess.update({
        where: { id: access.id },
        data: { authUserId, version: { increment: 1 } },
      });
    return access;
  });
}
