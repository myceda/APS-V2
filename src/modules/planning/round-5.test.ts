import { describe, expect, it } from "vitest";
import { makePlan } from "./engine";
import { evaluateEligibility } from "../track-criteria/evaluate";
import { eligibilityCases, planCases } from "../../../tests/support/round-5-plans";

describe("Round 5 independent placements, constraints and eligibility", () => {
  for (const c of planCases().filter(c => !c.expected.fullCatalogue)) {
    it(c.id, () => {
      const before = structuredClone(c);
      const plan = makePlan(c.payload, c.data, c.track, c.parameters, "alternative");
      expect(plan.terms.map(t => t.courses.map(r => r.code))).toEqual(c.expected.terms);
      expect(plan.blocked.map(b => b.code).sort()).toEqual(c.expected.blocked?.slice().sort());
      if (c.expected.reason) expect(plan.blocked.flatMap(b => b.reasons).join(" ")).toContain(c.expected.reason);
      if (c.expected.conditional) expect(plan.terms.flatMap(t => t.courses.flatMap(r => r.assumptions)).join(" ")).toContain(c.expected.conditional);
      for (const t of plan.terms) {
        expect(t.credits).toBe(t.courses.reduce((n, r) => n + r.credits, 0));
        expect(t.credits).toBeLessThanOrEqual(t.term.semester === 3 ? c.parameters.summerLoad : c.parameters.normalLoad);
      }
      expect(plan.graduationTerm).toBeNull();
      expect(c).toEqual(before);
    });
  }
  for (const c of eligibilityCases()) it(`criteria-${c.id}`, () => {
    const before = structuredClone(c);
    const result = evaluateEligibility({ ...c, curriculumVersionId: "CS2565", term: { year: 2569, semester: 1 }, track: "project", today: "2026-10-18" });
    expect(result.status).toBe(c.expected);
    expect(result.approval).toBe("not_verified");
    expect(c).toEqual(before);
  });
});
