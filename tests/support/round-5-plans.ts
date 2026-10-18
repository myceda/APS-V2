import seed from "../../src/modules/curriculum/data/cs2565.json";
import type { Course, Dataset, StudyTrack } from "../../src/modules/curriculum/types";
import type { TranscriptPayload } from "../../src/modules/transcript/types";
import type { PlanningParameters } from "../../src/modules/planning/engine";
import { publishedCriteria, transcript } from "./track-criteria";

export const planParameters: PlanningParameters = {
  currentTerm: { year: 2569, semester: 1 }, normalLoad: 12, summerLoad: 6,
  horizon: 4, targetGrade: "B", assumeUnknownOfferings: false,
};
export const tracks: StudyTrack[] = ["project", "cooperative"];
export function catalogue(codes?: string[]): Dataset {
  const data = { ...structuredClone(seed), id: "round-5-synthetic", curriculumVersionId: "CS2565", version: 1, editVersion: 1, status: "draft" } as Dataset;
  if (codes) {
    data.courses = data.courses.filter(c => codes.includes(c.code));
    data.groups = tracks.flatMap(track => {
      const applicable = data.courses.filter(c => !c.tracks.length || c.tracks.includes(track));
      return [...new Set(applicable.map(c => c.category))].map(category => ({ category, track, minimum: applicable.filter(c => c.category === category).reduce((n, c) => n + c.credits, 0), source: "Synthetic subset minimum, not full curriculum" }));
    });
    data.offerings = data.courses.flatMap(c => ([1, 2, 3] as const).map(semester => ({ courseCode: c.code, year: 0, semester, availability: "open" as const, confidence: "planned" as const, source: "ข้อมูลสังเคราะห์รอบ 5 ไม่ใช่ตารางมหาวิทยาลัย" })));
  }
  return data;
}
export function row(code: string, grade: string | null, ordinal = 0) {
  const course = seed.courses.find(c => c.code === code)!;
  return { courseCode: code, name: course.name, credits: grade === "W" ? 0 : course.credits, grade, ordinal, gradePoints: null, year: 2568, semester: 2, kind: "semester" as const, sourcePage: 1 };
}
export type PlanCase = {
  id: string; description: string; data: Dataset; payload: TranscriptPayload;
  parameters: PlanningParameters; track: StudyTrack;
  expected: { terms?: string[][]; blocked?: string[]; reason?: string; conditional?: string; fullCatalogue?: boolean };
};

