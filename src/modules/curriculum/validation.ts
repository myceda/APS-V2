import type {
  Course,
  Dataset,
  AcademicPolicy,
  GroupRule,
  Offering,
  Prerequisite,
} from "./types";
import { CATEGORY_NAMES } from "./types";

export function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("ข้อมูลต้องเป็นรายการที่มีฟิลด์");
  return value as Record<string, unknown>;
}
export function text(value: unknown, maximum = 500): string {
  if (typeof value !== "string" || !value.trim() || value.length > maximum)
    throw new Error("ข้อความว่างหรือยาวเกินที่รองรับ");
  return value.trim();
}
export function integer(value: unknown, min: number, max: number): number {
  if (
    !Number.isInteger(value) ||
    (value as number) < min ||
    (value as number) > max
  )
    throw new Error(`ตัวเลขต้องอยู่ระหว่าง ${min}–${max}`);
  return value as number;
}
export function choice<T extends string>(
  value: unknown,
  choices: readonly T[],
): T {
  if (!choices.includes(value as T)) throw new Error("ค่าที่เลือกไม่รองรับ");
  return value as T;
}
export function parsePrerequisite(value: unknown): Prerequisite {
  const p = record(value);
  if (
    Object.keys(p).some(
      (key) => !["mode", "courses", "concurrent", "unresolved"].includes(key),
    )
  )
    throw new Error(
      "ยังไม่รองรับกฎเพิ่มเติมในเงื่อนไขนี้ กรุณาตรวจชนิดกฎก่อนเผยแพร่",
    );
  if (
    !Array.isArray(p.courses) ||
    p.courses.length > 30 ||
    typeof p.concurrent !== "boolean"
  )
    throw new Error("เงื่อนไขรายวิชาไม่ถูกต้อง");
  return {
    mode: choice(p.mode, ["all", "any"]),
    courses: p.courses.map((v) => text(v, 20)),
    concurrent: p.concurrent,
    unresolved: p.unresolved == null ? null : text(p.unresolved),
  };
}
export function parseCourse(value: unknown): Course {
  const c = record(value);
  const code = text(c.code, 20);
  if (!/^[A-Z0-9-]{2,20}$/.test(code))
    throw new Error("รหัสวิชาใช้ตัวอักษรอังกฤษพิมพ์ใหญ่ ตัวเลข และขีด");
  if (
    !Array.isArray(c.tracks) ||
    c.tracks.length > 2 ||
    typeof c.specific !== "boolean" ||
    typeof c.requiresConsent !== "boolean"
  )
    throw new Error("ข้อมูลสายและชนิดวิชาไม่ถูกต้อง");
  return {
    code,
    name: text(c.name, 300),
    credits: integer(c.credits, 0, 30),
    category: choice(
      c.category,
      Object.keys(CATEGORY_NAMES) as Course["category"][],
    ),
    tracks: [
      ...new Set(
        c.tracks.map((t) => choice(t, ["project", "cooperative"] as const)),
      ),
    ],
    grading: choice(c.grading, ["numeric", "su", "unknown"]),
    specific: c.specific,
    prerequisite: parsePrerequisite(c.prerequisite),
    requiresConsent: c.requiresConsent,
    source: text(c.source, 1000),
  };
}
export function parsePolicy(value: unknown): AcademicPolicy {
  const p = record(value);
  if (
    p.retakeCeiling != null &&
    (typeof p.retakeCeiling !== "number" ||
      p.retakeCeiling < 0 ||
      p.retakeCeiling > 4 ||
      !Number.isFinite(p.retakeCeiling))
  )
    throw new Error("เพดานเกรดเรียนซ้ำไม่ถูกต้อง");
  if (typeof p.gpaMinimum !== "number" || !Number.isFinite(p.gpaMinimum) || p.gpaMinimum < 0 || p.gpaMinimum > 4)
    throw new Error("เกณฑ์ GPA ไม่ถูกต้อง");
  if (p.starGradeCourses !== undefined &&
      (!Array.isArray(p.starGradeCourses) || p.starGradeCourses.length > 100 ||
       p.starGradeCourses.some((code) => typeof code !== "string" || !/^[A-Z0-9-]{2,20}$/.test(code)) ||
       new Set(p.starGradeCourses).size !== p.starGradeCourses.length))
    throw new Error("รายการวิชาที่รับรอง S*/U* ไม่ถูกต้อง");
  return {
    ...(p.electiveAllocation === undefined ? {} : { electiveAllocation: choice(p.electiveAllocation, ["specific_then_free_earliest_pass", "unconfirmed"] as const) }),
    ...(p.starGradeCourses === undefined ? {} : { starGradeCourses: p.starGradeCourses as string[] }),
    ...(p.gpaComparison === undefined ? {} : { gpaComparison: choice(p.gpaComparison, ["raw", "unconfirmed"] as const) }),
    ...(p.specificGpaBasis === undefined ? {} : { specificGpaBasis: choice(p.specificGpaBasis, ["all_specific", "unconfirmed"] as const) }),
    retakeCeiling: p.retakeCeiling == null ? null : (p.retakeCeiling as number),
    degreeCredits: integer(p.degreeCredits, 1, 500),
    gpaMinimum: p.gpaMinimum,
    repeat: choice(p.repeat, ["latest_numeric", "all_attempts", "unconfirmed"]),
    rounding: choice(p.rounding, ["half_up_2", "unconfirmed"]),
    prerequisitePass: choice(p.prerequisitePass, [
      "any_pass",
      "latest_assessed",
      "unconfirmed",
    ]),
    normalMax: integer(p.normalMax, 1, 30),
    normalMin:
      p.normalMin == null
        ? null
        : integer(p.normalMin, 0, integer(p.normalMax, 1, 30)),
    summerMax: integer(p.summerMax, 1, 15),
    source: text(p.source, 1000),
  };
}
export function parseOffering(value: unknown): Offering {
  const o = record(value);
  const year = integer(o.year, 0, 2700);
  if (year !== 0 && year < 2500)
    throw new Error("ปีต้องเป็น พ.ศ. หรือ 0 สำหรับรูปแบบซ้ำ");
  const confidence = choice(o.confidence, ["confirmed", "planned"]);
  if (year === 0 && confidence !== "planned")
    throw new Error("รูปแบบเปิดซ้ำต้องเป็นข้อมูลคาดการณ์");
  return {
    courseCode: text(o.courseCode, 20),
    year,
    semester: integer(o.semester, 1, 3) as 1 | 2 | 3,
    availability: choice(o.availability, ["open", "closed", "unknown"]),
    confidence,
    source: text(o.source, 1000),
  };
}
export function validateDataset(dataset: Dataset): string[] {
  const errors: string[] = [];
  const codes = new Set<string>();
  for (const [index, value] of dataset.courses.entries()) {
    try {
      const course = parseCourse(value);
      if (codes.has(course.code))
        errors.push(`แถว ${index + 1}: รหัส ${course.code} ซ้ำ`);
      codes.add(course.code);
    } catch (error) {
      errors.push(`แถว ${index + 1}: ${(error as Error).message}`);
    }
  }
  for (const course of dataset.courses)
    for (const code of course.prerequisite.courses) {
      if (!codes.has(code))
        errors.push(`${course.code}: ไม่พบวิชาเงื่อนไข ${code} ในชุดข้อมูล`);
      if (code === course.code)
        errors.push(`${course.code}: มีเงื่อนไขอ้างตนเอง`);
    }
  const visiting = new Set<string>(),
    visited = new Set<string>();
  const visit = (code: string) => {
    if (visiting.has(code)) {
      errors.push(`${code}: เงื่อนไขวิชาเกิดวงวน`);
      return;
    }
    if (visited.has(code)) return;
    visiting.add(code);
    const course = dataset.courses.find((c) => c.code === code);
    for (const parent of course?.prerequisite.courses ?? [])
      if (codes.has(parent)) visit(parent);
    visiting.delete(code);
    visited.add(code);
  };
  for (const code of codes) visit(code);
  for (const offering of dataset.offerings) {
    try {
      parseOffering(offering);
      if (!codes.has(offering.courseCode))
        errors.push(`เปิดสอน: ไม่พบ ${offering.courseCode}`);
    } catch (error) {
      errors.push(`เปิดสอน: ${(error as Error).message}`);
    }
  }
  const offeringKeys = dataset.offerings.map(
    (o) => `${o.courseCode}:${o.year}:${o.semester}`,
  );
  if (new Set(offeringKeys).size !== offeringKeys.length)
    errors.push("ข้อมูลเปิดสอนปี/ภาคซ้ำ");
  try {
    const policy = parsePolicy(dataset.policy);
    for (const code of policy.starGradeCourses ?? []) {
      if (!dataset.courses.some((course) => course.code === code && course.grading === "su"))
        errors.push(`${code}: การรับรอง S*/U* ต้องอ้างรายวิชาที่มีนโยบาย S/U`);
    }
  } catch (error) {
    errors.push((error as Error).message);
  }
  if (!dataset.source.trim()) errors.push("ต้องระบุแหล่งข้อมูล");
  if (!dataset.courses.length) errors.push("ต้องมีรายวิชาอย่างน้อยหนึ่งวิชา");
  return [...new Set(errors)];
}
export function parseGroups(value: unknown): GroupRule[] {
  if (!Array.isArray(value) || value.length > 50)
    throw new Error("หมวดวิชาไม่ถูกต้อง");
  return value.map((item) => {
    const g = record(item);
    return {
      category: choice(
        g.category,
        Object.keys(CATEGORY_NAMES) as GroupRule["category"][],
      ),
      minimum: integer(g.minimum, 0, 500),
      track: choice(g.track, ["project", "cooperative", "both"]),
      source: text(g.source, 1000),
    };
  });
}
