import { describe, expect, it } from "vitest";
import seed from "../curriculum/data/cs2565.json";
import type { Dataset, StudyTrack } from "../curriculum/types";
import { makePlan, type PlanningParameters } from "./engine";
import { row } from "../../../tests/support/round-5-plans";
import { transcript } from "../../../tests/support/track-criteria";

// Every catalogue row is retained. Opening states below are explicit synthetic
// administrator inputs, never claims about the university's actual timetable.
const active = ["517101", "517121", "517122", "517261", "520231"];
const parameters: PlanningParameters = { currentTerm: { year: 2569, semester: 2 }, normalLoad: 12, summerLoad: 6, horizon: 4, targetGrade: "B", assumeUnknownOfferings: false };
function data(): Dataset {
  const value = ({ ...structuredClone(seed), id: "followup", curriculumVersionId: "synthetic", version: 1, editVersion: 1, status: "draft" }) as Dataset;
  value.offerings = value.courses.flatMap(c => ([1, 2, 3] as const).map(semester => ({
    courseCode: c.code, year: 0, semester, availability: active.includes(c.code) ? "open" as const : "closed" as const,
    confidence: "planned" as const, source: "Synthetic administrator scenario; not an official offering",
  })));
  return value;
}
const terms = [{ year: 2569, semester: 2 }, { year: 2569, semester: 3 }, { year: 2570, semester: 1 }, { year: 2570, semester: 2 }] as const;
// Written before execution: 4-credit retake + 3-credit independent course;
// summer cap 6 fits the 4-credit successor alone; the two 3-credit courses wait.
const expected = {
  open: [["517101", "517121"], ["517122"], ["517261", "520231"], []],
  closed: [["517101"], ["517121"], ["517122", "517261", "520231"], []],
  unknown: [["517101"], [], [], []],
};
describe.each(["project", "cooperative"] as StudyTrack[])("full catalogue year-one W acceptance: %s", track => {
  it.each(["open", "closed", "unknown", "assumed-open", "assumed-closed"] as const)("compares all four terms and load bounds: %s", state => {
    const catalogue = data();
    expect(catalogue.courses).toHaveLength(189);
    if (state === "closed") catalogue.offerings.push({ courseCode: "517121", ...terms[0], availability: "closed", confidence: "planned", source: "Synthetic closure this term only" });
    if (state.startsWith("unknown") || state.startsWith("assumed")) for (const term of terms) catalogue.offerings.push({ courseCode: "517121", ...term, availability: "unknown", confidence: "planned", source: "Administrator has not supplied this offering" });
    const original = structuredClone(catalogue);
    const scenario = structuredClone(catalogue);
    if (state === "assumed-closed") for (const offering of scenario.offerings.filter(o => o.courseCode === "517121")) offering.availability = "closed";
    const payload = transcript([{ ...row("517121", "W"), year: 2569, semester: 1 }]);
    const before = structuredClone(payload);
    const result = makePlan(payload, scenario, track, { ...parameters, assumeUnknownOfferings: state === "assumed-open" }, state.startsWith("assumed") ? "assumption" : "alternative");
    const target = state === "closed" ? expected.closed : state === "unknown" || state === "assumed-closed" ? expected.unknown : expected.open;
    expect(result.terms.map(t => t.courses.map(c => c.code).sort())).toEqual(target);
    expect(result.terms.map(t => t.term)).toEqual(terms);
    for (const term of result.terms) {
      expect(term.credits).toBe(term.courses.reduce((sum, c) => sum + c.credits, 0));
      expect(term.credits).toBeLessThanOrEqual(term.term.semester === 3 ? 6 : 12);
      expect(term.courses.every(c => active.includes(c.code))).toBe(true);
    }
    expect(new Set(result.terms.flatMap(t => t.courses.map(c => c.code))).size).toBe(result.terms.flatMap(t => t.courses).length);
    expect(result.graduationTerm).toBeNull();
    if (state === "unknown") expect(result.blocked.find(c => c.code === "517121")?.reasons.join(" ")).toContain("ยังไม่ทราบ");
    if (state === "assumed-open") expect(result.assumptions.join(" ")).toContain("สมมติว่าเปิดสอน");
    expect(payload).toEqual(before);
    expect(catalogue).toEqual(original);
  });
});
