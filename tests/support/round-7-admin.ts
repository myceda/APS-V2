import type { Course, Dataset } from "@/modules/curriculum/types";
import { COURSE_COLUMNS, csvCell } from "@/modules/curriculum/csv";

export const syntheticSource = "ข้อมูลสาธิตผู้ดูแล รอบ 7 — ไม่ใช่หลักสูตรหรือเกณฑ์มหาวิทยาลัย";
export function adminCourse(code = "R7001"): Course {
  return { code, name: `ข้อมูลสาธิต ${code}`, credits: 3, category: "core_required", tracks: [], grading: "numeric", specific: true,
    prerequisite: { mode: "all", courses: [], concurrent: false, unresolved: null }, requiresConsent: false, source: syntheticSource };
}
export function adminData(base: Dataset): Dataset {
  return { ...base, source: syntheticSource, courses: [adminCourse(), adminCourse("R7002")],
    policy: { degreeCredits: 6, gpaMinimum: 2, retakeCeiling: null, repeat: "latest_numeric", rounding: "half_up_2", prerequisitePass: "latest_assessed", normalMax: 18, normalMin: 0, summerMax: 6, gpaComparison: "raw", specificGpaBasis: "all_specific", source: syntheticSource },
    groups: [{ category: "core_required", minimum: 6, track: "both", source: syntheticSource }],
    offerings: [{ courseCode: "R7001", year: 2568, semester: 1, availability: "closed", confidence: "confirmed", source: syntheticSource }], unresolved: [syntheticSource] };
}
export function importValues(code = "R7101", credits = "3"): string[] {
  return [code, `ข้อมูลสาธิตนำเข้า ${code}`, credits, "specific_elective", "", "numeric", "true", "all", "", "false", "false", syntheticSource];
}
export function importCsv(rows = [importValues()]): Buffer {
  return Buffer.from([COURSE_COLUMNS, ...rows].map(r => r.map(csvCell).join(",")).join("\r\n"));
}
