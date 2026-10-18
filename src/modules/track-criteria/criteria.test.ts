import { describe, it, expect } from "vitest";
import seed from "@/modules/curriculum/data/cs2565.json";
import type { Dataset } from "@/modules/curriculum/types";
import { evaluateEligibility } from "./evaluate";
import { completeness, parseCriteria } from "./validation";
import { emptyCriteriaData, type CriteriaView } from "./types";
import { publishedCriteria, transcript, attempt, criteriaInput } from "../../../tests/support/track-criteria";
const dataset = { ...seed, id: "fixture", curriculumVersionId: "CS2565", version: 1, editVersion: 1, status: "published" } as Dataset;
const evaluate = (c: CriteriaView[], p = transcript([attempt("B")]), admissionYear: number | null = 2565) => evaluateEligibility({ track: "project", curriculumVersionId: "CS2565", admissionYear, term: { year: 2569, semester: 1 }, criteria: c, dataset, transcript: p, today: "2026-10-17" });
describe("versioned departmental track criteria", () => {
  it("keeps absent rules unknown, permits draft, and never defaults a GPA", () => {
    const v = { ...criteriaInput(), data: emptyCriteriaData() };
    expect(parseCriteria(v).data.gpax.minimum).toBeNull();
    expect(completeness(v)).toContain("GPAX: ยังไม่ทราบ");
  });
  it.each(["draft", "withdrawn"] as const)("does not use %s criteria", status => expect(evaluate([{ ...publishedCriteria(), status }]).status).toBe("awaiting_criteria"));
  it("does not substitute another cohort, semester, curriculum, track or expired/future rules", () => {
    const c = publishedCriteria();
    for (const patch of [{ admissionYears: [2564] }, { year: 2568 }, { semester: 2 }, { curriculumVersionId: "OTHER" }, { track: "cooperative" as const }, { data: { ...c.data, effectiveUntil: "2026-01-01" } }, { data: { ...c.data, effectiveFrom: "2027-01-01" } }]) expect(evaluate([{ ...c, ...patch }]).status).toBe("awaiting_criteria");
    expect(evaluate([c], undefined, null).status).toBe("awaiting_criteria");
  });
  it("does not create approval or mutate transcript when preliminarily passing", () => {
    const p = transcript([attempt("B")]), before = structuredClone(p);
    expect(evaluate([publishedCriteria()], p)).toMatchObject({ status: "preliminary_pass", approval: "not_verified" });
    expect(p).toEqual(before);
  });
  it("rejects ambiguous overlapping published criteria", () => expect(evaluate([publishedCriteria(), publishedCriteria()]).status).toBe("insufficient_data"));
  it("compares unrounded GPAX and excludes results after the announced cutoff", () => {
    const c = publishedCriteria(); c.data.gpax = { state: "specified", evidence: "Synthetic", minimum: 3.01, throughYear: 2568, throughSemester: 2 };
    const p = transcript([attempt("B"), { ...attempt("A", 1), year: 2569, semester: 1 }]);
    expect(evaluate([c], p).status).toBe("not_met");
    c.data.gpax.minimum = 3; expect(evaluate([c], p).status).toBe("preliminary_pass");
  });
  it("does not treat rounded 1.995 as meeting 2.00", () => {
    const c = publishedCriteria(); c.data.gpax = { state: "specified", evidence: "Synthetic", minimum: 2, throughYear: 2568, throughSemester: 2 };
    const p = transcript([ { ...attempt("C"), credits: 199 }, { ...attempt("D", 1, "511108"), credits: 1 } ]);
    expect(evaluate([c], p).status).toBe("not_met");
  });
  it("pending or undated results cannot silently pass GPA", () => {
    const c = publishedCriteria(); c.data.gpax = { state: "specified", evidence: "Synthetic", minimum: 2, throughYear: 2568, throughSemester: 2 };
    expect(evaluate([c], transcript([attempt("I")])).status).toBe("insufficient_data");
    expect(evaluate([c], transcript([{ ...attempt("B"), year: null }])).status).toBe("insufficient_data");
  });
  it("uses actual latest assessed course outcomes and differentiates in-progress", () => {
    const c = publishedCriteria(); c.data.courses = { state: "specified", evidence: "Synthetic", codes: ["517101"], fulfillment: "passed" };
    expect(evaluate([c], transcript([attempt("D"), attempt("F", 1)])).status).toBe("not_met");
    expect(evaluate([c], transcript([attempt("F"), attempt("D", 1)])).status).toBe("preliminary_pass");
    expect(evaluate([c], transcript([attempt(null)])).status).toBe("insufficient_data");
    c.data.courses.fulfillment = "passed_or_in_progress";
    expect(evaluate([c], transcript([attempt(null)])).status).toBe("preliminary_pass");
    expect(evaluate([c], transcript([attempt("I")])).status).toBe("insufficient_data");
  });
  it("requires manual approval for an allowed exception and never waives GPA", () => {
    const c = publishedCriteria(); c.data.courses = { state: "specified", evidence: "Synthetic", codes: ["517101"], fulfillment: "passed" };
    c.data.exceptions = { state: "specified", evidence: "Synthetic", allowedOutstanding: 1, cannotBeOutstanding: [], approvalRequired: true, authority: "Synthetic Department" };
    expect(evaluate([c], transcript([attempt("F")])).status).toBe("manual_review");
    c.data.exceptions.cannotBeOutstanding = ["517101"];
    expect(evaluate([c], transcript([attempt("F")])).status).toBe("not_met");
    c.data.exceptions.cannotBeOutstanding = [];
    c.data.gpax = { state: "specified", evidence: "Synthetic", minimum: 2, throughYear: 2568, throughSemester: 2 };
    expect(evaluate([c], transcript([attempt("F")])).status).toBe("not_met");
  });
  it("manual conditions do not become automatically satisfied", () => {
    const c = publishedCriteria(); c.data.manual = { state: "specified", evidence: "Synthetic", description: "Interview", responsibleUnit: "Department" };
    expect(evaluate([c]).status).toBe("manual_review");
  });
  it("validates dates, URLs, evidence and incompatible exceptions", () => {
    const v = criteriaInput(); v.data.source.url = "javascript:alert(1)"; expect(() => parseCriteria(v)).toThrow();
    v.data.source.url = ""; v.data.source.date = "2026-02-30"; expect(() => parseCriteria(v)).toThrow();
    v.data.source.date = "2026-10-17"; v.data.gpax.evidence = ""; expect(completeness(v)).toContain("GPAX: ระบุข้อความอ้างอิง/ข้อในเอกสาร");
    v.data.exceptions.state = "specified"; expect(() => parseCriteria(v)).toThrow();
  });
});
