import { describe, expect, it } from "vitest";
import seed from "./data/cs2565.json";
import agreement from "./data/cs2565-academic-agreement.json";
import names from "./data/cs2565-course-names.json";
import type { Dataset } from "./types";
import type { TranscriptPayload } from "../transcript/types";
import { parseCourse, validateDataset } from "./validation";
import { auditTranscript } from "../analysis/engine";
import { makePlan, resolveOffering } from "../planning/engine";

const parameters = { currentTerm: { year: 2569, semester: 1 as const }, normalLoad: 12, summerLoad: 6, horizon: 2, targetGrade: "B", assumeUnknownOfferings: false };
function dataset(): Dataset {
  return { ...structuredClone(seed), id: "category-test", curriculumVersionId: "CS2565", version: 1, editVersion: 1, status: "draft" } as Dataset;
}
function transcript(grade?: string): TranscriptPayload {
  const field = { value: "Synthetic", state: "present" as const, sourcePage: 1 };
  return { header: { studentCode: field, studentName: field, faculty: field, department: field, degree: field, program: field, track: null, trackState: "not_selected" }, attempts: grade ? [{ ordinal: 0, courseCode: "517465", name: "Feature Engineering", credits: 3, grade, gradePoints: null, year: 2568, semester: 2, kind: "semester", sourcePage: 1 }] : [], summaries: [], pages: 1 };
}
describe("user-confirmed elective groups and Feature Engineering", () => {
  it("retains all PDF catalogue entries and adds exactly one separately sourced course", () => {
    const pdfCodes = new Set(names.courses.map(c => c.code));
    const extras = seed.courses.filter(c => c.category !== "unmapped" && !pdfCodes.has(c.code));
    expect(extras).toEqual([agreement.categoryAgreement.newCourse]);
    expect(seed.courses.filter(c => pdfCodes.has(c.code))).toHaveLength(180);
    expect(seed.courses.filter(c => c.category === "unmapped")).toHaveLength(8);
    expect(parseCourse(extras[0])).toEqual(extras[0]);
    expect(extras[0]).toMatchObject({ code: "517465", name: "วิศวกรรมคุณลักษณะ", credits: 3, grading: "numeric", category: "specific_elective", specific: true, prerequisite: { courses: [] } });
    expect(extras[0].source).toContain("คำยืนยันผู้ใช้");
    expect(extras[0].source).toContain("3(2-2-5)");
    expect(validateDataset(dataset())).toEqual([]);
  });
  it("keeps the 21 listed group-five courses eligible across both tracks, without group quotas", () => {
    const codes = agreement.categoryAgreement.group5Codes;
    expect(codes).toHaveLength(21);
    expect(codes).toContain("511109"); expect(codes).toContain("520464");
    for (const code of codes) {
      expect(seed.courses.find(c => c.code === code)).toMatchObject({ category: "specific_elective", credits: 3, specific: true, tracks: [] });
      expect(names.courses.some(c => c.code === code)).toBe(true);
    }
    expect(seed.groups.filter(g => g.category === "specific_elective").map(g => g.minimum).sort()).toEqual([15, 9]);
  });
  it.each(["project", "cooperative"] as const)("counts a numeric pass for 517465 once, including specific GPA, for %s", track => {
    const p = transcript("B"), before = structuredClone(p), result = auditTranscript(p, dataset(), track);
    expect(result.unmapped).not.toContain("517465");
    expect(result.courses.find(c => c.code === "517465")).toMatchObject({ status: "passed", earnedCredits: 3 });
    expect(result.groups.find(g => g.category === "specific_elective")?.earned).toBe(3);
    expect(result.groups.find(g => g.category === "free_elective")?.earned).toBe(0);
    expect(result.specificGpa).toMatchObject({ value: 3, credits: 3, confirmed: true });
    expect(p).toEqual(before);
  });
  it("does not award credits for F or fabricate an offering from catalogue membership", () => {
    const d = dataset();
    expect(auditTranscript(transcript("F"), d, "project").courses.find(c => c.code === "517465")).toMatchObject({ status: "failed", earnedCredits: 0 });
    expect(d.offerings.some(o => o.courseCode === "517465")).toBe(false);
    expect(resolveOffering(d, "517465", parameters.currentTerm).availability).toBe("unknown");
    d.offerings.push({ courseCode: "517465", year: 2568, semester: 1, availability: "open", confidence: "confirmed", source: "Synthetic previous announcement" });
    expect(resolveOffering(d, "517465", parameters.currentTerm).availability).toBe("unknown");
  });
  it("schedules only with a term offering and never carries its announcement to another term", () => {
    const d = dataset(); d.courses = d.courses.filter(c => c.code === "517465"); d.policy.normalMin = 0;
    d.groups = [{ category: "specific_elective", minimum: 3, track: "both", source: "Synthetic" }];
    expect(makePlan(transcript(), d, "project", parameters, "actual").terms.flatMap(t => t.courses)).toEqual([]);
    d.offerings.push({ courseCode: "517465", ...parameters.currentTerm, availability: "open", confidence: "confirmed", source: "Synthetic teacher Facebook announcement 2026-10-17, term 2569/1" });
    expect(makePlan(transcript(), d, "project", parameters, "actual").terms[0].courses.map(c => c.code)).toContain("517465");
    expect(resolveOffering(d, "517465", { year: 2569, semester: 2 }).availability).toBe("unknown");
    d.offerings[0].availability = "closed";
    expect(makePlan(transcript(), d, "project", parameters, "actual").terms.flatMap(t => t.courses)).toEqual([]);
  });
});
