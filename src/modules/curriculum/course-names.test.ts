import { describe, expect, it } from "vitest";
import seed from "./data/cs2565.json";
import names from "./data/cs2565-course-names.json";

describe("reviewed CS2565 catalog names", () => {
  it("covers the exact 180 catalog codes with source pages and valid Thai Unicode", () => {
    // 517465 is a user-confirmed extension, separate from the 180 PDF catalogue entries.
    const catalog = seed.courses.filter((c) => c.category !== "unmapped" && c.code !== "517465");
    expect(names.courses).toHaveLength(180);
    expect(new Set(names.courses.map((c) => c.code)).size).toBe(180);
    expect(catalog.map((c) => c.code).sort()).toEqual(names.courses.map((c) => c.code).sort());
    for (const entry of names.courses) {
      expect(entry.name).not.toMatch(/[\uE000-\uF8FF]|ตรวจชื่อ|รายวิชา \d|– SU/);
      expect(entry.name).toBe(entry.name.normalize("NFC"));
      expect(entry.pdfPages.length).toBeGreaterThan(0);
      expect(entry.pdfPages.every((p) => p >= 24 && p <= 37)).toBe(true);
    }
  });
  it("keeps verified source names rather than range headings or footnotes", () => {
    const catalog = new Map(seed.courses.map((c) => [c.code, c]));
    expect(catalog.get("SU110")?.name).toBe("มนุษย์กับการสร้างสรรค์");
    expect(catalog.get("SU115")?.name).toBe("อาหารเพื่อสุขภาพ");
    expect(catalog.get("SU201")?.name).toBe("ภาษาอังกฤษในยุคดิจิทัล");
    expect(catalog.get("520251")?.name).toBe("การปฏิสัมพันธ์ระหว่างมนุษย์กับคอมพิวเตอร์และการออกแบบประสบการณ์ผู้ใช้");
  });
  it("leaves external prerequisite references explicitly unconfirmed", () => {
    const references = seed.courses.filter((c) => c.category === "unmapped");
    expect(references).toHaveLength(8);
    for (const entry of references) {
      expect(entry.name).toContain("ยังไม่มีชื่อยืนยัน");
      expect(entry.credits).toBe(0);
      expect(entry.grading).toBe("unknown");
    }
  });
});
