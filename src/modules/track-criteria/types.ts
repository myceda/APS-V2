import type { StudyTrack } from "@/modules/curriculum/types";
export const CONDITION_NAMES = { gpax: "GPAX", courses: "ผลรายวิชา", exceptions: "ข้อยกเว้น", manual: "เงื่อนไขตรวจโดยเจ้าหน้าที่" };
export type ConditionState = "unknown" | "specified" | "not_required";
export interface Condition {
  state: ConditionState;
  evidence: string;
}
export interface CriteriaData {
  effectiveFrom: string;
  effectiveUntil: string;
  targetCourseCodes: string[];
  gpax: Condition & { minimum: number | null; throughYear: number | null; throughSemester: number | null };
  courses: Condition & { codes: string[]; fulfillment: "passed" | "passed_or_in_progress" };
  exceptions: Condition & { allowedOutstanding: number | null; cannotBeOutstanding: string[]; approvalRequired: boolean | null; authority: string };
  manual: Condition & { description: string; responsibleUnit: string };
  source: { title: string; unit: string; date: string; url: string; locator: string; verification: string };
}
export interface CriteriaInput {
  curriculumVersionId: string;
  catalogueDatasetId: string | null;
  admissionYears: number[];
  track: StudyTrack;
  year: number;
  semester: number;
  data: CriteriaData;
}
export interface CriteriaView extends CriteriaInput {
  id: string; version: number; editVersion: number;
  status: "draft" | "published" | "withdrawn";
  basedOnId: string | null;
}
export interface EligibilityResult {
  track: StudyTrack;
  status: "awaiting_criteria" | "insufficient_data" | "not_met" | "preliminary_pass" | "manual_review";
  reasons: string[];
  criteriaId: string | null;
  criteriaVersion: number | null;
  approval: "not_verified";
}
export const ELIGIBILITY_NAMES: Record<EligibilityResult["status"], string> = {
  awaiting_criteria: "รอข้อมูลจากผู้ดูแล", insufficient_data: "ข้อมูลไม่พอสำหรับตรวจเกณฑ์",
  not_met: "ยังไม่ผ่านเกณฑ์เบื้องต้น", preliminary_pass: "ผ่านเกณฑ์เบื้องต้น", manual_review: "รอเจ้าหน้าที่ตรวจเงื่อนไขเพิ่มเติม",
};
export function emptyCriteriaData(): CriteriaData {
  return {
    effectiveFrom: "", effectiveUntil: "", targetCourseCodes: [],
    gpax: { state: "unknown", evidence: "", minimum: null, throughYear: null, throughSemester: null },
    courses: { state: "unknown", evidence: "", codes: [], fulfillment: "passed" },
    exceptions: { state: "unknown", evidence: "", allowedOutstanding: null, cannotBeOutstanding: [], approvalRequired: null, authority: "" },
    manual: { state: "unknown", evidence: "", description: "", responsibleUnit: "" },
    source: { title: "", unit: "", date: "", url: "", locator: "", verification: "" },
  };
}
