import { AccessError, invalidInput } from "./errors";
import { normalizeEmail } from "./guards";

export function parseLoginEmail(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (
    typeof value !== "string" ||
    value.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
  )
    invalidInput("กรุณาระบุอีเมล Google ให้ถูกต้อง");
  return normalizeEmail(value);
}

export function requireMatchingLoginEmail(
  expected: unknown,
  verifiedEmail: string,
) {
  const requested = parseLoginEmail(expected);
  if (requested && requested !== normalizeEmail(verifiedEmail))
    throw new AccessError(
      403,
      "GOOGLE_ACCOUNT_MISMATCH",
      "Google ยืนยันบัญชีอื่น กรุณาเลือกบัญชีให้ตรงกับอีเมลที่กรอก",
    );
}
