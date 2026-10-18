import { invalidInput } from "./errors";
import { normalizeEmail } from "./guards";
import type { AccountInput } from "./types";

export const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const keys = new Set([
  "email",
  "role",
  "status",
  "curriculumIds",
  "studentCode",
  "curriculumVersionId",
  "trackState",
  "trackId",
  "expectedVersion",
]);

export function parseAccountInput(
  value: unknown,
  updating = false,
): AccountInput {
  if (!value || typeof value !== "object" || Array.isArray(value))
    invalidInput();
  const data = value as Record<string, unknown>;
  if (Object.keys(data).some((key) => !keys.has(key)))
    invalidInput("คำขอมีฟิลด์ที่ระบบไม่รองรับ");
  if (
    typeof data.email !== "string" ||
    data.email.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email.trim())
  )
    invalidInput("กรุณาตรวจอีเมล", { email: "รูปแบบอีเมลไม่ถูกต้อง" });
  if (data.role !== "student" && data.role !== "admin")
    invalidInput("กรุณาเลือกบทบาท");
  if (data.status !== "active" && data.status !== "inactive")
    invalidInput("กรุณาเลือกสถานะบัญชี");
  if (
    !Array.isArray(data.curriculumIds) ||
    data.curriculumIds.length > 25 ||
    data.curriculumIds.some(
      (id) => typeof id !== "string" || !uuidPattern.test(id),
    )
  )
    invalidInput("ข้อมูลสิทธิ์หลักสูตรไม่ถูกต้อง");
  const curriculumIds = data.curriculumIds as string[];
  if (new Set(curriculumIds).size !== curriculumIds.length)
    invalidInput("สิทธิ์หลักสูตรซ้ำ");
  if (
    updating &&
    (!Number.isInteger(data.expectedVersion) ||
      (data.expectedVersion as number) < 1)
  )
    invalidInput("ไม่มีฉบับข้อมูลสำหรับแก้ไข");
  if (!updating && data.expectedVersion !== undefined)
    invalidInput("คำขอเพิ่มบัญชีมีฉบับข้อมูลที่ไม่รองรับ");
  const input: AccountInput = {
    email: normalizeEmail(data.email),
    role: data.role,
    status: data.status,
    curriculumIds,
    studentCode: null,
    curriculumVersionId: null,
    trackState: "unknown",
    trackId: null,
  };
  if (updating) input.expectedVersion = data.expectedVersion as number;
  if (data.role === "admin") {
    if (!curriculumIds.length)
      invalidInput("กรุณามอบหมายหลักสูตรอย่างน้อยหนึ่งหลักสูตร");
    if (
      data.studentCode ||
      data.curriculumVersionId ||
      data.trackId ||
      (data.trackState && data.trackState !== "unknown")
    )
      invalidInput("บทบาทผู้ดูแลไม่รับบริบทนักศึกษาในคำขอนี้");
    return input;
  }
  if (curriculumIds.length) invalidInput("นักศึกษาไม่รับสิทธิ์ผู้ดูแลหลักสูตร");
  if (data.studentCode == null && data.curriculumVersionId == null) {
    if (
      data.trackId != null ||
      (data.trackState != null && data.trackState !== "unknown")
    )
      invalidInput("บัญชีที่ยังไม่มีบริบทต้องมีสถานะสายยังไม่ทราบ");
    return input;
  }
  if (
    typeof data.studentCode !== "string" ||
    !data.studentCode.trim() ||
    data.studentCode.trim().length > 32
  )
    invalidInput("กรุณาระบุรหัสนักศึกษาที่ตรวจแล้ว", {
      studentCode: "จำเป็นต้องมีรหัสนักศึกษา",
    });
  if (
    typeof data.curriculumVersionId !== "string" ||
    !uuidPattern.test(data.curriculumVersionId)
  )
    invalidInput("กรุณาเลือกฉบับหลักสูตร");
  if (
    !["selected", "not_selected", "unknown"].includes(String(data.trackState))
  )
    invalidInput("กรุณาเลือกสถานะสายการศึกษา");
  if (data.trackState === "selected") {
    if (typeof data.trackId !== "string" || !uuidPattern.test(data.trackId))
      invalidInput("กรุณาเลือกสายที่ยืนยันแล้ว");
    input.trackId = data.trackId;
  } else if (data.trackId != null && data.trackId !== "")
    invalidInput("ยังไม่เลือกหรือยังไม่ทราบสายต้องไม่มีรหัสสาย");
  input.studentCode = data.studentCode.trim();
  input.curriculumVersionId = data.curriculumVersionId;
  input.trackState = data.trackState as AccountInput["trackState"];
  return input;
}
