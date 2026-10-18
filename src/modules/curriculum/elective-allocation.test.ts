import { describe, expect, it } from "vitest";
import seed from "./data/cs2565.json";
import type { Dataset, StudyTrack } from "./types";
import type { Attempt, TranscriptPayload } from "../transcript/types";
import { auditTranscript } from "../analysis/engine";
import { makePlan } from "../planning/engine";
import { simulate } from "../simulation/engine";
import { parsePolicy } from "./validation";

function dataset(count = 7): Dataset {
  const template = seed.courses.find(c => c.code === "517465")!;
  return { ...structuredClone(seed), id: "allocation-test", curriculumVersionId: "CS2565", version: 1, editVersion: 1, status: "draft",
    courses: Array.from({ length: count }, (_, i) => ({ ...structuredClone(template), code: `99100${i + 1}`, source: "Synthetic test course" })),
    groups: [{ category: "specific_elective", minimum: 15, track: "project", source: "Synthetic" }, { category: "specific_elective", minimum: 9, track: "cooperative", source: "Synthetic" }, { category: "free_elective", minimum: 6, track: "both", source: "Synthetic" }], unresolved: [],
  } as Dataset;
}
function row(code: string, index = 0): Attempt {
  return { ordinal: index, courseCode: code, name: "Synthetic", credits: 3, grade: "B", gradePoints: null, year: code === "991007" ? 2566 : 2567, semester: 1, kind: "semester", sourcePage: 1 };
}
function payload(attempts: Attempt[]): TranscriptPayload {
  const field = { value: "Synthetic", state: "present" as const, sourcePage: 1 };
  return { header: { studentCode: field, studentName: field, faculty: field, department: field, degree: field, program: field, track: null, trackState: "not_selected" }, attempts, summaries: [], pages: 1 };
}
const parameters = { currentTerm: { year: 2569, semester: 1 as const }, normalLoad: 12, summerLoad: 6, horizon: 1, targetGrade: "B", assumeUnknownOfferings: false };

