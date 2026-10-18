import { emptyCriteriaData, type CriteriaInput, type CriteriaView } from "@/modules/track-criteria/types";
import type { Attempt, TranscriptPayload } from "@/modules/transcript/types";
export function criteriaInput(versionId = "CS2565", datasetId = "fixture"): CriteriaInput {
  const data = emptyCriteriaData();
  Object.assign(data, { effectiveFrom: "2020-01-01", effectiveUntil: "2099-12-31", targetCourseCodes: ["517392"] });
  for (const key of ["gpax", "courses", "exceptions", "manual"] as const) Object.assign(data[key], { state: "not_required", evidence: "Synthetic clause, NOT a university rule" });
  data.source = { title: "Synthetic fixture only", unit: "APS Tests", date: "2026-10-17", url: "", locator: "Synthetic clause", verification: "Automated fixture, not an official announcement" };
  return { curriculumVersionId: versionId, catalogueDatasetId: datasetId, admissionYears: [2565], track: "project", year: 2569, semester: 1, data };
}
export function publishedCriteria(): CriteriaView { return { ...criteriaInput(), id: "fixture-criteria", version: 1, editVersion: 1, status: "published", basedOnId: null }; }
export function attempt(grade: string | null, ordinal = 0, code = "517101"): Attempt { return { ordinal, courseCode: code, grade, credits: 3, gradePoints: null, name: "Synthetic", year: 2568, semester: 2, kind: "semester", sourcePage: 1 }; }
export function transcript(attempts: Attempt[] = []): TranscriptPayload {
  const f = { value: "Synthetic", state: "present" as const, sourcePage: 1 };
  return { header: { studentCode: f, studentName: f, faculty: f, department: f, degree: f, program: f, track: null, trackState: "not_selected" }, pages: 1, attempts, summaries: [] };
}
