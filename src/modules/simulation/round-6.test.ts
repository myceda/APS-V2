import { describe, expect, it } from "vitest";
import { simulationCases, simulationData, simulationParameters } from "../../../tests/support/round-6-simulation";
import { transcript } from "../../../tests/support/track-criteria";
import { simulate } from "./engine";
import type { ScenarioEvent } from "./engine";
describe("Round 6 What-if behavior and unchanged inputs", () => {
  for (const c of simulationCases()) it(c.id, () => {
    const before = structuredClone(c);
    if (c.expected.error) {
      expect(() => simulate(c.payload, c.data, c.track, c.parameters, c.events, c.offerings)).toThrow(c.expected.error);
    } else {
      const result = simulate(c.payload, c.data, c.track, c.parameters, c.events, c.offerings);
      const terms = (plan: typeof result.changed) => plan.terms.map(t => t.courses.map(r => `${r.code}:${r.grade}`));
      expect(terms(result.baseline)).toEqual(c.expected.before);
      expect(terms(result.changed)).toEqual(c.expected.after);
      expect(result.termDifference).toBe(c.expected.difference);
      const [n, d = "1"] = c.expected.gpax!.split("/");
      expect(result.simulatedAudit.gpax.raw).toBeCloseTo(Number(n) / Number(d), 12);
      if (c.id.startsWith("numeric-grade-a") || c.id.startsWith("fail-numeric") || c.id.startsWith("fail-su"))
        expect(result.changed.assumptions.join(" ")).toContain("เกรดตามเหตุการณ์");
      if (c.expected.warning) expect(result.changed.limitations.join(" ")).toContain(c.expected.warning);
    }
    expect(c).toEqual(before);
  });
  it("invalid event shape reports a Thai validation error", () => {
    const c = simulationCases()[0];
    expect(() => simulate(c.payload, c.data, c.track, c.parameters, [null as unknown as ScenarioEvent])).toThrow("ข้อมูลเหตุการณ์จำลองไม่ถูกต้อง");
  });
  it("a JSON number is not a numeric letter grade", () => {
    const c = simulationCases()[0];
    expect(() => simulate(c.payload, c.data, c.track, c.parameters, [{ ...c.events[0], grade: 3 } as unknown as ScenarioEvent])).toThrow("เกรดจำลองไม่ตรง");
  });
  it("clears an initial block warning when a documented concurrent prerequisite is later scheduled in the same term", () => {
    const d = simulationData(), template = structuredClone(d.courses.find(c => c.code === "517101")!);
    d.courses = ["991001", "991002", "991003", "991004"].map((code, i) => ({ ...structuredClone(template), code, prerequisite: { mode: "all" as const, courses: i === 0 ? [] : [i === 1 ? "991001" : "991002"], concurrent: i === 1, unresolved: null } }));
    d.offerings = d.courses.map(c => ({ courseCode: c.code, year: 0, semester: 1, availability: "open" as const, confidence: "planned" as const, source: "Synthetic documented concurrent pair" }));
    d.groups = [{ category: template.category, minimum: 12, track: "both", source: "Synthetic" }];
    const result = simulate(transcript(), d, "project", simulationParameters, [{ action: "add", courseCode: "991002", term: simulationParameters.currentTerm, grade: "A" }]);
    expect(result.changed.terms[0].courses.find(c => c.code === "991002")?.grade).toBe("A");
    expect(result.changed.limitations.join(" ")).not.toContain("991002 2569/1: ไม่ได้ใช้เหตุการณ์");
  });
});