describe("whole-course elective allocation", () => {
  it.each([["project", 7, 15, 6], ["cooperative", 5, 9, 6]] as const)("allocates %s credits once and keeps every specific course in GPA", (track, count, specific, free) => {
    const d = dataset(count), p = payload(d.courses.map((c,i) => row(c.code,i))), before = structuredClone({ d,p });
    const result = auditTranscript(p,d,track);
    expect(result.groups.find(g => g.category === "specific_elective")?.earned).toBe(specific);
    expect(result.groups.find(g => g.category === "free_elective")?.earned).toBe(free);
    expect(result.earnedCredits).toBe(count * 3);
    expect(result.courses.reduce((sum,c) => sum + c.earnedCredits,0)).toBe(count * 3);
    expect(result.specificGpa).toMatchObject({ value: 3, credits: count * 3, confirmed: true });
    expect(result.courses.filter(c => c.category === "free_elective").every(c => c.reasons.join(" ").includes("ไม่นับซ้ำ"))).toBe(true);
    expect({ d,p }).toEqual(before);
  });
  it("orders by earliest passing term then code, independently of array order or grade quality", () => {
    const d = dataset(), rows = d.courses.map((c,i) => row(c.code,i)); rows[0].grade = "D";
    const p = payload(rows), result = auditTranscript(p,d,"project");
    const selected = result.courses.filter(c => c.category === "specific_elective").map(c => c.code).sort();
    expect(selected).toEqual(["991001","991002","991003","991004","991007"]);
    d.courses.reverse(); d.groups.reverse(); p.attempts.reverse();
    expect(auditTranscript(p,d,"project").courses.filter(c => c.category === "specific_elective").map(c => c.code).sort()).toEqual(selected);
  });
  it("never splits a course when the minimum is not a multiple of its credits", () => {
    const d = dataset(3); d.groups = [{ category: "specific_elective", minimum: 4, track: "both", source: "Synthetic" }, { category: "free_elective", minimum: 3, track: "both", source: "Synthetic" }];
    const result = auditTranscript(payload(d.courses.map((c,i) => row(c.code,i))),d,"project");
    expect(result.groups.map(g => g.earned)).toEqual([6,3]);
    expect(result.courses.every(c => c.earnedCredits === 3)).toBe(true);
  });
  it("keeps legacy policy and missing passing-term data limited instead of guessing an allocation", () => {
    const d = dataset(), p = payload(d.courses.map((c,i) => row(c.code,i)));
    delete d.policy.electiveAllocation;
    expect(auditTranscript(p,d,"project").groups.find(g => g.category === "free_elective")?.earned).toBe(0);
    d.policy.electiveAllocation = "specific_then_free_earliest_pass"; p.attempts[0].year = null;
    const result = auditTranscript(p,d,"project");
    expect(result.groups.find(g => g.category === "free_elective")?.earned).toBe(0);
    expect(result.warnings.join(" ")).toContain("ต้องยืนยันภาคที่ผ่าน");
    expect(() => parsePolicy({ ...d.policy, electiveAllocation: "split_credits" })).toThrow();
  });
  it("never allocates F or unresolved grades as earned elective credits", () => {
    const d = dataset(3); d.groups = [{ category: "specific_elective", minimum: 3, track: "both", source: "Synthetic" }, { category: "free_elective", minimum: 3, track: "both", source: "Synthetic" }];
    const rows = d.courses.map((c,i) => row(c.code,i)); rows[1].grade = "F"; rows[2].grade = "S*";
    const result = auditTranscript(payload(rows),d,"project");
    expect(result.earnedCredits).toBe(3); expect(result.groups.map(g => g.earned)).toEqual([3,0]);
  });
  it.each(["project","cooperative"] as StudyTrack[])("plans distinct eligible courses for both categories and reuses allocation in What-if for %s", track => {
    const d = dataset(2); d.policy.normalMin = 0; d.policy.degreeCredits = 6;
    d.groups = [{ category: "free_elective", minimum: 3, track: "both", source: "Synthetic" }, { category: "specific_elective", minimum: 3, track: "both", source: "Synthetic" }];
    d.offerings = d.courses.map(c => ({ courseCode: c.code, ...parameters.currentTerm, availability: "open", confidence: "confirmed", source: "Synthetic test offering" }));
    const p = payload([]), before = structuredClone({ d,p });
    const baseline = makePlan(p,d,track,parameters,"actual");
    expect(baseline.terms[0].courses.map(c => c.code)).toEqual(["991001","991002"]);
    expect(baseline.graduationTerm).toEqual(parameters.currentTerm);
    const scenario = simulate(p,d,track,parameters,[{ action: "fail", courseCode: "991002", term: parameters.currentTerm, grade: null }]);
    expect(scenario.baseline).toEqual(baseline);
    expect(scenario.simulatedAudit.groups.find(g => g.category === "free_elective")?.earned).toBe(0);
    expect(scenario.changed.graduationTerm).toBeNull();
    const reserved = simulate(p,d,track,parameters,[{ action: "add", courseCode: "991002", term: parameters.currentTerm, grade: "B" }]);
    expect(reserved.changed.terms[0].courses.map(c => c.code)).toEqual(["991001","991002"]);
    expect(reserved.changed.graduationTerm).toEqual(parameters.currentTerm);
    expect({ d,p }).toEqual(before);
  });
  it("selects an announced elective ahead of lower codes with unknown or closed offerings", () => {
    const d = dataset(3); d.policy.normalMin = 0;
    d.groups = [{ category: "specific_elective", minimum: 3, track: "both", source: "Synthetic" }, { category: "free_elective", minimum: 0, track: "both", source: "Synthetic" }];
    d.offerings = [{ courseCode: "991002", ...parameters.currentTerm, availability: "closed", confidence: "confirmed", source: "Synthetic closed" }, { courseCode: "991003", ...parameters.currentTerm, availability: "open", confidence: "confirmed", source: "Synthetic teacher announcement" }];
    const plan = makePlan(payload([]),d,"project",parameters,"actual");
    expect(plan.terms[0].courses.map(c => c.code)).toEqual(["991003"]);
  });

});
