import { describe, expect, it } from "vitest";
import seed from "../curriculum/data/cs2565.json";
import type { Dataset, StudyTrack } from "../curriculum/types";
import { auditTranscript } from "../analysis/engine";
import { makePlan, type PlanningParameters } from "./engine";
import { row } from "../../../tests/support/round-5-plans";
import { transcript } from "../../../tests/support/track-criteria";

const terms = [{ year: 2569, semester: 2 }, { year: 2569, semester: 3 }, { year: 2570, semester: 1 }, { year: 2570, semester: 2 }] as const;
const parameters: PlanningParameters = { currentTerm: terms[0], normalLoad: 12, summerLoad: 6, horizon: 4, targetGrade: "B", assumeUnknownOfferings: false };
function catalogue(): Dataset {
  const data = { ...structuredClone(seed), id: "completion-synthetic", curriculumVersionId: "synthetic", version: 1, editVersion: 1, status: "draft" } as Dataset;
  const active = ["517101", "517121", "517122", "517261", "520231"];
  data.offerings = data.courses.flatMap(c => ([1, 2, 3] as const).map(semester => ({ courseCode: c.code, year: 0, semester, availability: active.includes(c.code) ? "open" as const : "closed" as const, confidence: "planned" as const, source: "Synthetic administrator input; not an official timetable" })));
  return data;
}
// Hand-written placements using 4+3 credits first, 4 in summer, then 3+3.
// Alternative 517111 only authorizes 517122, not the two 517121-only successors.
describe.each(["project", "cooperative"] as StudyTrack[])("completion full 189-course catalogue: %s", track => {
  it.each([
    ["F-to-pass", ["F", "D"], [["517101", "517122", "517261"], ["520231"], [], []]],
    ["pass-to-F", ["D", "F"], [["517101", "517121"], ["517122"], ["517261", "520231"], []]],
    ["W-repeat", ["W", "W"], [["517101", "517121"], ["517122"], ["517261", "520231"], []]],
    ["F-repeat", ["F", "F"], [["517101", "517121"], ["517122"], ["517261", "520231"], []]],
  ] as const)("keeps history and configured load: %s", (_name, grades, expected) => {
    const data = catalogue();
    const payload = transcript(grades.map((grade, i) => ({ ...row("517121", grade, i), year: 2569, semester: i + 1 })));
    // All assessments precede the planning term.
    payload.attempts[0].year = 2568;
    payload.attempts[1].semester = 1;
    const before = structuredClone({ data, payload });
    const plan = makePlan(payload, data, track, parameters, "alternative");
    expect(data.courses).toHaveLength(189);
    expect(plan.terms.map(t => t.courses.map(c => c.code).sort())).toEqual(expected);
    expect(plan.terms.map(t => t.term)).toEqual(terms);
    for (const t of plan.terms) expect(t.credits).toBeLessThanOrEqual(t.term.semester === 3 ? 6 : 12);
    expect(plan.graduationTerm).toBeNull();
    expect({ data, payload }).toEqual(before);
  });
  it.each([false, true])("517111 administrator data complete=%s", complete => {
    const data = catalogue();
    if (complete) Object.assign(data.courses.find(c => c.code === "517111")!, { credits: 3, grading: "numeric", source: "Synthetic administrator assertion only" });
    const payload = transcript([{ ...row("517111", "B"), credits: 3 }]);
    const before = structuredClone({ data, payload });
    const plan = makePlan(payload, data, track, parameters, "alternative");
    expect(plan.terms.map(t => t.courses.map(c => c.code).sort())).toEqual(complete
      ? [["517101", "517121", "517122"], ["517261", "520231"], [], []]
      : [["517101", "517121"], ["517122"], ["517261", "520231"], []]);
    expect(auditTranscript(payload, data, track).courses.find(c => c.code === "517111")?.status).toBe(complete ? "passed" : "unknown");
    expect({ data, payload }).toEqual(before);
  });
});
