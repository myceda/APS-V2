import { describe, expect, it } from "vitest";
import { auditTranscript, calculateGpa } from "./engine";
import { parsePolicy } from "../curriculum/validation";
import { catalogue, row } from "../../../tests/support/round-5-plans";
import { transcript } from "../../../tests/support/track-criteria";
import type { Attempt } from "../transcript/types";

// Independent hand oracle: 100 one-credit rows, grades in half-point units.
// Numerators below are divided by 200; no engine function computes expectations.
const boundaries = [
  [299, 1.495, 1.50, "critical"], [300, 1.5, 1.50, "high"], [301, 1.505, 1.51, "high"],
  [359, 1.795, 1.80, "high"], [360, 1.8, 1.80, "watch"], [361, 1.805, 1.81, "watch"],
  [399, 1.995, 2.00, "watch"], [400, 2, 2.00, "low"], [401, 2.005, 2.01, "low"],
] as const;
function boundaryFixture(numerator: number) {
  const data = catalogue(["517101"]);
  const original = data.courses[0];
  const grades = ["F", "D", "D", "D+", "C", "C+", "B", "B+", "A"];
  let remaining = numerator;
  const attempts: Attempt[] = [];
  data.courses = Array.from({ length: 100 }, (_, i) => {
    let points = Math.min(8, remaining);
    // There is no 0.5 grade. Reserve 1.5 by using 3+6 instead of 8+1.
    if (remaining - points === 1) points -= 2;
    remaining -= points;
    const code = `TEST${String(i).padStart(3, "0")}`;
    attempts.push({ ...row("517101", grades[points], i), courseCode: code, credits: 1 });
    return { ...original, code, credits: 1, specific: true, source: "Synthetic boundary oracle" };
  });
  if (remaining !== 0) throw new Error("Invalid independent boundary fixture");
  return { data, payload: transcript(attempts) };
}
describe("completion: configured GPA and incomplete official history", () => {
  it.each(boundaries)("numerator %i: raw %s, display %s, APS risk %s", (numerator, raw, display, risk) => {
    const { data, payload } = boundaryFixture(numerator);
    for (const track of ["project", "cooperative"] as const) {
      const result = auditTranscript(payload, data, track);
      expect(result.gpax).toMatchObject({ raw, value: display, confirmed: true, credits: 100 });
      expect(result.specificGpa.raw).toBe(raw);
      expect(result.risk.level).toBe(risk);
    }
  });
  it.each(["empty", "first-term", "missing-term", "unconfirmed-policy"])("keeps diagnostic evidence separate: %s", kind => {
    const data = catalogue(["517101"]);
    const payload = transcript(kind === "empty" ? [] : [{ ...row("517101", "B"), year: 2565, semester: kind === "missing-term" ? null : 1 }]);
    if (kind === "unconfirmed-policy") data.policy.rounding = "unconfirmed";
    const before = structuredClone({ data, payload });
    const result = auditTranscript(payload, data, "project");
    if (kind === "empty") expect(result.risk.level).toBe("unknown");
    if (kind === "unconfirmed-policy") expect(result.gpax.confirmed).toBe(false);
    // The engine returns APS risk, never official probation counts/status.
    expect(result).not.toHaveProperty("officialStatus");
    expect(result).not.toHaveProperty("probationCount");
    expect({ data, payload }).toEqual(before);
  });
  it("rejects non-finite GPA thresholds and retains the administrator source", () => {
    const data = catalogue(["517101"]);
    for (const gpaMinimum of [NaN, Infinity, -Infinity]) expect(() => parsePolicy({ ...data.policy, gpaMinimum })).toThrow("เกณฑ์ GPA");
    expect(parsePolicy({ ...data.policy, source: "Synthetic administrator policy, not university approval" }).source).toContain("Synthetic administrator");
    expect(calculateGpa([], data).value).toBeNull();
  });
});
