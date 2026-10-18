import type {
  Course,
  Dataset,
  StudyTrack,
  Term,
} from "@/modules/curriculum/types";
import type { TranscriptPayload } from "@/modules/transcript/types";
import {
  auditTranscript,
  GRADE_POINTS,
  isPassed,
  passedForPrerequisites,
} from "@/modules/analysis/engine";

export interface PlanningParameters {
  currentTerm: Term;
  normalLoad: number;
  summerLoad: number;
  horizon: number;
  targetGrade: string;
  assumeUnknownOfferings: boolean;
}
export function sameParameters(left: PlanningParameters, right: PlanningParameters): boolean {
  return left.currentTerm.year === right.currentTerm.year && left.currentTerm.semester === right.currentTerm.semester && left.normalLoad === right.normalLoad && left.summerLoad === right.summerLoad && left.horizon === right.horizon && left.targetGrade === right.targetGrade && left.assumeUnknownOfferings === right.assumeUnknownOfferings;
}
export interface PlannedCourse {
  code: string;
  name: string;
  credits: number;
  grade: string;
  assumptions: string[];
  reasons: string[];
}
export interface PlanningEvent {
  action: "add" | "drop" | "fail";
  courseCode: string;
  term: Term;
  grade: string | null;
}
export interface TermPlan {
  term: Term;
  courses: PlannedCourse[];
  credits: number;
  projectedGpax: number | null;
}
export interface TrackPlan {
  track: StudyTrack;
  basis: "actual" | "alternative" | "assumption";
  terms: TermPlan[];
  graduationTerm: Term | null;
  blocked: { code: string; reasons: string[] }[];
  assumptions: string[];
  limitations: string[];
}
export function termKey(term: Term): number {
  return term.year * 3 + term.semester - 1;
}
export function nextTerm(term: Term): Term {
  return term.semester === 3
    ? { year: term.year + 1, semester: 1 }
    : { year: term.year, semester: (term.semester + 1) as 2 | 3 };
}
export function resolveOffering(dataset: Dataset, code: string, term: Term) {
  const specific = dataset.offerings.find(
    (o) =>
      o.courseCode === code &&
      o.year === term.year &&
      o.semester === term.semester,
  );
  const recurring = dataset.offerings.find(
    (o) =>
      o.courseCode === code && o.year === 0 && o.semester === term.semester,
  );
  return (
    specific ??
    recurring ?? {
      courseCode: code,
      ...term,
      availability: "unknown" as const,
      confidence: "planned" as const,
      source: "ไม่มีข้อมูลเปิดสอน",
    }
  );
}
export function prerequisiteSatisfied(
  course: Course,
  passed: Set<string>,
  sameTerm = new Set<string>(),
): boolean {
  const checks = course.prerequisite.courses.map(
    (code) =>
      passed.has(code) ||
      (course.prerequisite.concurrent && sameTerm.has(code)),
  );
  return (
    checks.length === 0 ||
    (course.prerequisite.mode === "all"
      ? checks.every(Boolean)
      : checks.some(Boolean))
  );
}
export function makePlan(
  payload: TranscriptPayload,
  dataset: Dataset,
  track: StudyTrack,
  parameters: PlanningParameters,
  basis: TrackPlan["basis"],
  forbidden = new Map<string, Set<number>>(),
  events: PlanningEvent[] = [],
): TrackPlan {
  const audit = auditTranscript(payload, dataset, track);
  const passed = passedForPrerequisites(payload.attempts, dataset);
  const remaining = new Map<string, Course>();
  const limitations = [...audit.warnings];
  const assumptions = new Set<string>();
  for (const event of events.filter((e) => e.action === "add")) {
    const course = dataset.courses.find((c) => c.code === event.courseCode);
    if (course) remaining.set(course.code, course);
  }
  for (const course of dataset.courses.filter(
    (c) => !c.tracks.length || c.tracks.includes(track),
  )) {
    const result = audit.courses.find((c) => c.code === course.code);
    if (
      [
        "general_required",
        "core_required",
        "specific_required",
        "track_required",
      ].includes(course.category) &&
      result?.status !== "passed"
    ) {
      if (result?.status === "pending" || result?.status === "unknown")
        limitations.push(
          `${course.code}: รอผลหรือข้อมูลไม่พอ ไม่สร้างผลผ่านแทน`,
        );
      else remaining.set(course.code, course);
    }
  }
  // Electives are selected by an explicit catalogue category, never by code prefix.
  for (const group of audit.groups.filter((g) =>
    ["general_elective", "specific_elective", "free_elective"].includes(
      g.category,
    ),
  ).sort((a,b) => ["general_elective", "specific_elective", "free_elective"].indexOf(a.category) - ["general_elective", "specific_elective", "free_elective"].indexOf(b.category))) {
    const autoAllocation = dataset.policy.electiveAllocation === "specific_then_free_earliest_pass";
    const reserved = [...remaining.values()].map((c, index) => ({
      ordinal: Math.max(-1, ...payload.attempts.map(r => r.ordinal)) + index + 1,
      courseCode: c.code, name: c.name, credits: c.credits,
      grade: c.grading === "su" ? "S" : parameters.targetGrade,
      gradePoints: null, ...parameters.currentTerm, kind: "semester" as const, sourcePage: 0,
    }));
    // Reserve each planned course once before choosing courses for the next group.
    let deficit = autoAllocation
      ? auditTranscript({ ...payload, attempts: [...payload.attempts, ...reserved] }, dataset, track)
          .groups.find(g => g.category === group.category)!.remaining
      : group.remaining;
    const offeringRank = (course: Course) => {
      let rank = 2, candidateTerm = { ...parameters.currentTerm };
      for (let step = 0; step < parameters.horizon; step++, candidateTerm = nextTerm(candidateTerm)) {
        const availability = resolveOffering(dataset, course.code, candidateTerm).availability;
        rank = Math.min(rank, availability === "open" ? 0 : availability === "unknown" ? 1 : 2);
      }
      return rank;
    };
    const candidates = dataset.courses
      .filter(
        (c) =>
          (!autoAllocation || !remaining.has(c.code)) &&
          (c.category === group.category || (autoAllocation && group.category === "free_elective" && c.category === "specific_elective" && !remaining.has(c.code))) &&
          (!c.tracks.length || c.tracks.includes(track)) &&
          audit.courses.find((r) => r.code === c.code)?.status !== "passed",
      )
      .sort((a, b) => (autoAllocation ? offeringRank(a) - offeringRank(b) : 0) || Number(b.category === group.category) - Number(a.category === group.category) || a.code.localeCompare(b.code));
    for (const course of candidates) {
      if (deficit <= 0) break;
      if (
        ["pending", "unknown"].includes(
          audit.courses.find((c) => c.code === course.code)?.status ?? "",
        )
      )
        continue;
      remaining.set(course.code, course);
      deficit -= course.credits;
    }
    if (deficit > 0)
      limitations.push(
        `${group.category}: ยังมีตัวเลือกรายวิชาที่จัดหมวดไม่พอ ${deficit} หน่วยกิต`,
      );
  }
  const terms: TermPlan[] = [],
    projected = structuredClone(payload);
  let term = { ...parameters.currentTerm };
  const reasons = new Map<string, string[]>();
  for (
    let step = 0;
    step < parameters.horizon && remaining.size;
    step++, term = nextTerm(term)
  ) {
    const maximum =
      term.semester === 3
        ? Math.min(parameters.summerLoad, dataset.policy.summerMax)
        : Math.min(parameters.normalLoad, dataset.policy.normalMax);
    const selected: Course[] = [],
      selectedIds = new Set<string>(),
      courses: PlannedCourse[] = [];
    let credits = 0;
    const candidates = [...remaining.values()].sort((a, b) => {
      const dependents = (code: string) =>
        [...remaining.values()].filter((c) =>
          c.prerequisite.courses.includes(code),
        ).length;
      return (
        dependents(b.code) - dependents(a.code) || a.code.localeCompare(b.code)
      );
    });
    // Multiple passes allow only documented concurrent prerequisite pairs.
    for (let pass = 0; pass < 3; pass++)
      for (const course of candidates) {
        if (selectedIds.has(course.code)) continue;
        const blocked: string[] = [],
          conditional: string[] = [];
        const additions = events.filter(
          (e) => e.action === "add" && e.courseCode === course.code,
        );
        if (
          additions.length &&
          additions.every((e) => termKey(e.term) > termKey(term))
        )
          blocked.push("รอภาคที่กำหนดเหตุการณ์เพิ่มวิชา");
        if (forbidden.get(course.code)?.has(termKey(term)))
          blocked.push("ถอนหรือไม่ผ่านในภาคที่จำลอง");
        if (course.grading === "unknown")
          blocked.push("ยังไม่ยืนยันนโยบายเกรดรายวิชา");
        if (!prerequisiteSatisfied(course, passed, selectedIds))
          blocked.push(
            `ต้องผ่าน${course.prerequisite.mode === "any" ? "อย่างน้อยหนึ่งวิชา" : "ทุกวิชา"}: ${course.prerequisite.courses.join(", ")}`,
          );
        if (
          course.prerequisite.unresolved &&
          !course.prerequisite.courses.every((code) => passed.has(code))
        )
          blocked.push(course.prerequisite.unresolved);
        const offering = resolveOffering(dataset, course.code, term);
        if (offering.availability === "closed")
          blocked.push("ไม่เปิดสอนในภาคนี้");
        if (offering.availability === "unknown") {
          if (parameters.assumeUnknownOfferings)
            conditional.push("สมมติว่าเปิดสอน ต้องตรวจตารางจริง");
          else blocked.push("ยังไม่ทราบการเปิดสอน");
        } else if (offering.confidence === "planned")
          conditional.push("การเปิดสอนเป็นข้อมูลคาดการณ์");
        if (course.requiresConsent) {
          conditional.push("ต้องได้รับความยินยอมจากผู้มีอำนาจก่อนลงทะเบียน");
          limitations.push(`${course.code}: ยังไม่ได้ตรวจหลักฐานความยินยอม`);
        }
        if (credits + course.credits > maximum)
          blocked.push("เกินภาระเรียนที่ตั้งไว้สำหรับภาคนี้");
        if (blocked.length) {
          reasons.set(course.code, blocked);
          continue;
        }
        selected.push(course);
        selectedIds.add(course.code);
        credits += course.credits;
        conditional.forEach((message) => assumptions.add(message));
        const event = events.find(
          (e) =>
            e.courseCode === course.code && termKey(e.term) === termKey(term),
        );
        const grade =
          event?.action === "fail"
            ? course.grading === "su"
              ? "U"
              : "F"
            : event?.action === "add"
              ? event.grade!
              : course.grading === "su"
                ? "S"
                : parameters.targetGrade;
        if (event?.action === "fail")
          conditional.push("สมมติไม่ผ่านในภาคนี้ ต้องจัดเรียนใหม่");
        courses.push({
          code: course.code,
          name: course.name,
          credits: course.credits,
          grade,
          assumptions: conditional,
          reasons: [
            `เรียงตามจำนวนวิชาที่ต่อเนื่องและรหัสวิชา`,
            `แหล่งเปิดสอน: ${offering.source}`,
          ],
        });
      }
    for (const course of selected) {
      const grade = courses.find((c) => c.code === course.code)!.grade;
      if (isPassed(grade)) {
        remaining.delete(course.code);
        reasons.delete(course.code);
      }
      projected.attempts.push({
        ordinal: projected.attempts.length,
        courseCode: course.code,
        name: course.name,
        credits: course.credits,
        grade,
        gradePoints: null,
        ...term,
        kind: "semester",
        sourcePage: 0,
      });
      passed.clear();
      for (const code of passedForPrerequisites(projected.attempts, dataset))
        passed.add(code);
    }
    if (
      credits > 0 &&
      term.semester !== 3 &&
      dataset.policy.normalMin != null &&
      credits < dataset.policy.normalMin
    ) {
      const message = `${term.year}/${term.semester}: ภาระเรียน ${credits} ต่ำกว่าขั้นต่ำทั่วไป ${dataset.policy.normalMin} ต้องตรวจความเห็นชอบ/ข้อยกเว้นก่อนลงทะเบียน`;
      assumptions.add(message);
      limitations.push(message);
    }
    const projectedAudit = auditTranscript(projected, dataset, track);
    terms.push({
      term: { ...term },
      courses,
      credits,
      projectedGpax: projectedAudit.gpax.value,
    });
  }
  const projectedAudit = auditTranscript(projected, dataset, track);
  if (
    projectedAudit.gpax.raw == null ||
    projectedAudit.gpax.raw < dataset.policy.gpaMinimum
  )
    limitations.push("ผลคาดการณ์ GPAX ยังไม่ถึงเกณฑ์ภายใต้เกรดสมมติ");
  if (
    projectedAudit.specificGpa.raw == null ||
    projectedAudit.specificGpa.raw < dataset.policy.gpaMinimum
  )
    limitations.push("GPA เฉพาะด้านยังไม่ถึงเกณฑ์หรือข้อมูลไม่พอ");
  if (projectedAudit.earnedCredits < dataset.policy.degreeCredits)
    limitations.push("หน่วยกิตคาดการณ์ยังไม่ครบขั้นต่ำ");
  if (projectedAudit.groups.some((g) => g.status !== "met"))
    limitations.push("ยังมีหมวดที่ไม่ครบหรือสรุปไม่ได้");
  if (remaining.size)
    limitations.push(
      "ยังจัดวิชาบางรายการไม่ได้ภายในช่วงค้นหา ไม่ใช่ข้อสรุปว่าไม่มีแผนทุกกรณี",
    );
  assumptions.add(
    `ผลคาดการณ์ใช้เกรด ${parameters.targetGrade} สำหรับวิชาตัวเลข และ S สำหรับวิชา S/U`,
  );
  const uniqueLimitations = [...new Set(limitations)];
  return {
    track,
    basis,
    terms,
    graduationTerm:
      !remaining.size && !uniqueLimitations.length
        ? (terms.at(-1)?.term ?? parameters.currentTerm)
        : null,
    blocked: [...remaining.keys()].map((code) => ({
      code,
      reasons: reasons.get(code) ?? ["ยังไม่ได้จัดในแผน"],
    })),
    assumptions: [...assumptions],
    limitations: uniqueLimitations,
  };
}
export function validateParameters(
  value: unknown,
  dataset: Dataset,
): PlanningParameters {
  if (!value || typeof value !== "object")
    throw new Error("ต้องระบุพารามิเตอร์แผน");
  const p = value as Record<string, unknown>,
    term = p.currentTerm as Term;
  if (
    !term ||
    !Number.isInteger(term.year) ||
    term.year < 2500 ||
    term.year > 2700 ||
    ![1, 2, 3].includes(term.semester)
  )
    throw new Error("ภาคอ้างอิงไม่ถูกต้อง");
  for (const [key, max] of [
    ["normalLoad", dataset.policy.normalMax],
    ["summerLoad", dataset.policy.summerMax],
    ["horizon", 24],
  ] as const)
    if (
      !Number.isInteger(p[key]) ||
      (p[key] as number) < 1 ||
      (p[key] as number) > max
    )
      throw new Error(`${key}: ค่าภาระเรียนหรือช่วงค้นหาเกินที่รองรับ`);
  if (
    typeof p.targetGrade !== "string" ||
    !(p.targetGrade in GRADE_POINTS) ||
    GRADE_POINTS[p.targetGrade] < 1 ||
    typeof p.assumeUnknownOfferings !== "boolean"
  )
    throw new Error("เกรดเป้าหมายหรือสมมติฐานไม่ถูกต้อง");
  return {
    currentTerm: { year: term.year, semester: term.semester },
    normalLoad: p.normalLoad as number,
    summerLoad: p.summerLoad as number,
    horizon: p.horizon as number,
    targetGrade: p.targetGrade,
    assumeUnknownOfferings: p.assumeUnknownOfferings,
  };
}