// Expected placements are written from the four-course graph and credit sums,
// before calling the planner. Full-catalogue examples use independent invariants.
export function planCases(): PlanCase[] {
  const result: PlanCase[] = [];
  for (const track of tracks) {
    const add = (id: string, description: string, data: Dataset, payload: TranscriptPayload, expected: PlanCase["expected"], parameters = planParameters) => result.push({ id: `${id}-${track}`, description, data, payload, parameters: structuredClone(parameters), track, expected });
    const graph = () => catalogue(["517121", "517122", "517261", "520231"]);
    for (const grade of ["W", "F"]) add(`retake-${grade.toLowerCase()}`, `เรียน 517121 ใหม่จาก ${grade} ก่อนวิชาต่อ`, graph(), transcript([row("517121", grade)]), { terms: [["517121"], ["517122", "517261", "520231"]], blocked: [] });
    const closed = graph();
    closed.offerings.push({ courseCode: "517121", ...planParameters.currentTerm, availability: "closed", confidence: "confirmed", source: "Synthetic explicit closure overrides recurring open" });
    add("closed-first", "517121 ปิดภาคแรก ไม่ลบทั้งแผน และข้ามภาคไปจัดได้ตามข้อมูล", closed, transcript([row("517121", "W")]), { terms: [[], ["517121"], ["517122"], ["517261", "520231"]], blocked: [] });
    const unknown = graph();
    for (const o of unknown.offerings.filter(o => o.courseCode === "517121")) o.availability = "unknown";
    add("unknown-offering", "ไม่เปลี่ยน unknown เป็น open", unknown, transcript(), { terms: [[], [], [], []], blocked: ["517121", "517122", "517261", "520231"], reason: "ยังไม่ทราบการเปิดสอน" });
    add("unknown-assumed", "เลือกสมมติฐานเอง ต้องติดป้าย ไม่เปลี่ยนข้อมูลจริง", structuredClone(unknown), transcript(), { terms: [["517121"], ["517122", "517261", "520231"]], blocked: [], conditional: "สมมติว่าเปิดสอน" }, { ...planParameters, assumeUnknownOfferings: true });
    add("load-cap", "วิชา 4 หน่วยกิตเกินภาระสมมติ 3 ไม่จัดเกิน", graph(), transcript(), { terms: [[], [], [], []], blocked: ["517121", "517122", "517261", "520231"], reason: "เกินภาระเรียน" }, { ...planParameters, normalLoad: 3, summerLoad: 3 });
    add("pending-i", "I รอผล ไม่สร้างผลผ่านและไม่ให้สิทธิ์ตัวต่อ", graph(), transcript([row("517121", "I")]), { terms: [[], [], [], []], blocked: ["517122", "517261", "520231"], reason: "ต้องผ่าน" });
    const alternative = graph(); alternative.courses.push(structuredClone(seed.courses.find(c => c.code === "517111")!) as Course);
    add("or-unverified", "517111 ต้นทางยัง grading unknown จึงไม่อนุมานสิทธิ์จาก B", structuredClone(alternative), transcript([row("517111", "B")]), { terms: [["517121"], ["517122", "517261", "520231"]], blocked: [] });
    Object.assign(alternative.courses.find(c => c.code === "517111")!, { credits: 3, grading: "numeric", source: "Synthetic confirmed alternative ONLY; does not resolve real 517111" });
    add("or-confirmed-fixture", "OR เมื่อสมมติข้อมูล 517111 ครบ ให้สิทธิ์เฉพาะ 517122", alternative, transcript([{ ...row("517111", "B"), credits: 3 }]), { terms: [["517121", "517122"], ["517261", "520231"]], blocked: [] });
    const uncertain = catalogue(["517121", "517261"]);
    uncertain.courses.find(c => c.code === "517121")!.prerequisite.unresolved = "Synthetic: เงื่อนไขก่อนเรียนยังไม่ทราบ ต้องตรวจข้อมูล";
    add("unresolved-prerequisite", "เงื่อนไขไม่ทราบและไม่มีชุดวิชารองรับ ต้องไม่ผ่านเพราะรายการว่าง", uncertain, transcript(), { terms: [[], [], [], []], blocked: ["517121", "517261"], reason: "เงื่อนไขก่อนเรียนยังไม่ทราบ" });
    const split = catalogue(["517392", "517393", "517493", "517494", "517496", "517497"]);
    add("track-difference", "เฉพาะวิชาแต่ละสาย พร้อมข้อจำกัดความยินยอม", split, transcript(), { terms: track === "project" ? [["517493", "517392"], ["517494"]] : [["517393", "517392", "517497"], ["517496"]], blocked: [], conditional: "ต้องได้รับความยินยอม" });
    add("full-cs2565", "แผนทั้ง catalogue ใช้ OPEN และข้อมูลเปิดสอนต้นทางตามจริง", catalogue(), transcript([row("517101", "B"), row("511108", "B", 1), row("517121", "W", 2)]), { fullCatalogue: true }, { ...planParameters, horizon: 24 });
  }
  return result;
}

export function eligibilityCases() {
  const data = catalogue();
  const base = publishedCriteria();
  base.data.gpax = { state: "specified", evidence: "เกณฑ์สังเคราะห์ ไม่ใช่มหาวิทยาลัย", minimum: 2.5, throughYear: 2568, throughSemester: 2 };
  return [
    { id: "absent", criteria: [], expected: "awaiting_criteria" },
    { id: "wrong-cohort", criteria: [{ ...base, admissionYears: [2566] }], expected: "awaiting_criteria" },
    { id: "wrong-year", criteria: [{ ...base, year: 2570 }], expected: "awaiting_criteria" },
    { id: "wrong-semester", criteria: [{ ...base, semester: 2 }], expected: "awaiting_criteria" },
    { id: "wrong-curriculum", criteria: [{ ...base, curriculumVersionId: "OTHER" }], expected: "awaiting_criteria" },
    { id: "expired", criteria: [{ ...base, data: { ...base.data, effectiveUntil: "2026-10-17" } }], expected: "awaiting_criteria" },
    { id: "future", criteria: [{ ...base, data: { ...base.data, effectiveFrom: "2026-10-19" } }], expected: "awaiting_criteria" },
    { id: "draft", criteria: [{ ...base, status: "draft" as const }], expected: "awaiting_criteria" },
    { id: "withdrawn", criteria: [{ ...base, status: "withdrawn" as const }], expected: "awaiting_criteria" },
    { id: "valid-pass", criteria: [base], expected: "preliminary_pass" },
    { id: "valid-fail", criteria: [base], expected: "not_met", grade: "D" },
    { id: "pending", criteria: [base], expected: "insufficient_data", grade: "I" },
    { id: "manual", criteria: [{ ...base, data: { ...base.data, manual: { state: "specified" as const, evidence: "Synthetic", description: "ต้องสัมภาษณ์", responsibleUnit: "เจ้าหน้าที่สาธิต" } } }], expected: "manual_review" },
    { id: "no-cohort", criteria: [base], expected: "awaiting_criteria", admissionYear: null },
  ].map(c => ({ ...c, dataset: data, transcript: transcript([row("517101", "grade" in c ? c.grade! : "B")]), admissionYear: "admissionYear" in c ? c.admissionYear! : 2565 }));
}
