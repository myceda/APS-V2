import { describe, expect, it } from "vitest";
import { extractPdf } from "@/server/pdf-extraction";
import { parsePayload, transcriptIssues } from "./validation";
import { parsePage, type TextLine } from "./layout";
import { syntheticTranscript } from "../../../tests/support/synthetic-transcript";

describe("PDF review integrity", () => {
  it("preserves unreadable state and raw evidence when an unrelated row is edited", async () => {
    const original = await extractPdf(syntheticTranscript("6509999999"));
    original.header.faculty = { value: null, state: "unreadable", sourcePage: 1, raw: "Faculty:" };
    const edited = structuredClone(original);
    edited.attempts[0].name = "Reviewed Course";
    const saved = parsePayload(edited, original);
    expect(saved.header.faculty).toEqual(original.header.faculty);
    expect(saved.header.campus?.state).toBe("not_present");
    expect(transcriptIssues(saved, null)).toContainEqual(expect.objectContaining({ code: "HEADER_MISSING", severity: "blocking" }));
  });

  it("does not allow client state alone to clear an unreadable field", async () => {
    const original = await extractPdf(syntheticTranscript("6509999999"));
    original.header.faculty = { value: null, state: "unreadable", sourcePage: 1 };
    const edited = structuredClone(original);
    edited.header.faculty.state = "not_present";
    expect(parsePayload(edited, original).header.faculty.state).toBe("unreadable");
    edited.header.faculty.value = "Science";
    expect(parsePayload(edited, original).header.faculty.state).toBe("present");
  });

  it("keeps a genuinely absent optional field absent and blocks clearing required data", async () => {
    const original = await extractPdf(syntheticTranscript("6509999999"));
    const edited = structuredClone(original);
    edited.header.faculty.value = null;
    const saved = parsePayload(edited, original);
    expect(saved.header.faculty.state).toBe("unreadable");
    expect(saved.header.campus?.state).toBe("not_present");
  });

  it("never treats an unrecognized grade as a genuinely blank pending result", async () => {
    await expect(extractPdf(syntheticTranscript("6509999999", "Q"))).rejects.toMatchObject({ code: "PDF_GRADE_UNSUPPORTED", status: 422 });
  });

  it.each(["W", "I", "S*", "U*", ""])("retains raw grade %s and all repeated attempts", async grade => {
    const payload = await extractPdf(syntheticTranscript("6509999999", grade, [{ code: "517101", name: "First Attempt" }, { code: "517101", name: "Second Attempt" }]));
    expect(payload.attempts.map(row => row.grade)).toEqual([grade || null, grade || null]);
    expect(payload.attempts.map(row => row.ordinal)).toEqual([0, 1]);
    expect(payload.attempts.map(row => row.sourcePage)).toEqual([1, 1]);
  });

  it("matches repeated summary values to their own terms and keeps latest values distinct", () => {
    const line = (y: number, parts: [number, string][]): TextLine => ({ y, items: parts.map(([x, text]) => ({ x, text, width: 30 })) });
    const parsed = parsePage([
      line(800, [[20, "ผลการเรียนเฉลี่ยภาคล่าสุด 0"], [320, "ผลการเรียนเฉลี่ยสะสม 2.75"]]),
      line(700, [[20, "Semester 1/2568"]]),
      line(650, [[20, "CR:3 CP:3 CA:3 GP:9"], [320, "CR:3 CP:3 CA:3 GP:9"]]),
      line(600, [[20, "Semester 2/2568"]]),
      line(550, [[20, "CR:3 CP:3 CA:3 GP:9"], [320, "CR:6 CP:6 CA:6 GP:18"]]),
    ], 595, 1, { kind: "unknown", year: null, semester: null }, 0);
    expect(parsed.summaries).toContainEqual(expect.objectContaining({ year: null, semester: null, kind: "latest_semester", fields: { gpa: "0" } }));
    expect(parsed.summaries).toContainEqual(expect.objectContaining({ year: null, semester: null, kind: "latest_cumulative", fields: { gpax: "2.75" } }));
    expect(parsed.summaries.filter(s => s.kind === "semester").map(s => [s.year, s.semester, s.fields.CR])).toEqual([[2568,1,"3"], [2568,2,"3"]]);
    expect(parsed.summaries.find(s => s.kind === "cumulative" && s.semester === 2)?.fields.CR).toBe("6");
  });
});
