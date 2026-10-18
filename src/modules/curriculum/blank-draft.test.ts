import { it, expect } from "vitest";
import { blankDraft } from "./blank-draft";
import { parsePolicy, parseGroups, validateDataset } from "./validation";
it("starts other curricula without CS courses, offerings or confirmed policies", () => {
  const d = blankDraft(); expect(d.courses).toEqual([]); expect(d.offerings).toEqual([]);
  expect(parsePolicy(d.policy).repeat).toBe("unconfirmed"); expect(parseGroups(d.groups).every(g => g.minimum === 0)).toBe(true);
  expect(d.unresolved.join()).toContain("ค่าเริ่มต้น");
  expect(validateDataset({ ...d, id: "test", curriculumVersionId: "test", version: 1, editVersion: 1, status: "draft" })).toContain("ต้องมีรายวิชาอย่างน้อยหนึ่งวิชา");
});
it("does not share mutable template state between curricula", () => {
  const a = blankDraft(); a.groups[0].minimum = 99; a.policy.starGradeCourses!.push("R7001");
  const b = blankDraft(); expect(b.groups[0].minimum).toBe(0); expect(b.policy.starGradeCourses).toEqual([]);
});
