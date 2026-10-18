import { describe, expect, it } from "vitest";
import seed from "./data/cs2565.json";
import agreement from "./data/cs2565-academic-agreement.json";
import type { Course, Dataset, StudyTrack } from "./types";
import type { Attempt, TranscriptPayload } from "../transcript/types";
import { auditTranscript } from "../analysis/engine";
import { makePlan, prerequisiteSatisfied } from "../planning/engine";

function dataset(): Dataset {
  return { ...structuredClone(seed), id: "agreement-test", curriculumVersionId: "CS2565-test", version: 1, editVersion: 1, status: "draft" } as Dataset;
}
function attempt(courseCode: string, grade: string, credits = 3): Attempt {
  return { ordinal: 0, courseCode, grade, credits, name: "Synthetic course", gradePoints: null, year: 2568, semester: 2, kind: "semester", sourcePage: 1 };
}
function payload(attempts: Attempt[]): TranscriptPayload {
  const field = { value: "synthetic", state: "present" as const, sourcePage: 1 };
  return { header: { studentCode: field, studentName: field, faculty: field, department: field, degree: field, program: field, track: null, trackState: "not_selected" }, attempts, summaries: [], pages: 1 };
}
const params = { currentTerm: { year: 2569, semester: 1 as const }, normalLoad: 12, summerLoad: 6, horizon: 4, targetGrade: "B", assumeUnknownOfferings: false };
function algorithmDataset(): Dataset {
  const d = dataset();
  d.courses = d.courses.filter(c => ["511108", "517211", "517212", "517311"].includes(c.code));
  d.groups = [];
  d.policy.normalMin = 0;
  d.offerings = d.courses.map(c => ({ courseCode: c.code, year: 0, semester: 1, availability: "open", confidence: "planned", source: "Synthetic offering for test only" }));
  d.offerings.push(...d.offerings.map(o => ({ ...o, semester: 2 as const })));
  return d;
}
describe("CS2565 user-confirmed S/U and APS normal Algorithm plan", () => {
  for (const [code, track] of [["517392", "project"], ["517393", "cooperative"]] as const) {
    it.each(["S", "U"])(`${code} %s counts degree credits only on S and never adds GPA credits`, grade => {
      const d = dataset();
      const p = payload([attempt("517101", "B"), attempt(code, grade, 1)]);
      const original = structuredClone(p);
      const result = auditTranscript(p, d, track);
      const course = result.courses.find(c => c.code === code)!;
      expect(course.status).toBe(grade === "S" ? "passed" : "failed");
      expect(course.earnedCredits).toBe(grade === "S" ? 1 : 0);
      expect(result.groups.find(g => g.category === "track_required")?.earned).toBe(grade === "S" ? 1 : 0);
      expect(result.gpax.value).toBe(3);
      expect(result.gpax.credits).toBe(3);
      expect(p).toEqual(original);
      expect(d.courses.find(c => c.code === code)?.source).toContain(agreement.grading.sourceNote);
    });
    it(`${code} keeps S* unresolved and rejects numeric grades as a confirmed pass`, () => {
      for (const grade of ["S*", "B"])
        expect(auditTranscript(payload([attempt(code, grade, 1)]), dataset(), track).courses.find(c => c.code === code)?.status).toBe("unknown");
    });
  }
  it.each(["517211", "517212"])("Algorithm is not eligible with only %s passed, including same-term selection", code => {
    const course = dataset().courses.find(c => c.code === "517311")!;
    expect(prerequisiteSatisfied(course, new Set([code]), new Set(["517211", "517212"]))).toBe(false);
    const d = algorithmDataset();
    const plan = makePlan(payload([attempt("511108", "B"), attempt(code, "B")]), d, "project", { ...params, horizon: 1 }, "actual");
    expect(plan.terms.flatMap(t => t.courses).some(c => c.code === "517311")).toBe(false);
    expect(course.prerequisite.unresolved).toBe(agreement.algorithm.unresolvedNote);
  });
  it.each(["project", "cooperative"] as const)("plans preparation courses as S rather than numeric grades for %s", track => {
    const d = dataset();
    d.courses = d.courses.filter(c => ["517392", "517393"].includes(c.code));
    d.groups = [];
    d.policy.normalMin = 0;
    d.offerings = d.courses.map(c => ({ courseCode: c.code, year: 0, semester: 1, availability: "open", confidence: "planned", source: "Synthetic test offering" }));
    const planned = makePlan(payload([]), d, track, { ...params, horizon: 1 }, "actual").terms[0].courses;
    expect(planned.map(c => c.code).sort()).toEqual(track === "project" ? ["517392"] : ["517392", "517393"]);
    expect(planned.every(c => c.grade === "S")).toBe(true);
  });
  it("schedules the missing Discrete course before Algorithm, never concurrently", () => {
    const d = algorithmDataset();
    const plan = makePlan(payload([attempt("511108", "B"), attempt("517211", "B"), attempt("517212", "F")]), d, "project", params, "actual");
    expect(plan.terms[0].courses.map(c => c.code)).toContain("517212");
    expect(plan.terms[0].courses.map(c => c.code)).not.toContain("517311");
    expect(plan.terms[1].courses.map(c => c.code)).toContain("517311");
  });
  it("schedules Algorithm with both passed and respects offering and load restrictions", () => {
    const d = algorithmDataset();
    const p = payload([attempt("511108", "B"), attempt("517211", "B"), attempt("517212", "B")]);
    const course = d.courses.find(c => c.code === "517311") as Course;
    expect(prerequisiteSatisfied(course, new Set(["517211", "517212"]))).toBe(true);
    for (const track of ["project", "cooperative"] as StudyTrack[])
      expect(makePlan(p, d, track, params, "actual").terms[0].courses.map(c => c.code)).toContain("517311");
    for (const availability of ["closed", "unknown"] as const) {
      const restricted = structuredClone(d);
      restricted.offerings.push({ courseCode: "517311", ...params.currentTerm, availability, confidence: "confirmed", source: "Synthetic restriction" });
      expect(makePlan(p, restricted, "project", { ...params, horizon: 1 }, "actual").terms.flatMap(t => t.courses).some(c => c.code === "517311")).toBe(false);
    }
    expect(makePlan(p, d, "project", { ...params, horizon: 1, normalLoad: 2 }, "actual").terms.flatMap(t => t.courses).some(c => c.code === "517311")).toBe(false);
  });
});
