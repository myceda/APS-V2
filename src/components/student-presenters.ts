import type { studentWorkspace, AcademicResult } from "@/server/academic";

export type StudentWorkspaceData = Awaited<ReturnType<typeof studentWorkspace>>;
export type StudentAnalysis = AcademicResult;

export const COURSE_STATUS_NAMES = {
  passed: "ผ่านแล้ว", failed: "ยังไม่ผ่าน", pending: "รอผล", missing: "ยังต้องเรียน", unknown: "ข้อมูลไม่พอ",
} as const;

export const termName = (term: { year: number; semester: number } | null) => term
  ? `${term.year}/${term.semester}${term.semester === 3 ? " (ฤดูร้อน)" : ""}`
  : "ยังคาดไม่ได้";
