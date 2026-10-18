import type { EnrollmentContext } from "@/modules/accounts/types";
import {
  GRADES,
  type TranscriptIssue,
  type TranscriptPayload,
  type TranscriptHeader,
  type Attempt,
} from "./types";
import { choice, integer, record, text } from "@/modules/curriculum/validation";

export function transcriptIssues(
  payload: TranscriptPayload,
  enrollment: EnrollmentContext | null,
): TranscriptIssue[] {
  const issues: TranscriptIssue[] = [];
  for (const field of [
    "studentCode",
    "studentName",
    "faculty",
    "department",
    "degree",
    "program",
  ] as const)
    if (!payload.header[field].value)
      issues.push({
        code: "HEADER_MISSING",
        message: "ตรวจข้อมูลส่วนหัวกับต้นฉบับ",
        field,
        severity: "blocking",
        sourcePage: 1,
      });
  if (enrollment && payload.header.studentCode.value !== enrollment.studentCode)
    issues.push({
      code: "STUDENT_ID_MISMATCH",
      message:
        "รหัสนักศึกษาไม่ตรงกับข้อมูลเดิม กรุณาตรวจใบผลการเรียนหรือติดต่อผู้ดูแล",
      field: "studentCode",
      severity: "blocking",
      sourcePage: 1,
    });
  if (
    (!enrollment || enrollment.curriculumCode === "CS2565") &&
    payload.header.program.value &&
    !/วิทยาการคอมพิวเตอร์|^Computer Science$/i.test(
      payload.header.program.value,
    )
  )
    issues.push({
      code: "PROGRAM_MISMATCH",
      message: "สาขาที่ PDF รายงานไม่ตรงกับบริบทหลักสูตร ต้องตรวจต้นฉบับ",
      field: "program",
      severity: "blocking",
      sourcePage: 1,
    });
  if (payload.header.trackState === "unknown")
    issues.push({
      code: "TRACK_UNKNOWN",
      message: "ยังระบุสายจากส่วนหัวไม่ได้ กรุณาตรวจต้นฉบับ",
      field: "track",
      severity: "blocking",
      sourcePage: 1,
    });
  for (const row of payload.attempts) {
    if (
      row.credits == null ||
      row.gradePoints == null ||
      !row.name ||
      row.kind === "unknown" ||
      (row.kind === "semester" && (row.year == null || row.semester == null))
    )
      issues.push({
        code: "ROW_INCOMPLETE",
        message: `${row.courseCode}: ตรวจชื่อ หน่วยกิต คะแนน และภาคกับต้นฉบับ`,
        ordinal: row.ordinal,
        severity: "blocking",
        sourcePage: row.sourcePage,
      });
    if (row.grade == null || ["I", "R", "X"].includes(row.grade))
      issues.push({
        code: "GRADE_PENDING",
        message: `${row.courseCode}: คงเกรดรอผลตามต้นฉบับ ผลวิเคราะห์จะมีข้อจำกัด`,
        ordinal: row.ordinal,
        severity: "warning",
        sourcePage: row.sourcePage,
      });
    if (row.grade?.endsWith("*") || row.kind === "transfer")
      issues.push({
        code: "POLICY_UNRESOLVED",
        message: `${row.courseCode}: เก็บเกรดและการโอนตามต้นฉบับ ต้องยืนยันนโยบายก่อนสรุปผล`,
        ordinal: row.ordinal,
        severity: "warning",
        sourcePage: row.sourcePage,
      });
  }
  return issues;
}
export function parsePayload(
  value: unknown,
  original: TranscriptPayload,
): TranscriptPayload {
  const input = record(value),
    header = record(input.header);
  const fields = {} as Pick<
    TranscriptHeader,
    | "studentCode"
    | "studentName"
    | "faculty"
    | "department"
    | "degree"
    | "program"
  >;
  for (const key of [
    "studentCode",
    "studentName",
    "faculty",
    "department",
    "degree",
    "program",
  ] as const) {
    const f = record(header[key]);
    const value = f.value == null ? null : text(f.value, 300);
    const source = original.header[key];
    fields[key] = {
      ...source,
      value,
      // An unrelated edit cannot turn a failed read into an absent field.
      // Clearing a previously populated required field needs review as well.
      state: value ? "present" : source.value === value ? source.state : "unreadable",
    };
  }
  const trackState = choice(header.trackState, [
    "selected",
    "not_selected",
    "unknown",
  ]);
  const track =
    header.track == null
      ? null
      : choice(header.track, ["project", "cooperative"]);
  if ((trackState === "selected") !== (track != null))
    throw new Error("สถานะสายและสายที่เลือกไม่ตรงกัน");
  if (
    !Array.isArray(input.attempts) ||
    input.attempts.length !== original.attempts.length
  )
    throw new Error(
      "ต้องคงทุกรายการจากเอกสาร ห้ามลบหรือเพิ่มประวัติผ่านการแก้ร่าง",
    );
  const attempts: Attempt[] = input.attempts.map((value, index) => {
    const a = record(value),
      source = original.attempts[index];
    const code = text(a.courseCode, 20);
    if (!/^(\d{6}|SU\d{3})$/.test(code))
      throw new Error(`แถว ${index + 1}: รหัสวิชาไม่ถูกต้อง`);
    const grade =
      a.grade == null || a.grade === "" ? null : choice(a.grade, GRADES);
    if (
      a.gradePoints != null &&
      (typeof a.gradePoints !== "number" ||
        !Number.isFinite(a.gradePoints) ||
        a.gradePoints < 0 ||
        a.gradePoints > 120)
    )
      throw new Error("คะแนนเกรดไม่ถูกต้อง");
    return {
      ordinal: source.ordinal,
      courseCode: code,
      name: text(a.name, 300),
      credits: a.credits == null ? null : integer(a.credits, 0, 30),
      grade,
      gradePoints: a.gradePoints as number | null,
      year: a.year == null ? null : integer(a.year, 2500, 2700),
      semester: a.semester == null ? null : integer(a.semester, 1, 3),
      kind: choice(a.kind, ["semester", "transfer", "unknown"]),
      sourcePage: source.sourcePage,
    };
  });
  return {
    header: {
      ...fields,
      campus: original.header.campus,
      studentStatus: original.header.studentStatus,
      track,
      trackState,
    },
    attempts,
    summaries: original.summaries,
    pages: original.pages,
  };
}
