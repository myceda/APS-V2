import { describe, expect, it } from "vitest";
import seed from "./data/cs2565.json";
import type { Dataset } from "./types";
import { publicationReadiness } from "./publication-readiness";

describe("publication capability boundaries", () => {
  it("lists every unresolved CS2565 rule and both effects of composite rules", () => {
    const data = ({ ...structuredClone(seed), id: "followup", curriculumVersionId: "synthetic", version: 1, editVersion: 1, status: "draft" }) as Dataset;
    const before = structuredClone(data);
    const result = publicationReadiness(data);
    expect(result.limitations.map(item => item.rule)).toEqual(data.unresolved);
    expect(result.limitations.find(item => item.rule.startsWith("OPEN-04/10"))?.affects).toContain("โครงงาน");
    expect(result.limitations.find(item => item.rule.startsWith("OPEN-04/10"))?.affects).toContain("สหกิจ");
    expect(result.capabilities.fullAcademicConclusion).toBe(false);
    expect(data).toEqual(before);
  });
  it.each(["repeat", "rounding", "gpaComparison", "specificGpaBasis"] as const)("does not certify GPA with unconfirmed %s", field => {
    const data = ({ ...structuredClone(seed), id: "followup", curriculumVersionId: "synthetic", version: 1, editVersion: 1, status: "draft" }) as Dataset;
    Object.assign(data.policy, { [field]: "unconfirmed" });
    expect(publicationReadiness(data).capabilities.confirmedGpa).toBe(false);
    expect(publicationReadiness(data).capabilities.diagnosticGpa).toBe(true);
  });
  it("does not silently drop a rule added by the administrator", () => {
    const data = ({ ...structuredClone(seed), id: "followup", curriculumVersionId: "synthetic", version: 1, editVersion: 1, status: "draft" }) as Dataset;
    data.unresolved = ["กฎใหม่ที่ผู้ดูแลยังไม่มีข้อมูล", "OPEN-99: กฎใหม่"];
    expect(publicationReadiness(data).limitations).toEqual(data.unresolved.map(rule => ({ rule, affects: "ผลสรุปการศึกษาที่พึ่งกฎนี้" })));
    data.unresolved = [];
    expect(publicationReadiness(data).capabilities.fullAcademicConclusion).toBe(false);
  });
});
