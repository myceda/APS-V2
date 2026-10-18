import seed from "../../src/modules/curriculum/data/cs2565.json";
import { parsePayload } from "../../src/modules/transcript/validation";
import { emptyCriteriaData, type CriteriaInput } from "../../src/modules/track-criteria/types";
import { validateDataset } from "../../src/modules/curriculum/validation";
import type { Dataset } from "../../src/modules/curriculum/types";
import type { TranscriptPayload, HeaderField } from "../../src/modules/transcript/types";
import type { DemoCase } from "../../src/modules/demo/config";

export const DEMO_SOURCE = "ข้อมูลสาธิต APS รอบ 2; ไม่ใช่ประกาศมหาวิทยาลัย";
export const DEMO_PARAMETERS = { currentTerm: { year: 2569, semester: 1 as const }, normalLoad: 12, summerLoad: 6, horizon: 24, targetGrade: "B", assumeUnknownOfferings: false };
export const CASE_NAMES: Record<DemoCase, string> = {
  "not-selected": "ยังไม่เลือกสาย / ผ่านเบื้องต้น", project: "โครงงาน / ไม่ผ่านเกณฑ์สมมติ", cooperative: "สหกิจ / รอเจ้าหน้าที่", "unknown-track": "สายไม่ชัดเจน / ตรวจร่าง", "insufficient-data": "ผลเรียนยังไม่พอ", "awaiting-criteria": "ยังไม่มีเกณฑ์ตรงรุ่น", admin: "ผู้ดูแลชุดสาธิต",
};
export function demoCatalogue(versionId: string): Dataset {
  const d = structuredClone(seed) as unknown as Dataset;
  Object.assign(d, { id: "demo-pending", curriculumVersionId: versionId, version: 1, editVersion: 1, status: "published", source: `${DEMO_SOURCE}; สำเนา CS2565; ${seed.source}` });
  d.offerings = [
    { courseCode: "517121", year: 2569, semester: 1, availability: "open" },
    { courseCode: "517122", year: 0, semester: 1, availability: "open" },
    { courseCode: "517122", year: 2569, semester: 1, availability: "closed" },
    { courseCode: "517261", year: 0, semester: 1, availability: "open" },
    { courseCode: "517261", year: 2569, semester: 1, availability: "unknown" },
    { courseCode: "517122", year: 2569, semester: 2, availability: "open" },
    { courseCode: "517211", year: 2569, semester: 3, availability: "open" },
  ].map(row => ({ ...row, semester: row.semester as 1 | 2 | 3, availability: row.availability as "open" | "closed" | "unknown", confidence: "planned", source: `${DEMO_SOURCE}; ปี/ภาคสมมติ ${row.year}/${row.semester}` }));
  const issues = validateDataset(d);
  if (issues.length) throw new Error(`ชุดสาธิตไม่ผ่าน validation: ${issues.join("; ")}`);
  return d;
}

export function demoTranscript(key: Exclude<DemoCase, "admin">, studentCode: string): TranscriptPayload {
  const field = (value: string): HeaderField => ({ value, state: "present", sourcePage: 1 });
  const track = key === "project" || key === "cooperative" ? key : null;
  const codes = ["517101", "511108", "517121"];
  const payload: TranscriptPayload = {
    header: {
      studentCode: field(studentCode), studentName: field(`ข้อมูลสาธิต ${CASE_NAMES[key]}`), faculty: field("วิทยาศาสตร์ — ข้อมูลสาธิต"), department: field("คอมพิวเตอร์ — ข้อมูลสาธิต"), degree: field("ปริญญาตรี — ข้อมูลสาธิต"),
      program: field(`วิทยาการคอมพิวเตอร์${key === "unknown-track" ? " โครงงานวิจัย / สหกิจศึกษา (กำกวม)" : track === "project" ? " โครงงานวิจัย" : track === "cooperative" ? " สหกิจศึกษา" : ""} — ข้อมูลสาธิต`),
      track, trackState: key === "unknown-track" ? "unknown" : track ? "selected" : "not_selected",
    },
    attempts: codes.map((code, ordinal) => {
      const course = seed.courses.find(c => c.code === code)!;
      const grade = key === "project" ? "D" : key === "insufficient-data" && ordinal === 0 ? "I" : "B";
      return { ordinal, courseCode: code, name: course.name, credits: course.credits, grade, gradePoints: grade === "B" ? course.credits * 3 : grade === "D" ? course.credits : 0, year: 2568, semester: 2, kind: "semester", sourcePage: 1 };
    }), summaries: [], pages: 1,
  };
  return parsePayload(payload, payload);
}

export function demoCriteria(versionId: string, datasetId: string, track: "project" | "cooperative"): CriteriaInput {
  const data = emptyCriteriaData();
  Object.assign(data, { effectiveFrom: "2026-01-01", effectiveUntil: "2099-12-31", targetCourseCodes: [track === "project" ? "517392" : "517393"] });
  for (const name of ["gpax", "courses", "exceptions", "manual"] as const) Object.assign(data[name], { state: "not_required", evidence: `${DEMO_SOURCE}; หัวข้อนี้สมมติว่าไม่กำหนด` });
  Object.assign(data.gpax, { state: "specified", minimum: 2.5, throughYear: 2568, throughSemester: 2, evidence: `${DEMO_SOURCE}; ใช้ GPAX ก่อนปัด 2.50 เพื่อแสดงผลตัวอย่างเท่านั้น` });
  if (track === "cooperative") Object.assign(data.manual, { state: "specified", description: "ตรวจเอกสารประกอบการสมัครสหกิจ (สมมติ)", responsibleUnit: "เจ้าหน้าที่สาธิต APS", evidence: DEMO_SOURCE });
  data.source = { title: DEMO_SOURCE, unit: "APS Demo", date: "2026-10-18", url: "", locator: "เกณฑ์สมมติสำหรับซ้อมเท่านั้น", verification: "ไม่ได้รับรองโดยมหาวิทยาลัย" };
  return { curriculumVersionId: versionId, catalogueDatasetId: datasetId, admissionYears: [2565], track, year: 2569, semester: 1, data };
}
