import { describe, expect, it } from "vitest";
import { auditTranscript, calculateGpa } from "./engine";
import {
  makePlan,
  resolveOffering,
  validateParameters,
} from "@/modules/planning/engine";
import { simulate } from "@/modules/simulation/engine";
import {
  parseHeader,
  parsePage,
  type TextLine,
} from "@/modules/transcript/layout";
import { parseCourse, validateDataset } from "@/modules/curriculum/validation";
import type { Course, Dataset } from "@/modules/curriculum/types";
import type { Attempt, TranscriptPayload } from "@/modules/transcript/types";

export function course(code: string, patch: Partial<Course> = {}): Course {
  return {
    code,
    name: `วิชา ${code}`,
    credits: 3,
    category: "specific_required",
    tracks: [],
    grading: "numeric",
    specific: true,
    prerequisite: {
      mode: "all",
      courses: [],
      concurrent: false,
      unresolved: null,
    },
    requiresConsent: false,
    source: "ข้อมูลสังเคราะห์สำหรับทดสอบ",
    ...patch,
  };
}
export function dataset(
  courses = [
    course("101001"),
    course("101002", {
      prerequisite: {
        mode: "all",
        courses: ["101001"],
        concurrent: false,
        unresolved: null,
      },
    }),
  ],
): Dataset {
  return {
    id: "test-dataset",
    curriculumVersionId: "test-version",
    version: 1,
    editVersion: 1,
    status: "published",
    source: "synthetic",
    courses,
    groups: [
      {
        category: "specific_required",
        minimum: courses.reduce((s, c) => s + c.credits, 0),
        track: "both",
        source: "synthetic",
      },
    ],
    offerings: courses.flatMap((c) =>
      [1, 2, 3].map((semester) => ({
        courseCode: c.code,
        year: 0,
        semester: semester as 1 | 2 | 3,
        availability: "open" as const,
        confidence: "planned" as const,
        source: "รูปแบบสมมติสำหรับทดสอบ",
      })),
    ),
    policy: {
      degreeCredits: courses.reduce((s, c) => s + c.credits, 0),
      gpaMinimum: 2,
      retakeCeiling: 1.5,
      repeat: "latest_numeric",
      rounding: "half_up_2",
      gpaComparison: "raw",
      specificGpaBasis: "all_specific",
      prerequisitePass: "any_pass",
      normalMax: 22,
      normalMin: 0,
      summerMax: 9,
      source: "synthetic",
    },
    unresolved: [],
  };
}
export function attempt(
  code: string,
  grade: string | null,
  ordinal = 0,
  patch: Partial<Attempt> = {},
): Attempt {
  return {
    ordinal,
    courseCode: code,
    name: `วิชา ${code}`,
    credits: 3,
    grade,
    gradePoints: null,
    year: 2568,
    semester: 1,
    kind: "semester",
    sourcePage: 1,
    ...patch,
  };
}
export function payload(attempts: Attempt[] = []): TranscriptPayload {
  const field = { value: "ทดสอบ", state: "present" as const, sourcePage: 1 };
  return {
    header: {
      studentCode: { ...field, value: "TEST" },
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
  currentTerm: { year: 2569, semester: 1 as const },
  normalLoad: 6,
  summerLoad: 6,
  horizon: 6,
  targetGrade: "B",
  assumeUnknownOfferings: false,
};

describe("GPA and curriculum behaviour", () => {
  it("uses the agreed APS boundaries and keeps them distinct from university standing", () => {
    const d = dataset();
    expect(
      auditTranscript(payload([attempt("101001", "D")]), d, "project").risk
        .level,
    ).toBe("critical");
    expect(
      auditTranscript(payload([attempt("101001", "D+", 0)]), d, "project").risk
        .level,
    ).toBe("high");
    expect(
      auditTranscript(
        payload([
          attempt("101001", "C", 0, { credits: 4 }),
          attempt("101002", "D", 1, { credits: 1 }),
        ]),
        d,
        "project",
      ).risk.level,
    ).toBe("watch");
    expect(
      auditTranscript(payload([attempt("101001", "C")]), d, "project").risk
        .level,
    ).toBe("low");
  });
  it("suggests only eligible grade thresholds for diagnostic recovery without mutating data", () => {
    const d = dataset(),
      p = payload([attempt("101001", "D+"), attempt("101002", "F", 1)]),
      before = structuredClone(p);
    const result = auditTranscript(p, d, "project");
    expect(result.recovery).toHaveLength(2);
    expect(result.recovery[0].diagnosticGpax).toBeGreaterThan(
      result.gpax.value!,
    );
    expect(p).toEqual(before);
    d.policy.retakeCeiling = null;
    expect(auditTranscript(p, d, "project").recovery).toEqual([]);
  });
  it("preserves retakes and uses numeric assessment despite later W/I", () => {
    const p = payload([
      attempt("101001", "F", 0),
      attempt("101001", "B", 1),
      attempt("101001", "W", 2, { credits: 0 }),
      attempt("101001", "I", 3),
    ]);
    const before = structuredClone(p);
    const result = auditTranscript(p, dataset(), "project");
    expect(result.gpax.value).toBe(3);
    expect(result.earnedCredits).toBe(3);
    expect(p).toEqual(before);
  });
  it("counts a course once and cannot replace a missing required course with an elective", () => {
    const d = dataset([
      course("101001"),
      course("101002"),
      course("101003", { category: "specific_elective" }),
    ]);
    const result = auditTranscript(
      payload([
        attempt("101001", "A"),
        attempt("101001", "A", 1),
        attempt("101003", "A", 2),
      ]),
      d,
      "project",
    );
    expect(result.earnedCredits).toBe(6);
    expect(result.courses.find((c) => c.code === "101002")?.status).toBe(
      "missing",
    );
    expect(result.graduation).toBe("requirements_not_met");
  });
  it("does not call completed courses sufficient when GPA is below the required minimum",()=>{
    const d=dataset([course("101001")]);
    const result=auditTranscript(payload([attempt("101001","D")]),d,"project");
    expect(result.earnedCredits).toBe(d.policy.degreeCredits);
    expect(result.courses[0].status).toBe("passed");
    expect(result.graduation).toBe("requirements_not_met");
    d.policy.rounding="unconfirmed";
    expect(auditTranscript(payload([attempt("101001","D")]),d,"project").graduation).toBe("not_evaluated");
  });
  it("keeps S*, U*, transfer and unmapped data unresolved", () => {
    const result = auditTranscript(
      payload([
        attempt("101001", "S*"),
        attempt("101002", "B", 1, { kind: "transfer" }),
        attempt("999999", "A", 2),
      ]),
      dataset(),
      "project",
    );
    expect(result.courses.every((c) => c.status === "unknown")).toBe(true);
    expect(result.unmapped).toEqual(["999999"]);
    expect(result.gpax.confirmed).toBe(false);
  });
  it("excludes S/U from GPA and foundation credits from degree", () => {
    const d = dataset([
      course("101001", {
        category: "non_degree",
        grading: "su",
        specific: false,
      }),
      course("101002"),
    ]);
    const result = auditTranscript(
      payload([attempt("101001", "S"), attempt("101002", "B", 1)]),
      d,
      "project",
    );
    expect(result.earnedCredits).toBe(3);
    expect(result.gpax.credits).toBe(3);
    expect(result.gpax.value).toBe(3);
  });
  it("uses integer rounding at half a hundredth and exposes unconfirmed policy", () => {
    const d = dataset([
      course("101001", { credits: 31 }),
      course("101002", { credits: 169 }),
    ]);
    expect(
      calculateGpa(
        [
          attempt("101001", "A", 0, { credits: 31 }),
          attempt("101002", "C", 1, { credits: 169 }),
        ],
        d,
      ).value,
    ).toBe(2.31);
    d.policy.repeat = "unconfirmed";
    d.policy.rounding = "unconfirmed";
    expect(
      calculateGpa([attempt("101001", "B", 0, { credits: 31 })], d).confirmed,
    ).toBe(false);
  });
  it("does not label a student at risk solely because of W", () => {
    expect(
      auditTranscript(
        payload([attempt("101001", "W", 0, { credits: 0 })]),
        dataset(),
        "project",
      ).risk.level,
    ).toBe("unknown");
  });
  it("compares risk against the raw number, separately from displayed rounding", () => {
    const d = dataset();
    const rows = [
      attempt("101001", "D+", 0, { credits: 1 }),
      attempt("101002", "C", 1, { credits: 199 }),
    ];
    expect(auditTranscript(payload(rows), d, "project").gpax.value).toBe(2);
    expect(auditTranscript(payload(rows), d, "project").risk.level).toBe(
      "watch",
    );
  });
});
describe("offerings, roadmap and scenarios", () => {
  it("specific unknown/closed overrides a recurring open", () => {
    const d = dataset();
    d.offerings.push({
      courseCode: "101001",
      year: 2569,
      semester: 1,
      availability: "unknown",
      confidence: "confirmed",
      source: "specific",
    });
    expect(resolveOffering(d, "101001", params.currentTerm).availability).toBe(
      "unknown",
    );
    d.offerings.at(-1)!.availability = "closed";
    expect(resolveOffering(d, "101001", params.currentTerm).availability).toBe(
      "closed",
    );
    expect(resolveOffering(d, "999999", params.currentTerm).availability).toBe(
      "unknown",
    );
  });
  it("schedules a prerequisite before its successor, without changing the input", () => {
    const p = payload(),
      before = structuredClone(p),
      result = makePlan(p, dataset(), "project", params, "actual");
    expect(result.terms[0].courses.map((c) => c.code)).toEqual(["101001"]);
    expect(result.terms[1].courses.map((c) => c.code)).toEqual(["101002"]);
    expect(p).toEqual(before);
    expect(result.graduationTerm).toEqual({ year: 2569, semester: 2 });
  });
  it("supports OR and only documented concurrent study", () => {
    const d = dataset([
      course("101001"),
      course("101002"),
      course("101003", {
        prerequisite: {
          mode: "any",
          courses: ["101001", "101002"],
          concurrent: true,
          unresolved: null,
        },
      }),
    ]);
    const result = makePlan(
      payload([attempt("101002", "F")]),
      d,
      "project",
      { ...params, normalLoad: 9 },
      "actual",
    );
    expect(result.terms[0].courses.map((c) => c.code)).toContain("101003");
  });
  it("keeps other eligible courses when one course is blocked", () => {
    const d = dataset();
    d.offerings = d.offerings.filter((o) => o.courseCode !== "101002");
    const result = makePlan(payload(), d, "project", params, "actual");
    expect(result.terms[0].courses[0].code).toBe("101001");
    expect(result.blocked[0].code).toBe("101002");
    expect(result.graduationTerm).toBeNull();
  });
  it("unknown is not open unless the user explicitly selects an assumption", () => {
    const d = dataset();
    d.offerings = [];
    expect(
      makePlan(payload(), d, "project", params, "actual").terms.every(
        (t) => !t.courses.length,
      ),
    ).toBe(true);
    const result = makePlan(
      payload(),
      d,
      "project",
      { ...params, assumeUnknownOfferings: true },
      "assumption",
    );
    expect(result.terms[0].courses.length).toBe(1);
    expect(result.assumptions.join()).toContain("สมมติว่าเปิด");
  });
  it("does not imply permission from an APS admin or forecast through unresolved rules", () => {
    const d = dataset();
    d.courses[1].requiresConsent = true;
    const result = makePlan(payload(), d, "project", params, "actual");
    expect(result.graduationTerm).toBeNull();
    expect(result.limitations.join()).toContain("ความยินยอม");
  });
  it("drop delays a successor without deleting history or creating W", () => {
    const p = payload(),
      before = structuredClone(p);
    const result = simulate(p, dataset(), "project", params, [
      {
        action: "drop",
        courseCode: "101001",
        term: params.currentTerm,
        grade: null,
      },
    ]);
    expect(result.changed.terms[0].courses).toEqual([]);
    expect(result.termDifference).toBe(1);
    expect(p).toEqual(before);
  });
  it("a later fail takes effect in that term, and the successor waits for the retake", () => {
    const p = payload(),
      before = structuredClone(p);
    const result = simulate(p, dataset(), "project", params, [
      {
        action: "fail",
        courseCode: "101002",
        term: { year: 2569, semester: 2 },
        grade: null,
      },
    ]);
    expect(result.changed.terms[0].courses[0].code).toBe("101001");
    expect(result.changed.terms[1].courses[0].grade).toBe("F");
    expect(result.changed.terms[2].courses[0].grade).toBe("B");
    expect(result.termDifference).toBe(1);
    expect(p).toEqual(before);
  });
  it("does not make every scenario delay graduation", () => {
    const d = dataset([course("101001"), course("101002")]);
    const p = payload([attempt("101001", "D+")]);
    const result = simulate(p, d, "project", params, [
      {
        action: "add",
        courseCode: "101001",
        term: params.currentTerm,
        grade: "B",
      },
    ]);
    expect(result.termDifference).toBe(0);
  });
  it("rejects unsupported retakes, fabricated planned events and excessive loads", () => {
    expect(() =>
      simulate(
        payload([attempt("101001", "C")]),
        dataset(),
        "project",
        params,
        [
          {
            action: "add",
            courseCode: "101001",
            term: params.currentTerm,
            grade: "B",
          },
        ],
      ),
    ).toThrow("สูงกว่าเกณฑ์");
    expect(() =>
      simulate(payload(), dataset(), "project", params, [
        {
          action: "drop",
          courseCode: "101002",
          term: params.currentTerm,
          grade: null,
        },
      ]),
    ).toThrow("แผนฐาน");
    expect(() =>
      validateParameters({ ...params, normalLoad: 23 }, dataset()),
    ).toThrow();
  });
});
describe("layout and catalogue validation", () => {
  const line = (texts: string[], y = 100): TextLine => ({
    y,
    items: texts.map((text, i) => ({ text, x: i * 100, width: 40 })),
  });
  it("distinguishes complete unselected header from unreadable or ambiguous header", () => {
    const lines = [
      line(["รหัสนักศึกษา: 12345678"]),
      line(["ชื่อ-นามสกุล: ทดสอบ ระบบ"]),
      line(["คณะ: วิทยาศาสตร์"]),
      line(["ภาควิชา: คอมพิวเตอร์"]),
      line(["ระดับ: ปริญญาตรี"]),
      line(["สาขาวิชา: วิทยาการคอมพิวเตอร์"]),
    ];
    expect(parseHeader(lines).trackState).toBe("not_selected");
    expect(parseHeader(lines.slice(1)).trackState).toBe("unknown");
    expect(
      parseHeader([
        ...lines.slice(0, -1),
        line(["สาขาวิชา: วิทยาการคอมพิวเตอร์ (โครงงานวิจัย)"]),
      ]).track,
    ).toBe("project");
  });
  it("preserves W with zero credits and an empty grade in a narrow table", () => {
    const lines: TextLine[] = [
      {
        y: 100,
        items: [
          { text: "101001", x: 20, width: 40 },
          { text: "วิชาทดสอบ", x: 100, width: 80 },
          { text: "0", x: 400, width: 10 },
          { text: "W", x: 450, width: 10 },
          { text: "0", x: 500, width: 10 },
        ],
      },
      {
        y: 80,
        items: [
          { text: "101002", x: 20, width: 40 },
          { text: "วิชาทดสอบ", x: 100, width: 80 },
          { text: "3", x: 400, width: 10 },
          { text: "0", x: 500, width: 10 },
        ],
      },
    ];
    const result = parsePage(
      lines,
      600,
      1,
      { kind: "semester", year: 2569, semester: 1 },
      0,
    );
    expect(result.attempts[0].credits).toBe(0);
    expect(result.attempts[0].grade).toBe("W");
    expect(result.attempts[1].grade).toBeNull();
    expect(result.attempts[1].gradePoints).toBe(0);
  });
  it("simulates unknown offerings per term without changing the actual catalogue or baseline", () => {
    const d = dataset();
    d.offerings = d.offerings.filter((o) => o.courseCode !== "101002");
    const before = structuredClone(d);
    const result = simulate(
      payload([attempt("101001", "B")]),
      d,
      "project",
      params,
      [],
      [
        {
          courseCode: "101002",
          term: params.currentTerm,
          availability: "open",
        },
      ],
    );
    expect(
      result.baseline.terms
        .flatMap((t) => t.courses)
        .some((c) => c.code === "101002"),
    ).toBe(false);
    expect(
      result.changed.terms[0].courses.some((c) => c.code === "101002"),
    ).toBe(true);
    expect(result.changed.assumptions.join()).toContain("ข้อมูลจริงยังไม่ทราบ");
    expect(d).toEqual(before);
    expect(() =>
      simulate(
        payload(),
        d,
        "project",
        params,
        [],
        [
          {
            courseCode: "101001",
            term: params.currentTerm,
            availability: "closed",
          },
        ],
      ),
    ).toThrow("เฉพาะข้อมูลที่ยังไม่ทราบ");
    expect(() =>
      simulate(
        payload(),
        d,
        "project",
        params,
        [],
        [
          {
            courseCode: "101002",
            term: { year: 2568, semester: 1 },
            availability: "open",
          },
        ],
      ),
    ).toThrow("ช่วงแผน");
    expect(() =>
      simulate(
        payload(),
        d,
        "project",
        params,
        [],
        [
          {
            courseCode: "101002",
            term: params.currentTerm,
            availability: "open",
          },
          {
            courseCode: "101002",
            term: params.currentTerm,
            availability: "closed",
          },
        ],
      ),
    ).toThrow("ซ้ำ");
  });
  it("detects duplicate catalogue rows, cycles and missing prerequisites", () => {
    const d = dataset();
    d.courses[0].prerequisite.courses = ["101002"];
    expect(validateDataset(d).join()).toContain("วงวน");
    d.courses.push({ ...d.courses[0] });
    expect(validateDataset(d).join()).toContain("ซ้ำ");
    expect(() => parseCourse({ ...d.courses[0], credits: -1 })).toThrow();
    expect(() =>
      parseCourse({
        ...d.courses[0],
        prerequisite: { ...d.courses[0].prerequisite, ruleType: "unsupported" },
      }),
    ).toThrow("ยังไม่รองรับกฎ");
  });
  it("recovers a two-line name whose code is vertically centered", () => {
    const lines: TextLine[] = [
      {
        y: 112,
        items: [
          { text: "ชื่อรายวิชาบรรทัดแรก", x: 100, width: 300 },
          { text: "ท้ายชื่อ", x: 401, width: 25 },
        ],
      },
      {
        y: 100,
        items: [
          { text: "101001", x: 20, width: 40 },
          { text: "3", x: 440, width: 10 },
          { text: "B", x: 480, width: 10 },
          { text: "9", x: 530, width: 10 },
        ],
      },
      { y: 88, items: [{ text: "บรรทัดที่สอง", x: 100, width: 200 }] },
    ];
    const result = parsePage(
      lines,
      600,
      1,
      { kind: "semester", year: 2569, semester: 1 },
      0,
    );
    expect(result.attempts[0].name).toBe(
      "ชื่อรายวิชาบรรทัดแรกท้ายชื่อ บรรทัดที่สอง",
    );
    expect(result.attempts[0].credits).toBe(3);
  });
  it("keeps cumulative CR when the right column starts left of the page midpoint", () => {
    const lines: TextLine[] = [
      {
        y: 200,
        items: [
          { text: "CR:3", x: 30, width: 40 },
          { text: "CP:3", x: 90, width: 40 },
          { text: "CA:3", x: 150, width: 40 },
          { text: "GP:9", x: 210, width: 40 },
          { text: "CR:30", x: 275, width: 40 },
          { text: "CP:27", x: 340, width: 40 },
          { text: "CA:27", x: 405, width: 40 },
          { text: "GP:81", x: 460, width: 40 },
        ],
      },
    ];
    const summaries = parsePage(
      lines,
      600,
      1,
      { kind: "semester", year: 2569, semester: 1 },
      0,
    ).summaries;
    expect(summaries.find((s) => s.kind === "semester")?.fields.CR).toBe("3");
    expect(summaries.find((s) => s.kind === "cumulative")?.fields.CR).toBe(
      "30",
    );
  });
  it("preserves zero GPAX when its label and value wrap into separate lines", () => {
    const lines: TextLine[] = [
      {
        y: 150,
        items: [
          { text: "GPA", x: 240, width: 20 },
          { text: "GPAX", x: 520, width: 25 },
        ],
      },
      {
        y: 130,
        items: [
          { text: "เฉลีย:0", x: 240, width: 40 },
          { text: "ผลการเรียนเฉลีย", x: 490, width: 80 },
        ],
      },
      { y: 115, items: [{ text: "สะสม:0", x: 510, width: 45 }] },
    ];
    const summaries = parsePage(
      lines,
      600,
      1,
      { kind: "transfer", year: null, semester: null },
      0,
    ).summaries;
    expect(summaries.find((s) => s.kind === "cumulative")?.fields.gpax).toBe(
      "0",
    );
  });
  it("keeps reported latest GPA and GPAX distinct from following transfer totals", () => {
    const lines: TextLine[] = [
      { y: 240, items: [
        { text: "ผลการเรียนเฉลียเทอมล่าสุด0", x: 24, width: 180 },
        { text: "ผลการเรียนเฉลียสะสม3.25", x: 320, width: 180 },
      ] },
      { y: 200, items: [{ text: "รายวิชาโอนย้าย", x: 24, width: 100 }] },
      { y: 180, items: [{ text: "GPAX", x: 500, width: 35 }] },
      { y: 160, items: [{ text: "ผลการเรียนเฉลียสะสม:0", x: 470, width: 100 }] },
    ];
    const summaries = parsePage(lines, 600, 1, {kind:"unknown",year:null,semester:null}, 0).summaries;
    expect(summaries.find(s=>s.kind==="latest_cumulative")?.fields.gpax).toBe("3.25");
    expect(summaries.find(s=>s.kind==="latest_semester")?.fields.gpa).toBe("0");
    expect(summaries.find(s=>s.kind==="cumulative")?.fields.gpax).toBe("0");
  });
});
