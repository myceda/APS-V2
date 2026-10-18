import { describe, expect, it } from "vitest";
import seed from "@/modules/curriculum/data/cs2565.json";
import { academicDataset } from "../../../tests/support/academic-fixtures";
import { makePlan, prerequisiteSatisfied, sameParameters } from "./engine";
import { simulate } from "@/modules/simulation/engine";
import { auditTranscript } from "@/modules/analysis/engine";
import type { Course, Dataset } from "@/modules/curriculum/types";
import type { Attempt, TranscriptPayload } from "@/modules/transcript/types";
function dataset(courses?: Course[]): Dataset {
  const d = academicDataset({
    id: "synthetic",
    curriculumVersionId: "synthetic",
    version: 1,
    editVersion: 1,
    status: "published",
  } as Dataset);
  if (courses) {
    d.courses = structuredClone(courses);
    d.offerings = courses.flatMap((c) =>
      ([1, 2, 3] as const).map((semester) => ({
        courseCode: c.code,
        year: 0,
        semester,
        availability: "open" as const,
        confidence: "planned" as const,
        source: "synthetic offering",
      })),
    );
    d.policy.degreeCredits = courses.reduce((n, c) => n + c.credits, 0);
  }
  return d;
}
function attempt(
  courseCode: string,
  grade: string,
  ordinal = 0,
  change: Partial<Attempt> = {},
): Attempt {
  return {
    courseCode,
    grade,
    ordinal,
    name: "Synthetic Course",
    credits: 3,
    gradePoints: null,
    year: 2568,
    semester: 1,
    kind: "semester",
    sourcePage: 1,
    ...change,
  };
}
function payload(attempts: Attempt[] = []): TranscriptPayload {
  const field = {
    value: "synthetic",
    state: "present" as const,
    sourcePage: 1,
  };
  return {
    header: {
      studentCode: field,
      studentName: field,
      faculty: field,
      department: field,
      degree: field,
      program: field,
      track: null,
      trackState: "not_selected",
    },
    attempts,
    summaries: [],
    pages: 1,
  };
}
const params = {
  currentTerm: { year: 2569, semester: 2 as const },
  normalLoad: 12,
  summerLoad: 6,
  horizon: 6,
  targetGrade: "B",
  assumeUnknownOfferings: false,
};
const codes = ["517121", "517122", "517261", "520231"];
const selected = seed.courses.filter((c) => codes.includes(c.code)) as Course[];
describe("CS2565 sourced dependencies with explicit synthetic offering assumptions", () => {
  it("compares parameter values regardless of PostgreSQL JSON field ordering",()=>{
    const reordered={targetGrade:params.targetGrade,horizon:params.horizon,summerLoad:params.summerLoad,normalLoad:params.normalLoad,currentTerm:{semester:params.currentTerm.semester,year:params.currentTerm.year},assumeUnknownOfferings:params.assumeUnknownOfferings};
    expect(JSON.stringify(reordered)).not.toBe(JSON.stringify(params));
    expect(sameParameters(params,reordered)).toBe(true);
    expect(sameParameters(params,{...reordered,normalLoad:13})).toBe(false);
    expect(sameParameters(params,{...reordered,currentTerm:{year:2570,semester:2}})).toBe(false);
  });
  it("uses CS-P08 OR only on 517122, preserving the separate 517121 conditions", () => {
    const alternative = new Set(["517111"]);
    expect(
      prerequisiteSatisfied(
        selected.find((c) => c.code === "517122")!,
        alternative,
      ),
    ).toBe(true);
    for (const code of ["517261", "520231"])
      expect(
        prerequisiteSatisfied(
          selected.find((c) => c.code === code)!,
          alternative,
        ),
      ).toBe(false);
  });
  it("reschedules W without converting it to low GPA, respecting closed and unknown terms", () => {
    const d = dataset(selected),
      p = payload([
        attempt("517121", "W", 0, { credits: 0 }),
        attempt("517122", "B", 1),
      ]);
    // Group allocations and limits are a synthetic fixture; dependencies come from the CS2565 seed.
    d.groups = [...new Set(selected.map((c) => c.category))].map(
      (category) => ({
        category,
        minimum: selected
          .filter((c) => c.category === category)
          .reduce((n, c) => n + c.credits, 0),
        track: "both",
        source: "synthetic test allocation",
      }),
    );
    expect(auditTranscript(p,d,"project").risk.level).toBe("low");
    const base = makePlan(p, d, "project", params, "actual");
    expect(base.terms[0].courses.some((c) => c.code === "517121")).toBe(true);
    expect(base.terms[0].courses.some((c) => c.code === "517261")).toBe(false);
    expect(base.terms[1].courses.some((c) => c.code === "517261")).toBe(true);
    d.offerings.push({
      courseCode: "517121",
      ...params.currentTerm,
      availability: "closed",
      confidence: "confirmed",
      source: "synthetic explicit closure",
    });
    const closed = makePlan(p, d, "project", params, "actual");
    expect(closed.terms[0].courses.some((c) => c.code === "517121")).toBe(
      false,
    );
    expect(closed.terms[1].courses.some((c) => c.code === "517121")).toBe(true);
    d.offerings[d.offerings.length - 1].availability = "unknown";
    const before = structuredClone(p),
      actual = structuredClone(d);
    for (const availability of ["open", "closed"] as const) {
      const comparison = simulate(
        p,
        d,
        "project",
        params,
        [],
        [{ courseCode: "517121", term: params.currentTerm, availability }],
      );
      expect(
        comparison.changed.terms[0].courses.some((c) => c.code === "517121"),
      ).toBe(availability === "open");
      expect(comparison.offeringAssumptions[0].availability).toBe(availability);
    }
    expect(p).toEqual(before);
    expect(d).toEqual(actual);
  });
  it("flags a normal term below the general minimum without inventing advisor approval", () => {
    const d = dataset();
    d.policy.normalMin = 12;
    const plan = makePlan(payload(), d, "project", params, "actual");
    expect(plan.terms[0].courses.length).toBeGreaterThan(0);
    expect(plan.limitations.join()).toContain("ต่ำกว่าขั้นต่ำทั่วไป 12");
    expect(plan.graduationTerm).toBeNull();
  });
});
