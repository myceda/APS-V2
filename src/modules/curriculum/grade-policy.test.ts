import { describe, expect, it } from "vitest";
import seed from "./data/cs2565.json";
import type { Course, Dataset } from "./types";
import type { Attempt, TranscriptPayload } from "../transcript/types";
import { auditTranscript, passedForPrerequisites } from "../analysis/engine";
import { makePlan } from "../planning/engine";
import { simulate } from "../simulation/engine";
import { parsePolicy, validateDataset } from "./validation";

function dataset(): Dataset {
  return { ...structuredClone(seed), id: "grade-test", curriculumVersionId: "CS2565", version: 1, editVersion: 1, status: "draft" } as Dataset;
}
function row(courseCode: string, grade: string, ordinal = 0, credits = 3): Attempt {
  return { ordinal, courseCode, grade, credits, name: "Synthetic", gradePoints: null, year: 2568, semester: 2, kind: "semester", sourcePage: 1 };
}
function payload(attempts: Attempt[]): TranscriptPayload {
  const field = { value: "Synthetic", state: "present" as const, sourcePage: 1 };
  return { header: { studentCode: field, studentName: field, faculty: field, department: field, degree: field, program: field, track: null, trackState: "not_selected" }, attempts, summaries: [], pages: 1 };
}
const parameters = { currentTerm: { year: 2569, semester: 1 as const }, normalLoad: 12, summerLoad: 6, horizon: 1, targetGrade: "B", assumeUnknownOfferings: false };

describe("APS user agreement for grades and GPA", () => {
  it.each(["project", "cooperative"] as const)("recognizes only foundation stars and preserves raw attempts for %s", track => {
    const d = dataset(), p = payload([row("511100", "U*"), row("511100", "S*", 1), row("517101", "B", 2)]);
    const before = structuredClone(p), result = auditTranscript(p, d, track);
    expect(result.courses.find(c => c.code === "511100")).toMatchObject({ status: "passed", latestGrade: "S*", earnedCredits: 0 });
    expect(result.gpax).toMatchObject({ credits: 3, value: 3, confirmed: true });
    expect(result.earnedCredits).toBe(3);
    expect(passedForPrerequisites(p.attempts, d).has("511100")).toBe(true);
    expect(auditTranscript(payload([row("511100", "U*")]), d, track).courses.find(c => c.code === "511100")?.status).toBe("failed");
    expect(auditTranscript(payload([row("517392", "S*", 0, 1)]), d, track).gpax.confirmed).toBe(false);
    expect(p).toEqual(before);
  });
  it("keeps unapproved, mismatched and transfer star grades unresolved", () => {
    const d = dataset();
    for (const attempt of [row("517101", "S*"), row("511100", "S*", 0, 2), { ...row("511100", "S*"), kind: "transfer" as const }]) {
      const result = auditTranscript(payload([attempt]), d, "project");
      expect(result.courses.find(c => c.code === attempt.courseCode)?.status).toBe("unknown");
      expect(result.gpax.confirmed).toBe(false);
    }
    delete d.policy.starGradeCourses;
    expect(auditTranscript(payload([row("511100", "S*")]), d, "project").gpax.confirmed).toBe(false);
  });
  it.each([["F", "B", 3], ["B", "D", 1]] as const)("uses latest numeric %s -> %s and ignores later W/I for GPA", (first, last, expected) => {
    const p = payload([row("517101", first), row("517101", last, 1), row("517101", "W", 2), row("517101", "I", 3)]);
    const before = structuredClone(p), result = auditTranscript(p, dataset(), "project");
    expect(result.gpax).toMatchObject({ value: expected, credits: 3, confirmed: true });
    expect(result.courses.find(c => c.code === "517101")?.reasons.join(" ")).toContain("ยังไม่สิ้นสุด");
    expect(p).toEqual(before);
  });
  it.each([["D", "F", false], ["F", "D", true]] as const)("uses latest assessment %s -> %s for successor in baseline and What-if", (first, last, allowed) => {
    const d = dataset();
    const base = d.courses.find(c => c.code === "517101")!;
    d.courses = [base, { ...structuredClone(base), code: "TEST02", prerequisite: { mode: "all", courses: [base.code], concurrent: false, unresolved: null } }];
    d.groups = []; d.unresolved = []; d.policy.normalMin = 0;
    d.offerings = d.courses.map(c => ({ courseCode: c.code, ...parameters.currentTerm, availability: "open", confidence: "planned", source: "Synthetic test" }));
    const p = payload([row("517101", first), row("517101", last, 1)]), before = structuredClone(p);
    expect(passedForPrerequisites(p.attempts, d).has("517101")).toBe(allowed);
    const plan = makePlan(p, d, "project", parameters, "actual");
    expect(plan.terms.flatMap(t => t.courses).some(c => c.code === "TEST02")).toBe(allowed);
    const scenario = simulate(p, d, "project", parameters, [{ action: "add", courseCode: "517101", term: parameters.currentTerm, grade: "B" }], []);
    expect(scenario.baseline).toEqual(plan);
    expect(scenario.changed.terms.flatMap(t => t.courses).some(c => c.code === "TEST02")).toBe(allowed);
    expect(p).toEqual(before);
  });
  it.each([["D", "D+", 1, 1.495, 1.5, "critical"], ["D+", "C", 41, 1.795, 1.8, "high"], ["D+", "C", 1, 1.995, 2, "watch"]] as const)("compares raw GPA at the %s/%s boundary", (lower, upper, lowerCount, raw, displayed, risk) => {
    const d = dataset(), template = d.courses.find(c => c.code === "517101")!;
    d.courses = Array.from({ length: 100 }, (_, i): Course => ({ ...template, code: `TEST${i}`, credits: 1 }));
    d.groups = []; d.policy.degreeCredits = 100; d.unresolved = [];
    const result = auditTranscript(payload(d.courses.map((c, i) => row(c.code, i < lowerCount ? lower : upper, i, 1))), d, "project");
    expect(result.gpax.raw).toBe(raw); expect(result.gpax.value).toBe(displayed);
    expect(result.risk.level).toBe(risk);
    expect(result.graduation).toBe("requirements_not_met");
  });
  it("includes all specific courses beyond the group minimum and keeps legacy policies limited", () => {
    const d = dataset();
    const base = d.courses.find(c => c.code === "517101")!;
    d.courses = [base, { ...structuredClone(base), code: "TEST02", prerequisite: { mode: "all", courses: [base.code], concurrent: false, unresolved: null } }];
    d.groups = [{ category: base.category, track: "both", minimum: 3, source: "Synthetic" }];
    const p = payload([row("517101", "A"), row("TEST02", "F", 1)]);
    expect(auditTranscript(p, d, "project").specificGpa).toMatchObject({ value: 2, credits: 6, confirmed: true });
    delete d.policy.gpaComparison; delete d.policy.specificGpaBasis;
    const result = auditTranscript(p, d, "project");
    expect(result.gpax.confirmed).toBe(false); expect(result.specificGpa.confirmed).toBe(false);
  });
  it("round-trips optional policy fields and validates invalid aliases", () => {
    const d = dataset();
    expect(parsePolicy(d.policy)).toEqual(d.policy);
    expect(validateDataset(d)).toEqual([]);
    expect(() => parsePolicy({ ...d.policy, gpaComparison: "rounded" })).toThrow();
    expect(() => parsePolicy({ ...d.policy, starGradeCourses: ["511100", "511100"] })).toThrow();
    d.policy.starGradeCourses = ["517101"];
    expect(validateDataset(d).join(" ")).toContain("S/U");
  });
});
